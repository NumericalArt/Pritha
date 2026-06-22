import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const settingsRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
const codexSettingsSource = readFileSync("interfaces/control-center/src/components/settings/CodexSettingsSection.tsx", "utf8");

test("Codex task planning settings are persisted and exposed through runtime settings", () => {
  for (const key of [
    "codexPlanningMode",
    "codexExecutionMode",
    "codexMaxPlanSteps",
    "codexAskBeforeOrchestration",
    "codexVoiceProgressVerbosity",
  ]) {
    assert.match(runtimeSource, new RegExp(`${key}:`), `${key} should have a runtime default`);
    assert.match(settingsRouteSource, new RegExp(`${key}`), `${key} should be accepted by the settings API`);
    assert.match(codexSettingsSource, new RegExp(`${key}`), `${key} should be configurable from the Codex settings UI`);
  }

  assert.match(runtimeSource, /codexExecutionMode: "inline_only"/, "safe default should keep execution inline until the operator enables orchestration");
});

test("Codex App tasks write plan and voice feedback artifacts", () => {
  assert.match(runtimeSource, /function codexTaskPlanPath\(taskDir: string\)/);
  assert.match(runtimeSource, /function codexTaskVoiceFeedbackPath\(taskDir: string\)/);
  assert.match(runtimeSource, /plan_path: rootRelative\(root, planPath\)/);
  assert.match(runtimeSource, /voice_feedback_path: rootRelative\(root, voiceFeedbackPath\)/);
  assert.match(runtimeSource, /latest_voice_feedback/);
  assert.match(runtimeSource, /speakable_events/);
});

test("Realtime instructions prefer semantic voice feedback over heartbeat", () => {
  assert.match(runtimeSource, /Prefer latest_voice_feedback and speakable_events over heartbeat/);
  assert.match(runtimeSource, /Never read heartbeat as the main progress update/);
  assert.match(runtimeSource, /plan_created, planning_fallback, fallback_started, stale_repaired, mode_selected, step_started, step_completed or step_blocked/);
});

test("Step orchestrator remains policy gated", () => {
  assert.match(runtimeSource, /chooseCodexExecutionModeForPlan/);
  assert.match(runtimeSource, /settings\.codexExecutionMode === "inline_only"\) return "inline_progress"/);
  assert.match(runtimeSource, /settings\.codexExecutionMode === "orchestrator_enabled"/);
  assert.match(runtimeSource, /settings\.codexExecutionMode === "orchestrator_preferred"/);
});

test("Planner operator questions do not leave non-actionable active task cards", () => {
  assert.doesNotMatch(
    runtimeSource,
    /status: "waiting_for_operator",\s+phase: "operator_question"/,
    "operator questions should complete with a question result instead of leaving an active wait card",
  );
  assert.match(runtimeSource, /status: "complete",\s+phase: "operator_question"/);
  assert.match(runtimeSource, /operator_question_terminal: true/);
  assert.match(runtimeSource, /Codex task needs operator input before execution/);
});
