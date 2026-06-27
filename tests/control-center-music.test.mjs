import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildBackgroundMusicPrompt,
  normalizeMusicStyleKey,
} from "../interfaces/control-center/src/lib/music/prompt-builder.ts";

const aceStepClientSource = readFileSync("interfaces/control-center/src/lib/music/ace-step-client.ts", "utf8");
const queueSource = readFileSync("interfaces/control-center/src/lib/music/queue.ts", "utf8");
const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const realtimeHookSource = readFileSync("interfaces/control-center/src/components/voice/usePrithaRealtime.ts", "utf8");
const sessionConfigRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/session-config/route.ts", "utf8");
const voicePageSource = readFileSync("interfaces/control-center/src/components/voice/VoiceControlPage.tsx", "utf8");

test("music prompt builder forces background instrumental intent", () => {
  const prompt = buildBackgroundMusicPrompt("organ");
  assert.match(prompt, /Instrumental-only/);
  assert.match(prompt, /soft pipe organ ambient/);
  assert.match(prompt, /No vocals, no lyrics, no spoken words/);
  assert.equal(normalizeMusicStyleKey("  Organ!!! Ambient  "), "organ ambient");
});

test("ACE-Step client implements documented async API flow", () => {
  assert.match(aceStepClientSource, /parseAceTaskId/);
  assert.match(aceStepClientSource, /JSON\.parse\(result\)/);
  assert.match(aceStepClientSource, /item\.status === 1/);
  assert.match(aceStepClientSource, /row\.status === 2/);
  assert.match(aceStepClientSource, /"\/release_task"/);
  assert.match(aceStepClientSource, /"\/query_result"/);
  assert.match(aceStepClientSource, /const fileUrl = item\.file/);
  assert.match(aceStepClientSource, /fetch\(this\.url\(fileUrl\)/);
  assert.match(aceStepClientSource, /Authorization: `Bearer \$\{this\.config\.aceStepApiKey\}`/);
});

test("Realtime music_control tool is gated by session config", () => {
  assert.match(runtimeSource, /musicControlToolDefinition/);
  assert.match(runtimeSource, /if \(options\.musicControlEnabled\) tools\.push\(musicControlToolDefinition\(\)\)/);
  assert.match(runtimeSource, /Generated background music control is enabled/);
  assert.match(runtimeSource, /buildRealtimeSessionConfig\(options: RealtimeSessionBuildOptions = \{\}\)/);
});

test("music generation queue is single-worker and dedupes active style jobs", () => {
  assert.match(queueSource, /private running = false/);
  assert.match(queueSource, /if \(this\.running\) return/);
  assert.match(queueSource, /while \(this\.pending\.length\)/);
  assert.match(queueSource, /await this\.runner\(job\.request\)/);
  assert.match(queueSource, /findActiveByStyle/);
  assert.match(queueSource, /if \(existing && !request\.forceFresh\) return cloneJob\(existing\)/);
});

test("Voice client handles music_control locally and exposes one compact toggle pattern", () => {
  assert.match(realtimeHookSource, /item\.name === "music_control"/);
  assert.match(realtimeHookSource, /music\.handleMusicControl\(args\)/);
  assert.match(realtimeHookSource, /\/api\/realtime\/session-config/);
  assert.match(realtimeHookSource, /type: payload\.type \|\| "realtime"/);
  assert.match(realtimeHookSource, /musicControlEnabled/);
  assert.match(sessionConfigRouteSource, /type: config\.type/);

  assert.match(voicePageSource, /onMusicToggle/);
  assert.match(voicePageSource, /mobile-voice-secondary/);
  assert.match(voicePageSource, /voice-secondary-control/);
  assert.doesNotMatch(voicePageSource, /MusicCard/);
});
