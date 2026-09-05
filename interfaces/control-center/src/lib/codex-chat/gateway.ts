import { createHash, randomUUID } from "node:crypto";
import { resolveTechscopeRoot } from "@/lib/pritha-paths";
import { AppServerConnection, CodexRuntimeManager, type RpcMessage } from "./app-server";
import { verifyNativeThreadIdentity } from "./storage-identity";
import { classifyNativeThreadReadFailure } from "./native-thread-errors";
import { CodexChatPrivateStore, type ChatBinding } from "./private-store";
import { queueVoiceTaskChatIndexRefresh, reconcileVoiceTaskChatLink, voiceTaskChatIndexStatus } from "./voice-links";
import { nativeThreadLeaseKey, tryAcquireNativeThreadTurn } from "./native-turn-coordinator";
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
} from "./types";

type CreateThreadInput = {
  clientThreadId: string;
  title?: string;
  source: "chat";
  settings?: { modelId?: string; effortId?: string; serviceTierId?: string };
};

type StartTurnInput = {
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
};

type EventSubscriber = { send: (event: ChatEventRecord) => void; close: (() => void) | null };

const MAX_EVENTS_PER_CHAT = 10_000;
const UNCERTAIN_TURN_LEASE_MS = 30_000;

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
    && binding.taskLinks.length === 0;
}

function firstTurnDeliveryIsUncertain(error: unknown) {
  return error instanceof CodexChatGatewayError
    && (error.code === "fallback_confirmation_required" || error.code === "turn_active");
}

function validatedTurnText(input: StartTurnInput) {
  if (!validClientId(input?.clientMessageId)) {
    throw new CodexChatGatewayError("invalid_request", "A valid clientMessageId is required.", 400);
  }
  const text = String(input.input?.[0]?.text || "").trim();
  if (!text || input.input?.length !== 1 || input.input[0].type !== "text") {
    throw new CodexChatGatewayError("invalid_request", "Exactly one non-empty text input is required.", 400);
  }
  if (Buffer.byteLength(text, "utf8") > 64_000) {
    throw new CodexChatGatewayError("field_limit_exceeded", "Turn text exceeds 64,000 UTF-8 bytes.", 400);
  }
  return text;
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
  private readonly store = new CodexChatPrivateStore();
  private readonly root = resolveTechscopeRoot();
  private readonly runtime = new CodexRuntimeManager(this.store, (providerId, message) => this.handleNotification(providerId, message), this.root);
  private readonly activeTurns = new Map<string, ActiveAttempt>();
  private readonly activeTurnLeases = new Map<string, () => void>();
  private readonly uncertainTurnTimers = new Map<string, NodeJS.Timeout>();
  private readonly events = new Map<string, ChatEventRecord[]>();
  private readonly subscribers = new Map<string, Set<EventSubscriber>>();
  private eventSequence = 0;

  async runtimeStatus() {
    return this.runtime.status();
  }

  async listThreads(input: {
    group?: string;
    archived?: boolean;
    search?: string;
    cursor?: string;
    limit?: number;
    view?: "current" | "legacy";
  } = {}): Promise<ThreadPage> {
    if (input.group === "voice_work") queueVoiceTaskChatIndexRefresh(this.store, this.runtime);
    const bindings = await this.store.all();
    const providerViews = new Map<RuntimeProviderId, RuntimeProviderView>();
    for (const providerId of ["desktop_bundled", "standalone_cli"] as const) {
      providerViews.set(providerId, (await this.runtime.provider(providerId)).view);
    }
    const search = String(input.search || "").trim().toLowerCase();
    const archived = input.archived === true;
    const summaries = bindings
      .filter((binding) => binding.archived === archived)
      .map((binding) => summarizeThread(binding, providerViews.get(binding.providerId) || null))
      .filter((thread) => input.group == null || input.group === "all" || thread.group === input.group);
    const view = input.view || "current";
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
    const createHash = hash(input);
    const existing = await this.store.findByClientThreadId(input.clientThreadId);
    if (existing) {
      if (existing.createHash !== createHash) throw new CodexChatGatewayError("idempotency_conflict", "This clientThreadId was already used with different values.", 409);
      return { detail: await this.threadDetail(existing.chatId), replayed: true };
    }

    const provider = await this.runtime.effectiveProvider();
    if (!provider) throw new CodexChatGatewayError("runtime_unavailable", "No compatible Codex runtime is available.", 503, true);
    try {
      const connection = await this.runtime.connection(provider.providerId);
      const requestedTitle = titleText(input.title);
      const defaults = this.runtime.threadDefaults();
      const response = asObject(await connection.request("thread/start", {
        ...defaults,
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
      await this.store.put(binding);
      if (input.title) void connection.request("thread/name/set", { threadId: nativeThreadId, name: requestedTitle }, 5_000).catch(() => undefined);
      const detail = await this.threadDetail(binding.chatId);
      this.emit(binding.chatId, "thread.updated", { thread: detail.thread });
      return { detail, replayed: false };
    } catch (error) {
      throw new CodexChatGatewayError("runtime_incompatible", publicMessage(error), 503, true);
    }
  }

  async createThreadWithFirstTurn(input: CreateThreadWithFirstTurnInput) {
    validatedTurnText(input.initialTurn);
    const created = await this.createThread(input);
    let binding = await this.requireBinding(created.detail.thread.chatId);
    let ownsFreshEmptyBinding = !created.replayed;
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
          ownsFreshEmptyBinding = true;
          freshlyCreatedNativeThread = true;
          continue;
        }
        if (ownsFreshEmptyBinding && !firstTurnDeliveryIsUncertain(error)) {
          await this.store.removeEmptyDirectChat(binding.chatId, binding.nativeThreadId).catch(() => false);
        }
        throw error;
      }
    }
    throw new CodexChatGatewayError("turn_start_rejected", "The first message was not accepted.", 409, true);
  }

  private async replaceEmptyDirectThread(binding: ChatBinding, input: CreateThreadInput) {
    if (!replaceableEmptyDirectChat(binding)) {
      throw new CodexChatGatewayError("native_thread_missing", "This task thread is no longer available in the selected runtime.", 410);
    }
    const provider = await this.runtime.effectiveProvider();
    if (!provider) throw new CodexChatGatewayError("runtime_unavailable", "No compatible task runtime is available.", 503, true);
    try {
      const connection = await this.runtime.connection(provider.providerId);
      const defaults = this.runtime.threadDefaults();
      const response = asObject(await connection.request("thread/start", {
        ...defaults,
        model: input.settings?.modelId || defaults.model,
        ephemeral: false,
      }));
      const nativeThreadId = String(asObject(response?.thread)?.id || "");
      if (!nativeThreadId) throw new Error("missing_thread_id");
      connection.markThreadLoaded(nativeThreadId);
      const next = await this.store.patch(binding.chatId, {
        nativeThreadId,
        providerId: provider.providerId,
        stateIdentityHash: provider.view.stateIdentityHash,
        updatedAt: new Date().toISOString(),
        lastStatus: "idle",
      });
      if (!next) throw new Error("missing_binding");
      await this.store.recordRuntimeEvent("empty-direct-chat-replaced", {
        chatRef: hash({ chatId: binding.chatId }).slice(0, 16),
        providerId: provider.providerId,
      }).catch(() => undefined);
      if (!['New task chat', 'New Codex chat'].includes(next.title)) {
        void connection.request("thread/name/set", { threadId: nativeThreadId, name: next.title }, 5_000).catch(() => undefined);
      }
      return next;
    } catch (error) {
      if (error instanceof CodexChatGatewayError) throw error;
      throw new CodexChatGatewayError("runtime_incompatible", publicMessage(error), 503, true);
    }
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
    const summary = summarizeThread(current, provider, nativeThread);
    return {
      thread: summary,
      activeTurnId: this.activeTurns.get(chatId)?.turnId || null,
      pendingRequests: [],
      streamUrl: `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/events`,
      continuationState: summary.continuationState,
      history,
    };
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
      const provider = (await this.runtime.provider(binding.providerId)).view;
      if (!binding.stateIdentityHash || provider.stateIdentityHash !== binding.stateIdentityHash) {
        throw new CodexChatGatewayError("runtime_identity_mismatch", "The task runtime does not match this chat binding.", 409);
      }
      const native = await this.readNativeThread(binding, false);
      if (threadStatusFromNative(native.status, binding.archived) === "active" || this.activeTurns.has(chatId)) {
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
    const nativeStatus = threadStatusFromNative(nativeThread.status, binding.archived);
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
    };
  }

  async startTurn(chatId: string, input: StartTurnInput, options: { freshlyCreatedNativeThread?: boolean } = {}) {
    const binding = await this.requireBinding(chatId);
    if (binding.origin === "voice" && !binding.continuationEnabled) {
      throw new CodexChatGatewayError("continuation_confirmation_required", "Choose Continue in Task Chat before sending a message.", 409);
    }
    const providerView = (await this.runtime.provider(binding.providerId)).view;
    if (!binding.stateIdentityHash || providerView.stateIdentityHash !== binding.stateIdentityHash) {
      throw new CodexChatGatewayError("runtime_identity_mismatch", "The selected runtime does not match this chat binding.", 409);
    }
    const text = validatedTurnText(input);
    const requestHash = hash(input);
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
      return {
        accepted: { turn: recoveredNativeTurn, streamUrl: `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/events` },
        replayed: true,
      };
    }
    if (this.activeTurns.has(chatId)) throw new CodexChatGatewayError("turn_active", "This chat already has an active turn.", 409);
    if (threadStatusFromNative(native.status, binding.archived) === "active") {
      throw new CodexChatGatewayError("turn_active", "The task runtime reports an active turn for this chat.", 409);
    }

    const startedAt = new Date().toISOString();
    const releaseLease = tryAcquireNativeThreadTurn(
      nativeThreadLeaseKey(binding.providerId, binding.nativeThreadId),
      `task-chat:${chatId}:${input.clientMessageId}`,
    );
    if (!releaseLease) throw new CodexChatGatewayError("turn_active", "This task thread already has an active turn.", 409, true);
    const active: ActiveAttempt = {
      turnId: newId("turn"),
      nativeTurnId: "",
      userText: text,
      startedAt,
      assistantText: "",
      clientMessageId: input.clientMessageId,
      requestHash,
      acknowledged: false,
    };
    this.activeTurns.set(chatId, active);
    this.activeTurnLeases.set(chatId, releaseLease);
    let failureStage: "connection" | "resume" | "turn_start" = "connection";
    try {
      const connection = await this.runtime.connection(binding.providerId);
      failureStage = "resume";
      await connection.ensureThreadLoaded(binding.nativeThreadId);
      failureStage = "turn_start";
      const response = asObject(await connection.request("turn/start", {
        threadId: binding.nativeThreadId,
        clientUserMessageId: input.clientMessageId,
        input: [{ type: "text", text, text_elements: [] }],
        ...(input.settings?.modelId ? { model: input.settings.modelId } : {}),
        ...(input.settings?.effortId ? { effort: input.settings.effortId } : {}),
        ...(input.settings?.serviceTierId ? { serviceTier: input.settings.serviceTierId } : {}),
      }));
      active.acknowledged = true;
      const nativeTurn = asObject(response?.turn);
      const nativeTurnId = String(nativeTurn?.id || "");
      if (!nativeTurnId) throw new Error("missing_turn_id");
      active.nativeTurnId = nativeTurnId;
      const firstMessage = Object.keys(binding.messageReceipts).length === 0;
      const nextTitle = firstMessage && ["New Codex chat", "New task chat"].includes(binding.title) ? titleText(previewText(text).slice(0, 72)) : binding.title;
      const nextBinding = await this.store.patch(chatId, {
        title: nextTitle,
        preview: previewText(text),
        updatedAt: startedAt,
        lastStatus: "active",
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
      if (deliveryUnknown) this.deferUncertainTurnRelease(chatId, active);
      else this.releaseActiveTurn(chatId);
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
    for (const subscribers of this.subscribers.values()) {
      for (const subscriber of subscribers) subscriber.close?.();
    }
    this.subscribers.clear();
    for (const chatId of [...this.activeTurns.keys()]) this.releaseActiveTurn(chatId);
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
      if (mismatch && !verifyNativeThreadIdentity(thread, binding.nativeThreadId, this.root)) {
        throw new CodexChatGatewayError("runtime_identity_mismatch", "The original chat could not be verified in this workspace. Its history has been preserved.", 409);
      }
      if (includeTurns && !Array.isArray(thread.turns)) throw new Error("history_format_unsupported");
      if (mismatch && !allowRecovery) throw new CodexChatGatewayError("history_recovery_available", "This chat uses an older storage binding. Restore access to open the verified original conversation.", 409, false, { recoverable: true });
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

  private async requireBinding(chatId: string) {
    if (!/^chat_[A-Za-z0-9]+$/.test(chatId)) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
    const binding = await this.store.get(chatId);
    if (!binding) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
    return binding;
  }

  private releaseActiveTurn(chatId: string) {
    const uncertainTimer = this.uncertainTurnTimers.get(chatId);
    if (uncertainTimer) clearTimeout(uncertainTimer);
    this.uncertainTurnTimers.delete(chatId);
    this.activeTurns.delete(chatId);
    this.activeTurnLeases.get(chatId)?.();
    this.activeTurnLeases.delete(chatId);
  }

  private deferUncertainTurnRelease(chatId: string, active: ActiveAttempt) {
    const previous = this.uncertainTurnTimers.get(chatId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.uncertainTurnTimers.delete(chatId);
      if (this.activeTurns.get(chatId) === active && !(active.acknowledged && active.nativeTurnId)) {
        this.releaseActiveTurn(chatId);
      }
    }, UNCERTAIN_TURN_LEASE_MS);
    timer.unref?.();
    this.uncertainTurnTimers.set(chatId, timer);
  }

  private emit(
    chatId: string,
    event: string,
    payload: Record<string, unknown>,
    refs: { turnId?: string | null; itemId?: string | null; requestId?: string | null } = {},
  ) {
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

  private async handleNotification(providerId: RuntimeProviderId, message: RpcMessage) {
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

      if (method === "turn/started" && active && nativeTurnId) {
        active.nativeTurnId = nativeTurnId;
        active.acknowledged = true;
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
        if (!item) return;
        const turnId = active?.turnId || (nativeTurnId ? turnIdFor(binding.chatId, nativeTurnId) : null);
        if (method === "item/completed" && item.kind === "assistant_message") {
          this.emit(binding.chatId, "message.completed", { message: item.message }, { turnId, itemId: item.id });
        }
        this.emit(binding.chatId, method === "item/started" ? "item.started" : "item.completed", { item }, { turnId, itemId: item.id });
        return;
      }

      if (method === "turn/completed" && nativeTurn) {
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
        this.releaseActiveTurn(binding.chatId);
        await this.store.patch(binding.chatId, { lastStatus: "system_error", updatedAt: new Date().toISOString() });
      }
    } catch {
      // Upstream notifications are best-effort; request responses remain authoritative.
    }
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
