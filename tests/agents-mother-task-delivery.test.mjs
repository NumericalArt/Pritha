import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireFileLock } from "../scripts/lib/atomic-file.mjs";
import { budgetBlocker, createDeliveryLedger, readDeliveryLedger, targetKey, transitionDelivery, updateDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec, verifyCompiledTrialPlan } from "../scripts/agents-mother/outcome-spec.mjs";
import { listTaskDeliveries, performTaskDeliveryAction, readTaskDelivery } from "../scripts/agents-mother/task-delivery.mjs";
import { resumeDelivery } from "../scripts/agents-mother/delivery-loop.mjs";

const task = { chatId: "chat_fixture", nativeThreadId: "native-fixture", providerId: "desktop_bundled", stateIdentityHash: "storage-v2:fixture" };
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function fixture(t, runId = "controlled-run", isolation = "none") {
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
  createDeliveryLedger(runRoot, { runId, agentSlug: plan.agent_slug, targetKey: targetKey(project), sourceProject: project, budget: { maxTokens: 100 },
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
async function gatewayFixture(t) {
  const f = fixture(t);
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
    "./storage-identity": load("storage-identity"), "./normalize": load("normalize"), "./native-turn-coordinator": nativeCoordinator,
    "./private-store": { logicalChatKey: row => `${row.stateIdentityHash}:${row.nativeThreadId}` },
  });
  const binding = { ...task, archived: false, origin: "chat", continuationEnabled: true, messageReceipts: {} };
  const provider = { availability: "ready", stateIdentityHash: task.stateIdentityHash, capabilities: { goalControl: false } };
  const native = { id: task.nativeThreadId, cwd: f.root, status: { type: "idle" }, ephemeral: false };
  const gateway = Object.create(CodexChatGateway.prototype);
  Object.assign(gateway, { root: f.root, activeTurns: new Map(), store: { stateRoot: f.stateRoot, get: async () => binding, all: async () => [binding] }, runtime: {
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
