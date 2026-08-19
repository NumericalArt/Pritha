import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { CodexAppServerConnection, ExecutionBackendError } from "./execution-backends.mjs";

export const BUILD_EXECUTOR_RESULT_SCHEMA = "pritha-build-executor-result-v1";

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
  if (!source) return { summary: "Codex completed without a textual summary.", changed_files: [], remaining_risks: [] };
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

  close() {}
}

export class CodexAppServerBuildExecutor {
  constructor(options = {}) {
    this.name = "codex-app-server-build";
    this.options = options;
    this.connection = options.connection || null;
    this.initializeResponse = null;
  }

  async ensureReady(cwd, timeoutMs) {
    if (this.initializeResponse) return this.initializeResponse;
    if (!this.connection) {
      const factory = this.options.connectionFactory || ((value) => new CodexAppServerConnection(value));
      this.connection = factory({ codexBin: this.options.codexBin, cwd });
    }
    await this.connection.start(Math.min(timeoutMs, 10_000));
    this.initializeResponse = await this.connection.request("initialize", {
      clientInfo: { name: "pritha-build-executor", title: "Pritha Build Executor", version: "1.0" },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: ["thread/tokenUsage/updated", "item/reasoning/textDelta", "item/reasoning/summaryTextDelta"],
      },
    }, Math.min(timeoutMs, 10_000));
    return this.initializeResponse;
  }

  async execute(input) {
    const cwd = worktreeRoot(input.worktree);
    const timeoutMs = Number.isSafeInteger(input.timeoutMs) ? Math.min(Math.max(input.timeoutMs, 10_000), 3_600_000) : 900_000;
    const initialized = await this.ensureReady(cwd, timeoutMs);
    const started = Date.now();
    const threadResponse = await this.connection.request("thread/start", {
      cwd,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      runtimeWorkspaceRoots: [cwd],
      personality: "pragmatic",
      threadSource: "user",
      developerInstructions: "Implement only the approved delivery payload in the current worktree. Never modify verifier inputs or perform push, merge, deployment, service enablement, secret provisioning, remote changes, or hook bypasses.",
    }, Math.min(timeoutMs, 30_000));
    const threadId = String(threadResponse?.thread?.id || "");
    if (!threadId) throw new ExecutionBackendError("app_server_thread_missing", "Codex App Server did not return a build thread id");

    const turnResponse = await this.connection.request("turn/start", {
      threadId,
      input: [{ type: "text", text: buildPrompt(input), text_elements: [] }],
      cwd,
      approvalPolicy: "never",
      sandboxPolicy: { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false },
      runtimeWorkspaceRoots: [cwd],
      model: this.options.model || undefined,
      effort: this.options.effort || "high",
      serviceTier: this.options.serviceTier || undefined,
      personality: "pragmatic",
      summary: "none",
      outputSchema: outputSchema(),
    }, Math.min(timeoutMs, 30_000));
    const turnId = String(turnResponse?.turn?.id || "");
    if (!turnId) throw new ExecutionBackendError("app_server_turn_missing", "Codex App Server did not return a build turn id");

    const notification = await this.connection.waitForNotification((message) => {
      const notificationThread = String(message?.params?.threadId || "");
      const notificationTurn = String(message?.params?.turn?.id || message?.params?.turnId || "");
      if (message.method === "error" && message?.params?.willRetry === true) return false;
      return notificationThread === threadId && notificationTurn === turnId && ["turn/completed", "error"].includes(message.method);
    }, timeoutMs);
    if (notification.method === "error") {
      const message = notification.params?.error?.message || "Codex build turn failed";
      throw new ExecutionBackendError("app_server_turn_failed", bounded(message, 2_000));
    }
    const turn = notification.params?.turn || {};
    if (turn.status !== "completed") {
      throw new ExecutionBackendError("app_server_turn_failed", bounded(turn.error?.message || `Codex build turn ended with status ${turn.status || "unknown"}`, 2_000));
    }
    const summary = parseSummary(this.connection.agentTextForTurn?.(turnId) || extractAgentText(turn));
    const context = { projectRoot: cwd, stateRoot: input.stateRoot, root: input.root };
    return sanitized({
      schema: BUILD_EXECUTOR_RESULT_SCHEMA,
      executor: this.name,
      status: "completed",
      ...summary,
      duration_ms: Date.now() - started,
      runtime_version: String(initialized?.userAgent || "codex-app-server/unknown"),
      thread_id: threadId,
      turn_id: turnId,
    }, context);
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
