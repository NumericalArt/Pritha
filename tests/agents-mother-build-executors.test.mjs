import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { CodexAppServerBuildExecutor, FunctionBuildExecutor, ManualBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { ExecutionBackendError } from "../scripts/agents-mother/execution-backends.mjs";

const directories = [];
after(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); });
function input(overrides = {}) {
  const worktree = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-build-executor-")));
  directories.push(worktree);
  return {
    runId: "run-1", iteration: 1, remainingIterations: 5, worktree,
    plan: { spec_id: "fixture-outcome", agent_slug: "fixture", semantic_lock: "sha256:semantic", trials: [], demo: [] },
    failures: [], protectedPaths: [{ path: "scripts/eval.mjs" }], timeoutMs: 30_000,
    tokenBudget: 1000, goalObjective: "Run run-1 for fixture-outcome and satisfy sha256:semantic.", ...overrides,
  };
}

class FakeConnection {
  constructor(options = {}, threads = new Map()) { this.calls = []; this.options = options; this.threads = threads; }
  async start() {}
  notify(method) { this.initialized = method === "initialized"; }
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === "initialize") return { userAgent: "codex-fixture/2" };
    if (method === "thread/start") {
      const thread = { id: `thread-${this.threads.size + 1}`, cwd: params.cwd, ephemeral: params.ephemeral, turns: [], goal: null };
      this.threads.set(thread.id, thread);
      return { thread };
    }
    if (method === "thread/list") return { data: [...this.threads.values()].filter(thread => thread.archived && thread.cwd === params.cwd) };
    const thread = this.threads.get(params.threadId);
    assert.ok(thread, "Request must target an existing fixture thread");
    if (method.startsWith("thread/goal/")) {
      if (thread.ephemeral || this.options.goalUnavailable) throw new ExecutionBackendError("app_server_rpc_error", "Unsupported thread/goal/get for this thread", { rpcCode: -32601 });
      if (method === "thread/goal/set") {
        thread.goal = { ...thread.goal, threadId: thread.id, tokensUsed: thread.goal?.tokensUsed || 0, ...params };
        return { goal: { ...thread.goal } };
      }
      if (method === "thread/goal/get") {
        if (thread.turns.length && this.options.usageUnavailable) return { goal: null };
        const goal = thread.goal ? { ...thread.goal } : null;
        if (goal && this.options.preflightMismatch) goal.tokenBudget += 1;
        return { goal };
      }
      if (method === "thread/goal/clear") { thread.goal = null; return {}; }
    }
    if (method === "turn/start") {
      const turn = { id: `turn-${thread.turns.length + 1}`, status: this.options.terminalStatus || "completed", items: [{ type: "agentMessage", text: '{"summary":"implemented","changed_files":["agent.mjs"],"remaining_risks":[]}' }] };
      thread.turns.push(turn);
      this.current = thread;
      if (thread.goal) { thread.goal.tokensUsed = this.options.tokensUsed ?? 123; thread.goal.status = "complete"; }
      if (this.options.lostDispatchResponse) throw new ExecutionBackendError("app_server_request_timeout", "lost dispatch response");
      return { turn };
    }
    if (method === "turn/interrupt") { thread.turns[0].status = "interrupted"; this.interrupted = true; return {}; }
    if (method === "thread/read" || method === "thread/resume") { this.current = thread; return { thread: { ...thread, cwd: this.options.wrongCwd || thread.cwd } }; }
    if (method === "thread/archive") {
      if (this.options.archiveFailure) throw new Error("archive unavailable");
      if (thread.archived && this.options.rejectRepeatedArchive) throw new Error("no rollout found for thread id fixture");
      thread.archived = true; return {};
    }
    throw new Error(`unexpected method ${method}`);
  }
  async waitForNotification(predicate) {
    if (this.options.timeout && !this.interrupted) throw new ExecutionBackendError("app_server_notification_timeout", "fixture deadline");
    const message = { method: "turn/completed", params: { threadId: this.current.id, turn: this.current.turns[0] } };
    assert.equal(predicate({ method: "error", params: { threadId: this.current.id, turnId: this.current.turns[0].id, willRetry: true } }), false);
    assert.equal(predicate(message), true);
    return message;
  }
  tokenUsageForTurn() { return this.options.tokenUpdate ?? null; }
  stop() {}
}

function executor(options = {}) {
  const connection = new FakeConnection(options);
  return { connection, build: new CodexAppServerBuildExecutor({ connection }) };
}

test("App Server build executor constrains a persisted attempt and saves intent before dispatch", async () => {
  const { connection, build } = executor();
  const receipts = [];
  const request = input({ onCheckpoint: async (receipt) => { receipts.push(structuredClone(receipt)); if (receipt.status === "dispatching") assert.equal(connection.calls.some(call => call.method === "turn/start"), false); } });
  const result = await build.execute(request);
  const thread = connection.calls.find(call => call.method === "thread/start");
  const turn = connection.calls.find(call => call.method === "turn/start");
  assert.equal(thread.params.ephemeral, false);
  assert.equal(thread.params.approvalPolicy, "never");
  assert.equal(connection.initialized, true);
  assert.deepEqual(turn.params.sandboxPolicy, { type: "workspaceWrite", writableRoots: [request.worktree], networkAccess: false });
  assert.match(turn.params.input[0].text, /scripts\/eval.mjs/);
  assert.match(turn.params.input[0].text, /Do not push, merge, deploy/);
  assert.equal(connection.calls.filter(call => call.method === "thread/goal/get").length, 2);
  assert.ok(receipts.some(receipt => receipt.status === "running" && receipt.turn_id === "turn-1"));
  assert.equal(result.summary, "implemented");
  assert.equal(result.tokens_used, 123);
  assert.equal(result.usage_source, "goal");
  assert.equal(result.thread_cleanup, "archived");
  assert.equal(result.run_id, request.runId);
});

test("App Server build probe verifies persisted Goal capability and archives its empty thread", async () => {
  const { connection, build } = executor();
  const probe = await build.probe({ cwd: input().worktree });
  assert.equal(probe.available, true);
  assert.equal(probe.capabilities.goal, true);
  assert.deepEqual(connection.calls.map(call => call.method), ["initialize", "thread/start", "thread/goal/set", "thread/goal/get", "thread/goal/clear", "thread/archive"]);
  assert.equal(connection.calls.find(call => call.method === "thread/goal/set").params.status, "paused");
  assert.equal(connection.threads.get("thread-1").turns.length, 0);
});

test("Goal absence and invalid readback fail before turn/start", async () => {
  for (const [options, code] of [[{ goalUnavailable: true }, "goal_api_unavailable"], [{ preflightMismatch: true }, "goal_state_mismatch"]]) {
    const { connection, build } = executor(options);
    await assert.rejects(build.execute(input()), error => {
      assert.equal(error.code, code);
      assert.equal(error.details.executorResult.usage_status, "not-started");
      return true;
    });
    assert.equal(connection.calls.some(call => call.method === "turn/start"), false);
  }
});

test("missing final Goal and usage preserves the completed attempt as unknown", async () => {
  const { build } = executor({ usageUnavailable: true });
  await assert.rejects(build.execute(input()), error => {
    assert.equal(error.code, "goal_usage_unavailable");
    const receipt = error.details.executorResult;
    assert.equal(receipt.thread_id, "thread-1");
    assert.equal(receipt.turn_id, "turn-1");
    assert.equal(receipt.turn_status, "completed");
    assert.equal(receipt.tokens_used, null);
    assert.equal(receipt.thread_cleanup, "archived");
    return true;
  });
});

for (const status of ["failed", "interrupted"]) {
  test(`a ${status} turn retains measured usage in its error receipt`, async () => {
    const { build } = executor({ terminalStatus: status });
    await assert.rejects(build.execute(input()), error => {
      assert.equal(error.code, "app_server_turn_failed");
      assert.equal(error.details.executorResult.tokens_used, 123);
      assert.equal(error.details.executorResult.turn_status, status);
      return true;
    });
  });
}

test("waived attempts use token updates and never invent a zero when usage is missing", async () => {
  const known = executor({ tokenUpdate: 222 });
  const result = await known.build.execute(input({ goalRequired: false }));
  assert.equal(result.tokens_used, 222);
  assert.equal(result.usage_source, "thread-token-usage");
  assert.equal(known.connection.calls.some(call => call.method.startsWith("thread/goal/")), false);
  await assert.rejects(executor().build.execute(input({ goalRequired: false })), error => error.details.executorResult.tokens_used === null);
});

test("Goal usage and token updates are alternative sources, not additive charges", async () => {
  assert.equal((await executor({ tokenUpdate: 456 }).build.execute(input())).tokens_used, 123);
  const fallback = await executor({ usageUnavailable: true, tokenUpdate: 456 }).build.execute(input());
  assert.equal(fallback.tokens_used, 456);
  assert.equal(fallback.usage_source, "thread-token-usage");
});

test("timeout interrupts the bound turn and preserves its final usage", async () => {
  const { connection, build } = executor({ timeout: true });
  await assert.rejects(build.execute(input()), error => {
    assert.equal(error.details.executorResult.turn_status, "interrupted");
    assert.equal(error.details.executorResult.tokens_used, 123);
    return true;
  });
  assert.deepEqual(connection.calls.find(call => call.method === "turn/interrupt").params, { threadId: "thread-1", turnId: "turn-1" });
});

test("lost turn/start response recovers on another connection without a second dispatch", async () => {
  const { connection, build } = executor({ lostDispatchResponse: true });
  const request = input();
  let saved;
  await assert.rejects(build.execute(request), error => { saved = error.details.executorResult; return error.code === "goal_usage_unavailable"; });
  assert.equal(saved.turn_id, null);
  const resumed = new FakeConnection({}, connection.threads);
  const recovery = new CodexAppServerBuildExecutor({ connection: resumed });
  const result = await recovery.recover(request, saved);
  assert.equal(result.turn_id, "turn-1");
  assert.equal(result.tokens_used, 123);
  assert.equal(result.usage_status, "measured");
  assert.equal(resumed.calls.some(call => call.method === "turn/start" || call.method === "thread/start"), false);
  assert.equal(connection.calls.filter(call => call.method === "turn/start").length, 1);
});

test("recovery refuses another run or worktree before mutating a native thread", async () => {
  const { connection, build } = executor();
  const request = input();
  const saved = await build.execute(request);
  const count = connection.calls.length;
  await assert.rejects(build.recover({ ...request, runId: "other" }, saved), error => error.code === "executor_recovery_unavailable");
  assert.equal(connection.calls.length, count);
  connection.options.wrongCwd = path.dirname(request.worktree);
  await assert.rejects(build.recover(request, saved), error => error.code === "executor_recovery_mismatch");
  assert.equal(connection.calls.slice(count).some(call => call.method === "thread/archive"), false);
});

test("archive failure preserves measured usage and an explicit cleanup blocker", async () => {
  await assert.rejects(executor({ archiveFailure: true }).build.execute(input()), error => {
    assert.equal(error.code, "executor_cleanup_pending");
    assert.equal(error.details.executorResult.tokens_used, 123);
    assert.equal(error.details.executorResult.thread_cleanup, "pending");
    return true;
  });
});

test("a failed dispatch checkpoint prevents the model RPC and archives the unstarted attempt", async () => {
  const { connection, build } = executor();
  await assert.rejects(build.execute(input({ onCheckpoint: async receipt => {
    if (receipt.status === "dispatching") throw new Error("fixture disk failure");
  } })), error => {
    assert.equal(error.code, "executor_checkpoint_failed");
    assert.equal(error.details.executorResult.usage_status, "not-started");
    assert.equal(error.details.executorResult.thread_cleanup, "archived");
    return true;
  });
  assert.equal(connection.calls.some(call => call.method === "turn/start"), false);
});

test("cleanup still happens if the final evidence checkpoint fails", async () => {
  const { connection, build } = executor();
  await assert.rejects(build.execute(input({ onCheckpoint: async receipt => {
    if (receipt.usage_status === "measured") throw new Error("fixture disk failure");
  } })), error => {
    assert.equal(error.code, "executor_checkpoint_failed");
    assert.equal(error.details.executorResult.tokens_used, 123);
    assert.equal(error.details.executorResult.thread_cleanup, "archived");
    return true;
  });
  assert.equal(connection.threads.get("thread-1").archived, true);
});

test("recovery reconnects and interrupts the existing running turn without another dispatch", async () => {
  const { connection, build } = executor({ lostDispatchResponse: true, terminalStatus: "inProgress" });
  const request = input();
  let saved;
  await assert.rejects(build.execute(request), error => { saved = error.details.executorResult; return true; });
  const resumed = new FakeConnection({}, connection.threads);
  const result = await new CodexAppServerBuildExecutor({ connection: resumed }).recover(request, saved);
  assert.equal(result.turn_status, "interrupted");
  assert.equal(result.tokens_used, 123);
  assert.equal(resumed.calls.filter(call => call.method === "thread/resume").length, 1);
  assert.equal(resumed.calls.filter(call => call.method === "turn/interrupt").length, 1);
  assert.equal(resumed.calls.some(call => call.method === "turn/start"), false);
});

test("recovery confirms an already archived attempt without unarchiving or dispatching", async () => {
  const { connection, build } = executor({ lostDispatchResponse: true });
  const request = input();
  let saved;
  await assert.rejects(build.execute(request), error => { saved = error.details.executorResult; return true; });
  const resumed = new FakeConnection({ rejectRepeatedArchive: true }, connection.threads);
  const result = await new CodexAppServerBuildExecutor({ connection: resumed }).recover(request, saved);
  assert.equal(result.usage_status, "measured");
  assert.equal(result.thread_cleanup, "archived");
  assert.equal(resumed.calls.some(call => ["thread/unarchive", "turn/start"].includes(call.method)), false);
  assert.equal(resumed.calls.find(call => call.method === "thread/list").params.cwd, request.worktree);
});

test("nonpositive budgets fail before creating a native thread, including waived attempts", async () => {
  const { connection, build } = executor();
  for (const goalRequired of [true, false]) await assert.rejects(build.execute(input({ goalRequired, tokenBudget: 0 })), error => error.code === "token_budget_exhausted");
  assert.equal(connection.calls.length, 0);
});

test("function executor declares a fixture without pretending to measure tokens", async () => {
  const result = await new FunctionBuildExecutor(async () => ({ summary: "done", changed_files: ["one.mjs"] })).execute({});
  assert.equal(result.status, "completed");
  assert.equal(result.tokens_used, null);
  assert.equal(result.usage_status, "not-applicable");
});

test("manual build policy returns a typed implementation boundary", async () => {
  await assert.rejects(new ManualBuildExecutor().execute({}), error => error.code === "manual_build_required");
});
