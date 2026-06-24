import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const typesSource = readFileSync("interfaces/control-center/src/lib/realtime/codex-task/types.ts", "utf8");
const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const appClientSource = readFileSync("interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts", "utf8");
const settingsRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
const codexSettingsSource = readFileSync("interfaces/control-center/src/components/settings/CodexSettingsSection.tsx", "utf8");
const realtimeHookSource = readFileSync("interfaces/control-center/src/components/voice/usePrithaRealtime.ts", "utf8");
const voicePageSource = readFileSync("interfaces/control-center/src/components/voice/VoiceControlPage.tsx", "utf8");

test("Codex task payloads carry a stable thread scope contract", () => {
  assert.match(typesSource, /export type PrithaCodexThreadScopeKind = "agent" \| "pritha" \| "task" \| "control"/);
  assert.match(typesSource, /export type PrithaCodexThreadScope =/);
  assert.match(typesSource, /threadScope\?: PrithaCodexThreadScope/);
  assert.match(runtimeSource, /export type CodexAppThreadRoutingMode = "per_task" \| "control" \| "subject_scoped" \| "subject_scoped_rotate"/);
  assert.match(runtimeSource, /codexAppThreadRoutingMode: "subject_scoped"/);
  assert.match(runtimeSource, /function deriveCodexThreadScope\(args: CodexTaskArgs, task: Record<string, unknown>\): PrithaCodexThreadScope/);
  assert.match(runtimeSource, /subject_kind\?: unknown/);
  assert.match(runtimeSource, /subject_id\?: unknown/);
  assert.match(runtimeSource, /thread_reset\?: unknown/);
});

test("Realtime task creation persists thread scope into request, status, progress and tool output", () => {
  assert.match(runtimeSource, /task\.thread_scope = deriveCodexThreadScope\(args, task\)/);
  assert.match(runtimeSource, /thread_scope: task\.thread_scope/);
  assert.match(runtimeSource, /codex_app_thread_routing_mode: settings\.codexAppThreadRoutingMode/);
  assert.match(runtimeSource, /threadScope: threadScopeValue/);
  assert.match(runtimeSource, /threadReset: task\.thread_reset/);
  assert.match(runtimeSource, /routingMode: getPrithaRuntimeSettings\(\)\.codexAppThreadRoutingMode/);
  assert.match(realtimeHookSource, /threadScope: snapshot\.thread_scope \|\| snapshot\.request\?\.thread_scope \|\| null/);
  assert.match(realtimeHookSource, /threadRoutingMode: snapshot\.codex_app_thread_routing_mode \|\| snapshot\.request\?\.codex_app_thread_routing_mode/);
  assert.match(voicePageSource, /function formatThreadScope\(scope\?: CodexTaskThreadScope \| null\)/);
});

test("Codex App stale repair treats planner and step initialization phases as initialized", () => {
  assert.match(runtimeSource, /phase\.endsWith\("_codex_app_started"\)/);
  assert.match(runtimeSource, /phase\.endsWith\("_codex_app_initialized"\)/);
  assert.match(runtimeSource, /hasCodexAppStarted/);
  assert.match(runtimeSource, /hasCodexAppInitialized/);
  assert.doesNotMatch(
    runtimeSource,
    /!progressPhases\.has\("codex_app_initialized"\)/,
    "orchestrated Codex App tasks emit planning_/step_ prefixed init phases",
  );
});

test("Codex App reconnect errors stay on App transport until final reconnect attempt", () => {
  assert.match(appClientSource, /const CODEX_APP_RECONNECT_FINAL_ATTEMPT = 5/);
  assert.match(appClientSource, /function isTransientCodexReconnectError\(message: string\)/);
  assert.match(appClientSource, /progress\.current < CODEX_APP_RECONNECT_FINAL_ATTEMPT/);
  assert.doesNotMatch(appClientSource, /progress\.current < progress\.total && progress\.current < CODEX_APP_RECONNECT_FINAL_ATTEMPT/);
  assert.match(appClientSource, /const willRetry = message\.params\?\.willRetry === true/);
  assert.match(appClientSource, /if \(willRetry \|\| isTransientCodexReconnectError\(messageText\)\) return;/);
  assert.match(appClientSource, /message\.match\(\/\\bReconnecting\\\.\\\.\\\.\\s\*\(\\d\+\)\\s\*\\\/\\s\*\(\\d\+\)\\b\/i\)/);
});

test("Codex App resolver reuses scoped threads before creating a new task thread", () => {
  assert.match(appClientSource, /resolveNamedTaskThread/);
  assert.match(appClientSource, /resolveScopedThread/);
  assert.match(appClientSource, /resolveRegisteredOrNamedThread/);
  assert.match(appClientSource, /latestVoiceCodexThread/);
  assert.match(appClientSource, /scopedThreadName/);
  assert.match(appClientSource, /\$\{scope\.kind\}:\$\{scope\.id\} · g\$\{scope\.generation \|\| 1\} · \$\{branch \|\| "main"\}/);
  assert.match(appClientSource, /routingMode === "per_task"/);
  assert.match(appClientSource, /routingMode === "control"/);

  const listIndex = appClientSource.indexOf('"thread/list"');
  const startIndex = appClientSource.indexOf("this.startNamedThread(connection, options.threadName");
  assert.ok(listIndex > 0, "resolver should inspect existing Codex App threads by name");
  assert.ok(startIndex > listIndex, "resolver should list/resume before starting a new scoped thread");
});

test("Subject scoped rotation enforces generation changes by turn count and age", () => {
  assert.match(appClientSource, /routingMode === "subject_scoped_rotate"/);
  assert.match(appClientSource, /codexAppThreadMaxTurns/);
  assert.match(appClientSource, /codexAppThreadMaxAgeHours/);
  assert.match(appClientSource, /rotateForTurns/);
  assert.match(appClientSource, /rotateForAge/);
  assert.match(appClientSource, /turnCount: Number\(previous\?\.turnCount \|\| 0\) \+ 1/);
  assert.match(appClientSource, /registryKey\(\{\s*projectRoot: entry\.projectRoot/);
});

test("Thread routing is configurable through the runtime settings API and UI", () => {
  assert.match(settingsRouteSource, /codexAppThreadRoutingMode\?: string/);
  assert.match(settingsRouteSource, /invalid_codex_app_thread_routing_mode/);
  assert.match(settingsRouteSource, /normalizeCodexAppThreadRoutingMode/);
  assert.match(codexSettingsSource, /Thread Routing/);
  assert.match(codexSettingsSource, /value="subject_scoped"/);
  assert.match(codexSettingsSource, /Subject scoped \+ rotation/);
  assert.match(codexSettingsSource, /codexAppThreadMaxTurns/);
  assert.match(codexSettingsSource, /codexAppThreadMaxAgeHours/);
});
