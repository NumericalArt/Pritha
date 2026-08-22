import assert from "node:assert/strict";
import { mkdtempSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CodexAppServerBuildExecutor, FunctionBuildExecutor, ManualBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { ExecutionBackendError } from "../scripts/agents-mother/execution-backends.mjs";

function plan() {
  return {
    spec_id: "fixture-outcome",
    agent_slug: "fixture",
    contract_fingerprint: "sha256:contract",
    semantic_lock: "sha256:semantic",
    interaction_mode: "interface",
    trials: [{ id: "main", statement: "Produce ready output", kind: "automated", covers: ["core:main"], thenExitCode: 0, thenStdoutContains: ["READY"] }],
    demo: ["run main"],
  };
}

class FakeConnection {
  constructor(options = {}) {
    this.calls = [];
    this.options = options;
  }

  async start() {}

  async request(method, params) {
    this.calls.push({ method, params });
    if (method === "initialize") return { userAgent: "codex-fixture/2", platformOs: "macos", platformFamily: "unix" };
    if (method === "thread/start") return { thread: { id: "thread-1" } };
    if (method === "thread/goal/set") {
      if (this.options.goalUnavailable) throw new ExecutionBackendError("app_server_rpc_error", "Method not found: thread/goal/set", { rpcCode: -32601 });
      return { goal: { threadId: "thread-1", objective: params.objective, status: "active", tokenBudget: params.tokenBudget, tokensUsed: 0 } };
    }
    if (method === "thread/goal/get") {
      if (this.options.goalUnavailable) throw new ExecutionBackendError("app_server_rpc_error", "Method not found: thread/goal/get", { rpcCode: -32601 });
      if (this.options.usageUnavailable) return { goal: null };
      return { goal: { threadId: "thread-1", objective: "fixture goal", status: "complete", tokenBudget: 1000, tokensUsed: 123 } };
    }
    if (method === "turn/start") return { turn: { id: "turn-1" } };
    throw new Error(`unexpected method ${method}`);
  }

  async waitForNotification(predicate) {
    const message = {
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed",
          items: [{ type: "agentMessage", text: '{"summary":"implemented","changed_files":["agent.mjs"],"remaining_risks":[]}' }],
        },
      },
    };
    assert.equal(predicate(message), true);
    return message;
  }

  stop() {}
}

test("App Server build executor constrains the turn to the worktree and immutable outcome", async () => {
  const worktree = mkdtempSync(path.join(os.tmpdir(), "pritha-build-executor-"));
  const connection = new FakeConnection();
  const executor = new CodexAppServerBuildExecutor({ connection });
  const result = await executor.execute({
    runId: "run-1",
    iteration: 1,
    remainingIterations: 5,
    worktree,
    plan: plan(),
    failures: [{ id: "main", error: "not ready" }],
    protectedPaths: [{ path: "scripts/eval.mjs" }],
    timeoutMs: 30_000,
    tokenBudget: 1000,
    goalObjective: "Run run-1 for fixture-outcome and satisfy sha256:semantic.",
  });

  const thread = connection.calls.find((entry) => entry.method === "thread/start");
  const turn = connection.calls.find((entry) => entry.method === "turn/start");
  const goalSet = connection.calls.find((entry) => entry.method === "thread/goal/set");
  assert.equal(thread.params.ephemeral, true);
  assert.equal(thread.params.approvalPolicy, "never");
  assert.equal(goalSet.params.tokenBudget, 1000);
  assert.equal(connection.calls.findIndex((entry) => entry.method === "thread/goal/set") < connection.calls.findIndex((entry) => entry.method === "turn/start"), true);
  assert.deepEqual(turn.params.sandboxPolicy, { type: "workspaceWrite", writableRoots: [realpathSync(worktree)], networkAccess: false });
  assert.equal(turn.params.input[0].text.includes("scripts/eval.mjs"), true);
  assert.equal(turn.params.input[0].text.includes("Do not push, merge, deploy"), true);
  assert.equal(result.summary, "implemented");
  assert.deepEqual(result.changed_files, ["agent.mjs"]);
  assert.equal(result.tokens_used, 123);
  assert.equal(result.goal_status, "complete");
});

test("App Server build probe records runtime and thread/start capability before a turn", async () => {
  const worktree = mkdtempSync(path.join(os.tmpdir(), "pritha-build-probe-"));
  const connection = new FakeConnection();
  const executor = new CodexAppServerBuildExecutor({ connection });
  const probe = await executor.probe({ cwd: worktree, timeoutMs: 30_000 });
  assert.equal(probe.available, true);
  assert.equal(probe.runtimeVersion, "codex-fixture/2");
  assert.equal(probe.capabilities.threadStart, true);
  assert.equal(probe.capabilities.goal, true);
  assert.deepEqual(connection.calls.map((entry) => entry.method), ["initialize", "thread/start", "thread/goal/get"]);
});

test("Goal method absence fails before turn/start with an upgrade-or-waiver blocker code", async () => {
  const worktree = mkdtempSync(path.join(os.tmpdir(), "pritha-build-goal-missing-"));
  const connection = new FakeConnection({ goalUnavailable: true });
  const executor = new CodexAppServerBuildExecutor({ connection });
  await assert.rejects(
    executor.execute({
      runId: "run-goal-missing", iteration: 1, remainingIterations: 1, worktree,
      plan: plan(), failures: [], protectedPaths: [], tokenBudget: 1000,
      goalObjective: "Run run-goal-missing for fixture-outcome and satisfy sha256:semantic.",
    }),
    (error) => error.code === "goal_api_unavailable",
  );
  assert.equal(connection.calls.some((entry) => entry.method === "turn/start"), false);
});

test("missing goal/get usage preserves the completed executor result and blocks another iteration", async () => {
  const worktree = mkdtempSync(path.join(os.tmpdir(), "pritha-build-goal-usage-"));
  const connection = new FakeConnection({ usageUnavailable: true });
  const executor = new CodexAppServerBuildExecutor({ connection });
  await assert.rejects(
    executor.execute({
      runId: "run-goal-usage", iteration: 1, remainingIterations: 1, worktree,
      plan: plan(), failures: [], protectedPaths: [], tokenBudget: 1000,
      goalObjective: "Run run-goal-usage for fixture-outcome and satisfy sha256:semantic.",
    }),
    (error) => {
      assert.equal(error.code, "goal_usage_unavailable");
      assert.equal(error.details.executorResult.thread_id, "thread-1");
      assert.equal(error.details.executorResult.turn_id, "turn-1");
      assert.equal(error.details.executorResult.tokens_used, null);
      return true;
    },
  );
});

test("function executor provides the same bounded result contract", async () => {
  const executor = new FunctionBuildExecutor(async () => ({ summary: "done", changed_files: ["one.mjs"] }));
  const result = await executor.execute({});
  assert.equal(result.status, "completed");
  assert.equal(result.summary, "done");
  assert.deepEqual(result.changed_files, ["one.mjs"]);
});

test("manual build policy returns a typed implementation boundary", async () => {
  const executor = new ManualBuildExecutor();
  await assert.rejects(executor.execute({}), (error) => error.code === "manual_build_required");
});
