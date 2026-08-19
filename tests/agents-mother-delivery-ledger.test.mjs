import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimDeliveryTarget,
  createDeliveryLedger,
  deliveryLedgerPaths,
  readDeliveryLedger,
  recordDeliveryFailure,
  recoverDeliveryLedger,
  releaseDeliveryTarget,
  targetKey,
  transitionDelivery,
  typedBlocker,
  updateDeliveryLedger,
  validateDeliveryLedger,
} from "../scripts/agents-mother/delivery-ledger.mjs";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-delivery-ledger-"));
  const runRoot = path.join(root, "builds", "alpha", "run-1");
  const project = path.join(root, "project");
  const created = createDeliveryLedger(runRoot, {
    runId: "run-1",
    agentSlug: "alpha",
    targetKey: targetKey(project),
    targetLabel: "alpha",
    spec: {
      id: "alpha-outcome",
      semanticLock: "sha256:semantic",
      documentLock: "sha256:document",
      contractFingerprint: "sha256:contract",
      approvalId: "approval-1",
    },
    createdAt: "2026-08-16T12:00:00.000Z",
  });
  return { root, runRoot, project, created };
}

test("ledger invariant requires exactly one next action or typed blockers in active states", () => {
  const { runRoot } = fixture();
  const state = readDeliveryLedger(runRoot);
  assert.equal(validateDeliveryLedger(state).ok, true);

  assert.equal(validateDeliveryLedger({ ...state, next_action: "", blockers: [] }).ok, false);
  assert.equal(validateDeliveryLedger({
    ...state,
    next_action: "continue",
    blockers: [typedBlocker({
      code: "needs_choice",
      summary: "A choice is needed.",
      question: "Which path should Pritha use?",
      options: [
        { id: "first", label: "First", effect: "Use the first path." },
        { id: "second", label: "Second", effect: "Use the second path." },
      ],
    })],
  }).ok, false);
});

test("typed blockers require one explicit question and bounded answer options", () => {
  assert.throws(() => typedBlocker({ code: "bad", summary: "Bad", question: "Choose", options: [] }), /question.*ending|2 to 5/);
  const blocker = typedBlocker({
    code: "material_choice",
    summary: "Two valid designs change the visible result.",
    question: "Which visible behavior should be used?",
    options: [
      { id: "compact", label: "Compact", effect: "Use the compact interaction." },
      { id: "guided", label: "Guided", effect: "Use the guided interaction." },
    ],
    evidence_refs: ["trial:experience"],
  });
  assert.equal(blocker.options.length, 2);
});

test("updates use CAS versions and recover the latest snapshot from append-only events", () => {
  const { runRoot } = fixture();
  const prepared = transitionDelivery(runRoot, "preparing", { nextAction: "prepare_worktree", updatedAt: "2026-08-16T12:01:00.000Z" });
  assert.equal(prepared.state.version, 2);
  assert.throws(() => updateDeliveryLedger(runRoot, (state) => state, { expectedVersion: 1 }), /expected version 1/);

  const { statePath, eventsPath } = deliveryLedgerPaths(runRoot);
  writeFileSync(statePath, "{corrupt", "utf8");
  const recovered = recoverDeliveryLedger(runRoot);
  assert.equal(recovered.version, 2);
  assert.equal(recovered.status, "preparing");
  assert.equal(readFileSync(eventsPath, "utf8").trim().split("\n").length, 2);
});

test("recovery ignores only a crash-truncated final event line", () => {
  const { runRoot } = fixture();
  transitionDelivery(runRoot, "preparing", { nextAction: "prepare_worktree" });
  const { statePath, eventsPath } = deliveryLedgerPaths(runRoot);
  appendFileSync(eventsPath, '{"schema":"pritha-delivery-event-v1"');
  writeFileSync(statePath, "{corrupt", "utf8");

  const recovered = recoverDeliveryLedger(runRoot);
  assert.equal(recovered.version, 2);
  assert.equal(recovered.status, "preparing");
});

test("one active run may own a delivery target", () => {
  const { root, runRoot, project } = fixture();
  const buildsRoot = path.join(root, "builds");
  const key = targetKey(project);
  const first = claimDeliveryTarget(buildsRoot, { targetKey: key, runId: "run-1", runRoot });
  assert.throws(
    () => claimDeliveryTarget(buildsRoot, { targetKey: key, runId: "run-2", runRoot: path.join(buildsRoot, "alpha", "run-2") }),
    /already owns this target/,
  );
  assert.equal(releaseDeliveryTarget(first.claimPath, "run-1").released, true);
});

test("repeated identical Trial failures become an actionable blocker", () => {
  const { runRoot } = fixture();
  transitionDelivery(runRoot, "preparing", { nextAction: "build" });
  transitionDelivery(runRoot, "building", { nextAction: "verify" });
  transitionDelivery(runRoot, "verifying", { nextAction: "run_trials" });
  const failures = [{ id: "smoke", assertions: [{ type: "exit_code", passed: false }], error: null }];
  const first = recordDeliveryFailure(runRoot, failures);
  transitionDelivery(runRoot, "verifying", { nextAction: "run_trials" });
  const second = recordDeliveryFailure(runRoot, failures);
  transitionDelivery(runRoot, "verifying", { nextAction: "run_trials" });
  const third = recordDeliveryFailure(runRoot, failures);

  assert.equal(first.state.status, "building");
  assert.equal(second.state.status, "building");
  assert.equal(third.state.status, "blocked");
  assert.equal(third.state.next_action, "");
  assert.equal(third.state.blockers[0].code, "repeated_trial_failure");
  assert.equal(third.state.blockers[0].options.length, 3);
});
