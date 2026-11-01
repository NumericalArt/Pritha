import { existsSync, lstatSync, realpathSync,constants,openSync,closeSync,fstatSync,readFileSync } from "node:fs";
import { createHash,randomUUID } from "node:crypto";
import { execFileSync } from 'node:child_process';
import path from "node:path";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { CodexAppServerConnection, ExecutionBackendError } from "./execution-backends.mjs";
import { ClaudeProviderService } from '../claude/provider-service.mjs';
import { startClaudeCodeRun } from '../claude-code-runner.mjs';
import { ExecutionCoordinator } from '../lib/execution-coordinator.mjs';
import { providerProcessTreesExited } from '../lib/provider-process-proof.mjs';
import { providerProcessEnvironment } from '../lib/provider-process-environment.mjs';
import { privateStateFile } from '../lib/private-state-path.mjs';
import { resolvePrithaRoot,resolvePrithaStateRoot,resolvePrithaStatePathFrom } from '../lib/paths.mjs';

export const BUILD_EXECUTOR_RESULT_SCHEMA = "pritha-build-executor-result-v2";
export const CLAUDE_BUILD_REPORT_SCHEMA={type:'object',additionalProperties:false,required:['summary','changed_files','remaining_risks'],properties:{summary:{type:'string',minLength:1,maxLength:4000},changed_files:{type:'array',maxItems:200,items:{type:'string',maxLength:500}},remaining_risks:{type:'array',maxItems:50,items:{type:'string',maxLength:1000}}}};

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
    operator_guidance: bounded(input.guidance, 2_000),
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
    if (read.thread.status?.type === "notLoaded" || (turn && !TERMINAL_TURN_STATUSES.has(turn.status))) {
      // Persisted Goal reads require a loaded thread in Codex 0.153. A terminal
      // archived attempt may therefore need loading too; this never sends input.
      // Cold resume may otherwise resolve a new account default rather than
      // the model that actually ran this bound attempt. Recovery sends no new
      // turn, but must preserve the model projection before reading its Goal.
      const params = { threadId: receipt.thread_id, cwd, approvalPolicy: "never", sandbox: "workspace-write",
        model: saved.model_observed || saved.model_requested || undefined };
      try {
        await this.connection.request("thread/resume", params, 10_000);
      } catch (error) {
        if (!/session .* is archived/i.test(error?.message || "")) throw error;
        receipt.thread_cleanup = "pending";
        await this.checkpoint(input, receipt);
        await this.connection.request("thread/unarchive", { threadId: receipt.thread_id }, 10_000);
        try { await this.connection.request("thread/resume", params, 10_000); }
        catch (resumeError) {
          receipt.thread_cleanup = await this.archiveAttempt(receipt, cwd, 10_000);
          await this.checkpoint(input, receipt);
          throw resumeError;
        }
      }
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
      model_requested: this.options.model || null, effort_requested: this.options.effort || "high",
      model_observed: null, provider_observed: null,
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
        model: this.options.model || undefined,
        runtimeWorkspaceRoots: [cwd], personality: "pragmatic", threadSource: "user",
        developerInstructions: "Implement only the approved delivery payload in the current worktree. Never modify verifier inputs, budgets or Goal, or perform push, merge, deployment, service enablement, secret provisioning, remote changes, or hook bypasses.\n\n" + buildPrompt(input),
      }, Math.min(timeoutMs, 30_000));
      receipt.thread_id = String(response?.thread?.id || "");
      receipt.model_observed = typeof response?.model === "string" ? response.model : null;
      receipt.provider_observed = typeof response?.modelProvider === "string" ? response.modelProvider : null;
      if (!receipt.thread_id || response.thread.ephemeral === true) throw new ExecutionBackendError("app_server_thread_missing", "A persisted build thread is required");
      receipt.thread_cleanup = "pending";
      await this.checkpoint(input, receipt);
      if (goalRequired) {
        try {
          await this.connection.request("thread/goal/set", { threadId: receipt.thread_id, objective, status: "paused", tokenBudget }, Math.min(timeoutMs, 30_000));
          const goal = (await this.connection.request("thread/goal/get", { threadId: receipt.thread_id }, Math.min(timeoutMs, 30_000)))?.goal;
          if (!validGoal(goal, receipt) || goal.tokensUsed !== 0 || goal.status !== "paused") {
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
      if (goalRequired) {
        // Activation can start a native turn immediately. The payload and
        // durable charge intent must already exist before this RPC.
        await this.connection.request("thread/goal/set", { threadId: receipt.thread_id, status: "active" }, Math.min(timeoutMs, 30_000));
        const goal = (await this.connection.request("thread/goal/get", { threadId: receipt.thread_id }, Math.min(timeoutMs, 30_000)))?.goal;
        if (!validGoal(goal, receipt) || goal.status !== "active") throw new ExecutionBackendError("goal_state_mismatch", "Activated build Goal does not match its authorized projection");
      }
      const turnResponse = await this.connection.request("turn/start", {
        threadId: receipt.thread_id, input: [{ type: "text", text: buildPrompt(input), text_elements: [] }],
        cwd, approvalPolicy: "never", sandboxPolicy: { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false },
        runtimeWorkspaceRoots: [cwd], model: this.options.model || undefined, effort: this.options.effort || "high",
        // Do not impose an output schema on a turn already started by Goal.
        // The summary is advisory; only host Trials authorize verification.
        serviceTier: this.options.serviceTier || undefined, personality: "pragmatic", summary: "none",
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
      receipt.failure_code = bounded(error?.code || "app_server_turn_failed", 200);
      receipt.failure_message = bounded(error?.message || "Build attempt failed", 2_000);
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

/** The delivery contract authorizes implementation within its disposable
 * worktree. Host tools still enforce immutable verifier paths and closed egress;
 * an approval callback cannot widen that boundary. */
export class ClaudeCodeBuildExecutor {
  constructor(options={}){this.name='claude-code-build';this.options=options;this.active=new Set();}
  context(input={}){
    const root=input.root || this.options.root?path.resolve(input.root || this.options.root):resolvePrithaRoot(),stateRoot=resolvePrithaStateRoot({root,stateRoot:input.stateRoot || this.options.stateRoot});
    const privateRoot=resolvePrithaStatePathFrom({root,stateRoot},'private','agents-mother','claude-build');
    const executionDirectory=path.join(stateRoot===root?path.join(root,'.private'):stateRoot,'codex-chat','execution');
    return {root,stateRoot,privateRoot,executionDirectory};
  }
  isolated(input,context){
    const cwd=worktreeRoot(input.worktree || input.cwd),gitFile=path.join(cwd,'.git');
    if(cwd===realpathSync(context.root) || !existsSync(gitFile) || !lstatSync(gitFile).isFile() || lstatSync(gitFile).isSymbolicLink())throw new ExecutionBackendError('build_isolation_unavailable','Claude builds require a disposable Git worktree.');
    const env=providerProcessEnvironment({provider:'claude',root:context.root,stateRoot:context.stateRoot});
    try{const git=(...args)=>execFileSync('git',args,{cwd,env,encoding:'utf8',timeout:5000,maxBuffer:8000,stdio:['ignore','pipe','ignore']}).trim();
      const top=git('rev-parse','--show-toplevel'),directory=realpathSync(git('rev-parse','--absolute-git-dir')),common=realpathSync(path.resolve(cwd,git('rev-parse','--git-common-dir')));
      if(realpathSync(top)!==cwd || directory===common || realpathSync(readFileSync(path.join(directory,'gitdir'),'utf8').trim())!==realpathSync(gitFile))throw new Error();}
    catch{throw new ExecutionBackendError('build_isolation_unavailable','The delivery worktree identity could not be verified.');}return cwd;
  }
  service(context){return this.options.service || new ClaudeProviderService({...context,claudeBin:this.options.claudeBin});}
  preset(){return {modelId:this.options.model || 'sonnet',reasoningEffort:this.options.effort || 'high',authMode:'api-key',timeoutMs:900000,sandbox:'workspace-write'};}
  report(text){
    try{const value=JSON.parse(text);if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['summary','changed_files','remaining_risks'].includes(key))
      || typeof value.summary!=='string' || !value.summary.trim() || value.summary.length>4000 || !Array.isArray(value.changed_files) || value.changed_files.length>200
      || value.changed_files.some(file=>typeof file!=='string' || !file || file.length>500 || path.isAbsolute(file) || file.includes('\0') || file.split(/[\\/]/).includes('..'))
      || !Array.isArray(value.remaining_risks) || value.remaining_risks.length>50 || value.remaining_risks.some(risk=>typeof risk!=='string' || risk.length>1000))throw new Error();return value;
    }catch{return null;}
  }
  async probe(input={}){
    try{const context=this.context(input);this.isolated(input,context);const ready=await this.service(context).require(this.preset());
      return {backend:this.name,available:true,isolation:'sandboxed',runtimeVersion:ready.version,capabilities:{commandExec:true,threadStart:true,goal:false,tokenBudget:'host-reservation-estimate',protectedTrials:true},error:null};
    }catch(error){return {backend:this.name,available:false,isolation:'unavailable',runtimeVersion:null,capabilities:{commandExec:false,threadStart:false,goal:false},error:/^[a-z_]+$/.test(error.code || '')?error.code:'build_runtime_unavailable'};}
  }
  async execute(input){
    const context=this.context(input),cwd=this.isolated(input,context),tokenBudget=Number(input.tokenBudget);
    if(!Number.isSafeInteger(tokenBudget) || tokenBudget<1)throw new ExecutionBackendError('token_budget_exhausted','A positive build token budget is required.');
    if(typeof input.runId!=='string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(input.runId) || !Number.isSafeInteger(input.iteration) || input.iteration<1)throw new ExecutionBackendError('executor_input_invalid','A stable delivery run and iteration are required.');
    const key='claude-build:'+input.runId+':'+input.iteration,requestHash=createHash('sha256').update(JSON.stringify([cwd,input.plan,input.failures,input.protectedPaths,input.guidance,tokenBudget])).digest('hex');
    const coordinator=new ExecutionCoordinator({stateRoot:context.stateRoot,directory:context.executionDirectory});
    let lease,receipt,started=false,run,exitConfirmed=false,control;
    const checkpoint=async()=>{const safe=sanitized(receipt,{projectRoot:cwd,stateRoot:context.stateRoot,root:context.root});coordinator.updateIntent(key,{receipt:safe});try{await input.onCheckpoint?.(safe);}catch{throw new ExecutionBackendError('executor_checkpoint_failed','The build checkpoint could not be saved.',{executorResult:safe});}return safe;};
    try{
      const prepared=await coordinator.withMutation(key,async()=>{
        const prior=coordinator.getIntent(key);
        if(prior){if(prior.hash!==requestHash)throw new ExecutionBackendError('executor_recovery_mismatch','The saved attempt has different approved inputs.');if(prior.receipt?.process_exited===true)return {replay:prior.receipt};throw new ExecutionBackendError('executor_recovery_required','Recover the original build attempt before starting another.',{executorResult:prior.receipt});}
        const ready=await this.service(context).require(this.preset()),model=ready.model.id,attemptId=randomUUID();
        lease=coordinator.claim(['delivery-attempt:'+key,'workspace:'+cwd],key,{kind:'turn',capacity:coordinator.admission().capacity,detail:{runId:input.runId,connectorId:'claude'}});
        if(!lease)throw new ExecutionBackendError('workspace_busy','Another task owns this build workspace or execution capacity.');
        if(!coordinator.extend(lease.owner,lease.generation,['execution-ambient-effects'],{mode:'read'}))throw new ExecutionBackendError('execution_draining','The host is preparing a managed update.');
        receipt={schema:BUILD_EXECUTOR_RESULT_SCHEMA,executor:this.name,provider:'claude',run_id:input.runId,iteration:input.iteration,attempt_id:attemptId,budget_id:attemptId,
          worktree_identity:worktreeIdentity(cwd),runtime_version:ready.version,model_requested:this.options.model || 'sonnet',model_pinned:model,model_observed:null,effort_requested:this.preset().reasoningEffort,provider_observed:null,
          status:'prepared',turn_status:'not-started',thread_id:null,turn_id:attemptId,process_exited:false,thread_cleanup:'not-created',token_budget:tokenBudget,tokens_used:null,usage_scope:'build-executor',usage_status:'not-started',usage_source:'anthropic-host-response',goal_enforcement:'not-applicable',budget_enforcement:'host-reservation-estimate',duration_ms:0};
        coordinator.reserveIntent(key,requestHash,{kind:'build-executor',connectorId:'claude',runId:input.runId,iteration:input.iteration,owner:lease.owner,generation:lease.generation,receipt});return {};
      });
      if(prepared.replay)return prepared.replay;
      await checkpoint();const began=Date.now(),controller=new AbortController(),abort=()=>controller.abort();input.signal?.addEventListener('abort',abort,{once:true});if(input.signal?.aborted)abort();
      control={stop:()=>{controller.abort();run?.stop();}};this.active.add(control);
      try{
        const prompt=buildPrompt(input)+'\n\nReturn the final report as a JSON object, without code fences, matching this host-validated schema. changed_files must contain only relative workspace paths.\n'+JSON.stringify(CLAUDE_BUILD_REPORT_SCHEMA);
        let finalText='';
        run=await (this.options.launch || startClaudeCodeRun)({...context,cwd,claudeBin:this.options.claudeBin,model:receipt.model_pinned,effort:receipt.effort_requested,authMode:'api-key',sandbox:'workspace-write',prompt,
          timeoutMs:Number.isSafeInteger(input.timeoutMs)?Math.max(1000,Math.min(input.timeoutMs,3600000)):900000,maxTurns:Math.min(this.options.maxTurns || 32,128),tokenBudget,budgetId:receipt.budget_id,signal:controller.signal,
          hostExecutionContext:{coordinator,lease,chatId:'build_'+input.runId,turnId:receipt.attempt_id,protectedPaths:(input.protectedPaths || []).map(entry=>entry.path || entry)},
          approve:async request=>{lease.assertOwned();if(controller.signal.aborted)throw new ExecutionBackendError('operator_cancel','Build cancelled.');if(request.kind==='user_input')throw new ExecutionBackendError('build_operator_input_required','The build requires operator guidance.');return {decision:'accept'};},
          beforeStart:async proof=>{lease.assertOwned();started=true;receipt.status='dispatching';receipt.thread_id=proof.sessionId;receipt.profile_identity=proof.identity;receipt.thread_cleanup='pending';coordinator.updateIntent(key,{state:'dispatching',processProof:proof.evidence});await checkpoint();},
          onEvidence:proof=>coordinator.updateIntent(key,{processProof:proof}),
          beforeRequest:()=>{lease.assertOwned();if(controller.signal.aborted)throw new ExecutionBackendError('operator_cancel','Build cancelled.');},
          onBudgetCheckpoint:async value=>{receipt.tokens_used=value.usageKnown?value.tokensUsed:null;receipt.usage_status=value.requests.length?(value.usageKnown?'measured':'unknown'):'not-started';await checkpoint();},
          onEvent:event=>{if(event.type==='item.completed' && event.item?.type==='agent_message')finalText=event.item.text;},
        });
        const result=await run.completion;exitConfirmed=result.processTreeExited===true;
        const accounting=result.budget,measured=accounting?.usageKnown===true && Number.isSafeInteger(accounting.tokensUsed);
        const report=this.report(finalText),ok=result.ok && report!==null,errorCode=result.errorCode || (!report?'build_summary_invalid':null);
        receipt={...receipt,...(report || {summary:'The build returned no valid structured summary.',changed_files:[],remaining_risks:['Review the recorded tool results and independent Trials.']}),status:exitConfirmed?(ok?'completed':'failed'):'uncertain',turn_status:exitConfirmed?(ok?'completed':'interrupted'):'unknown',process_exited:exitConfirmed,
          model_observed:result.sessionId?result.model || receipt.model_pinned:null,provider_observed:result.sessionId?'anthropic':null,thread_id:result.sessionId || receipt.thread_id,
          thread_cleanup:exitConfirmed?'closed':'pending',tokens_used:measured?accounting.tokensUsed:null,usage_status:measured?'measured':'unknown',duration_ms:Date.now()-began,error_code:errorCode};
        coordinator.updateIntent(key,{state:exitConfirmed?receipt.status:'unknown'});const stored=await checkpoint();
        if(!exitConfirmed || !measured)throw new ExecutionBackendError('goal_usage_unavailable','The previous build execution or its usage remains unconfirmed.',{executorResult:stored});
        if(!ok)throw new ExecutionBackendError(errorCode==='provider_budget_exhausted'?'token_budget_exhausted':errorCode || 'build_executor_failed','The bounded Claude build stopped before completion.',{executorResult:stored});return stored;
      }finally{input.signal?.removeEventListener('abort',abort);}
    }catch(error){
      if(receipt && !started){exitConfirmed=true;receipt={...receipt,status:'not-started',turn_status:'not-started',process_exited:true,thread_cleanup:'not-created'};coordinator.updateIntent(key,{state:'not-started',receipt:sanitized(receipt,{projectRoot:cwd,stateRoot:context.stateRoot,root:context.root})});if(error.details?.executorResult)error.details.executorResult=receipt;}
      if(error.processTreeExited===true){exitConfirmed=true;if(receipt){receipt={...receipt,process_exited:true,thread_cleanup:'closed'};try{await checkpoint();}catch{/* Recovery can read the host receipt. */}if(error.details?.executorResult)error.details.executorResult=receipt;}}
      if(receipt && !error.details?.executorResult){exitConfirmed=error.processTreeExited===true || (!started && error.processTreeExited!==false);receipt={...receipt,status:exitConfirmed?'not-started':'uncertain',process_exited:exitConfirmed,thread_cleanup:exitConfirmed?'closed':'pending',error_code:/^[a-z_]+$/.test(error.code || '')?error.code:'build_executor_failed'};try{await checkpoint();}catch{/* The durable intent remains authoritative. */}}
      if(error instanceof ExecutionBackendError)throw error;throw new ExecutionBackendError('build_executor_failed','The bounded Claude build could not complete.',{executorResult:receipt});
    }finally{if(control)this.active.delete(control);if(lease && (exitConfirmed || !started))lease.release();coordinator.close();}
  }
  async recover(input,saved){
    const context=this.context(input),cwd=this.isolated(input,context),key='claude-build:'+input.runId+':'+saved.iteration,coordinator=new ExecutionCoordinator({stateRoot:context.stateRoot,directory:context.executionDirectory});
    try{
      const intent=coordinator.getIntent(key),receipt=intent?.receipt;
      if(saved.executor!==this.name || saved.run_id!==input.runId || !receipt || receipt.attempt_id!==saved.attempt_id || receipt.worktree_identity!==worktreeIdentity(cwd))throw new ExecutionBackendError('executor_recovery_mismatch','The build recovery identity does not match.');
      let exited=receipt.process_exited===true;try{exited ||= Boolean(intent.processProof && (this.options.proveExit || providerProcessTreesExited)(intent.processProof));}catch{/* Keep the original unknown state. */}
      if(!exited)return receipt;
      let accounting;
      try{const file=privateStateFile(context.stateRoot,path.join(context.privateRoot,'budgets',receipt.budget_id+'.json')),fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
        try{const stat=fstatSync(fd);if(!stat.isFile() || stat.nlink!==1 || stat.size>2*1024*1024)throw new Error();accounting=JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}
        if(accounting.identity!==receipt.profile_identity || accounting.model!==receipt.model_pinned || accounting.sessionId!==receipt.thread_id || accounting.budgetId!==receipt.budget_id)throw new Error();
      }catch{accounting=null;}
      const measured=accounting?.usageKnown===true && Number.isSafeInteger(accounting.tokensUsed) && accounting.tokensUsed>=0 && accounting.tokenBudget===receipt.token_budget
        && Array.isArray(accounting.requests) && accounting.requests.length<=384 && accounting.requests.every(row=>row.status==='measured' && Number.isSafeInteger(row.usage?.totalTokens) && row.usage.totalTokens>=0)
        && accounting.requests.reduce((sum,row)=>sum+row.usage.totalTokens,0)===accounting.tokensUsed;
      const notStarted=receipt.process_exited===true && receipt.usage_status==='not-started';
      const result={...receipt,process_exited:true,thread_cleanup:'closed',status:receipt.status==='completed'?'completed':'interrupted',turn_status:receipt.status==='completed'?'completed':'interrupted',
        tokens_used:measured?accounting.tokensUsed:null,usage_status:measured?'measured':notStarted?'not-started':'unknown',
        model_observed:receipt.model_observed || (accounting?.requests?.some(row=>row.status==='measured')?receipt.model_pinned:null)};
      coordinator.updateIntent(key,{state:result.status,receipt:result});coordinator.reconcileRelease(intent.owner,intent.generation);await input.onCheckpoint?.(result);return result;
    }finally{coordinator.close();}
  }
  close(){for(const active of this.active)active.stop();}
}

export function createBuildExecutor(name = "codex-app-server", options = {}) {
  if (name === "codex-app-server" || name === "app-server") return new CodexAppServerBuildExecutor(options);
  if (name === 'claude-code') return new ClaudeCodeBuildExecutor(options);
  if (name === "manual") return new ManualBuildExecutor();
  throw new Error(`Unknown build executor: ${name}`);
}
