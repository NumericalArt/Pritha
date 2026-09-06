import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { readDeliveryUsage, readParentUsage, readTrialUsage, recordParentUsage, recordTrialUsage } from "../scripts/agents-mother/phase-usage.mjs";

const task = { chatId: "chat_fixture", providerId: "desktop_bundled", nativeThreadId: "native-fixture", stateIdentityHash: "storage-v2:fixture" };
function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-phase-usage-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), runRoot = path.join(stateRoot, "builds/fixture/run-fixture");
  mkdirSync(root);mkdirSync(runRoot, { recursive: true });
  const state = createDeliveryLedger(runRoot, { runId: "run-fixture", agentSlug: "fixture", targetKey: "fixture-target", spec: { id: "fixture-spec", semanticLock: "fixture", documentLock: "fixture", contractFingerprint: "fixture", approvalId: "fixture-approval" } }).state;
  const plan = { spec_id: state.spec.id, trials: [] };
  writeFileSync(path.join(runRoot, "trial-plan.json"), JSON.stringify(plan));
  const planLock = `sha256:${createHash("sha256").update(JSON.stringify(plan)).digest("hex")}`;
  return { parent, root, stateRoot, runRoot, state, planLock, options: { root, stateRoot } };
}
function receipts(f) {
  const parent = path.join(f.stateRoot, "codex-chat/usage");
  return readdirSync(parent).flatMap(dir => readdirSync(path.join(parent, dir)).filter(file => file.endsWith(".json")).map(file => path.join(parent, dir, file)));
}
const observation = { attemptId: "message-1", turnId: "turn-1", turnStatus: "running", counterTotal: 100, runtimeVersion: "codex/fixture-1", modelRequested: "fixture-model", effortRequested: "high" };

test("native cumulative snapshots are deduplicated across events, turns and provider aliases", t => {
  const f = fixture(t);
  recordParentUsage(task, observation, f.options);
  const file = receipts(f)[0], before = readFileSync(file, "utf8");
  recordParentUsage(task, observation, f.options);
  assert.equal(readFileSync(file, "utf8"), before);
  recordParentUsage(task, { ...observation, attemptId: "message-2", turnId: "turn-2", counterTotal: 250 }, f.options);
  recordParentUsage({ ...task, providerId: "standalone_cli" }, { ...observation, attemptId: "message-2", turnId: "turn-2", counterTotal: 250 }, f.options);
  const view = readParentUsage(task, f.options);
  assert.equal(view.observedTokens, 250, "100 then cumulative 250 is not 350 or 600");
  assert.equal(view.observedTurns, 2);
  assert.equal(view.coverage, "partial", "observed snapshots do not claim complete historic coverage");
  assert.equal(view.allocation, "whole-native-thread-unallocated");
  assert.deepEqual(view.runtimeVersions, ["codex/fixture-1"]);
});

test("failed and interrupted attempts without usage remain unknown, never free", t => {
  const f = fixture(t);
  recordParentUsage(task, { attemptId: "failed-request", turnStatus: "dispatching" }, f.options);
  recordParentUsage(task, { attemptId: "failed-request", turnId: "failed-turn", turnStatus: "failed" }, f.options);
  recordParentUsage(task, { attemptId: "failed-request", turnId: "failed-turn", turnStatus: "running" }, f.options);
  let view = readParentUsage(task, f.options);
  assert.equal(view.observedTokens, null);assert.equal(view.unknownAttempts, 1);
  assert.equal(JSON.parse(readFileSync(receipts(f)[0], "utf8")).turnStatus, "failed", "a delayed event does not revive a terminal attempt");
  recordParentUsage(task, { attemptId: "failed-request", turnId: "failed-turn", counterTotal: 300 }, f.options);
  view = readParentUsage(task, f.options);assert.equal(view.observedTokens, 300);assert.equal(view.unknownAttempts, 0);
});

test("counter regression and unavailable metadata remain explicit instead of reducing observed spend", t => {
  const f = fixture(t);
  recordParentUsage(task, observation, f.options);
  recordParentUsage(task, { ...observation, counterTotal: 20, runtimeVersion: null, modelRequested: null }, f.options);
  const view = readParentUsage(task, f.options);
  assert.equal(view.observedTokens, 100);assert.equal(view.counterRegression, true);
  const row = JSON.parse(readFileSync(receipts(f)[0], "utf8"));
  assert.equal(row.runtimeVersion, "codex/fixture-1");assert.equal(row.modelRequested, "fixture-model");assert.equal(row.modelObserved, null);
});

test("invalid observations cannot become zero or enter another native task", t => {
  const f = fixture(t);
  for (const counterTotal of [-1, "0", 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) assert.throws(() => recordParentUsage(task, { ...observation, counterTotal }, f.options), /usage_counter_invalid/);
  recordParentUsage(task, observation, f.options);
  assert.throws(() => recordParentUsage(task, { ...observation, turnId: "different-turn" }, f.options), /usage_turn_conflict/);
  assert.equal(readParentUsage({ ...task, nativeThreadId: "other-native" }, f.options).observedTokens, null);
  assert.equal(readParentUsage({ ...task, stateIdentityHash: "storage-v2:other" }, f.options).observedTokens, null);
});

test("damaged or foreign usage evidence is visible as unknown and never overwritten", t => {
  const f = fixture(t);recordParentUsage(task, observation, f.options);
  const file = receipts(f)[0], row = JSON.parse(readFileSync(file, "utf8"));
  row.counterTotal = "0";writeFileSync(file, JSON.stringify(row));
  let view = readParentUsage(task, f.options);assert.equal(view.observedTokens, null);assert.equal(view.receiptIssues, 1);
  assert.throws(() => recordParentUsage(task, observation, f.options), /usage_counter_invalid/);
  row.counterTotal = 100;row.identity.threadId = "another-thread";writeFileSync(file, JSON.stringify(row));
  assert.throws(() => recordParentUsage(task, observation, f.options), /usage_identity_conflict/);
  view = readParentUsage(task, f.options);assert.equal(view.observedTokens, null);assert.equal(view.receiptIssues, 1);
});

test("phase receipt writers reject foreign paths and symlinked instance storage", t => {
  const f = fixture(t), foreign = path.join(f.parent, "foreign");mkdirSync(foreign);
  const attempt = { attemptId: "attempt-1", trialId: "smoke", runId: f.state.run_id, planLock: `sha256:${"a".repeat(64)}`, status: "dispatching" };
  assert.throws(() => recordTrialUsage(foreign, attempt, f.options), /usage_path_outside_instance/);
  const parent = path.join(f.stateRoot, "codex-chat");symlinkSync(foreign, parent);
  assert.throws(() => recordParentUsage(task, observation, f.options), /usage_path_symlink/);
  assert.deepEqual(readdirSync(foreign), []);
});

test("Trial invocation receipts preserve unknown model spend separately from terminal command evidence", t => {
  const f = fixture(t), attempt = { attemptId: "trial-pass-1", trialId: "smoke", runId: f.state.run_id, planLock: f.planLock, status: "dispatching", backend: "local", runtimeVersion: "node/fixture", commandHash: `sha256:${"b".repeat(64)}` };
  recordTrialUsage(f.runRoot, attempt, f.options);
  let view = readTrialUsage(f.runRoot, f.state, f.options);
  assert.equal(view.unconfirmedTerminals, 1);assert.equal(view.tokensUsed, null);
  recordTrialUsage(f.runRoot, { ...attempt, status: "completed", terminalObserved: true }, f.options);
  recordTrialUsage(f.runRoot, { ...attempt, status: "completed", terminalObserved: true }, f.options);
  view = readTrialUsage(f.runRoot, f.state, f.options);
  assert.equal(view.attempts, 1);assert.equal(view.unconfirmedTerminals, 0);assert.equal(view.unknownAttempts, 1);assert.equal(view.tokensUsed, null);
  recordTrialUsage(f.runRoot, { ...attempt, attemptId: "trial-pass-2", status: "unknown" }, f.options);
  assert.equal(readTrialUsage(f.runRoot, f.state, f.options).attempts, 2);
  writeFileSync(path.join(f.runRoot, "trial-plan.json"), JSON.stringify({ trials: ["substituted plan"] }));
  const substituted = readTrialUsage(f.runRoot, f.state, f.options);
  assert.equal(substituted.attempts, 0);assert.equal(substituted.receiptIssues, 2, "a copied run identifier cannot rebind receipts to another approved plan");
});

test("a shared parent, build observations and uninstrumented Trials never create a fabricated run total", t => {
  const f = fixture(t);recordParentUsage(task, observation, f.options);
  const view = readDeliveryUsage(f.runRoot, f.state, task, f.options);
  assert.equal(view.parent.observedTokens, 100);assert.equal(view.build.tokensUsed, 0);
  assert.equal(view.totalTokens, null);assert.equal(view.other.tokensUsed, null);assert.equal(view.trials.tokensUsed, null);
  const legacy = readTrialUsage(f.runRoot, { ...f.state, last_trial_result: { path: "old-evidence.json" } }, f.options);
  assert.equal(legacy.legacyEvidenceUnaccounted, true);assert.equal(legacy.coverage, "not-observed");
});
