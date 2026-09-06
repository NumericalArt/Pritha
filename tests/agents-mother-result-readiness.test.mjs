import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FunctionBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { acceptDelivery, runDeliveryLoop } from "../scripts/agents-mother/delivery-loop.mjs";
import { readDeliveryLedger, transitionDelivery } from "../scripts/agents-mother/delivery-ledger.mjs";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec } from "../scripts/agents-mother/outcome-spec.mjs";
import { readAgentResultReadiness } from "../scripts/agents-mother/result-readiness.mjs";
import { readAgentResultReadinessAsync } from "../scripts/agents-mother/result-readiness-async.mjs";

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
async function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-result-readiness-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), project = path.join(agentParent, "product"), contracts = path.join(stateRoot, "agents/contracts");
  const options = { root, stateRoot, agentParent };
  for (const directory of [root, contracts, path.join(project, "scripts")]) mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(project, "AGENTS.md"), "# Synthetic agent\n");
  writeFileSync(path.join(project, "scripts/smoke-test.mjs"), "console.log('synthetic result');\n");
  git(project, ["init"]); git(project, ["config", "user.name", "Pritha Tests"]); git(project, ["config", "user.email", "tests@pritha.local"]);
  git(project, ["add", "."]); git(project, ["commit", "-m", "synthetic fixture"]);
  const contractPath = path.join(contracts, "contract.md");
  writeFileSync(contractPath, readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("type: agent-contract", "type: agent-contract\ncontract_schema_version: 2\nagent_kind: one-shot-cli\nagent_id: readiness-fixture")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${project}`));
  const specPath = createOutcomeSpec(contractPath, options).path;
  approveOutcomeSpec(specPath, { ...options, approvedBy: "user" });
  const compiled = compileOutcomeSpec(specPath, { ...options, runId: "readiness-run" });
  const executor = new FunctionBuildExecutor(async () => { throw new Error("A read-only readiness fixture must never call a build model"); });
  const result = await runDeliveryLoop({ ...options, ...compiled, projectPath: project, hostOnly: true, buildExecutor: executor, trialBackend: "local" });
  assert.ok(["verified", "awaiting_acceptance"].includes(result.state.status), JSON.stringify(result.state.blockers));
  return { ...options, options, ...compiled, project, contractPath, specPath, read: () => readAgentResultReadiness("readiness-fixture", options) };
}

test("read model verifies actual approved Trial evidence without mutating the run or executing it again", async t => {
  const f = await fixture(t), state = readDeliveryLedger(f.runRoot);
  const before = readFileSync(path.join(f.runRoot, "events.jsonl"), "utf8");
  const view = f.read();
  assert.equal(view.run.id, f.runId);
  assert.ok(["verified", "awaiting_operator"].includes(view.verification.status));
  assert.equal(view.verification.counts.automated, f.plan.counts.automated);
  assert.equal(view.verification.counts.passed, f.plan.counts.automated);
  assert.equal(view.verification.head, git(f.project, ["rev-parse", "HEAD"]));
  assert.equal(view.acceptance.status, "not_accepted");
  assert.deepEqual(f.read(), view);
  assert.equal(readFileSync(path.join(f.runRoot, "events.jsonl"), "utf8"), before);
  assert.deepEqual(readDeliveryLedger(f.runRoot), state);
});

test("acceptance requires a matching host event and survives cleanup only for the verified canonical revision", async t => {
  const f = await fixture(t);
  acceptDelivery(f.runId, { ...f.options, acceptedBy: "user" });
  const accepted = f.read();
  assert.equal(accepted.acceptance.status, "accepted");
  assert.equal(accepted.candidate.reason, "workspace-unavailable");
  assert.ok(["verified", "awaiting_operator"].includes(accepted.verification.status));
  writeFileSync(path.join(f.project, "AGENTS.md"), "# Changed product\n");
  const stale = f.read();
  assert.equal(stale.verification.status, "stale");
  assert.equal(stale.acceptance.status, "recorded_for_other_revision");
  const log = path.join(f.runRoot, "events.jsonl");
  writeFileSync(log, readFileSync(log, "utf8").split("\n").filter(line => !line.includes('"type":"delivery_accepted_by_user"')).join("\n"));
  assert.equal(f.read().acceptance.status, "unknown", "a ledger label alone is not acceptance evidence");
});

test("a verified build branch is distinguished from the unchanged canonical checkout", async t => {
  const f = await fixture(t), worktree = path.join(f.runRoot, "worktree");
  writeFileSync(path.join(worktree, "result.txt"), "New build artifact\n");
  git(worktree, ["add", "."]); git(worktree, ["commit", "-m", "synthetic improvement"]);
  transitionDelivery(f.runRoot, "correcting", { nextAction: "recheck_changed_result" });
  await runDeliveryLoop({ ...f.options, runId: f.runId, runRoot: f.runRoot, plan: f.plan, projectPath: f.project, hostOnly: true,
    buildExecutor: new FunctionBuildExecutor(async () => { throw new Error("No build dispatch is allowed"); }), trialBackend: "local" });
  const candidate = f.read();
  assert.equal(candidate.verification.status, "stale");
  assert.ok(["verified", "awaiting_operator"].includes(candidate.candidate.status));
  assert.notEqual(candidate.verification.head, candidate.candidate.head);
  // The fixture explicitly adopts the commit; the read model never merges it.
  git(f.project, ["merge", "--ff-only", `pritha/build-${f.runId}`]);
  assert.ok(["verified", "awaiting_operator"].includes(f.read().verification.status));
  assert.equal(f.read().acceptance.status, "not_accepted");
});

test("changed commands, result locks and workspace bindings cannot become current verification", async t => {
  for (const mutation of ["plan", "result", "worktree", "contract"]) {
    const f = await fixture(t);
    if (mutation === "contract") {
      writeFileSync(f.contractPath, readFileSync(f.contractPath, "utf8").replace("agent_kind: one-shot-cli", "agent_kind: library"));
      assert.equal(f.read().verification.reason, "outcome-approval-not-current");
      continue;
    }
    const file = mutation === "plan" ? path.join(f.runRoot, "trial-plan.json") : mutation === "worktree" ? path.join(f.runRoot, "delivery-worktree.json") : path.join(f.runRoot, readDeliveryLedger(f.runRoot).last_trial_result.path);
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (mutation === "plan") value.trials[0].argv = ["node", "unapproved.mjs"];
    if (mutation === "result") value.counts.passed = 999;
    if (mutation === "worktree") value.worktree = f.project;
    writeFileSync(file, JSON.stringify(value));
    assert.equal(f.read().verification.status, "unknown", mutation);
    assert.equal(f.read().acceptance.status, "not_accepted");
  }
});

test("a forged Markdown completion report never supplies missing host evidence", async t => {
  const f = await fixture(t), reports = path.join(f.stateRoot, "agents/reports");
  mkdirSync(reports, { recursive: true });
  writeFileSync(path.join(reports, "forged.md"), "---\ntype: agent-delivery-report\nagent_id: readiness-fixture\nstatus: accepted\nupdated: 2099-01-01\n---\n# Accepted\n");
  rmSync(path.join(f.runRoot, "build-state.json"));
  const view = f.read();
  assert.equal(view.run, null);
  assert.equal(view.verification.status, "unverified");
  assert.equal(view.acceptance.status, "not_accepted");
  assert.equal(existsSync(path.join(f.runRoot, "build-state.json")), false, "GET does not recover a missing ledger");
});

test("incomplete revision coverage remains unknown even when a past acceptance exists", async t => {
  const f = await fixture(t);
  acceptDelivery(f.runId, { ...f.options, acceptedBy: "user" });
  git(f.project, ["update-index", "--assume-unchanged", "AGENTS.md"]);
  const view = f.read();
  assert.equal(view.verification.status, "unknown");
  assert.equal(view.verification.reason, "revision-unavailable");
  assert.equal(view.acceptance.status, "unknown");
  assert.ok(view.acceptance.at, "retain the recorded acceptance date without assuming revision compatibility");
});

test("bounded host worker returns the same evidence and coalesces concurrent reads", async t => {
  const f = await fixture(t);
  const [left, right] = await Promise.all([readAgentResultReadinessAsync("readiness-fixture", f.options), readAgentResultReadinessAsync("readiness-fixture", f.options)]);
  assert.deepEqual(left, right);
  assert.ok(Date.parse(left.observedAt));
  const { observedAt: _time, ...value } = left;
  assert.deepEqual(value, f.read());
  const invalid = await readAgentResultReadinessAsync("readiness-fixture", { ...f.options, timeoutMs: "private-input" });
  assert.equal(invalid.verification.reason, "invalid-readiness-timeout-policy");
  assert.doesNotMatch(JSON.stringify(invalid), /private-input/);
});

test("host worker deadlines and stderr never become successful evidence or raw UI errors", async t => {
  const f = await fixture(t), codeRoot = path.join(f.root, "synthetic-host");
  const worker = path.join(codeRoot, "scripts/agents-mother/result-readiness-worker.mjs");
  mkdirSync(path.dirname(worker), { recursive: true });
  writeFileSync(worker, "process.stderr.write('sensitive fixture detail'); setInterval(()=>{},1000);\n");
  const start = Date.now();
  const result = await readAgentResultReadinessAsync("readiness-fixture", { ...f.options, codeRoot, timeoutMs: 100 });
  assert.equal(result.verification.status, "unknown");
  assert.equal(result.verification.reason, "readiness-timeout");
  assert.ok(Date.now() - start < 2000);
  assert.doesNotMatch(JSON.stringify(result), /sensitive fixture detail|synthetic-host/);
  rmSync(worker);
  const missing = await readAgentResultReadinessAsync("readiness-fixture", { ...f.options, codeRoot });
  assert.equal(missing.verification.status, "unknown");
});

test("bounded worker queue gives later cards a turn and includes queue time in the deadline", async t => {
  const f = await fixture(t), codeRoot = path.join(f.root, "synthetic-queue-host");
  const worker = path.join(codeRoot, "scripts/agents-mother/result-readiness-worker.mjs");
  mkdirSync(path.dirname(worker), { recursive: true });
  writeFileSync(worker, `let input = ''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => {
    const request = JSON.parse(input);
    if (request.target.startsWith('hang')) return setInterval(() => {}, 1000);
    setTimeout(() => process.stdout.write(JSON.stringify({ schema: 'pritha-result-readiness-v1', agentId: request.target,
      verification: { status: 'unverified' }, acceptance: { status: 'not_accepted' } })), 30);
  });\n`);
  const reads = Array.from({ length: 12 }, (_, i) => readAgentResultReadinessAsync(`card-${i}`, { ...f.options, codeRoot }));
  const results = await Promise.all(reads);
  assert.deepEqual(results.map(result => result.agentId), Array.from({ length: 12 }, (_, i) => `card-${i}`));
  const start = Date.now();
  const held = Array.from({ length: 4 }, (_, i) => readAgentResultReadinessAsync(`hang-${i}`, { ...f.options, codeRoot, timeoutMs: 300 }));
  const queued = await readAgentResultReadinessAsync("queued-timeout", { ...f.options, codeRoot, timeoutMs: 100 });
  assert.equal(queued.verification.reason, "readiness-timeout");
  assert.ok(Date.now() - start < 2000);
  await Promise.all(held);
  const recovered = await readAgentResultReadinessAsync("later-card", { ...f.options, codeRoot });
  assert.equal(recovered.agentId, "later-card");
});
