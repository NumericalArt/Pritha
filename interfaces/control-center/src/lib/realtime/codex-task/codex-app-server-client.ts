import { runtimeProbe } from "../../../../../../scripts/lib/runtime-probe.mjs";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { CodexAppThreadRoutingMode, CodexReasoningEffort, CodexServiceTier } from "../pritha-runtime";
import { isDesktopCodexBinary, resolveCodexAppBinary } from "../../settings/codex-binaries";
import { codexAppTurnSettings } from "../../settings/codex-model-catalog";
import { nativeExecutionCoordinator, nativeThreadLeaseKey, tryAcquireNativeThreadTurn } from "../../codex-chat/native-turn-coordinator";
import { captureNativeRequest, expireNativeRequests } from "../../codex-chat/native-requests";
import { effectiveCodexHome, storageIdentity } from "../../codex-chat/storage-identity";
import { registerNativeControl } from "../../codex-chat/native-control";
import { assertVoiceOwner, voiceWorkflow } from "./voice-execution";
import type { PrithaCodexTaskClient, PrithaCodexTaskPayload, PrithaCodexTaskRunOptions, PrithaCodexThreadScope, PrithaCodexThreadScopeKind } from "./types";

type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type CodexAppServerClientOptions = {
  logicalTaskId?: string;
  codexBin?: string;
  cwd: string;
  branch?: string;
  registryPath?: string;
  clientName?: string;
  buildSandboxPolicy: (payload: PrithaCodexTaskPayload) => Record<string, unknown>;
  getRuntimeSettings?: () => {
    codexModel: string;
    codexReasoningEffort: CodexReasoningEffort;
    codexServiceTier: CodexServiceTier;
    codexAppThreadRoutingMode?: CodexAppThreadRoutingMode;
    codexAppThreadMaxTurns?: number;
    codexAppThreadMaxAgeHours?: number;
  };
};

type CodexAppThreadTarget = {
  threadId: string;
  threadName: string;
  role: VoiceCodexThreadRole;
  scope: PrithaCodexThreadScope;
  routingMode: CodexAppThreadRoutingMode;
};

const CODEX_APP_RECONNECT_FINAL_ATTEMPT = 5;

export class CodexDispatchError extends Error {
  constructor(readonly code: string, message: string, readonly deliveryState: "not_dispatched" | "unknown" | "completed", readonly fallbackEligible = false) { super(message); }
}

export function safeCodexCliFallback(error: unknown, anyTurnDispatched: boolean) {
  return !anyTurnDispatched && error instanceof CodexDispatchError && error.deliveryState === "not_dispatched" && error.fallbackEligible;
}

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "text", "data", "errors", "warnings"],
  properties: {
    status: { enum: ["ok", "error", "decision_required"] },
    text: { type: "string" },
    data: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "refs", "changedFiles", "nextActions", "structuredJson"],
      properties: {
        summary: { type: "string" },
        refs: { type: "array", items: { type: "string" } },
        changedFiles: { type: "array", items: { type: "string" } },
        nextActions: { type: "array", items: { type: "string" } },
        structuredJson: { type: "string" },
      },
    },
    errors: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

function codexAppAbortError() {
  return new Error("Codex App task aborted by operator");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw codexAppAbortError();
}

export class PrithaCodexAppServerClient implements PrithaCodexTaskClient {
  private readonly logicalTaskId?: string;
  private readonly codexBin: string;
  private readonly cwd: string;
  private readonly branch: string;
  private readonly registryPath?: string;
  private readonly clientName: string;
  private readonly buildSandboxPolicy: (payload: PrithaCodexTaskPayload) => Record<string, unknown>;
  private readonly getRuntimeSettings?: CodexAppServerClientOptions["getRuntimeSettings"];

  constructor(options: CodexAppServerClientOptions) {
    this.logicalTaskId = options.logicalTaskId;
    this.codexBin = resolveCodexAppBinary(options.codexBin);
    this.cwd = path.resolve(options.cwd);
    this.branch = options.branch || currentBranch(this.cwd);
    this.registryPath = options.registryPath;
    this.clientName = options.clientName || "pritha-voice-control";
    this.buildSandboxPolicy = options.buildSandboxPolicy;
    this.getRuntimeSettings = options.getRuntimeSettings;
  }

  async runTask(payload: PrithaCodexTaskPayload, options: PrithaCodexTaskRunOptions) {
    if (looksLikePath(this.codexBin) && !fs.existsSync(this.codexBin)) {
      throw new CodexDispatchError("runtime_unavailable", "Codex binary is unavailable.", "not_dispatched", true);
    }

    const connection = new AppServerConnection(this.codexBin, this.cwd);
    const coordinator = nativeExecutionCoordinator();
    const workflow = this.logicalTaskId ? voiceWorkflow(this.logicalTaskId) : null;
    const phase = options.executionPhase || "execution";
    const intentKey = `voice-turn:${this.logicalTaskId || payload.requestId}:${workflow?.round || 1}:${phase}`;
    const requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const clientUserMessageId=`voice_${createHash("sha256").update(intentKey).digest("hex").slice(0,40)}`;
    const prompt=buildPrompt(payload);
    const {intent} = coordinator.reserveIntent(intentKey, requestHash, {kind:"voice-turn",key:intentKey,taskId:this.logicalTaskId || payload.requestId,phase,round:workflow?.round || 1,storage:storageIdentity(effectiveCodexHome()),clientMessageId:clientUserMessageId,promptHash:createHash("sha256").update(prompt).digest("hex")});
    if (intent.state === "completed" && intent.result) return intent.result;
    if (!["reserved","not_dispatched"].includes(intent.state)) throw new CodexDispatchError("voice_delivery_unknown", "The original Voice turn must be reconciled before continuing.", "unknown");
    const startedAt = Date.now();
    let target: CodexAppThreadTarget | null = null;
    let turnId = "";
    let controlCleanup: (()=>void) | undefined;
    const ownership: {lease: ReturnType<typeof tryAcquireNativeThreadTurn>} = {lease:null};
    let ownedThreadId = "";
    let stage: "initializing" | "routing" | "dispatching" | "completed" = "initializing";
    let routingLease: ReturnType<ReturnType<typeof nativeExecutionCoordinator>["claim"]> = null;
    let capacityLease: ReturnType<ReturnType<typeof nativeExecutionCoordinator>["claim"]> = null;
    connection.beforeThreadMutation = async (threadId) => {
      if (ownedThreadId === threadId) { ownership.lease?.assertOwned(); return; }
      if (ownedThreadId) throw new CodexDispatchError("thread_identity_changed", "Voice routing cannot switch an owned native thread.", "unknown");
      const nativeKey = nativeThreadLeaseKey("voice", threadId);
      let lease;
      if (this.logicalTaskId) {
        const owner = assertVoiceOwner(this.logicalTaskId, nativeKey);
        lease = Object.assign(() => {}, {owner:owner.owner as string,generation:owner.generation as string,assertOwned:()=>{assertVoiceOwner(this.logicalTaskId!,nativeKey);}});
      } else lease = tryAcquireNativeThreadTurn(nativeKey, `voice:${payload.requestId}`, { detail: { taskId: payload.requestId, nativeThreadId: threadId } });
      if (!lease) throw new CodexDispatchError("turn_active", "This task thread is already owned by another execution.", "not_dispatched");
      ownership.lease = lease;
      ownedThreadId = threadId;
      if (!connection.newThreads.has(threadId)) {
        const response = asObject(await connection.request("thread/read", {threadId, includeTurns:false}, remainingMs(startedAt, options.timeoutMs)));
        const status = asObject(response?.thread)?.status;
        if (status === "active" || asObject(status)?.type === "active") throw new CodexDispatchError("turn_active", "The native runtime reports an active turn.", "not_dispatched");
      }
    };
    const emitProgress = async (phase: string, message: string, extra: Record<string, unknown> = {}) => {
      await options.onProgress?.({
        timestamp: new Date().toISOString(),
        phase,
        level: "info",
        message,
        status: "running",
        transport: "codex-app",
        elapsed_ms: Date.now() - startedAt,
        ...extra,
      });
    };

    const abortHandler = () => {
      if (ownedThreadId && turnId) void connection.request("turn/interrupt", {threadId:ownedThreadId, turnId}, 5_000).catch(() => undefined);
    };
    if (options.signal) {
      throwIfAborted(options.signal);
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      capacityLease = coordinator.claim([intentKey], intentKey, {kind:"turn",capacity:coordinator.admission().capacity,detail:{taskId:payload.requestId,intentKey}});
      if (!capacityLease) throw new CodexDispatchError("capacity_busy", "The execution limit is reached; this turn has not been sent.", "not_dispatched");
      await connection.start(options.timeoutMs);
      throwIfAborted(options.signal);
      await emitProgress("codex_app_started", "Codex App sidecar process started.");
      await connection.request(
        "initialize",
        {
          clientInfo: { name: this.clientName, version: "0.1" },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
            optOutNotificationMethods: [
              "thread/tokenUsage/updated",
              "item/reasoning/textDelta",
              "item/reasoning/summaryTextDelta",
            ],
          },
        },
        remainingMs(startedAt, options.timeoutMs),
      );
      throwIfAborted(options.signal);
      await emitProgress("codex_app_initialized", "Codex App sidecar initialized.");

      const scope = payload.threadScope;
      const routingMode = this.getRuntimeSettings?.().codexAppThreadRoutingMode || "subject_scoped";
      const routingKey = `voice-routing:${this.cwd}:${routingMode === "control" ? "control" : routingMode === "per_task" ? payload.requestId : `${scope?.kind}:${scope?.id}`}`;
      if (!this.logicalTaskId) {
        routingLease = coordinator.claim([routingKey], `voice-routing:${payload.requestId}`, {kind:"voice-routing", detail:{taskId:payload.requestId}});
        if (!routingLease) throw new CodexDispatchError("voice_scope_busy", "Another Voice task owns this conversation scope.", "not_dispatched");
      }
      stage = "routing";
      target = await this.resolveTaskThread(connection, payload, remainingMs(startedAt, options.timeoutMs));
      throwIfAborted(options.signal);
      await emitProgress("thread_resolved", "Codex App task thread resolved.", {
        thread_id: target.threadId,
        thread_name: target.threadName,
        provider_id: isDesktopCodexBinary(this.codexBin) ? "desktop_bundled" : "standalone_cli",
        thread_role: target.role,
        thread_scope: target.scope,
        routing_mode: target.routingMode,
      });
      await connection.beforeThreadMutation(target.threadId);
      await this.injectThreadReport(connection, target.threadId, buildTaskReport("started", payload, target.threadName), remainingMs(startedAt, options.timeoutMs));
      throwIfAborted(options.signal);
      const runtimeSettings = this.getRuntimeSettings?.();
      const turnSettings = codexAppTurnSettings({
        model: runtimeSettings?.codexModel || "",
        effort: runtimeSettings?.codexReasoningEffort || effortForTask(payload.taskType),
        serviceTier: runtimeSettings?.codexServiceTier || "standard",
      });

      coordinator.updateIntent(intentKey, {state:"dispatching",nativeThreadId:target.threadId,owner:capacityLease.owner,generation:capacityLease.generation}, intent.revision);
      await emitProgress("turn_dispatching", "Sending the reserved Voice turn.");
      stage = "dispatching";
      const turnResponse = (await connection.request(
        "turn/start",
        {
          threadId: target.threadId,
          clientUserMessageId,
          input: [{ type: "text", text: prompt, text_elements: [] }],
          cwd: this.cwd,
          model: turnSettings.model || undefined,
          approvalPolicy: "never",
          sandboxPolicy: this.buildSandboxPolicy(payload),
          outputSchema: RESULT_SCHEMA,
          effort: turnSettings.effort,
          serviceTier: turnSettings.serviceTier,
          summary: "none",
          personality: "pragmatic",
        },
        remainingMs(startedAt, options.timeoutMs),
      )) as { turn?: { id?: string; items?: unknown[] } };
      turnId = String(turnResponse.turn?.id || "");
      if (!turnId) throw new Error("Codex app-server did not return a turn id");
      coordinator.updateIntent(intentKey, {state:"running",nativeTurnId:turnId});
      const controlOwner = ownership.lease!;
      controlCleanup = registerNativeControl({coordinator:coordinator,key:nativeThreadLeaseKey("voice",target.threadId),owner:controlOwner.owner,generation:controlOwner.generation,turnId:()=>turnId,steer:phase !== "planning",request:(method,params)=>connection.request(method,params,5_000)});
      await emitProgress("turn_started", "Codex App turn started; waiting for completion.", { turn_id: turnId });

      if(options.signal?.aborted)abortHandler();
      const completed = await connection.waitForTurnCompleted(target.threadId, turnId, remainingMs(startedAt, options.timeoutMs));
      stage = "completed";
      coordinator.updateIntent(intentKey, {state:"completed",nativeTurnId:turnId,terminalStatus:asObject(completed)?.status});
      throwIfAborted(options.signal);
      await emitProgress("turn_completed", "Codex App turn completed.", { turn_id: turnId, level: "complete", status: "complete" });
      const text = extractAssistantText(completed) || connection.agentTextForTurn(turnId);
      const result = parseCodexJson(text);
      coordinator.updateIntent(intentKey, {state:"completed",result:{...result,transport:"codex-app"}});
      await this.injectThreadReport(connection, target.threadId, buildTaskReport("completed", payload, target.threadName, result, Date.now() - startedAt), remainingMs(startedAt, options.timeoutMs));
      return { ...result, transport: "codex-app" };
    } catch (error) {
      if (stage !== "completed") coordinator.updateIntent(intentKey, {state: stage === "dispatching" ? "unknown" : "not_dispatched"});
      await options.onProgress?.({
        timestamp: new Date().toISOString(),
        phase: "failed",
        level: "error",
        message: error instanceof Error ? error.message : "Codex App task failed.",
        status: "failed",
        transport: "codex-app",
        elapsed_ms: Date.now() - startedAt,
      });
      if (target && ownership.lease && stage === "completed") {
        await this.injectThreadReport(connection, target.threadId, buildTaskReport("failed", payload, target.threadName, error, Date.now() - startedAt), Math.min(5_000, remainingMs(startedAt, options.timeoutMs)));
      }
      if (error instanceof CodexDispatchError) throw error;
      const code=String((error as {code?:string}).code || (error instanceof Error ? error.message : ""));
      if (stage !== "dispatching" && ["turn_active","workspace_busy","capacity_busy"].includes(code)) throw new CodexDispatchError(code,"The requested execution resource is busy.","not_dispatched");
      throw new CodexDispatchError("voice_dispatch_failed", error instanceof Error ? error.message : "Voice task failed.", stage === "initializing" ? "not_dispatched" : stage === "completed" ? "completed" : "unknown", stage === "initializing");
    } finally {
      controlCleanup?.();
      if (stage !== "dispatching") { ownership.lease?.(); routingLease?.release(); capacityLease?.release(); }
      options.signal?.removeEventListener("abort", abortHandler);
      connection.close();
    }
  }

  private async resolveTaskThread(connection: AppServerConnection, payload: PrithaCodexTaskPayload, timeoutMs: number): Promise<CodexAppThreadTarget> {
    const overrideThreadId = process.env.PRITHA_CODEX_APP_THREAD_ID?.trim() || process.env.CODEX_APP_THREAD_ID?.trim();
    const reuseControlThread = ["1", "true", "yes"].includes(String(process.env.PRITHA_CODEX_APP_REUSE_CONTROL_THREAD || "").toLowerCase());
    const routingMode = this.getRuntimeSettings?.().codexAppThreadRoutingMode || "subject_scoped";
    if (overrideThreadId || reuseControlThread || routingMode === "control") return this.resolveControlThread(connection, timeoutMs, routingMode);
    if (routingMode === "per_task") return this.resolveNamedTaskThread(connection, payload, timeoutMs, routingMode);

    return this.resolveScopedThread(connection, payload, timeoutMs, routingMode);
  }

  private async resolveControlThread(connection: AppServerConnection, timeoutMs: number, routingMode: CodexAppThreadRoutingMode = "control"): Promise<CodexAppThreadTarget> {
    const threadName = controlThreadName(this.cwd, this.branch);
    const overrideThreadId = process.env.PRITHA_CODEX_APP_THREAD_ID?.trim() || process.env.CODEX_APP_THREAD_ID?.trim();
    const scope = { kind: "control", id: "control", label: "Control", source: overrideThreadId ? "override" : "fallback", generation: 1 } satisfies PrithaCodexThreadScope;

    if (overrideThreadId) {
      const thread = await this.resumeThread(connection, overrideThreadId, timeoutMs);
      await this.saveThread({ threadName, thread, role: "control", scope, routingMode });
      return { threadId: String(thread.id), threadName, role: "control", scope, routingMode };
    }

    const registered = getVoiceCodexThread({ projectRoot: this.cwd, branch: this.branch, role: "control" }, this.registryPath);
    if (registered?.threadId) {
      try {
        const thread = await this.resumeThread(connection, registered.threadId, timeoutMs);
        await this.saveThread({ threadName, thread, role: "control", scope, routingMode });
        return { threadId: String(thread.id), threadName, role: "control", scope, routingMode };
      } catch (error) {
        throw error; // A busy or unavailable original thread never authorizes a replacement.
      }
    }

    const listed = (await connection.request("thread/list", { limit: 20, cwd: this.cwd, archived: false, searchTerm: threadName }, timeoutMs)) as { data?: Array<Record<string, unknown>> };
    const exact = (listed.data || [])
      .filter((thread) => thread.name === threadName && thread.cwd === this.cwd)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
    if (exact?.id) {
      const thread = await this.resumeThread(connection, String(exact.id), timeoutMs);
      await this.saveThread({ threadName, thread, role: "control", scope, routingMode });
      return { threadId: String(thread.id), threadName, role: "control", scope, routingMode };
    }

    const thread = await this.startNamedThread(connection, threadName, timeoutMs);
    await this.saveThread({ threadName, thread, role: "control", scope, routingMode });
    return { threadId: String(thread.id), threadName, role: "control", scope, routingMode };
  }

  private async resolveNamedTaskThread(
    connection: AppServerConnection,
    payload: PrithaCodexTaskPayload,
    timeoutMs: number,
    routingMode: CodexAppThreadRoutingMode,
  ): Promise<CodexAppThreadTarget> {
    const scope = taskScope(payload.requestId);
    const threadName = taskThreadName(this.cwd, this.branch, payload.requestId);
    const thread = await this.resolveRegisteredOrNamedThread(connection, {
      role: "task",
      scope,
      threadName,
      timeoutMs,
      routingMode,
      forceNew: false,
    });
    return { threadId: String(thread.id), threadName, role: "task", scope, routingMode };
  }

  private async resolveScopedThread(
    connection: AppServerConnection,
    payload: PrithaCodexTaskPayload,
    timeoutMs: number,
    routingMode: CodexAppThreadRoutingMode,
  ): Promise<CodexAppThreadTarget> {
    const reset = asObject(payload.data)?.threadReset === true;
    const baseScope = normalizedThreadScope(payload.threadScope, payload.requestId);
    const runtimeSettings = this.getRuntimeSettings?.();
    const maxTurns = Math.max(1, Number(runtimeSettings?.codexAppThreadMaxTurns || 24));
    const maxAgeMs = Math.max(1, Number(runtimeSettings?.codexAppThreadMaxAgeHours || 168)) * 60 * 60 * 1000;
    const registered = latestVoiceCodexThread(
      {
        projectRoot: this.cwd,
        branch: this.branch,
        role: "subject",
        scopeKind: baseScope.kind,
        scopeId: baseScope.id,
      },
      this.registryPath,
    );
    const registeredCreatedAt = Date.parse(String(registered?.createdAt || registered?.updatedAt || ""));
    const rotateForTurns = routingMode === "subject_scoped_rotate" && Number(registered?.turnCount || 0) >= maxTurns;
    const rotateForAge = routingMode === "subject_scoped_rotate" && Number.isFinite(registeredCreatedAt) && Date.now() - registeredCreatedAt > maxAgeMs;
    const rotate = Boolean(registered) && (rotateForTurns || rotateForAge);
    const generation =
      reset || rotate
        ? Math.max(Number(registered?.generation || 0) + 1, baseScope.generation || 1)
        : Number(registered?.generation || baseScope.generation || 1);
    const scope = { ...baseScope, generation };
    const threadName = scopedThreadName(this.cwd, this.branch, scope);
    const thread = await this.resolveRegisteredOrNamedThread(connection, {
      role: "subject",
      scope,
      threadName,
      timeoutMs,
      routingMode,
      forceNew: reset || rotate,
    });
    return { threadId: String(thread.id), threadName, role: "subject", scope, routingMode };
  }

  private async startNamedThread(connection: AppServerConnection, threadName: string, timeoutMs: number) {
    const started = (await connection.request(
      "thread/start",
      {
        cwd: this.cwd,
        approvalPolicy: "never",
        sandbox: "read-only",
        personality: "pragmatic",
        threadSource: "user",
      },
      timeoutMs,
    )) as { thread?: Record<string, unknown> };
    const thread = started.thread;
    if (!thread?.id) throw new Error("Codex app-server did not create a thread");
    await connection.request("thread/name/set", { threadId: thread.id, name: threadName }, timeoutMs);
    return thread;
  }

  private async resumeThread(connection: AppServerConnection, threadId: string, timeoutMs: number) {
    const resumed = (await connection.request(
      "thread/resume",
      {
        threadId,
      },
      timeoutMs,
    )) as { thread?: Record<string, unknown> };
    if (!resumed.thread?.id) throw new Error(`Codex app-server did not resume thread ${threadId}`);
    return resumed.thread;
  }

  private async resolveRegisteredOrNamedThread(
    connection: AppServerConnection,
    options: {
      role: VoiceCodexThreadRole;
      scope: PrithaCodexThreadScope;
      threadName: string;
      timeoutMs: number;
      routingMode: CodexAppThreadRoutingMode;
      forceNew: boolean;
    },
  ) {
    if (!options.forceNew) {
      const registered = latestVoiceCodexThread(
        {
          projectRoot: this.cwd,
          branch: this.branch,
          role: options.role,
          scopeKind: options.scope.kind,
          scopeId: options.scope.id,
        },
        this.registryPath,
      );
      if (registered?.threadId) {
        try {
          const thread = await this.resumeThread(connection, registered.threadId, options.timeoutMs);
          await this.saveThread({ threadName: registered.threadName || options.threadName, thread, role: options.role, scope: { ...options.scope, generation: Number(registered.generation || options.scope.generation || 1) }, routingMode: options.routingMode });
          return thread;
        } catch (error) {
          throw error;
        }
      }

      const listed = (await connection.request("thread/list", { limit: 20, cwd: this.cwd, archived: false, searchTerm: options.threadName }, options.timeoutMs)) as { data?: Array<Record<string, unknown>> };
      const exact = (listed.data || [])
        .filter((thread) => thread.name === options.threadName && thread.cwd === this.cwd)
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
      if (exact?.id) {
        const thread = await this.resumeThread(connection, String(exact.id), options.timeoutMs);
        await this.saveThread({ threadName: options.threadName, thread, role: options.role, scope: options.scope, routingMode: options.routingMode });
        return thread;
      }
    }

    const thread = await this.startNamedThread(connection, options.threadName, options.timeoutMs);
    await this.saveThread({ threadName: options.threadName, thread, role: options.role, scope: options.scope, routingMode: options.routingMode });
    return thread;
  }

  private async saveThread(options: { threadName: string; thread: Record<string, unknown>; role: VoiceCodexThreadRole; scope: PrithaCodexThreadScope; routingMode: CodexAppThreadRoutingMode }) {
    await nativeExecutionCoordinator().withMutation(`voice-registry:${this.registryPath || defaultVoiceCodexRegistryPath()}`, async()=>saveVoiceCodexThread(
      {
        projectRoot: this.cwd,
        projectSlug: projectSlug(this.cwd),
        branch: this.branch,
        role: options.role,
        scopeKind: options.scope.kind,
        scopeId: options.scope.id,
        scopeLabel: options.scope.label,
        generation: options.scope.generation,
        routingMode: options.routingMode,
        threadName: options.threadName,
        threadId: String(options.thread.id),
        sessionId: stringOrNull(options.thread.sessionId),
        updatedAt: new Date().toISOString(),
      },
      this.registryPath,
    ));
  }

  private async injectThreadReport(connection: AppServerConnection, threadId: string, report: string, timeoutMs: number) {
    if (process.env.PRITHA_CODEX_APP_THREAD_REPORTS === "0" || process.env.PRITHA_CODEX_APP_THREAD_REPORTS === "false") return;
    try {
      await connection.request(
        "thread/inject_items",
        {
          threadId,
          items: [{ type: "message", role: "user", content: [{ type: "input_text", text: report }] }],
        },
        Math.min(Math.max(1_000, timeoutMs), 5_000),
      );
    } catch {
      // Audit-only thread reports must not block the operator task.
    }
  }
}

class AppServerConnection {
  readonly generation = randomUUID();
  readonly storage = storageIdentity(effectiveCodexHome());
  beforeThreadMutation?: (threadId: string) => Promise<void>;
  readonly newThreads = new Set<string>();
  private child: ReturnType<typeof spawn> | null = null;
  private nextId = 1;
  private pending = new Map<string | number, PendingRequest>();
  private turnWaiters = new Map<string, PendingRequest>();
  private turnErrors = new Map<string, string>();
  private completedTurns = new Map<string, unknown>();
  private agentText = new Map<string, string>();

  constructor(private readonly codexBin: string, private readonly cwd: string) {}

  start(timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.codexBin, ["app-server", "--listen", "stdio://"], {
        cwd: this.cwd,
        env: codexEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Codex app-server startup timed out"));
      }, Math.min(timeoutMs, 10_000));
      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.stderr.on("data", () => undefined);
      readline.createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    });
  }

  async request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const threadId = String(asObject(params)?.threadId || "");
    if (threadId && ["thread/resume", "thread/name/set", "thread/inject_items", "turn/start"].includes(method)) await this.beforeThreadMutation?.(threadId);
    const stdin = this.child?.stdin;
    if (!stdin?.writable) return Promise.reject(new Error("Codex app-server is not running"));
    const id = this.nextId++;
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, Math.max(1_000, timeoutMs));
      this.pending.set(id, { resolve, reject, timer });
      stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    if (method === "thread/start") {
      const id = asObject(asObject(result)?.thread)?.id;
      if (id) this.newThreads.add(String(id));
    }
    return result;
  }

  waitForTurnCompleted(threadId: string, turnId: string, timeoutMs: number) {
    const key = `${threadId}:${turnId}`;
    if (this.completedTurns.has(key)) { const turn = this.completedTurns.get(key); this.completedTurns.delete(key); return Promise.resolve(turn); }
    const priorError = this.turnErrors.get(key);
    if (priorError) {
      this.turnErrors.delete(key);
      return Promise.reject(new Error(priorError));
    }
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.turnWaiters.delete(key);
        reject(new Error(`Codex app-server turn timed out: ${turnId}`));
      }, Math.max(1_000, timeoutMs));
      this.turnWaiters.set(key, { resolve, reject, timer });
    });
  }

  agentTextForTurn(turnId: string) {
    return this.agentText.get(turnId) || "";
  }

  close(reason?: Error) {
    try { expireNativeRequests(this.generation); } catch { /* Closing still expires live callbacks. */ }
    const closeError = reason || new Error("Codex app-server connection closed");
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(closeError);
    }
    for (const waiter of this.turnWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(closeError);
    }
    this.pending.clear();
    this.turnWaiters.clear();
    this.turnErrors.clear();
    this.child?.kill("SIGTERM");
    this.child = null;
  }

  private handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: RpcMessage;
    try {
      message = JSON.parse(trimmed) as RpcMessage;
    } catch {
      return;
    }
    if (message.id !== undefined && message.method) {
      try {
      if (captureNativeRequest(message,this.storage,this.generation,result=>{
        const stdin=this.child?.stdin;
        if (!stdin?.writable) throw new Error("native_request_connection_expired");
        return new Promise<void>((resolve,reject)=>stdin.write(`${JSON.stringify({id:message.id,result})}\n`,error=>error?reject(error):resolve()));
      })) return;
      } catch {
        this.child?.stdin?.write(`${JSON.stringify({id:message.id,error:{code:-32603,message:"Request coordination is unavailable."}})}\n`);
        return;
      }
      this.child?.stdin?.write(`${JSON.stringify({id:message.id,error:{code:-32601,message:"Unsupported request"}})}\n`);
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || "Codex app-server JSON-RPC error"));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "item/agentMessage/delta") {
      const turnId = String(message.params?.turnId || "");
      const delta = String(message.params?.delta || "");
      if (turnId && delta) this.agentText.set(turnId, `${this.agentText.get(turnId) || ""}${delta}`);
      return;
    }
    if (message.method === "error") {
      const threadId = String(message.params?.threadId || "");
      const turnId = String(message.params?.turnId || "");
      const error = asObject(message.params?.error);
      const key = `${threadId}:${turnId}`;
      const waiter = this.turnWaiters.get(key);
      const messageText = String(error?.message || "Codex app-server turn failed");
      const willRetry = message.params?.willRetry === true;
      if (willRetry || isTransientCodexReconnectError(messageText)) return;
      if (waiter) {
        this.turnWaiters.delete(key);
        clearTimeout(waiter.timer);
        waiter.reject(new Error(messageText));
      } else if (threadId && turnId) {
        this.turnErrors.set(key, messageText);
      }
      return;
    }
    if (message.method === "turn/completed") {
      const threadId = String(message.params?.threadId || "");
      const turn = asObject(message.params?.turn);
      const turnId = String(turn?.id || "");
      const waiter = this.turnWaiters.get(`${threadId}:${turnId}`);
      if (!waiter && threadId && turnId) this.completedTurns.set(`${threadId}:${turnId}`, turn);
      if (waiter) {
        this.turnWaiters.delete(`${threadId}:${turnId}`);
        clearTimeout(waiter.timer);
        waiter.resolve(turn);
      }
    }
  }
}

function isTransientCodexReconnectError(message: string) {
  const progress = codexReconnectProgress(message);
  if (!progress) return false;
  return progress.current < CODEX_APP_RECONNECT_FINAL_ATTEMPT;
}

function codexReconnectProgress(message: string) {
  const match = message.match(/\bReconnecting\.\.\.\s*(\d+)\s*\/\s*(\d+)\b/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || current < 1 || total < 1) return null;
  return { current, total };
}

export async function checkCodexAppServerAvailable(codexBin: string, cwd: string) {
  const result = await runtimeProbe(codexBin,["app-server","--help"],cwd);
  const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const hasAppServerHelp = /Usage:\s+codex app-server\b/.test(detail) && /--listen\s+<URL>/.test(detail);
  return {
    available: result.ok && hasAppServerHelp && !/unknown|unrecognized|invalid/i.test(detail),
    detail,
  };
}

function buildPrompt(payload: PrithaCodexTaskPayload) {
  return [
    "You are the Codex App control thread for Pritha Control Center realtime voice.",
    "Complete the task using the current Pritha workspace and the evidence in the payload.",
    "Return JSON only. The final response must match the provided output schema.",
    "Put task-specific structured payload into data.structuredJson as a JSON string.",
    "",
    "Operational constraints:",
    "- Do not expose secrets, tokens, credentials, private memory, runtime queues, or unnecessary raw logs.",
    "- For system_change and implementation tasks, make narrowly scoped code/config/documentation changes and report changed files plus verification.",
    "- For analysis, research, review, and read-only tasks, inspect without changing files unless the payload explicitly grants workspace write.",
    "- For agent_creation tasks, sibling child-agent projects may be created next to Pritha only when requested by the operator.",
    "- If evidence is insufficient, return status=error with a concise explanation and next required data.",
    "",
    "Output schema:",
    JSON.stringify(RESULT_SCHEMA, null, 2),
    "",
    "Task payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildTaskReport(status: "started" | "completed" | "failed", payload: PrithaCodexTaskPayload, threadName: string, resultOrError?: unknown, durationMs?: number) {
  const result = asObject(resultOrError);
  const data = asObject(result?.data);
  const report = {
    marker: "PRITHA_CODEX_APP_TASK_REPORT",
    status,
    request_id: payload.requestId,
    user_id: payload.userId,
    task_type: payload.taskType,
    thread_name: threadName,
    thread_scope: payload.threadScope || null,
    routing_mode: stringOrNull(asObject(payload.data)?.routingMode),
    timestamp: new Date().toISOString(),
    duration_ms: durationMs ?? null,
    intent: truncate(payload.userIntent, 600),
    result_status: stringOrNull(result?.status),
    result_text: truncate(String(result?.text || ""), 1_000),
    changed_files: stringArray(data?.changedFiles).slice(0, 20),
    refs: stringArray(data?.refs).slice(0, 20),
    warnings: stringArray(result?.warnings).slice(0, 10),
    errors: status === "failed" ? [truncate(errorMessage(resultOrError), 1_000)] : stringArray(result?.errors).slice(0, 10),
  };
  return [
    "[Pritha Codex App task report]",
    "This is an automatic audit note from the Pritha Voice Control Codex App adapter. No response is required.",
    JSON.stringify(report, null, 2),
  ].join("\n");
}

function parseCodexJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return errorResult("Codex App returned an empty response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
      .map((match) => match[1]?.trim())
      .filter(Boolean)
      .reverse();
    for (const fenced of fencedMatches) {
      try {
        return JSON.parse(fenced as string);
      } catch {
        continue;
      }
    }

    for (const candidate of extractJsonObjects(trimmed).reverse()) {
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
    }

    return {
      status: "error",
      text: trimmed.slice(0, 2_000),
      data: { summary: trimmed.slice(0, 2_000), refs: [], changedFiles: [], nextActions: [], structuredJson: "{}" },
      errors: ["Codex App returned non-JSON output"],
      warnings: [],
    };
  }
}

function extractJsonObjects(text: string) {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function errorResult(message: string) {
  return {
    status: "error",
    text: "",
    data: { summary: "", refs: [], changedFiles: [], nextActions: [], structuredJson: "{}" },
    errors: [message],
    warnings: [],
  };
}

function extractAssistantText(turn: unknown) {
  const turnObject = asObject(turn);
  const items = Array.isArray(turnObject?.items) ? (turnObject.items as unknown[]) : [];
  const messages = items
    .map(asObject)
    .filter((item): item is Record<string, unknown> => item?.type === "agentMessage")
    .map((item) => String(item.text || "").trim())
    .filter(Boolean);
  return messages.at(-1) || "";
}

/** Native receipt recovery never launches or resumes a model turn. */
export function recoverVoiceNativeTurns(storage:string,nativeThreadId:string,turns:unknown[]) {
  const coordinator=nativeExecutionCoordinator();
  for(const intent of coordinator.listIntents({kind:"voice-turn",states:["dispatching","running","unknown"],limit:1000})) {
    if(intent.storage!==storage || intent.nativeThreadId!==nativeThreadId || !intent.key)continue;
    const candidate=turns.map(asObject).find(turn=>turn && (intent.nativeTurnId ? turn.id===intent.nativeTurnId : (Array.isArray(turn.items)?turn.items:[]).some(raw=>{
      const item=asObject(raw);
      if(item?.type!=="userMessage" || item.clientId!==intent.clientMessageId)return false;
      const content=(Array.isArray(item.content)?item.content:[]).map(asObject).filter(part=>part?.type==="text").map(part=>String(part?.text || "")).join("\n");
      return createHash("sha256").update(content).digest("hex")===intent.promptHash;
    })));
    if(!candidate || !["completed","interrupted","failed"].includes(String(candidate.status)))continue;
    try {
      coordinator.updateIntent(intent.key,{state:"completed",nativeTurnId:candidate.id,terminalStatus:candidate.status,result:{...parseCodexJson(extractAssistantText(candidate)),transport:"codex-app"},recoveredFromNative:true},intent.revision);
      if(intent.owner && intent.generation)coordinator.reconcileRelease(intent.owner,intent.generation);
    } catch(error){if((error as {code?:string}).code!=="execution_revision_conflict")throw error;}
  }
}

function currentBranch(cwd: string) {
  const result = spawnSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" });
  return result.stdout?.trim() || "main";
}

function effortForTask(taskType: string) {
  return ["analysis", "research"].includes(taskType) ? "low" : "medium";
}

function remainingMs(startedAt: number, timeoutMs: number) {
  return Math.max(1_000, timeoutMs - (Date.now() - startedAt));
}

function codexEnv() {
  const env = { ...process.env };
  if (process.env.PRITHA_REALTIME_CODEX_USE_PROXY === "1" || process.env.TECHSCOPE_VOICE_CODEX_USE_PROXY === "1") return env;
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    delete env[key];
  }
  env.NO_PROXY = env.NO_PROXY || "127.0.0.1,localhost";
  env.no_proxy = env.no_proxy || env.NO_PROXY;
  return env;
}

type VoiceCodexThreadRole = "control" | "task" | "subject" | "worktree";

type VoiceCodexThreadEntry = {
  projectRoot: string;
  projectSlug: string;
  branch: string;
  role: VoiceCodexThreadRole;
  scopeKind?: PrithaCodexThreadScopeKind;
  scopeId?: string;
  scopeLabel?: string;
  generation?: number;
  turnCount?: number;
  routingMode?: CodexAppThreadRoutingMode;
  threadName: string;
  threadId: string;
  sessionId: string | null;
  createdAt?: string;
  updatedAt: string;
};

function defaultVoiceCodexRegistryPath() {
  return process.env.PRITHA_VOICE_CODEX_REGISTRY_PATH?.trim() || process.env.VOICE_CODEX_REGISTRY_PATH?.trim() || path.join(os.homedir(), ".config", "voice-codex", "projects.json");
}

function projectSlug(projectRoot: string) {
  return (path.basename(projectRoot).trim() || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function controlThreadName(projectRoot: string, branch: string) {
  return `VC · ${projectSlug(projectRoot)} · control · ${branch || "main"}`;
}

function taskThreadName(projectRoot: string, branch: string, requestId: string) {
  const shortId = (requestId || randomUUID()).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 32);
  return `VC · ${projectSlug(projectRoot)} · task · ${shortId} · ${branch || "main"}`;
}

function scopedThreadName(projectRoot: string, branch: string, scope: PrithaCodexThreadScope) {
  return `VC · ${projectSlug(projectRoot)} · ${scope.kind}:${scope.id} · g${scope.generation || 1} · ${branch || "main"}`;
}

function registryKey(input: { projectRoot: string; branch: string; role: string; scopeKind?: string; scopeId?: string; generation?: number }) {
  const base = `${path.resolve(input.projectRoot)}::${input.branch || "main"}::${input.role}`;
  if (!input.scopeKind || !input.scopeId) return base;
  return `${base}::${input.scopeKind}::${input.scopeId}::${input.generation || 1}`;
}

function readVoiceCodexRegistry(registryPath = defaultVoiceCodexRegistryPath()) {
  if (!fs.existsSync(registryPath)) return { version: 1, threads: {} as Record<string, VoiceCodexThreadEntry> };
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { threads?: Record<string, VoiceCodexThreadEntry> };
    if (!parsed.threads || typeof parsed.threads!=="object" || Array.isArray(parsed.threads))throw new Error("voice_registry_invalid");
    return { version: 1, threads: parsed.threads };
  } catch {
    throw new Error("Voice thread registry needs recovery; the original history has been preserved.");
  }
}

function getVoiceCodexThread(input: { projectRoot: string; branch: string; role: VoiceCodexThreadRole; scopeKind?: string; scopeId?: string; generation?: number }, registryPath = defaultVoiceCodexRegistryPath()) {
  return readVoiceCodexRegistry(registryPath).threads[registryKey(input)] || null;
}

function latestVoiceCodexThread(
  input: { projectRoot: string; branch: string; role: VoiceCodexThreadRole; scopeKind?: string; scopeId?: string },
  registryPath = defaultVoiceCodexRegistryPath(),
) {
  const registry = readVoiceCodexRegistry(registryPath);
  const direct = getVoiceCodexThread(input, registryPath);
  if (direct) return direct;
  const root = path.resolve(input.projectRoot);
  return Object.values(registry.threads)
    .filter((entry) => path.resolve(entry.projectRoot) === root)
    .filter((entry) => entry.branch === (input.branch || "main"))
    .filter((entry) => entry.role === input.role)
    .filter((entry) => !input.scopeKind || entry.scopeKind === input.scopeKind)
    .filter((entry) => !input.scopeId || entry.scopeId === input.scopeId)
    .sort((a, b) => Number(b.generation || 1) - Number(a.generation || 1) || Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""))[0] || null;
}

function saveVoiceCodexThread(entry: VoiceCodexThreadEntry, registryPath = defaultVoiceCodexRegistryPath()) {
  const registry = readVoiceCodexRegistry(registryPath);
  const key = registryKey({
    projectRoot: entry.projectRoot,
    branch: entry.branch,
    role: entry.role,
    scopeKind: entry.scopeKind,
    scopeId: entry.scopeId,
    generation: entry.generation,
  });
  const previous = registry.threads[key];
  registry.threads[key] = {
    ...entry,
    createdAt: entry.createdAt || previous?.createdAt || new Date().toISOString(),
    turnCount: Number(previous?.turnCount || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(registryPath), { recursive: true, mode:0o700 });
  if (fs.existsSync(registryPath) && fs.lstatSync(registryPath).isSymbolicLink()) throw new Error("voice_registry_symlink");
  const temporary=`${registryPath}.${randomUUID()}.tmp`;
  const fd=fs.openSync(temporary,"wx",0o600);
  try {fs.writeFileSync(fd,`${JSON.stringify(registry,null,2)}\n`);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temporary,registryPath);
  return entry;
}

function safeScopeId(value: unknown, fallback: string) {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback;
}

function normalizedThreadScope(value: unknown, requestId: string): PrithaCodexThreadScope {
  const source = asObject(value);
  const kind = source?.kind === "agent" || source?.kind === "pritha" || source?.kind === "control" || source?.kind === "task" ? source.kind : "task";
  const id = safeScopeId(source?.id, kind === "task" ? requestId : "unknown");
  const label = String(source?.label || id).replace(/\s+/g, " ").trim().slice(0, 80) || id;
  const scopeSource = source?.source === "explicit" || source?.source === "derived" || source?.source === "override" || source?.source === "fallback" ? source.source : "fallback";
  const generation = Math.max(1, Math.min(Number(source?.generation || 1) || 1, 999));
  return { kind, id, label, source: scopeSource, generation };
}

function taskScope(requestId: string): PrithaCodexThreadScope {
  return {
    kind: "task",
    id: safeScopeId(requestId, randomUUID()),
    label: "One-off Codex task",
    source: "fallback",
    generation: 1,
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function looksLikePath(value: string) {
  return value.includes("/") || value.startsWith(".");
}

export function prithaCodexAppResultSchema() {
  return RESULT_SCHEMA;
}
