import { HistoryReader, HistoryError, HISTORY_READ_MS, type HistoryContext } from "./history-reader";
import { planOperationDecision, resolveOperationDecision, type OperationAction, type OperationRequest } from "../../../../../scripts/agents-mother/operation-decisions.mjs";
import { operationRuntime } from "./operation-runtime";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { prepareTaskWorkspace, inspectTaskWorkspace, taskWorkspaceResources, verifyTaskWorkspace } from "../../../../../scripts/lib/task-workspace.mjs";
import { resolveTechscopeRoot } from "@/lib/pritha-paths";
import { AppServerConnection, CodexRuntimeManager, type RpcMessage, type RuntimeNotificationOrigin } from "./app-server";
import { verifyNativeThreadIdentity } from "./storage-identity";
import { ChatAttachmentStore, AttachmentError } from "./attachment-store";
import { assertAttachmentCapabilities } from "./attachment-policy";
import { classifyNativeThreadReadFailure } from "./native-thread-errors";
import { CodexChatPrivateStore, logicalChatKey, type ChatBinding } from "./private-store";
import { queueVoiceTaskChatIndexRefresh, reconcileVoiceTaskChatLink, voiceTaskChatIndexStatus } from "./voice-links";
import { pendingNativeRequests, answerNativeRequest, expireCompletedNativeRequests } from "./native-requests";
import { registerNativeControl, nativeControlView, controlNativeTurn } from "./native-control";
import { nativeThreadLeaseKey, tryAcquireNativeThreadTurn } from "./native-turn-coordinator";
import { changeThreadGoalBudget, emptyGoalView, GoalControlError, readThreadGoal, type GoalBudgetReceipt } from "./goal-control";
import { parseBudgetIntent } from "./budget-intent";
import { listTaskDeliveries, normalizeTaskDeliveryBudgetRequest, performTaskDeliveryAction, readTaskDelivery, TaskDeliveryError, type TaskDeliveryRequest } from "../../../../../scripts/agents-mother/task-delivery.mjs";
import type { DeliveryBudgetReceipt } from "./delivery-types";
import { recordParentUsage } from "../../../../../scripts/agents-mother/phase-usage.mjs";
import {
  asObject,
  itemIdFor,
  normalizeNativeItem,
  normalizeNativeTurn,
  summarizeThread,
  threadStatusFromNative,
  turnIdFor,
  type ActiveAttemptSnapshot,
} from "./normalize";
import type {
  AcceptedTurn,
  ChatEvent,
  ChatEventRecord,
  RuntimeProviderId,
  RuntimeProviderView,
  RuntimeStatus,
  ThreadDetail,
  ThreadPage,
  ThreadSummary,
  TurnPage,
  TurnView,
  CreateTaskLinkRequest,
  GoalBudgetRequest,
  ThreadGoalView,
} from "./types";

type CreateThreadInput = {
  clientThreadId: string;
  title?: string;
  source: "chat";
  workspace?: {baseRevision?:string;mode?:"isolated"|"configured"|"read-only"};
  settings?: { modelId?: string; effortId?: string; serviceTierId?: string };
};

type StartTurnInput = {
  attachments?: string[];
  clientMessageId: string;
  input: [{ type: "text"; text: string }];
  settings?: { modelId?: string; effortId?: string; serviceTierId?: string };
};

type CreateThreadWithFirstTurnInput = CreateThreadInput & {
  initialTurn: StartTurnInput;
};

type ActiveAttempt = ActiveAttemptSnapshot & {
  clientMessageId: string;
  requestHash: string;
  acknowledged: boolean;
  intentKey?: string;
  controlCleanup?: () => void;
};

type EventSubscriber = { send: (event: ChatEventRecord) => void; close: (() => void) | null };

const MAX_EVENTS_PER_CHAT = 10_000;

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function newId(prefix: "chat" | "turn") {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function titleText(value: unknown, fallback = "New task chat") {
  const title = Array.from(String(value || "").trim()).slice(0, 120).join("");
  return title || fallback;
}

function previewText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function publicMessage(value: unknown) {
  const text = String(value instanceof Error ? value.message : value || "");
  if (/timed out/i.test(text)) return "The task runtime did not answer within the operation timeout.";
  if (/unavailable|not found|exited/i.test(text)) return "The selected task runtime is unavailable.";
  return "Task Chat could not complete the operation.";
}

function uncertainTurnStartFailure(value: unknown) {
  const text = String(value instanceof Error ? value.message : value || "");
  return /timed out|unavailable|exited|connection closed|broken pipe|EPIPE|write after end|socket|transport/i.test(text);
}

function turnStartFailureReason(value: unknown, stage: "connection" | "resume" | "turn_start", acknowledged: boolean) {
  if (acknowledged) return "accepted_response_incomplete";
  if (stage !== "turn_start") return stage === "resume" ? "thread_resume_failed" : "runtime_connection_failed";
  if (/timed out/i.test(String(value instanceof Error ? value.message : value || ""))) return "turn_start_timeout";
  if (uncertainTurnStartFailure(value)) return "turn_start_transport_failed";
  return "turn_start_rejected";
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown };
    const offset = Number(parsed.offset);
    return Number.isInteger(offset) && offset >= 0 ? offset : null;
  } catch {
    return null;
  }
}

function validClientId(value: string) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function replaceableEmptyDirectChat(binding: ChatBinding) {
  return binding.origin === "chat"
    && binding.group === "my_chats"
    && binding.preview === ""
    && Object.keys(binding.messageReceipts).length === 0
    && Object.keys(binding.goalBudgetRequests || {}).length === 0
    && Object.keys(binding.deliveryBudgetRequests || {}).length === 0
    && !binding.hasDeliveryBinding
    && binding.taskLinks.length === 0;
}

function validatedTurnText(input: StartTurnInput) {
  if (!validClientId(input?.clientMessageId)) {
    throw new CodexChatGatewayError("invalid_request", "A valid clientMessageId is required.", 400);
  }
  const text = String(input.input?.[0]?.text || "").trim();
  if (input.attachments != null && (!Array.isArray(input.attachments) || input.attachments.some(id => typeof id !== "string"))) throw new CodexChatGatewayError("invalid_request", "attachments must be an array of upload identifiers.", 400);
  if ((!text && !input.attachments?.length) || input.input?.length !== 1 || input.input[0].type !== "text") {
    throw new CodexChatGatewayError("invalid_request", "One text input or at least one attachment is required.", 400);
  }
  if (Buffer.byteLength(text, "utf8") > 64_000) {
    throw new CodexChatGatewayError("field_limit_exceeded", "Turn text exceeds 64,000 UTF-8 bytes.", 400);
  }
  return text;
}

function nativeHistoryHasImages(binding: ChatBinding, native: Record<string, unknown>, root: string) {
  return (Array.isArray(native.turns) ? native.turns : []).some(raw => {
      const turn = normalizeNativeTurn(binding, raw, root, null);
      if (turn?.userMessage.attachments?.some(file => file.kind === "image")) return true;
      const items = asObject(raw)?.items;
      return Array.isArray(items) && items.some(item => {
        const content = asObject(item)?.content;
        return Array.isArray(content) && content.some(input => ["image", "localImage"].includes(String(asObject(input)?.type)));
      });
    });
}

export class CodexChatGatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly details?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
  }
}

export class CodexChatGateway {
  private readonly historyReader = new HistoryReader();
  private readonly store = new CodexChatPrivateStore();
  readonly attachments = new ChatAttachmentStore(this.store.stateRoot, this.store.root);
  private readonly root = resolveTechscopeRoot();
  private readonly runtime = new CodexRuntimeManager(this.store, (providerId, message, origin) => this.handleNotification(providerId, message, origin), this.root);
  private readonly activeTurns = new Map<string, ActiveAttempt>();
  private readonly activeTurnLeases = new Map<string, () => void>();
  private readonly events = new Map<string, ChatEventRecord[]>();
  private readonly subscribers = new Map<string, Set<EventSubscriber>>();
  private eventSequence = 0;
  private activityRefresh: Promise<unknown> | null = null;
  private activityRefreshAt = 0;
  private queueTimer?: ReturnType<typeof setTimeout>;
  private queueStopped = false;
  private refreshOffset = 0;
  private queueOffset = 0;

  private scheduleQueues() {
    if (this.queueTimer || this.queueStopped) return;
    this.queueTimer = setTimeout(async () => {
      this.queueTimer = undefined;
      try {
        const rows=this.store.execution.listIntents({kind:"queued-message",states:["queued"],limit:200});
        const chats=[...new Set(rows.map(row=>String(row.chatId)))];
        const start=chats.length ? this.queueOffset%chats.length : 0;
        for (const chatId of [...chats.slice(start),...chats.slice(0,start)].slice(0,8)) await this.drainQueue(chatId);
        this.queueOffset=start+8;
        if (rows.length) this.scheduleQueues();
      } catch { this.scheduleQueues(); }
    },2_000);
    this.queueTimer.unref?.();
  }

  async activity(after = 0) {
    this.scheduleQueues();
    void import("../realtime/pritha-runtime").then(runtime=>runtime.wakeVoiceAdmissions()).catch(()=>undefined);
    const active = this.store.execution.listIntents({kind:"turn",states:["dispatching","running","unknown"],limit:1000});
    if (!this.activityRefresh && Date.now() - this.activityRefreshAt > 5_000) {
      this.activityRefreshAt = Date.now();
      const pendingVoice=this.store.execution.listIntents({kind:"voice-turn",states:["dispatching","running","unknown"],limit:1000});
      const bindings=await this.store.all();
      const all=[...new Set([...active.map(row=>String(row.chatId)),...bindings.filter(binding=>pendingVoice.some(row=>row.nativeThreadId===binding.nativeThreadId && row.storage===binding.stateIdentityHash)).map(binding=>binding.chatId)])];
      const start=all.length ? this.refreshOffset%all.length : 0;
      const chats=[...all.slice(start),...all.slice(0,start)].slice(0,4);
      this.refreshOffset=start+4;
      this.activityRefresh = Promise.allSettled(chats.map(chatId => this.historyPage(chatId, undefined, 1))).finally(() => { this.activityRefresh = null; });
    }
    const window=this.store.execution.eventWindow();
    const reset=after===0 || after>window.newest || (window.oldest>0 && after<window.oldest-1);
    const events = this.store.execution.events(reset ? 0 : after);
    const bindings = await this.store.all();
    const changed = bindings.filter(binding=>reset || events.some(event=>event.chatId===binding.chatId || (event.nativeThreadId===binding.nativeThreadId && event.storage===binding.stateIdentityHash) || (event.taskId && binding.taskLinks.some(link=>link.taskId===event.taskId)))).map(binding=>binding.chatId);
    return {
      cursor: reset ? window.newest : events.at(-1)?.sequence || after,
      reset,
      admissionEnabled:this.store.execution.admission().enabled,
      changed,
      active: active.map(row=>({chatId:row.chatId,state:row.state,revision:row.revision})),
      capacity: this.store.execution.admission().capacity,
      counts:{
        active:new Set(this.store.execution.claims().filter(row=>row.kind==="turn").map(row=>row.owner)).size,
        queued:this.store.execution.listIntents({kind:"queued-message",states:["queued"],limit:1000}).length+this.store.execution.listIntents({kind:"voice-admission",states:["queued"],limit:1000}).length,
        waitingForOperator:this.store.execution.listIntents({kind:"voice-workflow",states:["waiting_for_operator"],limit:1000}).length,
        unknown:this.store.execution.listIntents({states:["unknown"],limit:1000}).length,
      },
    };
  }

  async queuedMessages(chatId: string) {
    await this.requireBinding(chatId);
    return this.store.execution.listIntents({kind:"queued-message",states:["queued","dispatching","unknown","blocked"],limit:1000})
      .filter(row=>row.chatId===chatId).map(row=>({id:row.id,revision:row.revision,state:row.state,text:row.input.input[0].text,clientMessageId:row.input.clientMessageId,createdAt:row.createdAt,reason:row.reason || null}));
  }

  async enqueueMessage(chatId: string, input: StartTurnInput) {
    return this.store.execution.withMutation(`queue-admission:${chatId}`,()=>this.enqueueMessageOwned(chatId,input));
  }
  private async enqueueMessageOwned(chatId: string, input: StartTurnInput) {
    const binding=await this.requireBinding(chatId), text=validatedTurnText(input);
    if (binding.archived) throw new CodexChatGatewayError("chat_archived","Restore this chat before queuing a message.",409);
    if (parseBudgetIntent(text).kind !== "none") throw new CodexChatGatewayError("budget_control_required","Use the task budget control for budget changes.",422);
    const provider=(await this.runtime.provider(binding.providerId)).view;
    if (provider.stateIdentityHash !== binding.stateIdentityHash) throw new CodexChatGatewayError("runtime_identity_mismatch","The original execution storage is unavailable.",409);
    const priorQueue=this.store.execution.listIntents({kind:"queued-message",states:["queued","dispatching","unknown","blocked"],limit:1000}).filter(row=>row.chatId===chatId && row.input.clientMessageId !== input.clientMessageId).at(-1);
    const nativeKey=nativeThreadLeaseKey(binding.stateIdentityHash!,binding.nativeThreadId);
    const resource=createHash("sha256").update(nativeKey).digest("hex");
    const voiceOwner=this.store.execution.claims().find(row=>row.resource===resource && row.kind === "voice-workflow");
    const direct=this.store.execution.listIntents({kind:"turn",states:["running","dispatching","unknown"],limit:1000}).find(row=>row.chatId===chatId);
    const predecessorKey=priorQueue ? `turn:${chatId}:${priorQueue.input.clientMessageId}` : voiceOwner ? `voice-workflow:${voiceOwner.detail.taskId}` : direct ? `turn:${chatId}:${direct.clientMessageId}` : null;
    const key=`queued:${chatId}:${input.clientMessageId}`;
    const existing=this.store.execution.getIntent(key);
    if (!existing && !predecessorKey) throw new CodexChatGatewayError("queue_target_ended","The preceding task ended. Send this draft as a new turn when ready.",409);
    const prepared=await this.prepareAttachmentInput(input,binding.providerId);
    if (prepared.files.length) await this.attachments.retain(input.attachments || []);
    const {intent,created}=this.store.execution.reserveIntent(key,hash(input),{kind:"queued-message",chatId,input,predecessorKey,nativeThreadId:binding.nativeThreadId,stateIdentityHash:binding.stateIdentityHash,continueVoice:Boolean(voiceOwner)},{initialState:"queued",limit:{max:128,scopeField:"chatId",scopeMax:16,states:["queued","dispatching","unknown","blocked"]}});
    if (created) this.store.execution.updateIntent(key,{state:"queued"},intent.revision);
    this.scheduleQueues();
    return this.queuedMessages(chatId);
  }

  async cancelQueued(chatId: string, id: string, revision: number) {
    await this.requireBinding(chatId);
    const row=this.store.execution.getIntentById(id);
    if (!row || row.kind!=="queued-message" || row.chatId!==chatId) throw new CodexChatGatewayError("queue_not_found","Queued message not found.",404);
    if (row.state === "cancelled") return this.queuedMessages(chatId);
    if (!["queued","blocked"].includes(row.state)) throw new CodexChatGatewayError("queue_already_dispatching","This message has reached dispatch. Stop its exact turn instead.",409);
    this.store.execution.updateIntent(`queued:${chatId}:${row.input.clientMessageId}`,{state:"cancelled"},revision);
    return this.queuedMessages(chatId);
  }

  private async drainQueue(chatId: string) {
    await this.store.execution.withMutation(`queue-drain:${chatId}`,async()=>{
      const queued=this.store.execution.listIntents({kind:"queued-message",states:["queued"],limit:1000}).find(row=>row.chatId===chatId);
      if (!queued) return;
      let predecessorKey=queued.predecessorKey;
      let predecessor=this.store.execution.getIntent(predecessorKey);
      for(let depth=0;!predecessor && predecessorKey.startsWith("turn:") && depth<32;depth++) {
        const cancelled=this.store.execution.getIntent(`queued:${predecessorKey.slice(5)}`);
        if(cancelled?.state!=="cancelled")break;
        predecessorKey=cancelled.predecessorKey;
        predecessor=this.store.execution.getIntent(predecessorKey);
      }
      if (!predecessor || predecessor.state !== "completed") return;
      const binding=await this.requireBinding(chatId);
      if (binding.archived || binding.nativeThreadId !== queued.nativeThreadId || binding.stateIdentityHash !== queued.stateIdentityHash) return;
      const key=`queued:${chatId}:${queued.input.clientMessageId}`;
      this.store.execution.updateIntent(key,{state:"dispatching"},queued.revision);
      try {
        if (queued.continueVoice) await this.store.patch(chatId,{continuationEnabled:true,continuationEnabledAt:new Date().toISOString()});
        await this.startTurn(chatId,queued.input,{fromQueue:key});
        this.store.execution.updateIntent(key,{state:"delivered"});
      } catch(error) {
        const code=(error as {code?:string}).code;
        this.store.execution.updateIntent(key,{state:["turn_active","workspace_busy","execution_draining","execution_metadata_busy"].includes(code || "") ? "queued" : code === "fallback_confirmation_required" ? "unknown" : "blocked",reason:code || "execution_unavailable"});
      }
    });
  }

  async runtimeStatus() {
    return this.runtime.status();
  }

  async listThreads(input: {
    group?: string;
    archived?: boolean;
    search?: string;
    cursor?: string;
    limit?: number;
    view?: "current" | "legacy" | "all";
  } = {}): Promise<ThreadPage> {
    if (input.group === "voice_work") queueVoiceTaskChatIndexRefresh(this.store, this.runtime);
    const bindings = await this.store.all();
    const providerViews = new Map<RuntimeProviderId, RuntimeProviderView>();
    for (const providerId of ["desktop_bundled", "standalone_cli"] as const) {
      providerViews.set(providerId, (await this.runtime.provider(providerId)).view);
    }
    const search = String(input.search || "").trim().toLowerCase();
    const archived = input.archived === true;
    const archivedKeys = new Set(bindings.filter(row => row.archived).map(logicalChatKey));
    const summaries = bindings
      .map((binding) => summarizeThread({ ...binding, archived: archivedKeys.has(logicalChatKey(binding)) }, providerViews.get(binding.providerId) || null))
      .filter((thread) => thread.archived === archived)
      .filter((thread) => input.group == null || input.group === "all" || thread.group === input.group);
    const view = input.view || "current";
    if (view === "all") {
      const groups = new Map<string, ThreadSummary[]>();
      const byId = new Map(bindings.map(binding => [binding.chatId, binding]));
      for (const summary of summaries) {
        const key = logicalChatKey(byId.get(summary.chatId)!);
        groups.set(key, [...(groups.get(key) || []), summary]);
      }
      const merged = [...groups.values()].map(rows => {
        const ordered = [...rows].sort((a, b) => Number(b.runtime.compatibility === "bound") - Number(a.runtime.compatibility === "bound") || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.chatId.localeCompare(b.chatId));
        return { ...ordered[0], taskLinks: [...new Map(ordered.flatMap(row => row.taskLinks).map(link => [link.taskId, link])).values()] };
      }).filter(thread => !search || `${thread.title} ${thread.preview} ${thread.taskLinks.map(link => link.label).join(" ")}`.toLowerCase().includes(search))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.chatId.localeCompare(b.chatId));
      const offset = input.cursor ? decodeCursor(input.cursor) : 0;
      if (offset == null || offset > merged.length) throw new CodexChatGatewayError("invalid_cursor", "The thread cursor is invalid.", 400);
      const limit = Math.max(1, Math.min(input.limit || 30, 50));
      return { data: merged.slice(offset, offset + limit), nextCursor: offset + limit < merged.length ? encodeCursor(offset + limit) : null, ...(input.group === "voice_work" ? { sync: voiceTaskChatIndexStatus() } : {}) };
    }
    const voiceRows = summaries.filter((thread) => thread.group === "voice_work");
    const currentVoiceIds = new Set<string>();
    const voiceByNative = new Map<string, ThreadSummary[]>();
    for (const thread of voiceRows) {
      const binding = bindings.find((candidate) => candidate.chatId === thread.chatId);
      if (!binding) continue;
      const rows = voiceByNative.get(binding.nativeThreadId) || [];
      rows.push(thread);
      voiceByNative.set(binding.nativeThreadId, rows);
    }
    const compatibilityRank = (value: ThreadSummary["runtime"]["compatibility"]) => value === "bound" ? 3 : value === "compatible" ? 2 : value === "probe_required" ? 1 : 0;
    for (const candidates of voiceByNative.values()) {
      const winner = [...candidates]
        .filter((thread) => compatibilityRank(thread.runtime.compatibility) >= 2)
        .sort((left, right) =>
          compatibilityRank(right.runtime.compatibility) - compatibilityRank(left.runtime.compatibility)
          || Number(right.runtime.providerId === this.runtime.preferredProvider()) - Number(left.runtime.providerId === this.runtime.preferredProvider())
          || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
          || left.chatId.localeCompare(right.chatId))[0];
      if (winner) currentVoiceIds.add(winner.chatId);
    }
    let rows = summaries.filter((thread) => {
      if (thread.group !== "voice_work") return true;
      return view === "legacy" ? !currentVoiceIds.has(thread.chatId) : currentVoiceIds.has(thread.chatId);
    }).filter((thread) => !search || `${thread.title} ${thread.preview} ${thread.taskLinks.map((link) => link.label).join(" ")}`.toLowerCase().includes(search));
    rows = rows.sort((left, right) => Number(right.pinned) - Number(left.pinned) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const requestedOffset = input.cursor ? decodeCursor(input.cursor) : 0;
    if (requestedOffset == null || requestedOffset > rows.length) throw new CodexChatGatewayError("invalid_cursor", "The thread cursor is invalid.", 400);
    const limit = Math.max(1, Math.min(input.limit || 30, 50));
    const data = rows.slice(requestedOffset, requestedOffset + limit);
    const nextOffset = requestedOffset + data.length;
    return {
      data,
      nextCursor: nextOffset < rows.length ? encodeCursor(nextOffset) : null,
      ...(input.group === "voice_work" ? { sync: voiceTaskChatIndexStatus() } : {}),
    };
  }

  async createThread(input: CreateThreadInput) {
    if (!validClientId(input.clientThreadId) || input.source !== "chat") {
      throw new CodexChatGatewayError("invalid_request", "A valid clientThreadId and source=chat are required.", 400);
    }
    if(input.workspace?.mode!==undefined && !["isolated","configured","read-only"].includes(input.workspace.mode))throw new CodexChatGatewayError("invalid_request","Unknown workspace mode.",400);
    const createHash = hash({ clientThreadId: input.clientThreadId, source: input.source, title: input.title, settings: input.settings, ...(input.workspace ? {workspace:input.workspace} : {}) });
    const existing = await this.store.findByClientThreadId(input.clientThreadId);
    if (existing) {
      if (existing.createHash !== createHash && existing.createHash !== hash(input)) throw new CodexChatGatewayError("idempotency_conflict", "This clientThreadId was already used with different values.", 409);
      return { detail: await this.threadDetail(existing.chatId), replayed: true };
    }

    const intentKey = `create:${input.clientThreadId}`;
    let intent;
    try { intent = this.store.execution.reserveIntent(intentKey, createHash, { kind: "create" }).intent; }
    catch (error) { throw new CodexChatGatewayError((error as {code?: string}).code || "execution_unavailable", "The chat request could not be reserved safely.", 409); }
    if (intent.state === "bound" && intent.binding) {
      await this.store.putCreatedBinding(intent.binding as ChatBinding);
      return { detail: await this.threadDetail(String(intent.chatId)), replayed: true };
    }
    if (["dispatching", "unknown"].includes(intent.state)) {
      throw new CodexChatGatewayError("create_delivery_unknown", "The original chat creation is being reconciled. Keep this draft; it will not be sent twice.", 409, true);
    }
    const creationLease = this.store.execution.claim([intentKey], intentKey, { kind: "create" });
    if (!creationLease) throw new CodexChatGatewayError("create_pending", "This chat creation is already in progress.", 409, true);
    let dispatched = false;
    try {
      const provider = await this.runtime.effectiveProvider();
      if (!provider) throw new CodexChatGatewayError("runtime_unavailable", "No compatible Codex runtime is available.", 503, true);
      const connection = await this.runtime.connection(provider.providerId);
      const requestedTitle = titleText(input.title);
      const defaults = this.runtime.threadDefaults();
      const mode=input.workspace?.mode || "configured";
      const configured=defaults.sandbox || "read-only";
      const sandbox=mode === "read-only" ? "read-only" : mode === "isolated" && configured !== "read-only" ? "workspace-write" : configured;
      const workspace = await prepareTaskWorkspace({coordinator:this.store.execution,source:this.root,directory:path.join(this.store.root,"workspaces"),id:input.clientThreadId,
        mode:sandbox === "read-only" ? "read-only" : sandbox === "workspace-write" ? "worktree" : "serialized",baseRevision:input.workspace?.baseRevision});
      creationLease.assertOwned();
      this.store.execution.updateIntent(intentKey, { state: "dispatching", providerId: provider.providerId, stateIdentityHash: provider.view.stateIdentityHash });
      dispatched = true;
      const response = asObject(await connection.request("thread/start", {
        ...defaults,
        cwd: workspace.cwd,
        sandbox,
        model: input.settings?.modelId || defaults.model,
        ephemeral: false,
      }));
      const nativeThread = asObject(response?.thread);
      const nativeThreadId = String(nativeThread?.id || "");
      if (!nativeThreadId) throw new Error("missing_thread_id");
      connection.markThreadLoaded(nativeThreadId);
      const now = new Date().toISOString();
      const binding: ChatBinding = {
        chatId: newId("chat"),
        clientThreadId: input.clientThreadId,
        createHash,
        nativeThreadId,
        providerId: provider.providerId,
        workspace,
        sandbox,
        stateIdentityHash: provider.view.stateIdentityHash,
        group: "my_chats",
        origin: "chat",
        continuationEnabled: true,
        continuationEnabledAt: now,
        title: requestedTitle,
        preview: "",
        createdAt: now,
        updatedAt: now,
        pinned: false,
        archived: false,
        lastStatus: "idle",
        messageReceipts: {},
        taskLinks: [],
      };
      this.store.execution.updateIntent(intentKey, { state: "bound", chatId: binding.chatId, binding });
      await this.store.putCreatedBinding(binding);
      if (input.title) void connection.request("thread/name/set", { threadId: nativeThreadId, name: requestedTitle }, 5_000).catch(() => undefined);
      const detail = await this.threadDetail(binding.chatId);
      this.emit(binding.chatId, "thread.updated", { thread: detail.thread });
      return { detail, replayed: false };
    } catch (error) {
      const current = this.store.execution.getIntent(intentKey);
      if (current?.state !== "bound") this.store.execution.updateIntent(intentKey, { state: dispatched ? "unknown" : "reserved" });
      if (error instanceof CodexChatGatewayError) throw error;
      if (String((error as {code?:string}).code || "").startsWith("workspace_")) throw error;
      throw new CodexChatGatewayError("runtime_incompatible", publicMessage(error), 503, true);
    } finally {
      creationLease.release();
    }
  }

  async createThreadWithFirstTurn(input: CreateThreadWithFirstTurnInput) {
    const firstText = validatedTurnText(input.initialTurn);
    if (parseBudgetIntent(firstText).kind !== "none") throw new CodexChatGatewayError("budget_control_required", "Select an existing task before changing its Goal budget.", 422);
    if (input.initialTurn.attachments?.length && !await this.store.findByClientThreadId(input.clientThreadId)) {
      const provider = await this.runtime.effectiveProvider();
      if (!provider) throw new CodexChatGatewayError("runtime_unavailable", "No compatible runtime is available.", 503, true);
      await this.prepareAttachmentInput(input.initialTurn, provider.providerId);
    }
    const created = await this.createThread(input);
    let binding = await this.requireBinding(created.detail.thread.chatId);
    let freshlyCreatedNativeThread = !created.replayed;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const started = await this.startTurn(binding.chatId, input.initialTurn, { freshlyCreatedNativeThread });
        return {
          data: {
            detail: await this.threadDetail(binding.chatId),
            accepted: started.accepted,
          },
          replayed: created.replayed && started.replayed,
        };
      } catch (error) {
        const canReplace = attempt === 0
          && error instanceof CodexChatGatewayError
          && error.code === "native_thread_missing"
          && replaceableEmptyDirectChat(binding);
        if (canReplace) {
          const active = this.activeTurns.get(binding.chatId);
          if (active && (active.clientMessageId !== input.initialTurn.clientMessageId || active.acknowledged)) throw error;
          if (active) this.releaseActiveTurn(binding.chatId);
          binding = await this.replaceEmptyDirectThread(binding, input);
          freshlyCreatedNativeThread = true;
          continue;
        }
        // Preserve the binding and idempotency key even when the first turn fails.
        // A retry resumes this same chat; deleting it could start a second native thread.
        throw error;
      }
    }
    throw new CodexChatGatewayError("turn_start_rejected", "The first message was not accepted.", 409, true);
  }

  private async replaceEmptyDirectThread(binding: ChatBinding, input: CreateThreadInput) {
    return this.store.execution.withMutation(`replace-empty:${binding.chatId}`, async () => {
      const current=await this.requireBinding(binding.chatId);
      if(current.nativeThreadId!==binding.nativeThreadId)return current;
      if(!replaceableEmptyDirectChat(current))throw new CodexChatGatewayError("native_thread_missing","This task thread is no longer available.",410);
      const key=`replace-empty:${current.chatId}:${current.nativeThreadId}`;
      const {intent}=this.store.execution.reserveIntent(key,hash({clientThreadId:input.clientThreadId}),{kind:"replace-empty",chatId:current.chatId});
      if(intent.state === "bound" && intent.binding) {
        const restored=await this.store.patch(current.chatId,intent.binding);
        if(intent.owner && intent.generation)this.store.execution.reconcileRelease(intent.owner,intent.generation);
        return restored!;
      }
      if(!["reserved","not_dispatched"].includes(intent.state))throw new CodexChatGatewayError("create_delivery_unknown","Replacement of the empty native thread must be reconciled first.",409,true);
      const lease=tryAcquireNativeThreadTurn(nativeThreadLeaseKey(current.stateIdentityHash || current.providerId,current.nativeThreadId),key,{coordinator:this.store.execution,kind:"create",resources:[`chat-binding:${current.chatId}`]});
      if(!lease)throw new CodexChatGatewayError("turn_active","This conversation is already owned by another operation.",409,true);
      let dispatched=false;
      try {
        const provider=await this.runtime.provider(current.providerId);
        if(provider.view.stateIdentityHash!==current.stateIdentityHash)throw new CodexChatGatewayError("runtime_identity_mismatch","The original runtime storage is unavailable.",409);
        const uncertain=this.store.execution.listIntents({kind:"turn",states:["dispatching","running","unknown"],limit:1000}).some(row=>row.chatId===current.chatId);
        if(uncertain)throw new CodexChatGatewayError("fallback_confirmation_required","An earlier first message is unconfirmed; this thread cannot be replaced.",409);
        const connection=await this.runtime.connection(current.providerId),defaults=this.runtime.threadDefaults();
        if(current.workspace)await verifyTaskWorkspace(current.workspace);
        this.store.execution.updateIntent(key,{state:"dispatching",owner:lease.owner,generation:lease.generation},intent.revision);
        dispatched=true;
        const response=asObject(await connection.request("thread/start",{...defaults,cwd:current.workspace?.cwd || defaults.cwd,sandbox:current.sandbox || defaults.sandbox,model:input.settings?.modelId || defaults.model,ephemeral:false}));
        const nativeThreadId=String(asObject(response?.thread)?.id || "");
        if(!nativeThreadId)throw new Error("missing_thread_id");
        connection.markThreadLoaded(nativeThreadId);
        const next={...current,nativeThreadId,updatedAt:new Date().toISOString(),lastStatus:"idle" as const};
        this.store.execution.updateIntent(key,{state:"bound",binding:next});
        await this.store.patch(current.chatId,next);
        const creation=this.store.execution.getIntent(`create:${current.clientThreadId}`);
        if(creation?.state === "bound")this.store.execution.updateIntent(`create:${current.clientThreadId}`,{binding:next});
        for(const turn of this.store.execution.listIntents({kind:"turn",states:["reserved","not_dispatched"],limit:1000})) {
          if(turn.chatId===current.chatId)this.store.execution.updateIntent(`turn:${current.chatId}:${turn.clientMessageId}`,{nativeThreadId});
        }
        lease();
        return next;
      } catch(error) {
        if(!dispatched)lease();
        else if(this.store.execution.getIntent(key)?.state!=="bound")this.store.execution.updateIntent(key,{state:"unknown"});
        throw error;
      }
    });
  }

  async threadDetail(chatId: string): Promise<ThreadDetail> {
    const binding = await this.requireBinding(chatId);
    const provider = (await this.runtime.provider(binding.providerId)).view;
    const current = binding;
    let nativeThread: unknown;
    let history: NonNullable<ThreadDetail["history"]> = { state: "available", code: null, recoverable: false };
    try {
      nativeThread = await this.readNativeThread(current, false);
    } catch (error) {
      const code = error instanceof CodexChatGatewayError ? error.code : "history_unavailable";
      history = { state: code === "history_recovery_available" ? "recovery_available" : "blocked", code, recoverable: code === "history_recovery_available" };
    }
    const nativeResource=createHash("sha256").update(nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId,binding.nativeThreadId)).digest("hex");
    const voiceOwner=this.store.execution.claims().find(row=>row.resource===nativeResource && row.kind==="voice-workflow");
    const voice=voiceOwner ? this.store.execution.getIntent(`voice-workflow:${voiceOwner.detail.taskId}`) : null;
    const summary = summarizeThread(voice ? {...current,lastStatus:"active"} : current, provider, voice ? undefined : nativeThread);
    const control = nativeControlView(this.store.execution, nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId,binding.nativeThreadId));
    const controlTurnId = control ? this.activeTurns.get(chatId)?.turnId || turnIdFor(chatId,control.nativeTurnId) : null;
    return {
      thread: summary,
      voiceWorkflow:voice ? {taskId:voice.taskId,state:voice.state,revision:voice.revision,question:voice.question || null,questionId:voice.questionId || null} : null,
      queued: await this.queuedMessages(chatId),
      controls: control && controlTurnId ? {turnId:controlTurnId,steer:control.steer && provider.capabilities.steerTurn,interrupt:provider.capabilities.interruptTurn} : null,
      activeTurnId: this.activeTurns.get(chatId)?.turnId || null,
      pendingRequests: pendingNativeRequests(binding.stateIdentityHash!,binding.nativeThreadId).map(request=>({
        requestId:request.id,chatId,turnId:controlTurnId || "",itemId:null,kind:request.kind,title:request.kind === "user_input" ? "Input needed" : "Approval needed",reason:typeof request.params.reason === "string" ? request.params.reason : null,expiresAt:null,resolved:false,
        presentation:{...Object.fromEntries(Object.entries(request.params).filter(([key])=>!["threadId","turnId","itemId"].includes(key))),revision:request.revision,state:request.state},
      })),
      streamUrl: `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/events`,
      continuationState: summary.continuationState,
      history,
    };
  }

  async voiceControl(chatId:string,input:{action:"answer"|"stop";taskId:string;questionId?:string;revision:number;answer?:string;clientMessageId:string}) {
    const binding=await this.requireBinding(chatId);
    const workflow=this.store.execution.getIntent(`voice-workflow:${input.taskId}`);
    if(!validClientId(input.clientMessageId) || !binding.taskLinks.some(link=>link.taskId===input.taskId) || !workflow) throw new CodexChatGatewayError("voice_task_not_linked","This Voice task is not linked to the selected conversation.",409);
    if(input.action==="answer") {
      const text=String(input.answer || "").trim();
      if(!text || Buffer.byteLength(text)>4_000)throw new CodexChatGatewayError("invalid_request","Enter an answer of at most 4,000 UTF-8 bytes.",400);
      const key=`voice-answer:${input.taskId}:${input.clientMessageId}`;
      const {intent}=this.store.execution.reserveIntent(key,hash(input),{kind:"voice-answer",chatId,taskId:input.taskId});
      if(intent.state==="answered")return {submitted:true,replayed:true};
      if(!["reserved","not_dispatched"].includes(intent.state))throw new CodexChatGatewayError("voice_answer_unconfirmed","The original answer must be reconciled before another continuation.",409);
      this.store.execution.updateIntent(key,{state:"dispatching"},intent.revision);
      const {answerPrithaCodexTask}=await import("../realtime/pritha-runtime");
      const result=await answerPrithaCodexTask({task_id:input.taskId,answer:text,expected_question_id:input.questionId,expected_revision:input.revision});
      if(result.ok===false){this.store.execution.updateIntent(key,{state:"not_dispatched"});throw new CodexChatGatewayError("voice_question_changed","This question was already answered or changed.",409);}
      this.store.execution.updateIntent(key,{state:"answered"});
      return {submitted:true,replayed:false};
    }
    if(input.action!=="stop" || workflow.revision!==input.revision)throw new CodexChatGatewayError("voice_task_changed","Refresh the Voice task before controlling it.",409);
    const {abortPrithaCodexTask}=await import("../realtime/pritha-runtime");
    const result = await abortPrithaCodexTask(input.taskId,"Operator requested stop from Task Chat.",input.revision);
    if (result.ok === false || ("recovery_required" in result && result.recovery_required)) {
      throw new CodexChatGatewayError("voice_stop_unconfirmed", "The original execution owner is unavailable. No new stop signal was sent; reconcile this task first.", 409);
    }
    return {submitted:"abort_applied" in result && result.abort_applied === true, alreadyTerminal:"abort_applied" in result && result.abort_applied === false};
  }

  async workspacePreview() {
    const workspace=await inspectTaskWorkspace(this.root);
    return {git:workspace.git,dirty:workspace.dirty,baseRevision:workspace.baseRevision};
  }

  async answerRequest(chatId:string,input:Parameters<typeof answerNativeRequest>[2]) {
    if(!validClientId(input.clientMessageId))throw new CodexChatGatewayError("invalid_request","A stable answer identifier is required.",400);
    const binding=await this.requireBinding(chatId);
    const provider=(await this.runtime.provider(binding.providerId)).view;
    if(provider.stateIdentityHash!==binding.stateIdentityHash)throw new CodexChatGatewayError("runtime_identity_mismatch","The original request storage is unavailable.",409);
    return answerNativeRequest(binding.stateIdentityHash!,binding.nativeThreadId,input);
  }

  async controlTurn(chatId: string, input: {action:"steer"|"interrupt";expectedTurnId:string;clientMessageId:string;text?:string}) {
    if (!validClientId(input.clientMessageId) || !["steer","interrupt"].includes(input.action) || !input.expectedTurnId) throw new CodexChatGatewayError("invalid_request","A valid action, request identifier and exact turn are required.",400);
    const binding = await this.requireBinding(chatId);
    const provider = (await this.runtime.provider(binding.providerId)).view;
    if (provider.stateIdentityHash !== binding.stateIdentityHash) throw new CodexChatGatewayError("runtime_identity_mismatch","The original execution storage is unavailable.",409);
    if (!provider.capabilities[input.action === "steer" ? "steerTurn" : "interruptTurn"]) throw new CodexChatGatewayError("control_unsupported","This runtime does not support the requested control.",422);
    const text = String(input.text || "").trim();
    if (input.action === "steer" && (!text || Buffer.byteLength(text,"utf8") > 64_000)) throw new CodexChatGatewayError("invalid_request","A clarification must contain at most 64,000 UTF-8 bytes.",400);
    const intentKey=`control:${chatId}:${input.clientMessageId}`;
    const {intent}=this.store.execution.reserveIntent(intentKey,hash(input),{kind:input.action,chatId,clientMessageId:input.clientMessageId,text,expectedTurnId:input.expectedTurnId});
    if (intent.state === "confirmed") return {status:"requested",action:input.action,replayed:true};
    if (!["reserved","not_dispatched"].includes(intent.state)) throw new CodexChatGatewayError("control_delivery_unknown","Delivery of this control is being reconciled. It will not be repeated automatically.",409);
    const key=nativeThreadLeaseKey(binding.stateIdentityHash!,binding.nativeThreadId);
    return this.store.execution.withMutation(`native-control:${key}`,async()=>{
      const current=this.store.execution.getIntent(intentKey)!;
      if (current.state === "confirmed") return {status:"requested",action:input.action,replayed:true};
      if (!["reserved","not_dispatched"].includes(current.state)) throw new CodexChatGatewayError("control_delivery_unknown","The original control is unconfirmed.",409);
      const control=nativeControlView(this.store.execution,key);
      const turnId=control ? this.activeTurns.get(chatId)?.turnId || turnIdFor(chatId,control.nativeTurnId) : null;
      if (!control || turnId !== input.expectedTurnId) throw new CodexChatGatewayError("control_turn_changed","The selected turn ended or its connection changed. Your draft has been kept.",409);
      if (input.action === "steer" && this.store.execution.listIntents({kind:"steer",states:["dispatching","unknown"],limit:1000}).some(row=>row.chatId===chatId && row.nativeTurnId===control.nativeTurnId)) throw new CodexChatGatewayError("control_delivery_unknown","An earlier clarification is still unconfirmed. Check this turn before sending another clarification.",409);
      this.store.execution.updateIntent(intentKey,{state:"dispatching",nativeTurnId:control.nativeTurnId},current.revision);
      try {
        await controlNativeTurn(this.store.execution,key,control.nativeTurnId,input.action,input.action === "steer" ? {
          threadId:binding.nativeThreadId,expectedTurnId:control.nativeTurnId,clientUserMessageId:input.clientMessageId,input:[{type:"text",text}],
        } : {threadId:binding.nativeThreadId,turnId:control.nativeTurnId});
        this.store.execution.updateIntent(intentKey,{state:"confirmed"});
        this.historyReader?.invalidateChat(chatId);
        return {status:"requested",action:input.action,replayed:false};
      } catch(error) {
        const rejected=typeof (error as {rpcCode?:number}).rpcCode === "number";
        this.store.execution.updateIntent(intentKey,{state:rejected ? "not_dispatched" : "unknown"});
        if(rejected)throw new CodexChatGatewayError("control_rejected","The runtime rejected this control. Your draft has been kept; refresh the turn before trying again.",409);
        throw new CodexChatGatewayError("control_delivery_unknown","The runtime did not confirm this control. Check the task before repeating it.",409);
      }
    });
  }

  private async goalContext(chatId: string, writable: boolean) {
    const binding = await this.requireBinding(chatId);
    const provider = (await this.runtime.provider(binding.providerId)).view;
    if (provider.availability !== "ready") throw new CodexChatGatewayError("runtime_unavailable", "The task runtime is unavailable. Its saved progress is preserved.", 503, true);
    if (!provider.capabilities.goalControl) throw new CodexChatGatewayError("goal_unsupported", "This runtime does not expose Goal controls.", 422);
    if (!binding.stateIdentityHash || provider.stateIdentityHash !== binding.stateIdentityHash) throw new CodexChatGatewayError("runtime_identity_mismatch", "Restore access to the original task before changing its Goal.", 409);
    const native = await this.readNativeThread(binding, false);
    if (native.id !== binding.nativeThreadId || native.ephemeral === true) throw new CodexChatGatewayError("goal_thread_mismatch", "The Goal could not be bound to this saved task.", 409);
    if (writable) {
      if (binding.archived) throw new CodexChatGatewayError("chat_archived", "Restore this chat before changing its budget.", 409);
      if (binding.origin === "voice" && !binding.continuationEnabled) throw new CodexChatGatewayError("continuation_confirmation_required", "Choose Continue in Task Chat before changing this task.", 409);
      if (this.activeTurns.has(chatId) || threadStatusFromNative(native.status) === "active") throw new CodexChatGatewayError("turn_active", "Wait for the current turn or pending approval before changing its budget.", 409, true);
    }
    const connection = await this.runtime.connection(binding.providerId);
    return {
      threadId: binding.nativeThreadId,
      read: () => connection.request("thread/goal/get", { threadId: binding.nativeThreadId }, 5_000),
      set: (params: { threadId: string; tokenBudget: number; status?: "active" }) => connection.request("thread/goal/set", params, 10_000),
      receipts: async () => (await this.requireBinding(chatId)).goalBudgetRequests || {},
      save: async (requestId: string, receipt: GoalBudgetReceipt) => {
        const current = await this.requireBinding(chatId);
        if (!await this.store.patch(chatId, { goalBudgetRequests: { ...current.goalBudgetRequests, [requestId]: receipt } })) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
      },
    };
  }

  private async deliveryContext(chatId: string, writable: boolean) {
    const binding = await this.requireBinding(chatId);
    const provider = (await this.runtime.provider(binding.providerId)).view;
    if (provider.availability !== "ready" || !binding.stateIdentityHash || provider.stateIdentityHash !== binding.stateIdentityHash) {
      throw new CodexChatGatewayError("delivery_task_unverified", "Restore access to the original native task before using delivery actions.", 409);
    }
    const native = await this.readNativeThread(binding, false);
    if (!verifyNativeThreadIdentity(native, binding.nativeThreadId, binding.workspace?.cwd || this.root) || native.ephemeral === true) {
      throw new CodexChatGatewayError("delivery_task_unverified", "The delivery action could not be bound to this saved task.", 409);
    }
    if (writable) {
      if (binding.archived) throw new CodexChatGatewayError("chat_archived", "Restore this task before using a host action.", 409);
      if (binding.origin === "voice" && !binding.continuationEnabled) throw new CodexChatGatewayError("continuation_confirmation_required", "Choose Continue in Task Chat before using a host action.", 409);
      if (this.activeTurns.has(chatId) || threadStatusFromNative(native.status) === "active") throw new CodexChatGatewayError("turn_active", "Wait for the active turn or pending approval before using a host action.", 409, true);
    }
    // Goal availability and budget status do not authorize or block a host job.
    // Native history is read for ownership only; there is no Goal RPC or turn.
    return binding;
  }

  async operationDecision(chatId: string, runId: string, action: OperationAction, request?: OperationRequest) {
    const binding = await this.deliveryContext(chatId, Boolean(request));
    const release = request ? tryAcquireNativeThreadTurn(nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId, binding.nativeThreadId), `operation:${chatId}`) : null;
    if (request && !release) throw new CodexChatGatewayError("turn_active", "Дождитесь завершения текущего действия.", 409);
    const options = { root: this.root, stateRoot: this.store.stateRoot, runtime: operationRuntime(this.root, this.store.stateRoot) };
    try {
      if (request) return await resolveOperationDecision(binding, request, options);
      const { agentId, planLock, enabled, label, summary, reason, pendingRequest } = await planOperationDecision(binding, runId, action, options);
      return { agentId, runId, action, planLock, enabled, label, summary, reason, pendingRequest };
    } catch (error) {
      if (error instanceof TaskDeliveryError) throw new CodexChatGatewayError(error.code, error.message, error.status);
      throw new CodexChatGatewayError("operation_unavailable", "Операция пока недоступна. Проверьте Operations и сохранённое состояние.", 409);
    } finally { release?.(); }
  }

  async taskDeliveries(chatId: string, runId?: string) {
    const binding = await this.deliveryContext(chatId, false);
    try {
      const options = { root: this.root, stateRoot: this.store.stateRoot };
      return runId ? { run: readTaskDelivery(runId, binding, options) } : { runs: listTaskDeliveries(binding, options) };
    } catch (error) {
      if (error instanceof TaskDeliveryError) throw new CodexChatGatewayError(error.code, error.message, error.status);
      throw new CodexChatGatewayError("delivery_unavailable", "The saved delivery evidence is temporarily unavailable.", 503, true);
    }
  }

  async deliveryAction(chatId: string, input: TaskDeliveryRequest) {
    const binding = await this.requireBinding(chatId);
    if (input?.action === "budget" && (binding.goalBudgetRequests?.[input.requestId] || binding.messageReceipts[input.requestId] || binding.attachmentMessages?.[input.requestId])) {
      throw new CodexChatGatewayError("idempotency_conflict", "This request identifier already belongs to another task operation.", 409);
    }
    const release = tryAcquireNativeThreadTurn(nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId, binding.nativeThreadId), `delivery:${chatId}`);
    if (!release) throw new CodexChatGatewayError("turn_active", "This task has an active operation. Read its progress before trying another action.", 409, true);
    try {
      const current = await this.deliveryContext(chatId, true);
      if (input?.action === "budget") {
        input = normalizeTaskDeliveryBudgetRequest(input);
        const prior = await this.deliveryBudgetReceipt(current, input.requestId);
        if (prior && hash(normalizeTaskDeliveryBudgetRequest(prior.request)) !== hash(input)) {
          throw new CodexChatGatewayError("idempotency_conflict", "This budget action was saved with a different request or run.", 409);
        }
        if (!prior) await this.saveDeliveryBudgetRequest(current, input);
      }
      // This is only a conservative history-retention hint. Authorization is
      // still verified from the exact run binding by the host controller.
      if (input?.action === "bind") await this.store.patch(chatId, { hasDeliveryBinding: true });
      return await performTaskDeliveryAction(current, input, { root: this.root, stateRoot: this.store.stateRoot });
    } catch (error) {
      if (error instanceof CodexChatGatewayError) throw error;
      if (error instanceof TaskDeliveryError) throw new CodexChatGatewayError(error.code, error.message, error.status);
      if ((error as { code?: string })?.code === "delivery_running") throw new CodexChatGatewayError("delivery_running", "This delivery already has an active host operation. Read its current progress.", 409, true);
      throw new CodexChatGatewayError("delivery_unconfirmed", "Read the saved host action before trying another request.", 503, true);
    } finally { release(); }
  }

  async applyDeliveryBudgetIntent(chatId: string, input: { clientMessageId: string; text: string; runId?: string }) {
    if (!validClientId(input?.clientMessageId) || typeof input?.text !== "string" || (input.runId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.runId))) {
      throw new CodexChatGatewayError("invalid_request", "A valid message identifier, text and selected run are required.", 400);
    }
    const intent = parseBudgetIntent(input.text);
    if (intent.kind !== "delivery_budget") throw new CodexChatGatewayError("budget_intent_ambiguous", intent.kind === "clarification" ? intent.message : "Send a direct build budget command.", 422);
    const binding = await this.requireBinding(chatId);
    if (binding.goalBudgetRequests?.[input.clientMessageId] || binding.messageReceipts[input.clientMessageId] || binding.attachmentMessages?.[input.clientMessageId]) {
      throw new CodexChatGatewayError("idempotency_conflict", "This message identifier already belongs to another task operation.", 409);
    }
    const release = tryAcquireNativeThreadTurn(nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId, binding.nativeThreadId), `delivery-budget:${chatId}`);
    if (!release) throw new CodexChatGatewayError("turn_active", "This task has an active operation. Read its saved progress before retrying the budget command.", 409, true);
    try {
      const current = await this.deliveryContext(chatId, true);
      const options = { root: this.root, stateRoot: this.store.stateRoot };
      const sourceTextHash = hash(input.text.trim());
      const prior = await this.deliveryBudgetReceipt(current, input.clientMessageId);
      const requestedRun = intent.runId || input.runId;
      if (prior && (prior.sourceTextHash !== sourceTextHash || prior.request?.action !== "budget" || !prior.request.runId
        || (requestedRun && prior.request.runId !== requestedRun))) throw new CodexChatGatewayError("idempotency_conflict", "This budget message was saved with a different text or run.", 409);
      let request = prior?.request;
      if (!request) {
        const runs = requestedRun ? [{ runId: requestedRun }] : listTaskDeliveries(current, options);
        if (runs.length !== 1) throw new CodexChatGatewayError("delivery_scope_ambiguous", "Выберите одну связанную сборку в панели или укажите её run ID в команде бюджета.", 422);
        const run = readTaskDelivery(runs[0].runId, current, options);
        if (run.bindingStatus !== "bound") throw new CodexChatGatewayError("delivery_task_mismatch", "Link the selected build to this task before changing its budget.", 409);
        request = { runId: run.runId, requestId: input.clientMessageId, expectedRevision: run.revision, action: "budget", sourceTextHash,
          budget: { mode: intent.mode, tokens: intent.tokens, resume: intent.resume } };
        // Persist the resolved run before mutation. A retry never re-selects a
        // newer run, changes scope or grants the same additive budget twice.
        await this.saveDeliveryBudgetRequest(current, request);
      }
      return await performTaskDeliveryAction(current, request, options);
    } catch (error) {
      if (error instanceof CodexChatGatewayError) throw error;
      if (error instanceof TaskDeliveryError) throw new CodexChatGatewayError(error.code, error.message, error.status);
      if ((error as { code?: string })?.code === "delivery_running") throw new CodexChatGatewayError("delivery_running", "This delivery has an active operation. Retry this same budget message after reading its progress.", 409, true);
      throw new CodexChatGatewayError("delivery_unconfirmed", "Read the saved build budget action before trying another request.", 503, true);
    } finally { release(); }
  }

  private async deliveryBudgetReceipt(binding: ChatBinding, requestId: string): Promise<DeliveryBudgetReceipt | undefined> {
    const aliases = (await this.store.all()).filter(row => logicalChatKey(row) === logicalChatKey(binding));
    const receipts = aliases.flatMap(row => Object.hasOwn(row.deliveryBudgetRequests || {}, requestId) ? [row.deliveryBudgetRequests![requestId]] : []);
    if (!receipts.length) return undefined;
    const signature = (receipt: DeliveryBudgetReceipt) => hash([receipt.sourceTextHash || null, normalizeTaskDeliveryBudgetRequest(receipt.request)]);
    const expected = signature(receipts[0]);
    if (receipts.some(receipt => signature(receipt) !== expected)) {
      throw new CodexChatGatewayError("idempotency_conflict", "The aliases of this task contain conflicting budget requests. Review the original run before choosing a new action.", 409);
    }
    return receipts[0];
  }

  private async saveDeliveryBudgetRequest(binding: ChatBinding, request: TaskDeliveryRequest) {
    if (!await this.store.patch(binding.chatId, { deliveryBudgetRequests: { ...binding.deliveryBudgetRequests,
      [request.requestId]: { ...(request.sourceTextHash ? { sourceTextHash: request.sourceTextHash } : {}), request } } })) {
      throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
    }
  }

  async threadGoal(chatId: string): Promise<ThreadGoalView> {
    try { return await readThreadGoal(await this.goalContext(chatId, false)); }
    catch (error) {
      if (error instanceof CodexChatGatewayError && error.code === "goal_unsupported") return emptyGoalView("unsupported");
      if (error instanceof CodexChatGatewayError) throw error;
      throw new CodexChatGatewayError("goal_unavailable", "The Goal could not be read. Task history and progress are preserved.", 503, true);
    }
  }

  async updateGoalBudget(chatId: string, input: GoalBudgetRequest) {
    const binding = await this.requireBinding(chatId);
    if (binding.deliveryBudgetRequests?.[input?.requestId]) throw new CodexChatGatewayError("idempotency_conflict", "This request identifier was used for a build budget.", 409);
    const release = tryAcquireNativeThreadTurn(nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId, binding.nativeThreadId), `goal-budget:${chatId}`);
    if (!release) throw new CodexChatGatewayError("turn_active", "This task already has an active operation. Reconcile it before changing its budget.", 409, true);
    try {
      const result = await changeThreadGoalBudget(await this.goalContext(chatId, true), input);
      this.emit(chatId, "goal.updated", { goal: result.goal });
      return result;
    } catch (error) {
      if (error instanceof CodexChatGatewayError) throw error;
      if (error instanceof GoalControlError) throw new CodexChatGatewayError(error.code, error.message, error.status, error.retryable);
      throw new CodexChatGatewayError("goal_update_unconfirmed", "The runtime did not confirm the budget change. Retry the same request to reconcile it.", 503, true);
    } finally { release(); }
  }

  async applyBudgetIntent(chatId: string, input: { clientMessageId: string; text: string }) {
    if (!validClientId(input?.clientMessageId) || typeof input?.text !== "string") throw new CodexChatGatewayError("invalid_request", "A valid message identifier and text are required.", 400);
    const intent = parseBudgetIntent(input.text);
    if (intent.kind !== "goal_budget") throw new CodexChatGatewayError("budget_intent_ambiguous", intent.kind === "clarification" ? intent.message : "Send a direct budget command for this task.", 422);
    const binding = await this.requireBinding(chatId);
    if (binding.deliveryBudgetRequests?.[input.clientMessageId]) throw new CodexChatGatewayError("idempotency_conflict", "This message identifier was used for a build budget.", 409);
    if (binding.messageReceipts[input.clientMessageId] || binding.attachmentMessages?.[input.clientMessageId]) throw new CodexChatGatewayError("idempotency_conflict", "This message identifier was already used for a model turn.", 409);
    const release = tryAcquireNativeThreadTurn(nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId, binding.nativeThreadId), `budget-intent:${chatId}`);
    if (!release) throw new CodexChatGatewayError("turn_active", "This task already has an active operation. Reconcile it before changing its budget.", 409, true);
    try {
      const context = await this.goalContext(chatId, true);
      const sourceTextHash = hash(input.text.trim());
      const receipts = await context.receipts();
      const prior = receipts[input.clientMessageId];
      if (prior && prior.sourceTextHash !== sourceTextHash) throw new CodexChatGatewayError("idempotency_conflict", "This budget message identifier was used with different text.", 409);
      const goal = prior ? null : await readThreadGoal(context);
      if (!prior && !goal?.revision) throw new CodexChatGatewayError("goal_missing", "This task has no Goal to extend.", 409);
      const request = prior?.request || {
        requestId: input.clientMessageId, expectedRevision: goal!.revision!,
        mode: intent.mode, tokens: intent.tokens, resume: intent.resume,
      };
      const result = await changeThreadGoalBudget({
        ...context,
        save: (id, receipt) => context.save(id, { ...receipt, sourceTextHash }),
      }, request);
      this.emit(chatId, "goal.updated", { goal: result.goal });
      return result;
    } catch (error) {
      if (error instanceof CodexChatGatewayError) throw error;
      if (error instanceof GoalControlError) throw new CodexChatGatewayError(error.code, error.message, error.status, error.retryable);
      throw new CodexChatGatewayError("goal_update_unconfirmed", "The runtime did not confirm the budget change. Retry the same message to reconcile it.", 503, true);
    } finally { release(); }
  }

  async archiveThread(chatId: string, archived: boolean) {
    const binding = await this.store.setArchived(chatId, archived);
    if (!binding) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
    const summary = summarizeThread(binding, null);
    this.emit(chatId, archived ? "thread.archived" : "thread.unarchived", { archived });
    return summary;
  }

  async restoreAccess(chatId: string) {
    const binding = await this.requireBinding(chatId);
    const provider = (await this.runtime.provider(binding.providerId)).view;
    if (!provider.stateIdentityHash) throw new CodexChatGatewayError("runtime_unavailable", "The selected runtime is unavailable.", 503, true);
    if (binding.stateIdentityHash !== provider.stateIdentityHash) {
      await this.readNativeThread(binding, true, true);
      await this.store.migrateIdentity(chatId, binding.stateIdentityHash, provider.stateIdentityHash);
    }
    return this.threadDetail(chatId);
  }

  async taskChatLinkForTask(taskId: string) {
    await reconcileVoiceTaskChatLink(this.store, this.runtime, taskId);
    const candidates = (await this.store.all()).filter((row) => row.taskLinks.some((link) => link.taskId === taskId));
    const views = new Map<RuntimeProviderId, RuntimeProviderView>();
    for (const providerId of ["desktop_bundled", "standalone_cli"] as const) views.set(providerId, (await this.runtime.provider(providerId)).view);
    const effective = (await this.runtime.effectiveProvider())?.providerId || this.runtime.preferredProvider();
    const binding = candidates.sort((left, right) => {
      const leftView = summarizeThread(left, views.get(left.providerId) || null);
      const rightView = summarizeThread(right, views.get(right.providerId) || null);
      const rank = (value: ThreadSummary["runtime"]["compatibility"]) => value === "bound" ? 3 : value === "compatible" ? 2 : value === "probe_required" ? 1 : 0;
      return rank(rightView.runtime.compatibility) - rank(leftView.runtime.compatibility)
        || Number(right.providerId === effective) - Number(left.providerId === effective)
        || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    })[0] || null;
    if (!binding) return null;
    const detail = await this.threadDetail(binding.chatId);
    return {
      chatId: binding.chatId,
      href: `/task-chat?group=voice_work&chat=${encodeURIComponent(binding.chatId)}`,
      historyAvailable: detail.thread.runtime.compatibility === "bound",
      continuationState: detail.continuationState,
    };
  }

  async createTaskLink(chatId: string, input: CreateTaskLinkRequest) {
    if (!input.taskId || !["shared_thread", "result_reference"].includes(input.mode)) {
      throw new CodexChatGatewayError("invalid_request", "A valid taskId and link mode are required.", 400);
    }
    await reconcileVoiceTaskChatLink(this.store, this.runtime, input.taskId);
    const binding = await this.requireBinding(chatId);
    const existing = binding.taskLinks.find((link) => link.taskId === input.taskId);
    if (!existing) throw new CodexChatGatewayError("task_not_linked", "This task is not linked to the selected chat.", 404);
    if (input.mode === "shared_thread") {
      const workflow=this.store.execution.getIntent(`voice-workflow:${input.taskId}`);
      if ((workflow && !["completed","not_dispatched"].includes(workflow.state)) || (!workflow && !["complete","failed","failed_timeout","failed_empty_result","aborted","rejected"].includes(existing.status))) throw new CodexChatGatewayError("voice_task_owned","This Voice task still owns the conversation. Answer its question or stop the task before taking over.",409);
      const provider = (await this.runtime.provider(binding.providerId)).view;
      if (!binding.stateIdentityHash || provider.stateIdentityHash !== binding.stateIdentityHash) {
        throw new CodexChatGatewayError("runtime_identity_mismatch", "The task runtime does not match this chat binding.", 409);
      }
      const native = await this.readNativeThread(binding, false);
      if (threadStatusFromNative(native.status) === "active" || this.activeTurns.has(chatId)) {
        throw new CodexChatGatewayError("turn_active", "This task thread already has an active turn.", 409, true);
      }
    }
    const now = new Date().toISOString();
    const taskLinks = binding.taskLinks.map((link) => link.taskId === input.taskId ? { ...link, mode: input.mode } : link);
    const next = await this.store.patch(chatId, {
      taskLinks,
      continuationEnabled: input.mode === "shared_thread" ? true : binding.continuationEnabled,
      continuationEnabledAt: input.mode === "shared_thread" ? now : binding.continuationEnabledAt,
      updatedAt: now,
    });
    if (!next) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
    const detail = await this.threadDetail(chatId);
    this.emit(chatId, "thread.updated", { thread: detail.thread });
    return detail;
  }

  private async historyOperation<T>(chatId: string, key: string, operation: (context: HistoryContext, deadline: number) => Promise<T>): Promise<T> {
    return this.historyReader.singleFlight(`${chatId}:${key}`, async () => {
      const started = Date.now(), deadline = started + HISTORY_READ_MS;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let phase = "metadata";
      try {
        return await Promise.race([
          (async () => {
            const binding = await this.requireBinding(chatId);
            const provider = (await this.runtime.provider(binding.providerId)).view;
            if (provider.availability !== "ready") throw new HistoryError("runtime_unavailable", "The selected history runtime is unavailable.", 503, true);
            if (provider.stateIdentityHash !== binding.stateIdentityHash) {
              await this.readNativeThread(binding, false);
              throw new HistoryError("history_recovery_available", "Restore access to this original conversation before loading history.", 409, true);
            }
            let runtimeReadMs = 0;
            const read: HistoryContext["read"] = async (method, params, until) => {
              const before = Date.now();
              try {
                const response = await this.runtime.historyRequest(binding.providerId, method, params, until);
                // A separate history connection reconstructs open rollouts as
                // interrupted. Its snapshots must never release execution owners.
                return this.executionAwareHistory(binding, method, response);
              }
              finally { runtimeReadMs += Date.now() - before; }
            };
            const metadata = asObject(await read("thread/read", { threadId: binding.nativeThreadId, includeTurns: false }, deadline));
            if (!verifyNativeThreadIdentity(asObject(metadata?.thread) || {}, binding.nativeThreadId, binding.workspace?.cwd || this.root)) throw new HistoryError("runtime_identity_mismatch", "The original conversation could not be verified in this workspace.", 409);
            phase = "history";
            const readStarted = Date.now();
            const result = await operation({ binding, root: this.root, version: provider.version || "unknown", pagination: provider.capabilities.historyPagination, read }, deadline);
            if (Date.now() >= deadline) throw new HistoryError("history_timeout", "History preparation timed out. Retry without restarting the task.", 504, true);
            void this.store.recordRuntimeEvent("history-page-read", { chatRef: hash({ chatId }).slice(0, 16), providerId: binding.providerId,
              metadataMs: readStarted - started, historyMs: Date.now() - readStarted, runtimeReadMs, preparationMs: Math.max(0, Date.now() - started - runtimeReadMs), bytes: Buffer.byteLength(JSON.stringify(result)) }).catch(() => undefined);
            return result;
          })(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HistoryError("history_timeout", "Reading history took too long. Retry without restarting the task.", 504, true)), HISTORY_READ_MS); }),
        ]);
      } catch (error) {
        const code = error instanceof HistoryError || error instanceof CodexChatGatewayError ? error.code
          : (error as { code?: string }).code === "history_response_too_large" ? "history_response_too_large" : classifyNativeThreadReadFailure(error);
        void this.store.recordRuntimeEvent("history-read-failed", { chatRef: hash({ chatId }).slice(0, 16), phase, code, durationMs: Date.now() - started }).catch(() => undefined);
        if (error instanceof HistoryError || error instanceof CodexChatGatewayError) throw error;
        if (code === "history_response_too_large") throw new HistoryError(code, "This history needs a Codex runtime with pagination. Update the selected runtime.", 413);
        if (code === "history_timeout") throw new HistoryError(code, "Reading history took too long. Retry without restarting the task.", 504, true);
        if (code === "native_thread_missing") throw new HistoryError(code, "The original history was not found. Its binding has been preserved.", 410);
        throw new HistoryError("history_unavailable", "History could not be read from the selected runtime.", 503, true);
      } finally { if (timer) clearTimeout(timer); }
    });
  }

  private executionAwareHistory(binding: ChatBinding, method: string, response: unknown) {
    const live = this.store.execution.listIntents({states:["dispatching","running"],limit:1000})
      .filter(row => (row.kind === "turn" || row.kind === "voice-turn")
        && row.nativeThreadId === binding.nativeThreadId
        && (row.stateIdentityHash || row.storage) === binding.stateIdentityHash);
    const pending = new Set(live.map(row=>String(row.nativeTurnId || "")).filter(Boolean));
    const overlay = (value: unknown) => {
      const turn = asObject(value);
      return turn && pending.has(String(turn.id)) ? {...turn,status:"inProgress",completedAt:null} : value;
    };
    const data = asObject(response);
    if (method === "thread/turns/list" && Array.isArray(data?.data)) return {...data,data:data.data.map(overlay)};
    const thread = asObject(data?.thread);
    if (method === "thread/read" && Array.isArray(thread?.turns)) return {...data,thread:{...thread,turns:thread.turns.map(overlay)}};
    return response;
  }

  historyPage(chatId: string, cursor?: string, limit = 20) {
    return this.historyOperation(chatId, `page:${cursor || "latest"}:${limit}`, (context, deadline) => this.historyReader.page(context, cursor, limit, deadline));
  }
  historyItems(chatId: string, turnId: string, ref: string) {
    return this.historyOperation(chatId, `items:${turnId}:${ref}`, (context, deadline) => this.historyReader.items(context, turnId, ref, deadline));
  }
  historyContent(chatId: string, itemId: string, ref: string) {
    return this.historyOperation(chatId, `content:${itemId}:${ref}`, (context, deadline) => this.historyReader.content(context, itemId, ref, deadline));
  }

  async listTurns(chatId: string, input: { cursor?: string; direction?: "older" | "newer"; limit?: number } = {}): Promise<TurnPage> {
    const binding = await this.requireBinding(chatId);
    const nativeThread = await this.readNativeThread(binding, true);
    const nativeTurns = Array.isArray(nativeThread.turns) ? nativeThread.turns : [];
    const active = this.activeTurns.get(chatId) || null;
    let turns = nativeTurns
      .map((turn) => {
        const nativeId = String(asObject(turn)?.id || "");
        return normalizeNativeTurn(binding, turn, this.root, active && active.nativeTurnId === nativeId ? active : null);
      })
      .filter((turn): turn is TurnView => Boolean(turn));
    if (active?.acknowledged && !turns.some((turn) => turn.turnId === active.turnId)) {
      const normalized = normalizeNativeTurn(binding, { id: active.nativeTurnId || active.turnId, status: "inProgress", items: [] }, this.root, active);
      if (normalized) turns.push(normalized);
    }
    turns = turns.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));

    const recoveredActive = active && turns.find((turn) => turn.turnId === active.turnId);
    if (recoveredActive && ["completed", "interrupted", "failed"].includes(recoveredActive.status)) {
      this.releaseActiveTurn(chatId);
    }
    const stillActive = Boolean(this.activeTurns.get(chatId)) || turns.some((turn) =>
      turn.status === "queued"
      || turn.status === "in_progress"
      || turn.status === "waiting_for_approval"
      || turn.status === "waiting_for_input");
    const nativeStatus = threadStatusFromNative(nativeThread.status);
    const reconciledStatus = stillActive
      ? "active"
      : nativeStatus === "not_loaded"
        ? turns.length ? "idle" : binding.lastStatus
        : nativeStatus;
    if (reconciledStatus !== binding.lastStatus) {
      await this.store.patch(chatId, {
        lastStatus: reconciledStatus,
        updatedAt: turns.at(-1)?.completedAt || turns.at(-1)?.startedAt || new Date().toISOString(),
      });
    }

    const limit = Math.max(1, Math.min(input.limit || 20, 50));
    const cursorOffset = input.cursor ? decodeCursor(input.cursor) : null;
    if (input.cursor && cursorOffset == null) throw new CodexChatGatewayError("invalid_cursor", "The turn cursor is invalid.", 400);
    const end = cursorOffset == null ? turns.length : Math.min(cursorOffset, turns.length);
    const start = Math.max(0, end - limit);
    const data = turns.slice(start, end);
    return {
      data,
      olderCursor: start > 0 ? encodeCursor(start) : null,
      newerCursor: end < turns.length ? encodeCursor(Math.min(turns.length, end + limit)) : null,
      hasOlder: start > 0,
      hasNewer: end < turns.length,
      snapshotAt: new Date().toISOString(),
      hasImageInputs: nativeHistoryHasImages(binding, nativeThread, this.root),
    };
  }

  async startTurn(chatId: string, input: StartTurnInput, options: { freshlyCreatedNativeThread?: boolean; fromQueue?: string } = {}): Promise<{ accepted: AcceptedTurn; replayed: boolean }> {
    const binding = await this.requireBinding(chatId);
    if (binding.archived) throw new CodexChatGatewayError("chat_archived", "Restore this chat from archive before sending a message.", 409);
    if (binding.origin === "voice" && !binding.continuationEnabled) {
      throw new CodexChatGatewayError("continuation_confirmation_required", "Choose Continue in Task Chat before sending a message.", 409);
    }
    const providerView = (await this.runtime.provider(binding.providerId)).view;
    if (!binding.stateIdentityHash || providerView.stateIdentityHash !== binding.stateIdentityHash) {
      throw new CodexChatGatewayError("runtime_identity_mismatch", "The selected runtime does not match this chat binding.", 409);
    }
    const text = validatedTurnText(input);
    if (binding.goalBudgetRequests?.[input.clientMessageId] || binding.deliveryBudgetRequests?.[input.clientMessageId]) throw new CodexChatGatewayError("idempotency_conflict", "This message identifier was used for a budget change.", 409);
    if (parseBudgetIntent(text).kind !== "none") throw new CodexChatGatewayError("budget_control_required", "Use the task budget control for this command; it does not require a model turn.", 422);
    const requestHash = hash(input);
    const preparedMessage = binding.attachmentMessages?.[input.clientMessageId];
    if (preparedMessage && preparedMessage.requestHash !== requestHash) throw new CodexChatGatewayError("idempotency_conflict", "This message identifier was already used with different attachments or text.", 409);
    const prior = binding.messageReceipts[input.clientMessageId];
    if (prior) {
      if (prior.requestHash !== requestHash) throw new CodexChatGatewayError("idempotency_conflict", "This clientMessageId was already used with different text.", 409);
      const existingTurn = (await this.listTurns(chatId, { limit: 50 })).data.find((turn) => turn.turnId === prior.turnId);
      if (existingTurn) {
        return {
          accepted: { turn: existingTurn, streamUrl: `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/events` },
          replayed: true,
        };
      }
      const replayTurn = normalizeNativeTurn(binding, { id: prior.nativeTurnId, status: "inProgress", items: [] }, this.root, {
        turnId: prior.turnId,
        nativeTurnId: prior.nativeTurnId,
        userText: text,
        startedAt: prior.startedAt,
        assistantText: "",
      });
      if (!replayTurn) throw new CodexChatGatewayError("turn_not_found", "The existing turn could not be restored.", 404);
      return { accepted: { turn: replayTurn, streamUrl: `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/events` }, replayed: true };
    }
    if (!options.fromQueue && this.store.execution.listIntents({kind:"queued-message",states:["queued","dispatching","unknown","blocked"],limit:1000}).some(row=>row.chatId===chatId && row.input.clientMessageId !== input.clientMessageId)) throw new CodexChatGatewayError("queue_waiting","This chat has queued messages. Add this draft to the queue or cancel those messages first.",409);

    const intentKey = `turn:${chatId}:${input.clientMessageId}`;
    let intent;
    try { intent = this.store.execution.reserveIntent(intentKey, requestHash, { kind: "turn", chatId, clientMessageId: input.clientMessageId, userText: text, nativeThreadId: binding.nativeThreadId, stateIdentityHash: binding.stateIdentityHash }).intent; }
    catch (error) { throw new CodexChatGatewayError((error as {code?: string}).code || "execution_unavailable", "The message could not be reserved safely.", 409); }
    if (intent.receipt) {
      await this.store.patch(chatId, { messageReceipts: { [input.clientMessageId]: intent.receipt } });
      return this.startTurn(chatId, input, options);
    }

    const native = options.freshlyCreatedNativeThread
      ? { turns: [], status: "idle" }
      : await this.readNativeThread(binding, true);
    const recoveredNativeTurn = (Array.isArray(native.turns) ? native.turns : [])
      .map((candidate) => normalizeNativeTurn(binding, candidate, this.root, null))
      .find((candidate): candidate is TurnView => candidate?.clientMessageId === input.clientMessageId);
    if (recoveredNativeTurn) {
      if (recoveredNativeTurn.userMessage.markdown.trim() !== text) {
        throw new CodexChatGatewayError("idempotency_conflict", "This clientMessageId was already used with different text.", 409);
      }
      const nativeTurn = (Array.isArray(native.turns) ? native.turns : [])
        .map(asObject)
        .find((candidate) => String(candidate?.id || "") && turnIdFor(binding.chatId, String(candidate?.id)) === recoveredNativeTurn.turnId);
      const nativeTurnId = String(nativeTurn?.id || "");
      if (!nativeTurnId) throw new CodexChatGatewayError("turn_not_found", "The existing turn could not be restored.", 404);
      await this.store.patch(chatId, {
        messageReceipts: {
          ...binding.messageReceipts,
          [input.clientMessageId]: {
            clientMessageId: input.clientMessageId,
            requestHash,
            turnId: recoveredNativeTurn.turnId,
            nativeTurnId,
            startedAt: recoveredNativeTurn.startedAt,
          },
        },
      });
      this.store.execution.updateIntent(intentKey, { state: recoveredNativeTurn.status === "in_progress" ? "running" : "completed", nativeTurnId });
      return {
        accepted: { turn: recoveredNativeTurn, streamUrl: `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/events` },
        replayed: true,
      };
    }
    if (this.activeTurns.has(chatId)) throw new CodexChatGatewayError("turn_active", "This chat already has an active turn.", 409);
    if (threadStatusFromNative(native.status) === "active") {
      throw new CodexChatGatewayError("turn_active", "The task runtime reports an active turn for this chat.", 409);
    }

    const hasHistoryImages = nativeHistoryHasImages(binding, native, this.root);
    const attachmentInput = await this.prepareAttachmentInput(input, binding.providerId, hasHistoryImages);
    const attachmentMessage = attachmentInput.files.length ? { requestHash, attachments: attachmentInput.files.map(file => file.view), manifest: attachmentInput.manifest } : undefined;
    if (attachmentMessage) {
      await this.attachments.retain(input.attachments || []);
      if (!await this.store.prepareAttachmentMessage(chatId, input.clientMessageId, attachmentMessage)) throw new CodexChatGatewayError("idempotency_conflict", "This message identifier was already used with other files.", 409);
      binding.attachmentMessages = { ...binding.attachmentMessages, [input.clientMessageId]: attachmentMessage };
    }

    const startedAt = new Date().toISOString();
    const releaseLease = tryAcquireNativeThreadTurn(
      nativeThreadLeaseKey(binding.stateIdentityHash || binding.providerId, binding.nativeThreadId),
      `task-chat:${chatId}:${input.clientMessageId}`,
      { coordinator: this.store.execution, kind: "turn", capacity: this.store.execution.admission().capacity, resources:[`chat-binding:${chatId}`], detail: { chatId, intentKey } },
    );
    if (!releaseLease) throw new CodexChatGatewayError("turn_active", "This task thread already has an active turn.", 409, true);
    try {
      if(binding.workspace)await verifyTaskWorkspace(binding.workspace);
      const workspace = binding.workspace || {cwd:typeof native.cwd === "string" ? native.cwd : this.root};
      const policy=taskWorkspaceResources(workspace,binding.sandbox || "workspace-write");
      if(!this.store.execution.extend(releaseLease.owner,releaseLease.generation,policy.resources,{mode:policy.mode}) ||
        !this.store.execution.extend(releaseLease.owner,releaseLease.generation,["execution-ambient-effects"],{mode:binding.sandbox === "danger-full-access" || !binding.sandbox ? "write" : "read"})) {
        throw new CodexChatGatewayError("workspace_busy","Another task owns this workspace or shared resources. Keep this draft or add it to the queue.",409,true);
      }
    } catch(error) { releaseLease(); throw error; }
    const dispatchIntent = this.store.execution.getIntent(intentKey);
    if (!dispatchIntent || !["reserved", "not_dispatched"].includes(dispatchIntent.state)) {
      releaseLease();
      throw new CodexChatGatewayError("fallback_confirmation_required", "Delivery of this message is being reconciled; it will not be dispatched twice.", 409, true);
    }
    const active: ActiveAttempt = {
      turnId: newId("turn"),
      nativeTurnId: "",
      userText: text,
      startedAt,
      assistantText: "",
      clientMessageId: input.clientMessageId,
      requestHash,
      acknowledged: false,
      intentKey,
      attachmentMessage,
    };
    this.activeTurns.set(chatId, active);
    this.activeTurnLeases.set(chatId, releaseLease);
    let failureStage: "connection" | "resume" | "turn_start" = "connection";
    try {
      const connection = await this.runtime.connection(binding.providerId);
      failureStage = "resume";
      await connection.ensureThreadLoaded(binding.nativeThreadId);
      releaseLease.assertOwned();
      const connectionGeneration = connection.generation;
      active.controlCleanup = registerNativeControl({coordinator:this.store.execution,key:nativeThreadLeaseKey(binding.stateIdentityHash!,binding.nativeThreadId),owner:releaseLease.owner,generation:releaseLease.generation,turnId:()=>active.nativeTurnId,steer:providerView.capabilities.steerTurn,
        request:async (method,params)=>{
          if (!connection.isRunning() || connection.generation !== connectionGeneration) throw new CodexChatGatewayError("control_connection_expired","The original execution connection is no longer available. Reconcile this task before controlling it.",409);
          return connection.request(method,params);
        }});
      this.store.execution.updateIntent(intentKey, { state: "dispatching", owner: releaseLease.owner, generation: releaseLease.generation }, dispatchIntent.revision);
      failureStage = "turn_start";
      this.recordUsage(binding, { attemptId: input.clientMessageId, turnStatus: "dispatching", modelRequested: input.settings?.modelId, effortRequested: input.settings?.effortId });
      const response = asObject(await connection.request("turn/start", {
        threadId: binding.nativeThreadId,
        clientUserMessageId: input.clientMessageId,
        input: attachmentInput.nativeInput,
        ...(binding.workspace ? {cwd:binding.workspace.cwd} : {}),
        ...(binding.sandbox ? {sandboxPolicy:binding.sandbox === "read-only" ? {type:"readOnly"} : binding.sandbox === "danger-full-access" ? {type:"dangerFullAccess"} : {type:"workspaceWrite",writableRoots:[binding.workspace?.cwd || this.root],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true}} : {}),
        ...(input.settings?.modelId ? { model: input.settings.modelId } : {}),
        ...(input.settings?.effortId ? { effort: input.settings.effortId } : {}),
        ...(input.settings?.serviceTierId ? { serviceTier: input.settings.serviceTierId } : {}),
      }));
      active.acknowledged = true;
      const nativeTurn = asObject(response?.turn);
      const nativeTurnId = String(nativeTurn?.id || "");
      if (!nativeTurnId) throw new Error("missing_turn_id");
      active.nativeTurnId = nativeTurnId;
      const receipt = { clientMessageId: input.clientMessageId, requestHash, turnId: active.turnId, nativeTurnId, startedAt };
      this.store.execution.updateIntent(intentKey, { state: this.store.execution.getIntent(intentKey)?.state === "completed" ? "completed" : "running", nativeTurnId, receipt });
      this.recordUsage(binding, { attemptId: input.clientMessageId, turnId: nativeTurnId, turnStatus: "running" });
      const firstMessage = Object.keys(binding.messageReceipts).length === 0;
      const nextTitle = firstMessage && ["New Codex chat", "New task chat"].includes(binding.title) ? titleText(previewText(text || attachmentMessage?.attachments[0]?.name).slice(0, 72)) : binding.title;
      const nextBinding = await this.store.patch(chatId, {
        title: nextTitle,
        preview: previewText(text || attachmentMessage?.attachments.map(file => file.name).join(", ")),
        updatedAt: startedAt,
        lastStatus: this.store.execution.getIntent(intentKey)?.state === "completed" ? "idle" : "active",
        messageReceipts: {
          ...binding.messageReceipts,
          [input.clientMessageId]: {
            clientMessageId: input.clientMessageId,
            requestHash,
            turnId: active.turnId,
            nativeTurnId,
            startedAt,
          },
        },
      });
      if (nextTitle !== binding.title) void connection.request("thread/name/set", { threadId: binding.nativeThreadId, name: nextTitle }, 5_000).catch(() => undefined);
      const turn = normalizeNativeTurn(nextBinding || binding, nativeTurn || { id: nativeTurnId, status: "inProgress", items: [] }, this.root, active);
      if (!turn) throw new Error("normalize_turn_failed");
      this.emit(chatId, "turn.started", { turn }, { turnId: turn.turnId });
      const detail = await this.threadDetail(chatId);
      this.emit(chatId, "thread.updated", { thread: detail.thread }, { turnId: turn.turnId });
      const accepted: AcceptedTurn = { turn, streamUrl: detail.streamUrl };
      return { accepted, replayed: false };
    } catch (error) {
      const deliveryUnknown = active.acknowledged || (failureStage === "turn_start" && uncertainTurnStartFailure(error));
      const failureReason = turnStartFailureReason(error, failureStage, active.acknowledged);
      this.store.execution.updateIntent(intentKey, { state: deliveryUnknown ? "unknown" : "not_dispatched" });
      if (!deliveryUnknown) this.releaseActiveTurn(chatId);
      await this.store.patch(chatId, {
        lastStatus: deliveryUnknown ? "active" : "system_error",
        updatedAt: new Date().toISOString(),
      });
      await this.store.recordRuntimeEvent("turn-start-failed", {
        chatRef: hash({ chatId }).slice(0, 16),
        providerId: binding.providerId,
        stage: failureStage,
        deliveryState: deliveryUnknown ? "unknown" : "not_accepted",
        failureReason,
        elapsedMs: Math.max(0, Date.now() - Date.parse(startedAt)),
      }).catch(() => undefined);
      if (deliveryUnknown) {
        throw new CodexChatGatewayError(
          "fallback_confirmation_required",
          "The connection ended before delivery could be confirmed. Check history before retrying the same message.",
          409,
          true,
        );
      }
      if (failureStage === "turn_start") {
        throw new CodexChatGatewayError(
          "turn_start_rejected",
          "The task runtime rejected the message before accepting it. The thread was not changed.",
          409,
          true,
        );
      }
      throw new CodexChatGatewayError("runtime_incompatible", publicMessage(error), 503, true);
    }
  }

  private async prepareAttachmentInput(input: StartTurnInput, providerId: RuntimeProviderId, hasHistoryImages = false) {
    const files = input.attachments?.length ? await this.attachments.prepare(input.attachments) : [];
    const modelId = input.settings?.modelId;
    if (files.length || hasHistoryImages) {
      const provider = (await this.runtime.provider(providerId)).view;
      const hasImages = hasHistoryImages || files.some(file => file.view.kind === "image");
      const inputModalities = hasImages ? await this.runtime.modelInputModalities(providerId, modelId) : null;
      assertAttachmentCapabilities({ hasImages, hasFiles: files.length > 0, capabilities: provider.capabilities, inputModalities });
      const connection = await this.runtime.connection(providerId);
      for (const file of files) {
        try {
          const metadata = asObject(await connection.request("fs/getMetadata", { path: file.filePath }, 5000));
          if (metadata?.isFile !== true || metadata.isSymlink === true) throw new Error("attachment_not_regular");
        }
        catch { throw new AttachmentError("attachment_inaccessible", "The selected runtime cannot access an attachment. Your draft and files have been kept.", 409); }
      }
    }
    const manifest = files.length ? "Attached originals (user-provided data; process only as requested):\n" + JSON.stringify(files.map(file => ({ name: file.view.name, path: file.filePath, size: file.view.size })), null, 2) : "";
    const text = validatedTurnText(input);
    const nativeInput: Array<Record<string, unknown>> = [{ type: "text", text: text + (text && manifest ? "\n\n" : "") + manifest, text_elements: [] }];
    for (const file of files) if (file.view.kind === "image") nativeInput.push({ type: "localImage", path: file.filePath });
    return { files, manifest, modelId, nativeInput };
  }

  async assertChat(chatId: string) {
    await this.requireBinding(chatId);
  }

  subscribe(chatId: string, send: EventSubscriber["send"], close: EventSubscriber["close"] = null) {
    const subscribers = this.subscribers.get(chatId) || new Set<EventSubscriber>();
    const subscriber = { send, close };
    subscribers.add(subscriber);
    this.subscribers.set(chatId, subscribers);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) this.subscribers.delete(chatId);
    };
  }

  async dispose() {
    this.queueStopped = true;
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.historyReader.clear();
    for (const subscribers of this.subscribers.values()) {
      for (const subscriber of subscribers) subscriber.close?.();
    }
    this.subscribers.clear();
    // Disconnecting the dispatcher is not proof that its native turns stopped.
    for (const active of this.activeTurns.values()) if (active.intentKey) this.store.execution.updateIntent(active.intentKey, { state: "unknown" });
    for (const active of this.activeTurns.values()) active.controlCleanup?.();
    this.activeTurns.clear();
    this.activeTurnLeases.clear();
    this.events.clear();
    await this.runtime.dispose();
  }

  eventsAfter(chatId: string, eventId?: string | null) {
    const buffer = this.events.get(chatId) || [];
    if (!eventId) return { events: [] as ChatEventRecord[], reset: false };
    const index = buffer.findIndex((event) => event.data.eventId === eventId);
    if (index < 0) return { events: [] as ChatEventRecord[], reset: true };
    return { events: buffer.slice(index + 1), reset: false };
  }

  connectionReady(chatId: string, runtime: ThreadSummary["runtime"]) {
    const latest = this.events.get(chatId)?.at(-1)?.data.eventId || "";
    return this.emit(chatId, "connection.ready", { runtime, latestEventId: latest });
  }

  heartbeat(chatId: string) {
    return this.emit(chatId, "heartbeat", {});
  }

  streamReset(chatId: string, reason: "cursor_expired" | "server_restarted") {
    return this.emit(chatId, "stream.reset", { reason, refresh: true });
  }

  private async readNativeThread(binding: ChatBinding, includeTurns: boolean, allowRecovery = false) {
    try {
      const provider = (await this.runtime.provider(binding.providerId)).view;
      const mismatch = !binding.stateIdentityHash || provider.stateIdentityHash !== binding.stateIdentityHash;
      if (provider.availability !== "ready") throw new CodexChatGatewayError("runtime_unavailable", "The selected runtime is unavailable. Retry when it is ready.", 503, true);
      if (mismatch && !await this.runtime.canRecoverIdentity(binding.providerId, binding.stateIdentityHash)) {
        throw new CodexChatGatewayError("runtime_identity_mismatch", "This chat belongs to a different or unverified storage location. Its history has been preserved.", 409);
      }
      const result = asObject(await this.runtime.readThread(binding.providerId, binding.nativeThreadId, includeTurns));
      const thread = asObject(result?.thread);
      if (!thread) throw new Error("missing_thread");
      if (mismatch && !verifyNativeThreadIdentity(thread, binding.nativeThreadId, binding.workspace?.cwd || this.root)) {
        throw new CodexChatGatewayError("runtime_identity_mismatch", "The original chat could not be verified in this workspace. Its history has been preserved.", 409);
      }
      if (includeTurns && !Array.isArray(thread.turns)) throw new Error("history_format_unsupported");
      if (mismatch && !allowRecovery) throw new CodexChatGatewayError("history_recovery_available", "This chat uses an older storage binding. Restore access to open the verified original conversation.", 409, false, { recoverable: true });
      if (includeTurns && !mismatch) await this.reconcileExecutions(binding, thread);
      return thread;
    } catch (error) {
      if (error instanceof CodexChatGatewayError) throw error;
      const failure = classifyNativeThreadReadFailure(error);
      if (failure === "history_format_unsupported") {
        throw new CodexChatGatewayError("history_format_unsupported", "This history format is not supported by the selected runtime. The original has been preserved; you can keep or archive this chat.", 422);
      }
      if (failure === "history_timeout") {
        throw new CodexChatGatewayError("history_timeout", "The task history did not answer within the operation timeout.", 504, true);
      }
      if (failure === "native_thread_missing") {
        const replaceable = replaceableEmptyDirectChat(binding);
        throw new CodexChatGatewayError(
          "native_thread_missing",
          "This task thread is no longer available in the selected runtime.",
          410,
          false,
          { retryable: false, replacementAllowed: replaceable, origin: binding.origin === "voice" ? "voice" : "chat" },
        );
      }
      if (failure === "runtime_unavailable") {
        throw new CodexChatGatewayError("runtime_unavailable", "The selected task runtime is unavailable.", 503, true);
      }
      throw new CodexChatGatewayError("history_unavailable", "Task Chat could not read this thread history.", 503, true);
    }
  }

  private async reconcileExecutions(binding: ChatBinding, thread: Record<string, unknown>) {
    if (!this.store.execution || !Array.isArray(thread.turns)) return;
    // A newly opened runtime can read persisted history without owning the live
    // thread. In particular its synthesized interruption is not terminal proof.
    if (threadStatusFromNative(thread.status) === "not_loaded") return;
    if(this.store.execution.listIntents({kind:"native-request",states:["pending","unknown"],limit:1}).length)expireCompletedNativeRequests(binding.stateIdentityHash!,binding.nativeThreadId,new Set(thread.turns.map(asObject).filter(turn=>turn && ["completed","interrupted","failed"].includes(String(turn.status))).map(turn=>String(turn?.id))));
    if(this.store.execution.listIntents({kind:"voice-turn",states:["dispatching","running","unknown"],limit:1000}).some(row=>row.storage===binding.stateIdentityHash && row.nativeThreadId===binding.nativeThreadId)) {
      const {recoverVoiceNativeTurns}=await import("../realtime/codex-task/codex-app-server-client");
      recoverVoiceNativeTurns(binding.stateIdentityHash!,binding.nativeThreadId,thread.turns);
    }
    for (const intent of this.store.execution.listIntents({ kind: "turn", states: ["dispatching", "running", "unknown"], limit: 1000 })) {
      if (intent.chatId !== binding.chatId || intent.nativeThreadId !== binding.nativeThreadId || intent.stateIdentityHash !== binding.stateIdentityHash) continue;
      const candidate = thread.turns.map(asObject).find(row => row && (
        (intent.nativeTurnId && row.id === intent.nativeTurnId) ||
        (!intent.nativeTurnId && normalizeNativeTurn(binding, row, this.root, null)?.clientMessageId === intent.clientMessageId)
      ));
      if (!candidate) continue; // An idle snapshot or elapsed time cannot prove non-delivery.
      const turn = normalizeNativeTurn(binding, candidate, this.root, null);
      if (!turn || (!intent.nativeTurnId && turn.userMessage.markdown.trim() !== intent.userText)) continue;
      const key = `turn:${binding.chatId}:${intent.clientMessageId}`;
      const terminal = ["completed", "interrupted", "failed"].includes(turn.status);
      const receipt = intent.receipt || { clientMessageId: intent.clientMessageId, requestHash: intent.hash, turnId: turn.turnId, nativeTurnId: String(candidate.id), startedAt: turn.startedAt };
      await this.store.patch(binding.chatId, { messageReceipts: { [intent.clientMessageId]: receipt } });
      try { this.store.execution.updateIntent(key, { state: terminal ? "completed" : "running", nativeTurnId: candidate.id, receipt }, intent.revision); }
      catch (error) { if ((error as {code?:string}).code === "execution_revision_conflict") continue; throw error; }
      const queuedKey=`queued:${binding.chatId}:${intent.clientMessageId}`;
      const queued=this.store.execution.getIntent(queuedKey);
      if(queued && ["dispatching","unknown"].includes(queued.state))this.store.execution.updateIntent(queuedKey,{state:"delivered"});
      if (terminal && intent.owner && intent.generation) {
        this.store.execution.reconcileRelease(intent.owner, intent.generation);
        if (this.activeTurns.get(binding.chatId)?.clientMessageId === intent.clientMessageId) this.releaseActiveTurn(binding.chatId);
        await this.store.patch(binding.chatId, {lastStatus:turn.status === "failed" ? "system_error" : "idle",updatedAt:new Date().toISOString()});
      }
    }
    for(const intent of this.store.execution.listIntents({kind:"steer",states:["dispatching","unknown"],limit:1000})) {
      if(intent.chatId!==binding.chatId)continue;
      const turn=thread.turns.map(asObject).find(row=>row?.id===intent.nativeTurnId);
      const items=Array.isArray(turn?.items)?turn.items:[];
      const item=items.map(asObject).find(row=>row?.type==="userMessage" && row.clientId===intent.clientMessageId);
      const normalized=item && normalizeNativeItem(binding.chatId,item,this.root,intent.createdAt);
      if(normalized?.kind==="user_message" && normalized.message.markdown.trim()===intent.text)this.store.execution.updateIntent(`control:${binding.chatId}:${intent.clientMessageId}`,{state:"confirmed"});
    }
  }

  private async requireBinding(chatId: string): Promise<ChatBinding> {
    if (!/^chat_[A-Za-z0-9]+$/.test(chatId)) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
    const binding = await this.store.get(chatId);
    if (!binding) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
    const aliases = await this.store.all();
    const matching = aliases.filter(row => logicalChatKey(row) === logicalChatKey(binding));
    return { ...binding, archived: matching.some(row => row.archived), hasDeliveryBinding: matching.some(row => row.hasDeliveryBinding), messageReceipts:Object.assign({}, ...matching.map(row => row.messageReceipts),binding.messageReceipts), attachmentMessages: Object.assign({}, ...matching.map(row => row.attachmentMessages || {}), binding.attachmentMessages || {}),
      goalBudgetRequests: Object.assign({}, ...matching.map(row => row.goalBudgetRequests || {}), binding.goalBudgetRequests || {}),
      deliveryBudgetRequests: Object.assign({}, ...matching.map(row => row.deliveryBudgetRequests || {}), binding.deliveryBudgetRequests || {}) };
  }

  private releaseActiveTurn(chatId: string) {
    this.activeTurns.get(chatId)?.controlCleanup?.();
    this.activeTurns.delete(chatId);
    this.activeTurnLeases.get(chatId)?.();
    this.activeTurnLeases.delete(chatId);
  }

  private emit(
    chatId: string,
    event: string,
    payload: Record<string, unknown>,
    refs: { turnId?: string | null; itemId?: string | null; requestId?: string | null } = {},
  ) {
    if (["turn.started", "turn.completed", "turn.failed", "turn.interrupted"].includes(event)) this.historyReader?.invalidateChat(chatId);
    const eventId = `event_${Date.now().toString(36)}_${(++this.eventSequence).toString(36)}`;
    const data: ChatEvent = {
      apiVersion: "1",
      eventId,
      occurredAt: new Date().toISOString(),
      chatId,
      turnId: refs.turnId || null,
      itemId: refs.itemId || null,
      requestId: refs.requestId || null,
      payload,
    };
    const record = { event, data };
    const buffer = this.events.get(chatId) || [];
    buffer.push(record);
    if (buffer.length > MAX_EVENTS_PER_CHAT) buffer.splice(0, buffer.length - MAX_EVENTS_PER_CHAT);
    this.events.set(chatId, buffer);
    for (const subscriber of this.subscribers.get(chatId) || []) subscriber.send(record);
    return record;
  }

  private async handleNotification(providerId: RuntimeProviderId, message: RpcMessage, origin?: RuntimeNotificationOrigin) {
    try {
      const params = message.params || {};
      const thread = asObject(params.thread);
      const nativeThreadId = String(params.threadId || thread?.id || "");
      if (!nativeThreadId) return;
      const binding = await this.store.findByNative(providerId, nativeThreadId);
      if (!binding) return;
      const method = String(message.method || "");
      const nativeTurn = asObject(params.turn);
      const nativeTurnId = String(params.turnId || nativeTurn?.id || "");
      const active = this.activeTurns.get(binding.chatId) || null;

      const attemptId = nativeTurnId && Object.entries(binding.messageReceipts).find(([, receipt]) => receipt.nativeTurnId === nativeTurnId)?.[0];
      const usageAttempt = attemptId || (active?.nativeTurnId === nativeTurnId ? active.clientMessageId : nativeTurnId ? `native:${nativeTurnId}` : null);
      if (method === "thread/tokenUsage/updated" && nativeTurnId && usageAttempt) {
        const tokenUsage = asObject(params.tokenUsage), total = asObject(tokenUsage?.total);
        this.recordUsage(binding, { attemptId: usageAttempt, turnId: nativeTurnId, counterTotal: total?.totalTokens as number }, origin || null);
        return; // Goal snapshots are intentionally never added to this counter.
      }

      if (method === "thread/goal/updated" || method === "thread/goal/cleared") {
        this.emit(binding.chatId, "goal.updated", {});
        return;
      }

      if (method === "turn/started" && active && nativeTurnId) {
        if(active.nativeTurnId && active.nativeTurnId!==nativeTurnId)return;
        active.nativeTurnId = nativeTurnId;
        active.acknowledged = true;
        this.recordUsage(binding, { attemptId: active.clientMessageId, turnId: nativeTurnId, turnStatus: "running" }, origin || null);
        const latest = await this.store.get(binding.chatId);
        await this.store.patch(binding.chatId, {
          messageReceipts: {
            ...(latest || binding).messageReceipts,
            [active.clientMessageId]: {
              clientMessageId: active.clientMessageId,
              requestHash: active.requestHash,
              turnId: active.turnId,
              nativeTurnId,
              startedAt: active.startedAt,
            },
          },
          lastStatus: "active",
          updatedAt: active.startedAt,
        });
        return;
      }

      if (method === "item/agentMessage/delta") {
        const delta = String(params.delta || "");
        if (!delta || !active || (active.nativeTurnId && nativeTurnId && active.nativeTurnId !== nativeTurnId)) return;
        active.assistantText += delta;
        const nativeItemId = String(params.itemId || `${nativeTurnId}:streaming-assistant`);
        this.emit(binding.chatId, "message.delta", { delta }, {
          turnId: active.turnId,
          itemId: itemIdFor(binding.chatId, nativeItemId),
        });
        return;
      }

      if (method === "item/started" || method === "item/completed") {
        const item = normalizeNativeItem(binding.chatId, params.item, this.root, active?.startedAt || binding.updatedAt);
        if (!item || (active?.nativeTurnId && nativeTurnId && active.nativeTurnId!==nativeTurnId)) return;
        const rawItem=asObject(params.item);
        if(item.kind==="user_message" && rawItem?.clientId===active?.clientMessageId)return;
        const turnId = active?.turnId || (nativeTurnId ? turnIdFor(binding.chatId, nativeTurnId) : null);
        if (method === "item/completed" && item.kind === "assistant_message") {
          this.emit(binding.chatId, "message.completed", { message: item.message }, { turnId, itemId: item.id });
        }
        this.emit(binding.chatId, method === "item/started" ? "item.started" : "item.completed", { item }, { turnId, itemId: item.id });
        return;
      }

      if (method === "turn/completed" && nativeTurn) {
        if (active && (!active.nativeTurnId || active.nativeTurnId !== nativeTurnId)) return;
        if (active?.intentKey) this.store.execution.updateIntent(active.intentKey, { state: "completed", nativeTurnId });
        if (usageAttempt) this.recordUsage(binding, { attemptId: usageAttempt, turnId: nativeTurnId, turnStatus: String(nativeTurn.status || "unknown") }, origin || null);
        const turn = normalizeNativeTurn(binding, nativeTurn, this.root, active);
        if (!turn) return;
        const eventName = turn.status === "interrupted" ? "turn.interrupted" : turn.status === "failed" ? "turn.failed" : "turn.completed";
        const payload = eventName === "turn.failed" ? { turn, retryMode: "resume" } : { turn };
        this.emit(binding.chatId, eventName, payload, { turnId: turn.turnId });
        this.releaseActiveTurn(binding.chatId);
        const next = await this.store.patch(binding.chatId, {
          lastStatus: turn.status === "failed" ? "system_error" : "idle",
          updatedAt: new Date().toISOString(),
        });
        if (next) {
          const provider = (await this.runtime.provider(providerId)).view;
          this.emit(binding.chatId, "thread.updated", { thread: summarizeThread(next, provider) }, { turnId: turn.turnId });
        }
        return;
      }

      if (method === "error" && active && params.willRetry !== true) {
        const failed: TurnView = {
          turnId: active.turnId,
          status: "failed",
          userMessage: {
            id: itemIdFor(binding.chatId, `${active.nativeTurnId || active.turnId}:user`),
            role: "user",
            markdown: active.userText,
            status: "completed",
            createdAt: active.startedAt,
          },
          items: [],
          pendingRequestIds: [],
          startedAt: active.startedAt,
          completedAt: new Date().toISOString(),
          error: { code: "codex_turn_failed", message: "Codex could not complete this turn." },
        };
        this.emit(binding.chatId, "turn.failed", { turn: failed, retryMode: "resume" }, { turnId: active.turnId });
        if (active.intentKey) this.store.execution.updateIntent(active.intentKey, { state: "unknown" });
        await this.store.patch(binding.chatId, { lastStatus: "system_error", updatedAt: new Date().toISOString() });
      }
    } catch {
      // Upstream notifications are best-effort; request responses remain authoritative.
    }
  }

  private recordUsage(binding: ChatBinding, observation: Parameters<typeof recordParentUsage>[1], origin?: RuntimeNotificationOrigin | null) {
    if (typeof this.store.stateRoot !== "string") return;
    try {
      const source = origin === undefined ? this.runtime.liveRuntimeOrigin?.(binding.providerId) : origin;
      if (!source || source.stateIdentityHash !== binding.stateIdentityHash) return;
      recordParentUsage(binding, { ...observation, runtimeVersion: source.runtimeVersion }, { root: this.root, stateRoot: this.store.stateRoot });
    } catch { /* Accounting coverage stays partial when an observation cannot be saved; conversation progress is preserved. */ }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __prithaCodexChatGateway: CodexChatGateway | undefined;
  // eslint-disable-next-line no-var
  var __prithaCodexChatShutdownRegistered: boolean | undefined;
}

export function getCodexChatGateway() {
  if (!globalThis.__prithaCodexChatGateway) globalThis.__prithaCodexChatGateway = new CodexChatGateway();
  if (!globalThis.__prithaCodexChatShutdownRegistered) {
    globalThis.__prithaCodexChatShutdownRegistered = true;
    const dispose = () => { void globalThis.__prithaCodexChatGateway?.dispose(); };
    process.once("SIGTERM", dispose);
    process.once("SIGINT", dispose);
  }
  return globalThis.__prithaCodexChatGateway;
}
