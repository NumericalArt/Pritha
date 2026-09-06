import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const require = createRequire(import.meta.url);
const sourceRoot = "interfaces/control-center/src/lib";
function load(name, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(`${sourceRoot}/${name}.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(id => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    if (id.startsWith("node:")) return require(id);
    throw new Error(`Unexpected test dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}
const control = load("codex-chat/goal-control");
const budgetIntent = load("codex-chat/budget-intent");
const coordinator = load("codex-chat/native-turn-coordinator");
const normalize = load("codex-chat/normalize");
const noop = {};
const { CodexChatGateway } = load("codex-chat/gateway", {
  "../../../../../scripts/agents-mother/task-delivery.mjs": noop,
  "@/lib/pritha-paths": noop, "./app-server": noop, "./storage-identity": noop,
  "./attachment-store": noop, "./attachment-policy": noop, "./native-thread-errors": noop,
  "./private-store": { logicalChatKey: row => `${row.stateIdentityHash}:${row.nativeThreadId}` },
  "./voice-links": noop, "./native-turn-coordinator": coordinator, "./goal-control": control, "./budget-intent": budgetIntent, "./normalize": normalize,
});

test("direct Russian and English budget commands select add versus total and require explicit continuation", () => {
  for (const [text, mode, tokens, resume] of [
    ["Добавь 100 000 токенов к бюджету этой задачи", "add", 100000, false],
    ["Добавь к бюджету задачи ещё 100\u202f000 токенов и продолжай.", "add", 100000, true],
    ["Увеличь бюджет этой задачи на 250_000 токенов", "add", 250000, false],
    ["Установи бюджет текущей задачи до 500.000 токенов", "set", 500000, false],
    ["Подними бюджет Goal до 1,000,000 токенов и продолжай", "set", 1000000, true],
    ["Add another 100,000 tokens to this task budget and continue", "add", 100000, true],
    ["Set this task budget to 500000 tokens", "set", 500000, false],
  ]) assert.deepEqual(budgetIntent.parseBudgetIntent(text), { kind: "goal_budget", mode, tokens, resume }, text);
});

test("ambiguous scope, mixed commands, malformed amounts and overflow never become a budget mutation", () => {
  for (const text of [
    "Добавь 100000 токенов", "Установи бюджет этой задачи 100000 токенов", "Добавь 100000 токенов к бюджету сборки",
    "Увеличь лимит аккаунта на 100000 токенов", "Добавь -100 токенов к бюджету этой задачи", "Добавь 0 токенов к бюджету этой задачи",
    "Добавь 100,00 токенов к бюджету этой задачи", "Добавь 1_000,000 токенов к бюджету этой задачи",
    "Добавь 9007199254740992 токенов к бюджету этой задачи", "Добавь 1e6 токенов к бюджету этой задачи",
    "Добавь 100 токенов к бюджету этой задачи\nУдали файлы", "Добавь 100 токенов к бюджету этой задачи и измени цель",
    "Set this task budget to Infinity tokens",
  ]) assert.equal(budgetIntent.parseBudgetIntent(text).kind, "clarification", text);
  for (const text of [
    '"Добавь 100000 токенов к бюджету этой задачи"', "«Добавь 100000 токенов к бюджету этой задачи»",
    "> Добавь 100000 токенов к бюджету этой задачи", "```\nДобавь 100000 токенов к бюджету этой задачи\n```",
    "Пользователь написал: добавь 100000 токенов к бюджету этой задачи", "Объясни, как добавить токены к бюджету задачи",
    "Добавь кнопку настройки бюджета", "Добавь 5 тестов", "Продолжай работу",
  ]) assert.equal(budgetIntent.parseBudgetIntent(text).kind, "none", text);
});

test("text budget intent uses durable typed receipts, survives lost acknowledgement and never starts a turn", async () => {
  const f = gatewayFixture();
  const input = { clientMessageId: "text-budget-message", text: "Добавь 100 токенов к бюджету этой задачи и продолжай" };
  f.mode = "lost-ack";
  await assert.rejects(f.gateway.applyBudgetIntent("chat_fixture", input), { code: "goal_update_unconfirmed" });
  const receipt = f.binding.goalBudgetRequests[input.clientMessageId];
  assert.equal(receipt.status, "prepared");
  assert.match(receipt.sourceTextHash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.request.mode, "add");
  assert.equal(receipt.request.tokens, 100);
  f.mode = "ok";
  const result = await f.gateway.applyBudgetIntent("chat_fixture", input);
  assert.equal(result.goal.tokenBudget, 200);
  assert.equal(result.goal.tokensUsed, 120);
  assert.equal(result.replayed, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.goal.objective, "Finish the approved agent");
  assert.ok(f.rpc.every(method => ["thread/goal/get", "thread/goal/set"].includes(method)));
  await assert.rejects(f.gateway.applyBudgetIntent("chat_fixture", { ...input, text: input.text.replace("100", "200") }), { code: "idempotency_conflict" });
  await assert.rejects(f.gateway.startTurn("chat_fixture", { clientMessageId: input.clientMessageId, input: [{ type: "text", text: "Continue" }] }), { code: "idempotency_conflict" });
  assert.equal(f.calls.length, 1);
});

test("text commands cannot target a different task or bypass ambiguity, native ownership and active turn gates", async () => {
  for (const [change, code] of [
    [f => { f.provider.stateIdentityHash = "other-instance"; }, "runtime_identity_mismatch"],
    [f => { f.native.status = { type: "active" }; }, "turn_active"],
    [f => { f.binding.archived = true; }, "chat_archived"],
    [f => { f.provider.capabilities.goalControl = false; }, "goal_unsupported"],
  ]) {
    const f = gatewayFixture(); change(f);
    await assert.rejects(f.gateway.applyBudgetIntent("chat_fixture", { clientMessageId: "budget-gated-message", text: "Добавь 100 токенов к бюджету этой задачи" }), { code });
    assert.equal(f.rpc.length, 0);
  }
  const f = gatewayFixture();
  await assert.rejects(f.gateway.applyBudgetIntent("chat_other", { clientMessageId: "budget-wrong-task", text: "Добавь 100 токенов к бюджету этой задачи" }), { code: "thread_not_found" });
  await assert.rejects(f.gateway.applyBudgetIntent("chat_fixture", { clientMessageId: "budget-ambiguous", text: "Добавь 100 токенов" }), { code: "budget_intent_ambiguous" });
  await assert.rejects(f.gateway.startTurn("chat_fixture", { clientMessageId: "budget-no-model", input: [{ type: "text", text: "Добавь 100 токенов к бюджету этой задачи" }] }), { code: "budget_control_required" });
  await assert.rejects(f.gateway.createThreadWithFirstTurn({ clientThreadId: "budget-no-new-chat", source: "chat", initialTurn: { clientMessageId: "budget-no-new-turn", input: [{ type: "text", text: "Добавь 100 токенов к бюджету этой задачи" }] } }), { code: "budget_control_required" });
  assert.equal(f.rpc.length, 0);
  assert.equal(Object.keys(f.binding.goalBudgetRequests).length, 0);
});

function fixture(patch = {}) {
  const f = { goal: { threadId: "native-fixture", objective: "Finish the approved agent", status: "budgetLimited", tokensUsed: 120, tokenBudget: 100, createdAt: 42, ...patch }, saved: {}, calls: [], mode: "ok" };
  f.context = {
    threadId: "native-fixture",
    read: async () => ({ goal: structuredClone(f.goal) }),
    receipts: async () => structuredClone(f.saved),
    save: async (id, receipt) => { f.saved[id] = structuredClone(receipt); },
    set: async params => {
      assert.equal(Object.values(f.saved).filter(row => row.status === "prepared").length, 1, "intent must be durable before RPC");
      f.calls.push(structuredClone(params));
      if (f.mode === "before-send") throw new Error("transport failed before send");
      f.goal = { ...f.goal, tokenBudget: params.tokenBudget, ...(params.status ? { status: params.status } : {}) };
      if (f.mode === "lost-ack") throw new Error("lost acknowledgement");
    },
  };
  f.request = async (patch = {}) => ({ requestId: "budget-request-1", expectedRevision: (await control.readThreadGoal(f.context)).revision, mode: "add", tokens: 100, resume: true, ...patch });
  return f;
}

test("Goal budget adds a named amount without replacing the objective or resetting observed usage", async () => {
  const f = fixture();
  const request = await f.request();
  const result = await control.changeThreadGoalBudget(f.context, request);
  assert.deepEqual(f.calls, [{ threadId: "native-fixture", tokenBudget: 200, status: "active" }]);
  assert.equal(f.goal.objective, "Finish the approved agent");
  assert.equal(f.goal.createdAt, 42);
  assert.equal(result.goal.tokensUsed, 120);
  assert.equal(result.goal.status, "active");
  assert.equal(f.saved[request.requestId].status, "applied");
  assert.equal((await control.changeThreadGoalBudget(f.context, request)).replayed, true);
  assert.equal(f.calls.length, 1);
  await assert.rejects(control.changeThreadGoalBudget(f.context, { ...request, tokens: 101 }), { code: "idempotency_conflict" });
});

test("lost Goal acknowledgement reconciles after reload without adding twice or reactivating a later pause", async () => {
  const f = fixture();
  const request = await f.request();
  f.mode = "lost-ack";
  await assert.rejects(control.changeThreadGoalBudget(f.context, request), /lost acknowledgement/);
  assert.equal(f.saved[request.requestId].status, "prepared");
  f.goal.status = "paused";
  const reloaded = { ...f.context };
  const view = await control.readThreadGoal(reloaded);
  assert.equal(view.pendingRequest, null);
  assert.equal(view.status, "paused");
  assert.equal(view.tokensUsed, 120);
  assert.equal((await control.changeThreadGoalBudget(reloaded, request)).replayed, true);
  assert.equal(f.calls.length, 1);
});

test("undelivered Goal change retries the same absolute target and reserves its request until resolved", async () => {
  const f = fixture();
  const request = await f.request({ resume: false });
  f.mode = "before-send";
  await assert.rejects(control.changeThreadGoalBudget(f.context, request));
  assert.deepEqual((await control.readThreadGoal(f.context)).pendingRequest, request);
  await assert.rejects(control.changeThreadGoalBudget(f.context, { ...request, requestId: "another-request" }), { code: "goal_change_pending" });
  f.mode = "ok";
  const result = await control.changeThreadGoalBudget(f.context, request);
  assert.equal(result.goal.tokenBudget, 200);
  assert.equal(result.goal.status, "budgetLimited");
  assert.deepEqual(f.calls, Array(2).fill({ threadId: "native-fixture", tokenBudget: 200 }));
});

test("a saved request cannot change a replaced, completed or newly exhausted Goal", async () => {
  for (const update of [{ createdAt: 43 }, { status: "complete" }, { tokensUsed: 220 }]) {
    const f = fixture();
    const request = await f.request();
    f.mode = "before-send";
    await assert.rejects(control.changeThreadGoalBudget(f.context, request));
    Object.assign(f.goal, update);
    await assert.rejects(control.changeThreadGoalBudget(f.context, request), error => ["goal_changed", "goal_complete"].includes(error.code));
    assert.equal(f.calls.length, 1);
    await control.readThreadGoal(f.context);
    assert.equal(f.saved[request.requestId].status, "superseded");
    if (update.tokensUsed) {
      f.mode = "ok";
      const next = await control.changeThreadGoalBudget(f.context, await f.request({ requestId: "new-budget-after-recovery", tokens: 500 }));
      assert.equal(next.goal.tokenBudget, 600);
      assert.equal(next.goal.tokensUsed, 220);
    }
  }
});

test("Goal input and readback reject stale, malformed, other-thread and unsafe budget values", async () => {
  for (const update of [{ tokens: 0 }, { tokens: -1 }, { tokens: 1.5 }, { tokens: "100" }, { tokens: Number.MAX_SAFE_INTEGER }, { mode: "set", tokens: 120 }, { expectedRevision: "0".repeat(64) }]) {
    const f = fixture();
    await assert.rejects(control.changeThreadGoalBudget(f.context, await f.request(update)), error => ["goal_budget_invalid", "goal_changed"].includes(error.code));
    assert.equal(f.calls.length, 0);
    assert.equal(Object.keys(f.saved).length, 0);
  }
  for (const update of [{ threadId: "another-thread" }, { tokensUsed: null }, { tokenBudget: -1 }, { createdAt: undefined }, { objective: "" }]) {
    const f = fixture(update);
    await assert.rejects(control.readThreadGoal(f.context), { code: "goal_unavailable" });
  }
  const f = fixture(); f.goal = null;
  assert.equal((await control.readThreadGoal(f.context)).availability, "none");
});

test("Goal budget is distinct from account quotas and explicit total can bound an unlimited Goal", async () => {
  const f = fixture({ status: "usageLimited" });
  const request = await f.request();
  await assert.rejects(control.changeThreadGoalBudget(f.context, request), { code: "account_usage_limited" });
  assert.equal(f.calls.length, 0);
  const result = await control.changeThreadGoalBudget(f.context, { ...request, resume: false });
  assert.equal(result.goal.status, "usageLimited");
  assert.equal(f.calls[0].status, undefined);
  const unlimited = fixture({ tokenBudget: null, status: "paused" });
  await assert.rejects(control.changeThreadGoalBudget(unlimited.context, await unlimited.request()), { code: "goal_budget_invalid" });
  assert.equal((await control.changeThreadGoalBudget(unlimited.context, await unlimited.request({ mode: "set", tokens: 1_000, resume: false }))).goal.tokenBudget, 1_000);
});

test("a long Goal receipt history does not force a new task to authorize another extension", async () => {
  const f = fixture();
  await control.changeThreadGoalBudget(f.context, await f.request());
  const receipt = f.saved["budget-request-1"];
  f.saved = Object.fromEntries(Array.from({ length: 1_001 }, (_, index) => {
    const requestId = `historical-budget-${index}`;
    return [requestId, { ...receipt, request: { ...receipt.request, requestId } }];
  }));
  const result = await control.changeThreadGoalBudget(f.context, await f.request({ requestId: "next-authorized-budget", resume: false }));
  assert.equal(result.goal.tokenBudget, 300);
  assert.equal(result.goal.tokensUsed, 120);
  assert.equal(Object.keys(f.saved).length, 1_002);
});

function gatewayFixture() {
  const f = fixture();
  f.binding = { chatId: "chat_fixture", nativeThreadId: "native-fixture", providerId: "desktop_bundled", stateIdentityHash: "storage-v2:fixture", archived: false, origin: "chat", continuationEnabled: true, goalBudgetRequests: {}, messageReceipts: {} };
  f.provider = { availability: "ready", stateIdentityHash: f.binding.stateIdentityHash, capabilities: { goalControl: true } };
  f.native = { id: f.binding.nativeThreadId, status: { type: "idle" }, ephemeral: false };
  f.rpc = [];
  const gateway = Object.create(CodexChatGateway.prototype);
  Object.assign(gateway, {
    store: {
      get: async id => id === f.binding.chatId ? f.binding : null, all: async () => [f.binding],
      patch: async (_id, patch) => { Object.assign(f.binding, patch); f.saved = structuredClone(f.binding.goalBudgetRequests); return f.binding; },
    },
    root: "/fixture/checkout", activeTurns: new Map(), events: new Map(), subscribers: new Map(), eventSequence: 0,
    runtime: {
      provider: async () => ({ view: f.provider }),
      readThread: async () => ({ thread: f.native }),
      connection: async () => ({ request: async (method, params) => {
        f.rpc.push(method);
        if (method === "thread/goal/get") return f.context.read();
        if (method === "thread/goal/set") return f.context.set(params);
        assert.fail(`Goal controls must not send ${method}`);
      } }),
    },
  });
  f.gateway = gateway;
  return f;
}

test("Goal gateway guards original storage, exact thread, live turns, voice continuation and archive state", async () => {
  const changes = [
    [f => { f.provider.availability = "unavailable"; }, "runtime_unavailable"],
    [f => { f.provider.capabilities.goalControl = false; }, "goal_unsupported"],
    [f => { f.provider.stateIdentityHash = "storage-v2:other"; }, "runtime_identity_mismatch"],
    [f => { f.native.id = "other-thread"; }, "goal_thread_mismatch"],
    [f => { f.native.ephemeral = true; }, "goal_thread_mismatch"],
    [f => { f.native.status = { type: "active", activeFlags: ["waitingOnApproval"] }; }, "turn_active"],
    [f => { f.gateway.activeTurns.set("chat_fixture", {}); }, "turn_active"],
    [f => { f.binding.archived = true; }, "chat_archived"],
    [f => { f.binding.origin = "voice"; f.binding.continuationEnabled = false; }, "continuation_confirmation_required"],
  ];
  for (const [change, code] of changes) {
    const f = gatewayFixture(); change(f);
    await assert.rejects(f.gateway.updateGoalBudget("chat_fixture", await f.request()), { code });
    assert.equal(f.rpc.length, 0);
  }
  const unsupported = gatewayFixture(); unsupported.provider.capabilities.goalControl = false;
  assert.equal((await unsupported.gateway.threadGoal("chat_fixture")).availability, "unsupported");
});

test("Goal gateway shares the native turn lease and safely reconciles an unconfirmed change", async () => {
  const f = gatewayFixture();
  const request = await f.request();
  const release = coordinator.tryAcquireNativeThreadTurn("desktop_bundled:native-fixture", "test-turn");
  try { await assert.rejects(f.gateway.updateGoalBudget("chat_fixture", request), { code: "turn_active" }); }
  finally { release(); }
  f.mode = "lost-ack";
  await assert.rejects(f.gateway.updateGoalBudget("chat_fixture", request), error => error.code === "goal_update_unconfirmed" && !error.message.includes("lost acknowledgement"));
  assert.equal((await f.gateway.threadGoal("chat_fixture")).tokenBudget, 200);
  assert.equal((await f.gateway.updateGoalBudget("chat_fixture", request)).replayed, true);
  assert.equal(f.rpc.filter(method => method === "thread/goal/set").length, 1);
  assert.equal(f.gateway.events.get("chat_fixture").at(-1).event, "goal.updated");
});

test("Goal receipts survive private registry reload and share no transcript or authored knowledge", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-goal-registry-"));
  try {
    const { CodexChatPrivateStore } = load("codex-chat/private-store", {
      "@/lib/pritha-paths": { resolveTechscopeRoot: () => path.join(tmp, "checkout"), resolvePrithaStateRoot: () => path.join(tmp, "state") },
      "@/lib/private-json": load("private-json"),
    });
    const f = fixture(); await control.changeThreadGoalBudget(f.context, await f.request());
    const store = new CodexChatPrivateStore();
    await store.put({ chatId: "chat_fixture", nativeThreadId: "native-fixture", providerId: "desktop_bundled", goalBudgetRequests: f.saved });
    await store.patch("chat_fixture", { title: "Renamed" });
    const reloaded = await new CodexChatPrivateStore().get("chat_fixture");
    assert.deepEqual(reloaded.goalBudgetRequests, f.saved);
    assert.equal(reloaded.title, "Renamed");
    assert.equal(path.relative(tmp, store.registryPath), "state/codex-chat/registry.json");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("Goal API mutation is covered by existing origin and trusted-host guards", () => {
  const { evaluateApiRequestGuard } = load("security/api-guard");
  const url = "http://127.0.0.1:3420/api/codex-chat/v1/threads/chat_fixture/goal";
  assert.equal(evaluateApiRequestGuard({ url, method: "POST", headers: new Headers({ host: "127.0.0.1:3420", origin: "https://untrusted.example" }), env: {} }).action, "deny");
  assert.equal(evaluateApiRequestGuard({ url, method: "POST", headers: new Headers({ host: "127.0.0.1:3420", origin: "http://127.0.0.1:3420" }), env: {} }).action, "allow");
});

test("Control Center reads v1 and v2 delivery journals while keeping unknown usage distinct from zero", () => {
  const { deliveryStateView, deliveryBudgetText } = load("control-center/delivery-state");
  const state = { schema: "pritha-delivery-ledger-v2", run_id: "run-fixture", status: "verified", budget: {
    accounting_version: 1, usage_scope: "build-executor", legacy_usage_unverified: false,
    tokens_used: 120, max_tokens: 100, accounted_turns: [{ key: "turn-1", tokens_used: 120 }], unaccounted_attempts: [], amendments: [{}],
  } };
  const view = deliveryStateView(state);
  assert.equal(view.status, "verified");
  assert.equal(view.budget.tokensUsed, 120);
  assert.equal(view.budget.tokensAvailable, 0);
  assert.equal(view.budget.usageStatus, "complete");
  assert.match(deliveryBudgetText(view.budget), /120 \/ 100/);
  const unknown = deliveryStateView({ ...state, budget: { ...state.budget, unaccounted_attempts: [{ reserved_tokens: 200 }] } });
  assert.equal(unknown.budget.tokensAvailable, null);
  assert.equal(unknown.budget.tokensReserved, 200);
  assert.equal(unknown.budget.usageStatus, "unknown");
  const legacy = deliveryStateView({ ...state, schema: "pritha-delivery-ledger-v1", budget: {} });
  assert.equal(legacy.budget.tokensUsed, null);
  assert.equal(legacy.budget.tokensAvailable, null);
  assert.equal(legacy.budget.usageStatus, "legacy-unknown");
  for (const patch of [{ tokens_used: 0 }, { max_tokens: -1 }, { unaccounted_attempts: undefined }, { accounted_turns: [state.budget.accounted_turns[0], state.budget.accounted_turns[0]] }]) {
    assert.equal(deliveryStateView({ ...state, budget: { ...state.budget, ...patch } }).budget.usageStatus, "unknown");
  }
  assert.equal(deliveryStateView({ schema: "another-schema" }), null);
});
