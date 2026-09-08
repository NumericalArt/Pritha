import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkCardReadiness } from "../scripts/agents-mother/card-readiness.mjs";
import { FunctionBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { acceptDelivery, runDeliveryLoop } from "../scripts/agents-mother/delivery-loop.mjs";
import { readDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { approveOutcomeSpec, compileOutcomeSpec, reviseOutcomeSpec } from "../scripts/agents-mother/outcome-spec.mjs";
import { resultReadinessFixture } from "./helpers/result-readiness-fixture.mjs";

async function revisedFixture(t, { approve = true } = {}) {
  const f = await resultReadinessFixture(t);
  // Release this synthetic target through the normal lifecycle. Its acceptance
  // must not leak into the next revision's result.
  acceptDelivery(f.runId, { ...f.options, acceptedBy: "user" });
  const date = readFileSync(f.specPath, "utf8").match(/^created: (.+)$/m)[1];
  const revision = reviseOutcomeSpec(f.specPath, { ...f.options, date });
  assert.match(revision.path, /-agent-outcome-spec-2\.md$/);
  const original = readFileSync(f.specPath, "utf8");
  assert.match(original, /^status: superseded$/m);
  if (!approve) return { ...f, revision, original };
  approveOutcomeSpec(revision.path, { ...f.options, approvedBy: "user" });
  const compiled = compileOutcomeSpec(revision.path, { ...f.options, runId: "readiness-revision-2" });
  const result = await runDeliveryLoop({ ...f.options, ...compiled, projectPath: f.project,
    hostOnly: true, trialBackend: "local",
    buildExecutor: new FunctionBuildExecutor(async () => { throw new Error("No model dispatch in a readiness test"); }) });
  assert.ok(["verified", "awaiting_acceptance"].includes(result.state.status));
  return { ...f, ...compiled, revision, original };
}

test("same-day approved revision supplies both card and result readiness without rewriting history", async t => {
  const f = await revisedFixture(t);
  const reports = path.join(f.stateRoot, "agents", "reports");
  mkdirSync(reports, { recursive: true });
  const checkpoint = path.join(reports, "old-checkpoint.md");
  const checkpointText = "---\ntype: agent-delivery-report\nagent_id: readiness-fixture\nstatus: blocked\nupdated: 2099-01-01\n---\n# Historical checkpoint\n";
  writeFileSync(checkpoint, checkpointText, "utf8");
  const events = readFileSync(path.join(f.runRoot, "events.jsonl"), "utf8");
  const state = readFileSync(path.join(f.runRoot, "build-state.json"), "utf8");
  const view = f.read();
  assert.equal(view.run.id, f.runId);
  assert.ok(["verified", "awaiting_operator"].includes(view.verification.status));
  assert.equal(view.verification.counts.passed, f.plan.counts.automated);
  assert.equal(view.acceptance.status, "not_accepted");
  const card = await checkCardReadiness("readiness-fixture", { ...f.options, baseUrl: false });
  assert.equal(path.resolve(f.root, card.lifecycle.outcome.path), f.revision.path);
  assert.equal(card.lifecycle.outcome.approved, true);
  assert.deepEqual(card.lifecycle.delivery, { present: true, id: f.runId,
    status: readDeliveryLedger(f.runRoot).status, source: "delivery-ledger" });
  assert.equal(card.resultReadiness.run.id, f.runId);
  assert.doesNotMatch(card.nextActions.join("\n"), /review and approve|from blocked/i);
  assert.equal(readFileSync(f.specPath, "utf8"), f.original);
  assert.equal(readFileSync(checkpoint, "utf8"), checkpointText);
  assert.equal(readFileSync(path.join(f.runRoot, "events.jsonl"), "utf8"), events);
  assert.equal(readFileSync(path.join(f.runRoot, "build-state.json"), "utf8"), state);
});

test("revision selection preserves freshness, evidence locks and approval checks", async t => {
  const f = await revisedFixture(t);
  writeFileSync(path.join(f.project, "AGENTS.md"), "# Changed canonical product\n", "utf8");
  assert.equal(f.read().verification.status, "stale");
  assert.equal(f.read().acceptance.status, "not_accepted");
  const resultPath = path.join(f.runRoot, readDeliveryLedger(f.runRoot).last_trial_result.path);
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  result.counts.passed = 999;
  writeFileSync(resultPath, JSON.stringify(result), "utf8");
  assert.equal(f.read().verification.reason, "evidence-invalid-or-unavailable");
  writeFileSync(f.revision.path, readFileSync(f.revision.path, "utf8") + "\nUnapproved change\n", "utf8");
  assert.equal(f.read().verification.reason, "outcome-approval-not-current");
  assert.equal(f.read().acceptance.status, "not_accepted");
});

test("a draft revision cannot reuse a superseded Outcome's accepted result", async t => {
  const f = await revisedFixture(t, { approve: false });
  const view = f.read();
  assert.equal(view.run, null);
  assert.equal(view.verification.status, "unverified");
  assert.equal(view.acceptance.status, "not_accepted");
  const card = await checkCardReadiness("readiness-fixture", { ...f.options, baseUrl: false });
  assert.equal(card.lifecycle.outcome.approved, false);
  assert.equal(card.resultReadiness.acceptance.status, "not_accepted");
});
