import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { acquireFileLock } from "../scripts/lib/atomic-file.mjs";
import { applyDeliveryReconciliation, planDeliveryReconciliation } from "../scripts/agents-mother/delivery-reconcile.mjs";
import { deliveryTargetClaimPath, readDeliveryLedger, transitionDelivery, updateDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { resumeDelivery } from "../scripts/agents-mother/delivery-loop.mjs";
import { performTaskDeliveryAction, readTaskDelivery } from "../scripts/agents-mother/task-delivery.mjs";
import { git, resultReadinessFixture as fixture } from "./helpers/result-readiness-fixture.mjs";

function historicalBlock(f) {
  transitionDelivery(f.runRoot, "correcting", { nextAction: "inspect_existing_result" });
  transitionDelivery(f.runRoot, "blocked", { blockers: [{ code: "verification_stale", summary: "Synthetic historical status",
    question: "Recheck the current evidence?", options: [{ id: "verify-only", label: "Verify", effect: "Approved verification" }, { id: "inspect-worktree", label: "Inspect", effect: "Preserve evidence" }] }] });
}
const planFor = f => planDeliveryReconciliation(f.runId, f.options);
const apply = (f, plan) => applyDeliveryReconciliation(f.runId, { ...f.options, planLock: plan.planLock });

test("reconciliation plans without writes and applies the exact facts once without acceptance, Trials or merge", async t => {
  const f = await fixture(t); historicalBlock(f);
  const before = readDeliveryLedger(f.runRoot), eventsFile = path.join(f.runRoot, "events.jsonl");
  const events = readFileSync(eventsFile, "utf8"), files = readdirSync(f.runRoot), head = git(f.project, ["rev-parse", "HEAD"]);
  const plan = planFor(f);
  assert.equal(plan.status, "ready", JSON.stringify(plan.pending));
  assert.equal(plan.acceptance.status, "not_accepted");
  assert.equal(plan.bindings.handoff.status, "not_prepared");
  assert.deepEqual(readdirSync(f.runRoot), files); assert.equal(readFileSync(eventsFile, "utf8"), events);
  const result = apply(f, plan), after = readDeliveryLedger(f.runRoot);
  assert.equal(result.applied, true); assert.equal(result.modelTurns, 0); assert.equal(result.trialInvocations, 0);
  assert.ok(["verified", "awaiting_acceptance"].includes(after.status));
  assert.deepEqual(after.budget, before.budget); assert.deepEqual(after.last_trial_result, before.last_trial_result);
  assert.equal(after.accepted_by, null); assert.equal(git(f.project, ["rev-parse", "HEAD"]), head);
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), true);
  assert.equal(f.read().acceptance.status, "not_accepted");
  const updatedEvents = readFileSync(eventsFile, "utf8"); assert.ok(updatedEvents.startsWith(events));
  assert.equal(updatedEvents.split('"type":"delivery_facts_reconciled"').length - 1, 1);
  assert.equal(apply(f, plan).replayed, true);
  assert.deepEqual(readDeliveryLedger(f.runRoot), after); assert.equal(readFileSync(eventsFile, "utf8"), updatedEvents);
});

test("a changed product, Spec, Trial result or ledger invalidates an already reviewed plan", async t => {
  for (const mutation of ["product", "spec", "trial", "ledger"]) {
    const f = await fixture(t); historicalBlock(f); const plan = planFor(f);
    if (mutation === "product") writeFileSync(path.join(f.project, "AGENTS.md"), "# Changed product\n");
    if (mutation === "spec") writeFileSync(f.specPath, readFileSync(f.specPath, "utf8") + "\nChanged approved specification.\n");
    if (mutation === "trial") {
      const file = path.join(f.runRoot, readDeliveryLedger(f.runRoot).last_trial_result.path);
      const value = JSON.parse(readFileSync(file, "utf8")); value.counts.passed = 999; writeFileSync(file, JSON.stringify(value));
    }
    if (mutation === "ledger") updateDeliveryLedger(f.runRoot, state => ({ ...state, operator_guidance: "New recorded work" }));
    const before = readFileSync(path.join(f.runRoot, "events.jsonl"), "utf8");
    assert.throws(() => apply(f, plan), error => error.code === "reconcile_plan_stale", mutation);
    assert.equal(readFileSync(path.join(f.runRoot, "events.jsonl"), "utf8"), before);
    if (mutation !== "ledger") assert.equal(planFor(f).status, "pending", mutation);
  }
});

test("a verified candidate stays pending until the canonical checkout contains its exact clean revision", async t => {
  const f = await fixture(t), worktree = path.join(f.runRoot, "worktree"), head = git(f.project, ["rev-parse", "HEAD"]);
  writeFileSync(path.join(worktree, "result.txt"), "New candidate result\n");
  git(worktree, ["add", "result.txt"]); git(worktree, ["commit", "-m", "Synthetic candidate"]);
  await resumeDelivery(f.runId, { ...f.options, hostOnly: true }); historicalBlock(f);
  const pending = planFor(f);
  assert.equal(pending.status, "pending"); assert.equal(pending.bindings.candidate.status, "awaiting_operator");
  assert.throws(() => apply(f, pending), error => error.code === "reconcile_evidence_pending");
  assert.equal(git(f.project, ["rev-parse", "HEAD"]), head);
  // Explicit fixture adoption, never performed by reconciliation.
  git(f.project, ["merge", "--ff-only", `pritha/build-${f.runId}`]);
  const adopted = planFor(f); assert.equal(adopted.status, "ready");
  apply(f, adopted); assert.equal(f.read().acceptance.status, "not_accepted");
});

test("handoff preparation is bound to the original task and remains distinct from user acceptance", async t => {
  const f = await fixture(t);
  const task = { chatId: "chat_fixture", providerId: "standalone_cli", nativeThreadId: "fixture-thread", stateIdentityHash: "fixture-storage" };
  const action = kind => ({ runId: f.runId, requestId: `reconcile-${kind}`, action: kind, expectedRevision: readTaskDelivery(f.runId, task, f.options).revision });
  await performTaskDeliveryAction(task, action("bind"), f.options);
  await performTaskDeliveryAction(task, action("prepare_handoff"), f.options);
  historicalBlock(f);
  const plan = planFor(f); assert.equal(plan.bindings.handoff.status, "prepared_for_review");
  apply(f, plan); assert.equal(f.read().acceptance.status, "not_accepted");
  const file = path.join(f.runRoot, "handoff-preparation.json"), value = JSON.parse(readFileSync(file, "utf8"));
  value.bindingHash = "foreign"; value.acceptance = "accepted_by_user"; writeFileSync(file, JSON.stringify(value));
  assert.equal(planFor(f).bindings.handoff.status, "stale_or_unconfirmed");
  assert.equal(planFor(f).acceptance.status, "not_accepted");
});

test("a durable reconciliation event recovers an interrupted receipt and snapshot without duplicate events", async t => {
  const f = await fixture(t); historicalBlock(f); const plan = planFor(f);
  const stateFile = path.join(f.runRoot, "build-state.json"), before = readFileSync(stateFile, "utf8");
  apply(f, plan);
  const eventFile = path.join(f.runRoot, "events.jsonl"), events = readFileSync(eventFile, "utf8");
  const receiptFile = path.join(f.runRoot, `reconcile-${plan.planLock}.json`), receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
  receipt.status = "started"; delete receipt.result; delete receipt.completedAt;
  writeFileSync(receiptFile, JSON.stringify(receipt)); writeFileSync(stateFile, before);
  const replay = apply(f, plan); assert.equal(replay.replayed, true);
  assert.equal(readDeliveryLedger(f.runRoot).status, plan.desiredStatus);
  assert.equal(readFileSync(eventFile, "utf8"), events);
  assert.equal(JSON.parse(readFileSync(receiptFile, "utf8")).status, "completed");
  // A later authorized continuation owns its claim; recovery of the older
  // receipt must not release that claim or overwrite the newer progress.
  transitionDelivery(f.runRoot, "correcting", { nextAction: "new_work" });
  writeFileSync(receiptFile, JSON.stringify(receipt));
  const claimFile = deliveryTargetClaimPath(path.join(f.stateRoot, "builds"), readDeliveryLedger(f.runRoot).target_key);
  const claim = JSON.parse(readFileSync(claimFile, "utf8")); claim.released_at = null; writeFileSync(claimFile, JSON.stringify(claim));
  const newer = readDeliveryLedger(f.runRoot);
  const oldReplay = apply(f, plan); assert.equal(oldReplay.currentStatus, "correcting");
  assert.deepEqual(readDeliveryLedger(f.runRoot), newer);
  assert.equal(JSON.parse(readFileSync(claimFile, "utf8")).released_at, null);
});

test("another executor, a replaced path or a modified receipt cannot authorize reconciliation", async t => {
  const f = await fixture(t); historicalBlock(f); const plan = planFor(f);
  const lock = acquireFileLock(path.join(f.runRoot, "delivery-execution"));
  try { assert.throws(() => apply(f, plan), error => error.code === "delivery_running"); } finally { lock.release(); }
  apply(f, plan);
  const file = path.join(f.runRoot, `reconcile-${plan.planLock}.json`), receipt = JSON.parse(readFileSync(file, "utf8"));
  receipt.plan.desiredStatus = "accepted"; writeFileSync(file, JSON.stringify(receipt));
  assert.throws(() => apply(f, plan), error => error.code === "reconcile_receipt_invalid");
  const stateFile = path.join(f.runRoot, "build-state.json"), external = path.join(f.root, "external-state.json");
  writeFileSync(external, readFileSync(stateFile)); rmSync(stateFile); symlinkSync(external, stateFile);
  assert.throws(() => planFor(f), error => error.code === "evidence_unavailable");
});

test("the public CLI previews and applies the exact reviewed plan with same-plan replay", async t => {
  const f = await fixture(t); historicalBlock(f);
  const cli = args => JSON.parse(execFileSync(process.execPath, ["scripts/pritha.mjs", "delivery", "reconcile", f.runId, ...args], {
    cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TECHSCOPE_ROOT: f.root, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_PARENT: f.agentParent },
  }));
  const plan = cli([]); assert.equal(plan.status, "ready");
  assert.equal(readDeliveryLedger(f.runRoot).status, "blocked");
  assert.equal(cli(["--apply", "--plan-lock", plan.planLock]).applied, true);
  assert.equal(cli(["--apply", "--plan-lock", plan.planLock]).replayed, true);
  assert.equal(readDeliveryLedger(f.runRoot).accepted_by, null);
});
