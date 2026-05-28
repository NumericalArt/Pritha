import test from "node:test";
import assert from "node:assert/strict";
import { routeTriggerPhrase } from "../scripts/setup.mjs";

test("setup trigger phrases route to the first-run workflow", () => {
  const routed = routeTriggerPhrase("запусти проект");
  assert.equal(routed.id, "first-run-setup");
  assert.equal(routed.workflow, "07_workflows/first-run-setup.md");
  assert.equal(routed.command, "node scripts/setup.mjs");
});

test("operational trigger phrases route to health and Pritha commands", () => {
  assert.equal(routeTriggerPhrase("health").command, "node scripts/self-test.mjs");
  assert.equal(routeTriggerPhrase("создай агента").command, "node scripts/pritha.mjs interview");
  assert.equal(routeTriggerPhrase("ordinary research note"), null);
});
