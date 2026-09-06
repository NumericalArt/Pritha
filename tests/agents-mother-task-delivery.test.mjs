import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireFileLock } from "../scripts/lib/atomic-file.mjs";
import { budgetBlocker, createDeliveryLedger, grantDeliveryBudget, readDeliveryLedger, targetKey, transitionDelivery, updateDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec, verifyCompiledTrialPlan } from "../scripts/agents-mother/outcome-spec.mjs";
import { listTaskDeliveries, performTaskDeliveryAction, readTaskDelivery } from "../scripts/agents-mother/task-delivery.mjs";
import { resumeDelivery } from "../scripts/agents-mother/delivery-loop.mjs";

const task = { chatId: "chat_fixture", nativeThreadId: "native-fixture", providerId: "desktop_bundled", stateIdentityHash: "storage-v2:fixture" };
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function fixture(t, runId = "controlled-run", isolation = "none", createdAt) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-task-delivery-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), project = path.join(agentParent, "fixture-agent");
  const options = { root, stateRoot, agentParent }, contracts = path.join(stateRoot, "agents/contracts");
  for (const dir of [root, contracts, path.join(project, "scripts")]) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(project, "AGENTS.md"), "# Synthetic fixture\n");
  writeFileSync(path.join(project, "scripts/smoke-test.mjs"), "process.stdout.write('fixture passed');\n");
  git(project, ["init"]); git(project, ["config", "user.email", "tests@pritha.local"]); git(project, ["config", "user.name", "Pritha Tests"]);
  git(project, ["add", "."]); git(project, ["commit", "-m", "synthetic fixture"]);
  const contractPath = path.join(contracts, "contract.md");
  writeFileSync(contractPath, readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("type: agent-contract", "type: agent-contract\nagent_id: stable-fixture")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${project}`)
    .replace(/^- Build executor:.*$/m, "- Build executor: manual"));
  const specPath = createOutcomeSpec(contractPath, options).path;
  if (isolation === "sandbox") writeFileSync(specPath, readFileSync(specPath, "utf8").replace("- Isolation: none", "- Isolation: sandbox"));
  approveOutcomeSpec(specPath, { ...options, approvedBy: "user" });
  const { plan, runRoot } = compileOutcomeSpec(specPath, { ...options, runId });
  createDeliveryLedger(runRoot, { runId, agentSlug: plan.agent_slug, targetKey: targetKey(project), sourceProject: project, createdAt, budget: { maxTokens: 100 },
    spec: { id: plan.spec_id, semanticLock: plan.semantic_lock, documentLock: plan.document_lock, contractFingerprint: plan.contract_fingerprint, approvalId: plan.approval_id } });
  updateDeliveryLedger(runRoot, state => ({ ...state, budget: { ...state.budget, tokens_used: 101, accounted_turns: [{ key: "synthetic-thread:synthetic-turn", thread_id: "synthetic-thread", turn_id: "synthetic-turn", tokens_used: 101 }] } }));
  transitionDelivery(runRoot, "blocked", { blockers: [budgetBlocker(readDeliveryLedger(runRoot))] });
  const read = (actor = task) => readTaskDelivery(runId, actor, options);
  const action = (kind, actor = task, extra = {}) => ({ requestId: `fixture-${kind}-${Date.now()}`, runId, expectedRevision: read(actor).revision, action: kind, ...extra });
  const bind = async () => performTaskDeliveryAction(task, action("bind"), options);
  return { ...options, options, project, plan, runRoot, runId, contractPath, specPath, read, action, bind };
}

test("exact linking, budget-limited verification and handoff preparation preserve separate acceptance and usage", async t => {
  const f = fixture(t);
  const before = readDeliveryLedger(f.runRoot);
  assert.equal(f.read().bindingStatus, "unbound");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false, "GET never starts a verifier");
  const linked = await f.bind();
  assert.equal(linked.run.bindingStatus, "bound");
  assert.equal(listTaskDeliveries(task, f.options).length, 1);
  const input = f.action("verify");
  const result = await performTaskDeliveryAction(task, input, f.options);
  assert.equal(result.run.status, "awaiting_acceptance");
  assert.equal(result.run.acceptance, "not_accepted");
  const state = readDeliveryLedger(f.runRoot);
  assert.equal(state.iteration, 0, "no build turn was started");
  assert.deepEqual(state.budget, before.budget, "budget, usage and accounting scope remain unchanged");
  assert.equal((await performTaskDeliveryAction(task, input, f.options)).replayed, true);
  assert.equal(readDeliveryLedger(f.runRoot).version, state.version, "lost-response retry never repeats Trials");
  const handoff = f.action("prepare_handoff");
  await performTaskDeliveryAction(task, handoff, f.options);
  const file = path.join(f.runRoot, "handoff-preparation.json"), original = readFileSync(file, "utf8");
  assert.equal(JSON.parse(original).acceptance, "not_accepted");
  assert.equal(JSON.parse(original).disposition, "prepared_for_review");
  await performTaskDeliveryAction(task, handoff, f.options);
  assert.equal(readFileSync(file, "utf8"), original);
  await performTaskDeliveryAction(task, f.action("prepare_handoff", task, { requestId: "another-explicit-preparation" }), f.options);
  assert.equal(readFileSync(file, "utf8"), original, "the same reviewed handoff is not rewritten for a new request identifier");
  assert.deepEqual(f.read().preparation.demo, f.plan.demo, "the prepared demo is reviewable from Task Chat");
  assert.equal(git(f.project, ["status", "--porcelain"]), "", "the active source checkout remains unchanged");
});

test("same names, other tasks, providers, instances and stale revisions cannot authorize a host run", async t => {
  const f = fixture(t), other = fixture(t);
  const before = f.action("verify");
  await f.bind();
  for (const actor of [{ ...task, nativeThreadId: "different" }, { ...task, providerId: "standalone_cli" }, { ...task, stateIdentityHash: "storage-v2:other" }]) {
    assert.equal(f.read(actor).bindingStatus, "other_task");
    await assert.rejects(performTaskDeliveryAction(actor, f.action("verify", actor), f.options), { code: "delivery_task_mismatch" });
  }
  await assert.rejects(performTaskDeliveryAction(task, before, f.options), { code: "delivery_changed" });
  writeFileSync(path.join(other.runRoot, "task-control.json"), readFileSync(path.join(f.runRoot, "task-control.json")));
  assert.throws(() => other.read(), { code: "delivery_binding_stale" });
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
});

test("compiled command and policy substitution is rejected even with copied approval locks", async t => {
  const f = fixture(t);
  assert.equal(verifyCompiledTrialPlan(f.plan, f.options), true);
  const changes = [
    plan => { plan.trials[0].argv = ["node", "unexpected.mjs"]; },
    plan => { plan.trials[0].timeoutMs += 1; },
    plan => { plan.delivery_policy.trial_backend_policy = "app-server-required"; },
    plan => { plan.demo = ["unapproved action"]; },
  ];
  for (const change of changes) {
    const plan = structuredClone(f.plan); change(plan);
    writeFileSync(path.join(f.runRoot, "trial-plan.json"), JSON.stringify(plan));
    assert.equal(verifyCompiledTrialPlan(plan, f.options), false);
    assert.throws(() => f.read(), { code: "delivery_approval_stale" });
  }
  const result = await resumeDelivery(f.runId, { ...f.options, hostOnly: true });
  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "trial_plan_changed");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
});

test("binding and action evidence reject symlinks, project substitution and contract changes", async t => {
  const f = fixture(t), other = fixture(t);
  const input = f.action("bind");
  const stateFile = path.join(f.runRoot, "build-state.json"), state = readFileSync(stateFile);
  rmSync(stateFile); symlinkSync(path.join(other.runRoot, "build-state.json"), stateFile);
  assert.throws(() => f.read(), { code: "delivery_evidence_unavailable" });
  rmSync(stateFile); writeFileSync(stateFile, state);
  const auditFile = path.join(f.stateRoot, "audit/outcome-approvals.jsonl"), audit = readFileSync(auditFile);
  rmSync(auditFile); symlinkSync(path.join(other.stateRoot, "audit/outcome-approvals.jsonl"), auditFile);
  await assert.rejects(performTaskDeliveryAction(task, input, f.options), { code: "delivery_approval_unavailable" });
  rmSync(auditFile); writeFileSync(auditFile, audit);
  await f.bind();
  writeFileSync(f.contractPath, `${readFileSync(f.contractPath, "utf8")}\nChanged accepted meaning.\n`);
  assert.throws(() => f.read(), { code: "delivery_approval_stale" });
});

test("execution lease and durable started receipts prevent repeated unknown subprocess effects", async t => {
  const f = fixture(t); await f.bind();
  const input = f.action("verify");
  const lock = acquireFileLock(path.join(f.runRoot, "delivery-execution"));
  try { await assert.rejects(performTaskDeliveryAction(task, input, f.options), { code: "delivery_running" }); }
  finally { lock.release(); }
  const file = path.join(f.runRoot, "task-control.json"), control = JSON.parse(readFileSync(file, "utf8"));
  control.requests[input.requestId] = { request: input, action: "verify", status: "started", requestHash: hash([input.action, input.runId, input.expectedRevision, hash([task.providerId, task.stateIdentityHash, task.nativeThreadId])]) };
  writeFileSync(file, JSON.stringify(control));
  updateDeliveryLedger(f.runRoot, state => ({ ...state, status: "verifying", phase: "verification", blockers: [], next_action: "run_trials" }));
  assert.equal(f.read().receipts.at(-1).request.requestId, input.requestId, "reload can reconcile the exact saved request");
  await assert.rejects(performTaskDeliveryAction(task, { ...input, requestId: "another-request" }, f.options), { code: "delivery_action_pending" });
  const replay = await performTaskDeliveryAction(task, input, f.options);
  assert.equal(replay.replayed, true); assert.equal(replay.run.receipts.at(-1).status, "interrupted");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
  const next = await performTaskDeliveryAction(task, f.action("verify", task, { requestId: "explicit-new-action" }), f.options);
  assert.equal(next.run.status, "awaiting_acceptance", "a new explicit action can continue after interrupted evidence was reconciled");
});

test("handoff preparation detects changed verified revision without inventing acceptance", async t => {
  const f = fixture(t); await f.bind();
  await performTaskDeliveryAction(task, f.action("verify"), f.options);
  writeFileSync(path.join(f.runRoot, "worktree/changed.txt"), "Changed after verification.\n");
  const result = await performTaskDeliveryAction(task, f.action("prepare_handoff"), f.options);
  assert.equal(result.run.receipts.at(-1).result.code, "delivery_evidence_stale");
  assert.equal(existsSync(path.join(f.runRoot, "handoff-preparation.json")), false);
  assert.equal(readDeliveryLedger(f.runRoot).accepted_by, null);
});

// Execute the production gateway with the real host controller and a native
// thread reader. Any model/Goal RPC is an immediate test failure.
async function gatewayFixture(t, createdAt) {
  const f = fixture(t, "controlled-run", "none", createdAt);
  const ts = (await import("../interfaces/control-center/node_modules/typescript/lib/typescript.js")).default;
  const { createRequire } = await import("node:module"), require = createRequire(import.meta.url);
  function load(name, dependencies = {}) {
    const source = readFileSync(`interfaces/control-center/src/lib/codex-chat/${name}.ts`, "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    new Function("require", "module", "exports", output)(id => id.startsWith("node:") ? require(id) : dependencies[id] || {}, module, module.exports);
    return module.exports;
  }
  const nativeCoordinator = load("native-turn-coordinator");
  const { CodexChatGateway } = load("gateway", {
    "../../../../../scripts/agents-mother/task-delivery.mjs": await import("../scripts/agents-mother/task-delivery.mjs"),
    "./storage-identity": load("storage-identity"), "./normalize": load("normalize"), "./native-turn-coordinator": nativeCoordinator, "./budget-intent": load("budget-intent"),
    "./private-store": { logicalChatKey: row => `${row.stateIdentityHash}:${row.nativeThreadId}` },
  });
  const binding = { ...task, archived: false, origin: "chat", continuationEnabled: true, messageReceipts: {} };
  const provider = { availability: "ready", stateIdentityHash: task.stateIdentityHash, capabilities: { goalControl: false } };
  const native = { id: task.nativeThreadId, cwd: f.root, status: { type: "idle" }, ephemeral: false };
  const gateway = Object.create(CodexChatGateway.prototype);
  Object.assign(gateway, { root: f.root, activeTurns: new Map(), store: { stateRoot: f.stateRoot, get: async () => binding, all: async () => [binding], patch: async (_id, patch) => Object.assign(binding, patch) }, runtime: {
    provider: async () => ({ view: provider }), readThread: async () => ({ thread: native }),
    connection: async () => assert.fail("Host actions must not request a model turn or Goal RPC"),
  } });
  const previous = process.env.PRITHA_AGENT_PARENT;
  process.env.PRITHA_AGENT_PARENT = f.agentParent;
  t.after(() => { if (previous === undefined) delete process.env.PRITHA_AGENT_PARENT; else process.env.PRITHA_AGENT_PARENT = previous; });
  return { ...f, gateway, binding, provider, native };
}

test("Task Chat gateway performs approved host checks with unavailable Goal controls and no native turn", async t => {
  const f = await gatewayFixture(t);
  const preview = await f.gateway.taskDeliveries(task.chatId, f.runId);
  assert.equal(preview.run.bindingStatus, "unbound");
  await f.gateway.deliveryAction(task.chatId, f.action("bind"));
  const result = await f.gateway.deliveryAction(task.chatId, f.action("verify"));
  assert.equal(result.run.status, "awaiting_acceptance");
  assert.equal(readDeliveryLedger(f.runRoot).iteration, 0);
  assert.deepEqual((await f.gateway.taskDeliveries(task.chatId)).runs.map(row => row.runId), [f.runId]);
});

test("build budget add and total keep observed usage, progress and the same native task", async t => {
  const f = await gatewayFixture(t); await f.gateway.deliveryAction(task.chatId, f.action("bind"));
  const add = { clientMessageId: "build-budget-add", text: "Добавь 200 токенов к бюджету сборки" };
  let result = await f.gateway.applyDeliveryBudgetIntent(task.chatId, add);
  assert.equal(result.run.budget.maxTokens, 300);
  assert.equal(result.run.budget.tokensUsed, 101);
  assert.equal(result.run.status, "correcting");
  assert.equal(result.run.receipts.at(-1).result.resume, "not_requested");
  assert.equal(result.replayed, false);
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false, "a budget change alone starts no build or Trial");
  const version = readDeliveryLedger(f.runRoot).version;
  const saved = structuredClone(f.binding.deliveryBudgetRequests);
  assert.match(saved[add.clientMessageId].sourceTextHash, /^[a-f0-9]{64}$/);
  f.binding.deliveryBudgetRequests = JSON.parse(JSON.stringify(saved)); // registry reload
  result = await f.gateway.applyDeliveryBudgetIntent(task.chatId, add);
  assert.equal(result.replayed, true);
  assert.equal(readDeliveryLedger(f.runRoot).version, version);
  result = await f.gateway.applyDeliveryBudgetIntent(task.chatId, { clientMessageId: "build-budget-total", text: "Установи бюджет сборки до 250 токенов" });
  assert.equal(result.run.budget.maxTokens, 250);
  assert.equal(result.run.budget.tokensUsed, 101);
  assert.equal(readDeliveryLedger(f.runRoot).budget.amendments.at(-1).token_target, 250);
  assert.equal(readDeliveryLedger(f.runRoot).iteration, 0);
  assert.equal(f.binding.nativeThreadId, task.nativeThreadId);
  assert.equal(f.binding.hasDeliveryBinding, true, "binding retains native task history even without a model turn");
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, { ...add, text: add.text.replace("200", "300") }), { code: "idempotency_conflict" });
  await assert.rejects(f.gateway.startTurn(task.chatId, { clientMessageId: add.clientMessageId, input: [{ type: "text", text: "Continue" }] }), { code: "idempotency_conflict" });
  await assert.rejects(f.gateway.updateGoalBudget(task.chatId, { requestId: add.clientMessageId }), { code: "idempotency_conflict" });
});

function addBoundRun(f, runId) {
  const { plan, runRoot } = compileOutcomeSpec(f.specPath, { ...f.options, runId });
  createDeliveryLedger(runRoot, { runId, agentSlug: plan.agent_slug, targetKey: targetKey(f.project), sourceProject: f.project, budget: { maxTokens: 100 },
    spec: { id: plan.spec_id, semanticLock: plan.semantic_lock, documentLock: plan.document_lock, contractFingerprint: plan.contract_fingerprint, approvalId: plan.approval_id } });
  return { runRoot, bind: () => performTaskDeliveryAction(task, { requestId: `bind-${runId}`, runId, action: "bind", expectedRevision: readTaskDelivery(runId, task, f.options).revision }, f.options) };
}

test("budget scope never falls through to another run and same-message replay survives a newly bound run", async t => {
  const f = await gatewayFixture(t); await f.bind();
  const first = { clientMessageId: "original-budget-request", text: "Добавь 100 токенов к бюджету сборки" };
  await f.gateway.applyDeliveryBudgetIntent(task.chatId, first);
  const second = addBoundRun(f, "second-run"); await second.bind();
  const version = readDeliveryLedger(f.runRoot).version;
  assert.equal((await f.gateway.applyDeliveryBudgetIntent(task.chatId, first)).replayed, true);
  assert.equal(readDeliveryLedger(f.runRoot).version, version);
  assert.equal(readDeliveryLedger(second.runRoot).budget.max_tokens, 100);
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, { ...first, clientMessageId: "ambiguous-new-request" }), { code: "delivery_scope_ambiguous" });
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, { ...first, runId: "second-run" }), { code: "idempotency_conflict" });
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, { ...first, clientMessageId: "nonexistent-run-request", runId: "missing-run" }), { code: "delivery_run_unavailable" });
  const explicit = await f.gateway.applyDeliveryBudgetIntent(task.chatId, { clientMessageId: "explicit-text-selection", text: "Добавь 50 токенов к бюджету сборки second-run", runId: f.runId });
  assert.equal(explicit.run.runId, "second-run", "a run named in the command is the explicit target");
  assert.equal(readDeliveryLedger(second.runRoot).budget.max_tokens, 150);
  assert.equal(readDeliveryLedger(f.runRoot).budget.max_tokens, 200);
});

test("saved budget survives the ledger-to-receipt crash window without adding twice", async t => {
  const f = fixture(t); await f.bind();
  const request = f.action("budget", task, { requestId: "crash-budget-request", budget: { mode: "add", tokens: 150, resume: false } });
  await performTaskDeliveryAction(task, request, f.options);
  const file = path.join(f.runRoot, "task-control.json"), control = JSON.parse(readFileSync(file, "utf8"));
  const receipt = control.requests[request.requestId]; receipt.status = "started";
  delete receipt.finishedAt; delete receipt.budgetAppliedVersion; delete receipt.result;
  writeFileSync(file, JSON.stringify(control));
  const before = readDeliveryLedger(f.runRoot);
  const replay = await performTaskDeliveryAction(task, request, f.options);
  assert.equal(replay.replayed, true);
  assert.equal(replay.run.receipts.at(-1).status, "completed");
  assert.deepEqual(readDeliveryLedger(f.runRoot), before);
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
});

test("budget replay never dispatches an already-started resume or overrides newer run progress", async t => {
  for (const interrupted of [true, false]) {
    const f = fixture(t); await f.bind();
    const request = f.action("budget", task, { requestId: "resume-budget-request", budget: { mode: "add", tokens: 200, resume: true } });
    const file = path.join(f.runRoot, "task-control.json"), control = JSON.parse(readFileSync(file, "utf8"));
    const key = hash([task.providerId, task.stateIdentityHash, task.nativeThreadId]);
    const budgetRequestId = `task-budget-${hash([key, request.requestId]).slice(0, 40)}`;
    const versionBefore = readDeliveryLedger(f.runRoot).version;
    grantDeliveryBudget(f.runRoot, { approvedBy: "user", requestId: budgetRequestId, addTokens: 200, expectedVersion: versionBefore });
    control.requests[request.requestId] = { action: "budget", status: "started", request, versionBefore, budgetRequestId,
      requestHash: hash(["budget", f.runId, request.expectedRevision, key, request.budget, null]), ...(interrupted ? { resumeStartedAt: new Date().toISOString() } : {}) };
    writeFileSync(file, JSON.stringify(control));
    if (!interrupted) updateDeliveryLedger(f.runRoot, state => ({ ...state, phase: "newer-progress" }));
    const before = readDeliveryLedger(f.runRoot);
    const replay = await performTaskDeliveryAction(task, request, f.options);
    assert.equal(replay.run.receipts.at(-1).result.resume, interrupted ? "unconfirmed_review_existing_run" : "superseded_by_run_progress");
    assert.equal(existsSync(path.join(f.runRoot, "worktree")), false, "recovery must never dispatch an unconfirmed paid continuation twice");
    assert.deepEqual(readDeliveryLedger(f.runRoot), before);
  }
});

test("explicit build continuation reaches the same approved result without touching parent Goal", async t => {
  const f = await gatewayFixture(t); await f.bind();
  const request = { clientMessageId: "continue-build-request", text: "Добавь 200 токенов к бюджету сборки и продолжай" };
  const result = await f.gateway.applyDeliveryBudgetIntent(task.chatId, request);
  assert.equal(result.run.status, "awaiting_acceptance");
  assert.equal(result.run.acceptance, "not_accepted");
  assert.equal(result.run.receipts.at(-1).result.resume, "returned");
  assert.equal(result.run.budget.maxTokens, 300);
  const state = readDeliveryLedger(f.runRoot);
  assert.equal((await f.gateway.applyDeliveryBudgetIntent(task.chatId, request)).replayed, true);
  assert.deepEqual(readDeliveryLedger(f.runRoot), state);
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, { ...request, clientMessageId: "completed-build-request" }), { code: "delivery_budget_complete" });
});

test("budget controls enforce ownership, lifecycle, unknown usage and request scope", async t => {
  const f = await gatewayFixture(t); await f.bind();
  const input = { clientMessageId: "guarded-build-request", text: "Добавь 100 токенов к бюджету сборки" };
  for (const [object, field, value, code] of [
    [f.provider, "stateIdentityHash", "storage-v2:other", "delivery_task_unverified"],
    [f.native, "status", { type: "active" }, "turn_active"],
    [f.binding, "archived", true, "chat_archived"],
  ]) {
    const original = object[field]; object[field] = value;
    await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, input), { code }); object[field] = original;
  }
  updateDeliveryLedger(f.runRoot, state => ({ ...state, budget: { ...state.budget, max_tokens: 500, legacy_usage_unverified: true } }));
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, { ...input, text: "Установи бюджет сборки до 250 токенов" }), { code: "delivery_usage_unknown" });
  const uiRequest = f.action("budget", task, { requestId: "ui-budget-request", budget: { mode: "add", tokens: 100, resume: false } });
  const result = await f.gateway.deliveryAction(task.chatId, uiRequest);
  assert.equal(result.run.budget.maxTokens, 600);
  assert.equal(result.run.budget.usageStatus, "legacy-unknown");
  await assert.rejects(f.gateway.updateGoalBudget(task.chatId, { requestId: uiRequest.requestId }), { code: "idempotency_conflict" });
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, { ...input, clientMessageId: uiRequest.requestId }), { code: "idempotency_conflict" });
  assert.equal((await f.gateway.deliveryAction(task.chatId, uiRequest)).replayed, true);
});

test("conflicting alias budget receipts cannot silently retarget a saved command", async t => {
  const f = await gatewayFixture(t); await f.bind();
  const input = { clientMessageId: "alias-budget-request", text: "Добавь 100 токенов к бюджету сборки" };
  await f.gateway.applyDeliveryBudgetIntent(task.chatId, input);
  const alias = structuredClone(f.binding); alias.chatId = "chat_alias";
  alias.deliveryBudgetRequests[input.clientMessageId].request.runId = "another-run";
  f.gateway.store.all = async () => [f.binding, alias];
  const before = readDeliveryLedger(f.runRoot);
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(task.chatId, input), { code: "idempotency_conflict" });
  assert.deepEqual(readDeliveryLedger(f.runRoot), before);
  assert.equal((await f.gateway.taskDeliveries(task.chatId, f.runId)).run.runId, f.runId, "history and readback stay available while a request conflict is reviewed");
});

test("iteration and elapsed extensions recover the existing run without resetting usage or time", async t => {
  const f = await gatewayFixture(t, new Date(Date.now() - 10 * 60000).toISOString()); await f.bind();
  updateDeliveryLedger(f.runRoot, state => ({ ...state, iteration: 2,
    budget: { ...state.budget, max_tokens: 500, max_iterations: 2, max_elapsed_ms: 60000 } }));
  const request = f.action("budget", task, { requestId: "iteration-time-budget", budget: { mode: "add", tokens: 0, addIterations: 2, addElapsedMs: 60000, resume: false } });
  const result = await f.gateway.deliveryAction(task.chatId, request);
  const state = readDeliveryLedger(f.runRoot);
  assert.equal(result.run.status, "correcting");
  assert.equal(result.run.budget.iterations, 2);
  assert.equal(result.run.budget.maxIterations, 4);
  assert.equal(state.budget.max_tokens, 500);
  assert.equal(state.budget.tokens_used, 101);
  assert.ok(state.budget.max_elapsed_ms >= 11 * 60000);
  assert.ok(state.budget.max_elapsed_ms - result.run.budget.elapsedMs > 59000);
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
  assert.equal((await f.gateway.deliveryAction(task.chatId, request)).replayed, true);
  assert.deepEqual(readDeliveryLedger(f.runRoot), state);
});

test("the CLI accepts an absolute token cap and retains its idempotent budget history", t => {
  const f = fixture(t);
  const args = [path.resolve("scripts/pritha.mjs"), "delivery", "budget", f.runId, "--set-tokens", "350", "--answered-by", "user", "--request-id", "cli-absolute-budget"];
  const options = { cwd: f.root, env: { ...process.env, TECHSCOPE_ROOT: f.root, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_PARENT: f.agentParent }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  const output = execFileSync(process.execPath, args, options);
  assert.match(output, /Build tokens observed: 101\/350/);
  const before = readDeliveryLedger(f.runRoot);
  execFileSync(process.execPath, args, options);
  assert.deepEqual(readDeliveryLedger(f.runRoot), before);
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
});

test("Task Chat gateway keeps native cwd, storage, ephemeral, active turn, archive and voice permission gates", async t => {
  const f = await gatewayFixture(t);
  const input = f.action("bind");
  const cases = [
    [f.provider, "stateIdentityHash", "storage-v2:other", "delivery_task_unverified"],
    [f.native, "id", "other-thread", "delivery_task_unverified"],
    [f.native, "cwd", f.project, "delivery_task_unverified"],
    [f.native, "ephemeral", true, "delivery_task_unverified"],
    [f.native, "status", { type: "active", activeFlags: ["waitingOnApproval"] }, "turn_active"],
    [f.binding, "archived", true, "chat_archived"],
  ];
  for (const [object, field, value, code] of cases) {
    const previous = object[field]; object[field] = value;
    await assert.rejects(f.gateway.deliveryAction(task.chatId, input), { code });
    object[field] = previous;
  }
  f.binding.origin = "voice"; f.binding.continuationEnabled = false;
  await assert.rejects(f.gateway.deliveryAction(task.chatId, input), { code: "continuation_confirmation_required" });
  assert.equal(existsSync(path.join(f.runRoot, "task-control.json")), false);
});


test("approved sandbox Trials select a sandbox-capable host backend without weakening isolation", t => {
  const f = fixture(t, "sandbox-run", "sandbox");
  const view = f.read();
  assert.equal(view.plan.backend, "app-server");
  assert.equal(view.plan.commands[0].isolation, "sandbox");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false, "preview does not dispatch a backend probe or command");
});
