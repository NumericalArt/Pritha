import { existsSync, lstatSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { CodexAppServerConnection, ExecutionBackendError } from "./execution-backends.mjs";

export const BUILD_EXECUTOR_RESULT_SCHEMA = "pritha-build-executor-result-v2";

function bounded(value, maximum = 20_000) {
  const text = String(value || "").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 3)}...`;
}

function worktreeRoot(value) {
  const requested = path.resolve(String(value || ""));
  if (!existsSync(requested)) throw new Error("Build worktree does not exist");
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Build worktree must be a regular directory, not a symlink");
  return realpathSync(requested);
}

function sanitized(value, context) {
  if (typeof value === "string") return redactFilesystemPaths(value, context);
  if (Array.isArray(value)) return value.map((entry) => sanitized(entry, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitized(entry, context)]));
  return value;
}

function outcomeProjection(plan) {
  return {
    spec_id: plan.spec_id,
    agent_slug: plan.agent_slug,
    contract_fingerprint: plan.contract_fingerprint,
    semantic_lock: plan.semantic_lock,
    interaction_mode: plan.interaction_mode,
    trials: (plan.trials || []).map((trial) => ({
      id: trial.id,
      statement: trial.statement,
      kind: trial.kind,
      covers: trial.covers,
      pass_criteria: trial.passCriteria || null,
      assertions: trial.kind === "automated" ? {
        exit_code: trial.thenExitCode,
        stdout_contains: trial.thenStdoutContains,
        stdout_excludes: trial.thenStdoutExcludes,
        stderr_contains: trial.thenStderrContains,
        stderr_excludes: trial.thenStderrExcludes,
        artifacts: trial.thenArtifacts,
        artifact_contains: trial.thenArtifactContains,
        absent_paths: trial.thenAbsentPaths,
      } : null,
    })),
    demo: plan.demo || [],
  };
}

function buildPrompt(input) {
  const protectedPaths = (input.protectedPaths || []).map((entry) => entry.path || entry).filter(Boolean);
  const payload = {
    run_id: input.runId,
    iteration: input.iteration,
    remaining_iterations: input.remainingIterations,
    approved_outcome: outcomeProjection(input.plan),
    latest_trial_failures: input.failures || [],
    protected_trial_inputs: protectedPaths,
  };
  return [
    "You are the bounded implementation executor for a Pritha agent-delivery run.",
    "Work only inside the supplied worktree. Implement the approved outcome and repair the listed Trial failures.",
    "The approved outcome, Trial definitions, approval evidence, budgets, ledger and verifier are host-owned and immutable.",
    "Do not edit protected Trial input files. Do not weaken, delete, skip or replace tests to obtain a green result.",
    "Do not push, merge, deploy, enable services, provision secrets, change Git remotes or bypass hooks.",
    "Network access is disabled. Use only files and dependencies already present in the worktree.",
    "Make the smallest coherent implementation, run relevant local checks if useful, and finish with a concise summary.",
    "A completion claim is not trusted; Pritha will independently run the approved Trials after this turn.",
    "",
    "Delivery payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function outputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "changed_files", "remaining_risks"],
    properties: {
      summary: { type: "string" },
      changed_files: { type: "array", items: { type: "string" } },
      remaining_risks: { type: "array", items: { type: "string" } },
    },
  };
}

function extractAgentText(turn) {
  const values = [];
  for (const item of turn?.items || []) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "agentMessage") {
      if (typeof item.text === "string") values.push(item.text);
      if (Array.isArray(item.content)) {
        for (const part of item.content) if (typeof part?.text === "string") values.push(part.text);
      }
    }
  }
  return values.join("\n").trim();
}

function parseSummary(text) {
  const source = String(text || "").trim();
  if (!source) return { summary: "The build attempt has no textual summary.", changed_files: [], remaining_risks: [] };
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object") {
      return {
        summary: bounded(parsed.summary || source, 4_000),
        changed_files: Array.isArray(parsed.changed_files) ? parsed.changed_files.map((entry) => bounded(entry, 500)).slice(0, 200) : [],
        remaining_risks: Array.isArray(parsed.remaining_risks) ? parsed.remaining_risks.map((entry) => bounded(entry, 1_000)).slice(0, 50) : [],
      };
    }
  } catch {
    // Older App Server/model combinations may return unconstrained text.
  }
  return { summary: bounded(source, 4_000), changed_files: [], remaining_risks: [] };
}

function goalMethodUnavailable(error) {
  return error?.details?.rpcCode === -32601
    || /thread\/goal\/(?:set|get)|method.*(?:not found|unknown)|goal.*(?:unavailable|unsupported)/i.test(error?.message || "");
}

export class FunctionBuildExecutor {
  constructor(callback, options = {}) {
    if (typeof callback !== "function") throw new Error("FunctionBuildExecutor requires a callback");
    this.callback = callback;
    this.name = options.name || "function-build-executor";
  }

  async execute(input) {
    const started = Date.now();
    const value = await this.callback(input);
    return {
      schema: BUILD_EXECUTOR_RESULT_SCHEMA,
      executor: this.name,
      status: value?.status || "completed",
      summary: bounded(value?.summary || "Fixture executor completed."),
      changed_files: Array.isArray(value?.changed_files) ? value.changed_files.slice(0, 200) : [],
      remaining_risks: Array.isArray(value?.remaining_risks) ? value.remaining_risks.slice(0, 50) : [],
      duration_ms: Date.now() - started,
      runtime_version: value?.runtime_version || "fixture",
      thread_id: value?.thread_id || null,
      turn_id: value?.turn_id || null,
      tokens_used: Number.isSafeInteger(value?.tokens_used) ? value.tokens_used : null,
      usage_scope: "build-executor",
      usage_status: value?.usage_status || (Number.isSafeInteger(value?.tokens_used) ? "measured" : "not-applicable"),
      usage_source: value?.usage_source || "fixture",
      goal_enforcement: value?.goal_enforcement || "not-applicable",
    };
  }

  async probe() {
    return {
      backend: this.name,
      available: true,
      isolation: "caller-defined",
      runtimeVersion: "fixture",
      capabilities: { commandExec: true, threadStart: false, goal: false },
    };
  }

  close() {}
}

export class ManualBuildExecutor {
  constructor() {
    this.name = "manual-build";
  }

  async execute() {
    throw new ExecutionBackendError(
      "manual_build_required",
      "The approved contract selects manual implementation; Pritha cannot autonomously repair the failing Trials",
    );
  }

  async probe() {
    return {
      backend: this.name,
      available: true,
      isolation: "none",
      runtimeVersion: "manual",
      capabilities: { commandExec: false, threadStart: false, goal: false },
      error: "Manual build executor requires operator implementation.",
    };
  }

  close() {}
}

function worktreeIdentity(cwd) {
  return `sha256:${createHash("sha256").update(cwd).digest("hex")}`;
}

function validGoal(goal, receipt) {
  return goal?.threadId === receipt.thread_id
    && goal?.objective === receipt.goal_objective
    && goal?.tokenBudget === receipt.token_budget
    && Number.isSafeInteger(goal?.tokensUsed) && goal.tokensUsed >= 0;
}

const TERMINAL_TURN_STATUSES = new Set(["completed", "failed", "interrupted"]);

export class CodexAppServerBuildExecutor {
  constructor(options = {}) {
    this.name = "codex-app-server-build";
    this.options = options;
    this.connection = options.connection || null;
    this.initializeResponse = null;
  }

  async ensureReady(cwd, timeoutMs) {
    if (this.initializeResponse && this.connection && (!("child" in this.connection) || this.connection.child)) return this.initializeResponse;
    if (!this.connection) {
      const factory = this.options.connectionFactory || ((value) => new CodexAppServerConnection(value));
      this.connection = factory({ codexBin: this.options.codexBin, cwd });
    }
    await this.connection.start(Math.min(timeoutMs, 10_000));
    this.initializeResponse = await this.connection.request("initialize", {
      clientInfo: { name: "pritha-build-executor", title: "Pritha Build Executor", version: "2.0" },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: ["item/reasoning/textDelta", "item/reasoning/summaryTextDelta"],
      },
    }, Math.min(timeoutMs, 10_000));
    this.connection.notify?.("initialized");
    return this.initializeResponse;
  }

  async probe(options = {}) {
    const cwd = worktreeRoot(options.cwd || options.worktree);
    const timeoutMs = 10_000;
    let threadId;
    let result;
    try {
      const initialized = await this.ensureReady(cwd, timeoutMs);
      const response = await this.connection.request("thread/start", {
        cwd, ephemeral: false, approvalPolicy: "never", sandbox: "read-only",
        threadSource: "user", developerInstructions: "Capability probe only. No model turn is authorized.",
      }, timeoutMs);
      threadId = String(response?.thread?.id || "");
      if (!threadId || response.thread.ephemeral === true) throw new ExecutionBackendError("app_server_thread_missing", "A persisted probe thread is required");
      let goal = false;
      let error = null;
      try {
        const objective = "Pritha capability probe; no model turn is authorized.";
        await this.connection.request("thread/goal/set", { threadId, objective, status: "paused", tokenBudget: 1_000 }, timeoutMs);
        const readback = (await this.connection.request("thread/goal/get", { threadId }, timeoutMs))?.goal;
        goal = validGoal(readback, { thread_id: threadId, goal_objective: objective, token_budget: 1_000 })
          && readback.tokensUsed === 0 && readback.status === "paused";
        if (!goal) error = "The paused probe Goal failed its readback check.";
      } catch (failure) { error = bounded(failure?.message || failure, 2_000); }
      result = {
        backend: this.name, available: true, isolation: "sandboxed",
        runtimeVersion: String(initialized?.userAgent || "codex-app-server/unknown"),
        capabilities: { commandExec: false, threadStart: true, goal, threadLifetime: "persisted-per-attempt" }, error,
      };
    } catch (error) {
      result = {
        backend: this.name, available: false, isolation: "unavailable",
        runtimeVersion: String(this.initializeResponse?.userAgent || "unknown"),
        capabilities: { commandExec: false, threadStart: false, goal: "unprobed" },
        error: bounded(error?.message || error, 2_000),
      };
    } finally {
      if (threadId) {
        try { await this.connection.request("thread/goal/clear", { threadId }, timeoutMs); }
        catch { /* Goal may be unsupported; no model turn was sent. */ }
        try { await this.archiveAttempt({ thread_id: threadId, usage_status: "not-started" }, cwd, timeoutMs); }
        catch { result.available = false; result.error = "The capability probe thread could not be archived."; }
      }
    }
    return result;
  }

  async archiveAttempt(receipt, cwd, timeoutMs) {
    try {
      await this.connection.request("thread/archive", { threadId: receipt.thread_id }, timeoutMs);
      return "archived";
    } catch (error) {
      // Installed runtimes reject a repeated archive. Confirm its native state
      // instead of treating a lost archive acknowledgement as pending forever.
      if (!/no rollout found for thread id/i.test(error?.message || "")) throw error;
      let cursor;
      for (let page = 0; page < 5; page++) {
        const listed = await this.connection.request("thread/list", { cwd, archived: true, limit: 100, ...(cursor ? { cursor } : {}) }, timeoutMs);
        if (listed.data?.some(thread => thread.id === receipt.thread_id && path.resolve(thread.cwd || "") === cwd)) return "archived";
        cursor = listed.nextCursor;
        if (!cursor) break;
      }
      if (receipt.usage_status === "not-started") {
        // Before the first Goal/turn, thread/start may have no rollout at all.
        // This exception is limited to an attempt for which no RPC was sent.
        await this.connection.request("thread/unsubscribe", { threadId: receipt.thread_id }, timeoutMs);
        return "not-materialized";
      }
      throw error;
    }
  }

  async checkpoint(input, receipt) {
    const context = { projectRoot: input.worktree, stateRoot: input.stateRoot, root: input.root };
    const safe = sanitized(receipt, context);
    try { await input.onCheckpoint?.(safe); }
    catch {
      throw new ExecutionBackendError("executor_checkpoint_failed", "The host could not persist the build attempt checkpoint", { executorResult: safe });
    }
    return safe;
  }

  async waitForTurn(receipt, timeoutMs) {
    return this.connection.waitForNotification((message) => {
      const thread = message?.params?.threadId;
      const turn = message?.params?.turn?.id || message?.params?.turnId;
      return thread === receipt.thread_id && turn === receipt.turn_id
        && (message.method === "turn/completed" || (message.method === "error" && message.params?.willRetry !== true));
    }, timeoutMs);
  }

  async settle(input, receipt, turn, timeoutMs) {
    const rpcTimeout = Math.min(timeoutMs, 10_000);
    // A timeout/error is not proof that execution stopped. Interrupt only the
    // bound turn and wait for its terminal notification before trusting usage.
    if (!TERMINAL_TURN_STATUSES.has(turn?.status) && receipt.turn_id) {
      try {
        await this.connection.request("turn/interrupt", { threadId: receipt.thread_id, turnId: receipt.turn_id }, rpcTimeout);
        const notification = await this.waitForTurn(receipt, rpcTimeout);
        turn = notification.params?.turn;
      } catch { /* Unknown remains unknown; no dispatch retry. */ }
    }
    const terminal = TERMINAL_TURN_STATUSES.has(turn?.status);
    receipt.turn_status = terminal ? turn.status : "unknown";
    receipt.status = terminal ? turn.status : "uncertain";
    const summary = parseSummary(this.connection.agentTextForTurn?.(receipt.turn_id) || extractAgentText(turn));
    Object.assign(receipt, summary);
    let goal;
    if (receipt.goal_enforcement === "required") {
      try { goal = (await this.connection.request("thread/goal/get", { threadId: receipt.thread_id }, rpcTimeout))?.goal; }
      catch { /* A matching final token update can still supply usage. */ }
    }
    receipt.goal_status = goal?.status || (receipt.goal_enforcement === "required" ? "unavailable" : "waived");
    const goalValid = validGoal(goal, receipt);
    const fallback = this.connection.tokenUsageForTurn?.(receipt.thread_id, receipt.turn_id);
    const count = goalValid ? goal.tokensUsed : fallback;
    receipt.usage_status = terminal && Number.isSafeInteger(count) && count >= 0 ? "measured" : "unknown";
    receipt.tokens_used = receipt.usage_status === "measured" ? count : null;
    receipt.usage_source = receipt.usage_status === "measured" ? (goalValid ? "goal" : "thread-token-usage") : "unavailable";
    if (goal && !goalValid) receipt.error_code = "goal_state_mismatch";
    // Persist evidence before cleanup: a crash never hides a charged attempt.
    receipt.thread_cleanup = "pending";
    try { await this.checkpoint(input, receipt); }
    catch { /* Still quiesce the native thread; the final checkpoint must succeed. */ }
    try {
      if (receipt.goal_enforcement === "required" && goal?.status === "active") {
        await this.connection.request("thread/goal/set", { threadId: receipt.thread_id, status: "paused" }, rpcTimeout);
      }
      receipt.thread_cleanup = await this.archiveAttempt(receipt, worktreeRoot(input.worktree), rpcTimeout);
    } catch { receipt.thread_cleanup = "pending"; }
    return this.checkpoint(input, receipt);
  }

  async recover(input, saved) {
    const cwd = worktreeRoot(input.worktree);
    if (saved.schema !== BUILD_EXECUTOR_RESULT_SCHEMA || saved.run_id !== input.runId
      || saved.worktree_identity !== worktreeIdentity(cwd) || !saved.thread_id) {
      throw new ExecutionBackendError("executor_recovery_unavailable", "No compatible bound receipt is available for recovery");
    }
    await this.ensureReady(cwd, 10_000);
    const read = await this.connection.request("thread/read", { threadId: saved.thread_id, includeTurns: true }, 10_000);
    if (read.thread?.id !== saved.thread_id || path.resolve(read.thread.cwd || "") !== cwd || read.thread.ephemeral === true) {
      throw new ExecutionBackendError("executor_recovery_mismatch", "Native recovery thread does not match the bound worktree");
    }
    const turns = read.thread.turns || [];
    if (turns.length > 1 || (saved.turn_id && turns.some((turn) => turn.id !== saved.turn_id))) {
      throw new ExecutionBackendError("executor_recovery_mismatch", "The attempt contains an unexpected native turn");
    }
    const receipt = { ...saved };
    const turn = turns[0];
    if (saved.usage_status === "not-started" && turns.length === 0) {
      receipt.thread_cleanup = await this.archiveAttempt(receipt, cwd, 10_000);
      return this.checkpoint(input, receipt);
    }
    receipt.turn_id ||= turn?.id || null;
    if (turn && !TERMINAL_TURN_STATUSES.has(turn.status)) {
      await this.connection.request("thread/resume", { threadId: receipt.thread_id, cwd, approvalPolicy: "never", sandbox: "workspace-write" }, 10_000);
    }
    // Reading/resuming is recovery only. Never resend turn/start.
    return this.settle(input, receipt, turn, 10_000);
  }

  async execute(input) {
    const cwd = worktreeRoot(input.worktree);
    const timeoutMs = Number.isSafeInteger(input.timeoutMs) ? Math.min(Math.max(input.timeoutMs, 10_000), 3_600_000) : 900_000;
    const goalRequired = input.goalRequired !== false;
    const tokenBudget = Number(input.tokenBudget);
    if (!Number.isSafeInteger(tokenBudget) || tokenBudget < 1) throw new ExecutionBackendError("token_budget_exhausted", "Build turn has no positive remaining token budget");
    const objective = bounded(input.goalObjective, 4_000);
    if (goalRequired && !objective) throw new ExecutionBackendError("goal_objective_invalid", "Build Goal objective is required");
    const initialized = await this.ensureReady(cwd, timeoutMs);
    const started = Date.now();
    const receipt = {
      schema: BUILD_EXECUTOR_RESULT_SCHEMA, executor: this.name, run_id: input.runId, iteration: input.iteration,
      worktree_identity: worktreeIdentity(cwd), thread_lifetime: "persisted-per-attempt",
      runtime_version: String(initialized?.userAgent || "codex-app-server/unknown"),
      status: "prepared", turn_status: "not-started", thread_id: null, turn_id: null,
      goal_enforcement: goalRequired ? "required" : "waived-once", goal_objective: objective,
      token_budget: tokenBudget, tokens_used: null, usage_scope: "build-executor", usage_status: "not-started", usage_source: "not-started",
      thread_cleanup: "not-created", duration_ms: 0,
    };
    let failure;
    let turn;
    let dispatched = false;
    try {
      const response = await this.connection.request("thread/start", {
        cwd, ephemeral: false, approvalPolicy: "never", sandbox: "workspace-write",
        runtimeWorkspaceRoots: [cwd], personality: "pragmatic", threadSource: "user",
        developerInstructions: "Implement only the approved delivery payload in the current worktree. Never modify verifier inputs, budgets or Goal, or perform push, merge, deployment, service enablement, secret provisioning, remote changes, or hook bypasses.",
      }, Math.min(timeoutMs, 30_000));
      receipt.thread_id = String(response?.thread?.id || "");
      if (!receipt.thread_id || response.thread.ephemeral === true) throw new ExecutionBackendError("app_server_thread_missing", "A persisted build thread is required");
      receipt.thread_cleanup = "pending";
      await this.checkpoint(input, receipt);
      if (goalRequired) {
        try {
          await this.connection.request("thread/goal/set", { threadId: receipt.thread_id, objective, status: "active", tokenBudget }, Math.min(timeoutMs, 30_000));
          const goal = (await this.connection.request("thread/goal/get", { threadId: receipt.thread_id }, Math.min(timeoutMs, 30_000)))?.goal;
          if (!validGoal(goal, receipt) || goal.tokensUsed !== 0 || goal.status !== "active") {
            throw new ExecutionBackendError("goal_state_mismatch", "Build Goal readback does not match the authorized objective, budget and initial usage");
          }
        } catch (error) {
          if (goalMethodUnavailable(error)) throw new ExecutionBackendError("goal_api_unavailable", "Installed Codex runtime cannot enforce this persisted build Goal");
          throw error;
        }
      }
      receipt.status = "dispatching";
      receipt.turn_status = "unknown";
      receipt.usage_status = "unknown";
      // This durable intent must precede the potentially charged RPC.
      await this.checkpoint(input, receipt);
      dispatched = true;
      const turnResponse = await this.connection.request("turn/start", {
        threadId: receipt.thread_id, input: [{ type: "text", text: buildPrompt(input), text_elements: [] }],
        cwd, approvalPolicy: "never", sandboxPolicy: { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false },
        runtimeWorkspaceRoots: [cwd], model: this.options.model || undefined, effort: this.options.effort || "high",
        serviceTier: this.options.serviceTier || undefined, personality: "pragmatic", summary: "none", outputSchema: outputSchema(),
      }, Math.min(timeoutMs, 30_000));
      receipt.turn_id = String(turnResponse?.turn?.id || "");
      if (!receipt.turn_id) throw new ExecutionBackendError("app_server_turn_missing", "Codex App Server did not return a build turn id");
      receipt.status = "running";
      await this.checkpoint(input, receipt);
      const notification = await this.waitForTurn(receipt, timeoutMs);
      turn = notification.params?.turn;
      if (notification.method === "error" || turn?.status !== "completed") {
        failure = new ExecutionBackendError("app_server_turn_failed", "The bound Codex build turn did not complete successfully");
      }
    } catch (error) {
      failure = error;
      if (!dispatched) {
        receipt.usage_status = "not-started";
        receipt.turn_status = "not-started";
      }
    }
    receipt.duration_ms = Date.now() - started;
    if (receipt.usage_status === "not-started") {
      receipt.status = "not-started";
      if (receipt.thread_id) {
        try { receipt.thread_cleanup = await this.archiveAttempt(receipt, cwd, 10_000); }
        catch { receipt.thread_cleanup = "pending"; }
      }
      await this.checkpoint(input, receipt);
    } else {
      // Unknown delivery is preserved for reconnect recovery; no automatic resend.
      Object.assign(receipt, await this.settle(input, receipt, turn, timeoutMs));
    }
    const result = await this.checkpoint(input, receipt);
    if (receipt.usage_status === "unknown") failure = new ExecutionBackendError("goal_usage_unavailable", "Build usage could not be settled; no next model turn is allowed");
    else if (receipt.thread_cleanup === "pending") failure = new ExecutionBackendError("executor_cleanup_pending", "The bound build thread could not be archived");
    else if (receipt.error_code) failure = new ExecutionBackendError(receipt.error_code, "The native Goal no longer matches the authorized build projection");
    if (failure) throw new ExecutionBackendError(failure.code || "app_server_turn_failed", bounded(failure.message, 2_000), { executorResult: result });
    return result;
  }

  close() {
    this.connection?.stop?.();
    this.connection = null;
    this.initializeResponse = null;
  }
}

export function createBuildExecutor(name = "codex-app-server", options = {}) {
  if (name === "codex-app-server" || name === "app-server") return new CodexAppServerBuildExecutor(options);
  if (name === "manual") return new ManualBuildExecutor();
  throw new Error(`Unknown build executor: ${name}`);
}
