import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildBackgroundMusicPrompt,
  normalizeMusicStyleKey,
} from "../interfaces/control-center/src/lib/music/prompt-builder.ts";
import { normalizeMusicSourceSettings } from "../interfaces/control-center/src/lib/music/settings.ts";
import {
  computeMusicDucking,
  computeMusicOutputGain,
  dbToGain,
  MAX_MUSIC_LEVEL_PERCENT,
  MAX_MUSIC_USER_VOLUME,
  musicControlVolumeArgToUserVolume,
  musicSourceCapabilities,
  musicPercentToUserVolume,
  musicUserVolumeToElementVolume,
  musicUserVolumeToPercent,
  MUSIC_DUCK_DB,
  MUSIC_NORMAL_DB,
  normalizeMusicUserVolume,
} from "../interfaces/control-center/src/lib/music/volume.ts";

const aceStepClientSource = readFileSync("interfaces/control-center/src/lib/music/ace-step-client.ts", "utf8");
const queueSource = readFileSync("interfaces/control-center/src/lib/music/queue.ts", "utf8");
const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const voiceMusicSource = readFileSync("interfaces/control-center/src/components/voice/useVoiceMusic.ts", "utf8");
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

test("music source settings default to SomaFM", () => {
  const settings = normalizeMusicSourceSettings({});
  assert.equal(settings.defaultSource, "somafm");
  assert.equal(settings.somafm.defaultChannelId, "groovesalad");
  assert.equal(normalizeMusicSourceSettings({ defaultSource: "library" }).defaultSource, "library");
  assert.equal(normalizeMusicSourceSettings({ defaultSource: "invalid" }).defaultSource, "somafm");
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
  assert.match(runtimeSource, /Background music control is enabled/);
  assert.match(runtimeSource, /enum: \["somafm", "library", "ace-step"\]/);
  assert.match(runtimeSource, /set_channel/);
  assert.match(runtimeSource, /repeat_all/);
  assert.match(runtimeSource, /buildRealtimeSessionConfig\(options: RealtimeSessionBuildOptions = \{\}\)/);
});

test("music volume supports boosted voice control above standard level", () => {
  assert.match(runtimeSource, /maximum:\s*100/);
  assert.match(runtimeSource, /0 to 100/);
  assert.match(runtimeSource, /Use 100 for maximum/);
  assert.match(runtimeSource, /Volume uses 0\.\.100 percent/);
  assert.match(runtimeSource, /volume 0, not 5/);
  assert.doesNotMatch(runtimeSource, /Volume uses 0\.\.2/);
  assert.doesNotMatch(runtimeSource, /maximum boosted level/);
  assert.equal(MAX_MUSIC_USER_VOLUME, 3);
  assert.equal(MAX_MUSIC_LEVEL_PERCENT, 100);
  assert.equal(normalizeMusicUserVolume(0.05), 0.05);
  assert.equal(normalizeMusicUserVolume(0), 0);
  assert.equal(normalizeMusicUserVolume("3"), 3);
  assert.equal(normalizeMusicUserVolume(4), 3);
  assert.equal(musicPercentToUserVolume(0), 0);
  assert.equal(musicPercentToUserVolume(50), 1.5);
  assert.equal(musicPercentToUserVolume(100), 3);
  assert.equal(musicUserVolumeToPercent(0), 0);
  assert.equal(musicUserVolumeToPercent(1.5), 50);
  assert.equal(musicUserVolumeToPercent(3), 100);
  assert.equal(musicUserVolumeToElementVolume(0), 0);
  assert.equal(musicUserVolumeToElementVolume(1.5), 0.5);
  assert.equal(musicUserVolumeToElementVolume(3), 1);
  assert.equal(musicControlVolumeArgToUserVolume(0), 0);
  assert.equal(musicControlVolumeArgToUserVolume(1), 1.5);
  assert.equal(musicControlVolumeArgToUserVolume(2), 3);
  assert.equal(musicControlVolumeArgToUserVolume(50), 1.5);
  assert.equal(musicControlVolumeArgToUserVolume(100), 3);
  assert.match(voiceMusicSource, /normalizeMusicUserVolume/);
  assert.match(voiceMusicSource, /musicControlVolumeArgToUserVolume\(args\.volume\)/);
  assert.match(voiceMusicSource, /level_percent/);
  assert.match(voiceMusicSource, /computeMusicDucking/);
  assert.match(voiceMusicSource, /computeMusicOutputGain/);
  assert.doesNotMatch(voiceMusicSource, /function clamp01/);
});

test("music source capabilities mark SomaFM as external and local/generated as controllable", () => {
  assert.deepEqual(musicSourceCapabilities("somafm"), {
    source: "somafm",
    programmaticVolume: false,
    ducking: false,
    externalStream: true,
  });
  assert.deepEqual(musicSourceCapabilities("somafm-decoded"), {
    source: "somafm-decoded",
    programmaticVolume: true,
    ducking: true,
    externalStream: false,
  });
  assert.equal(musicSourceCapabilities("library").programmaticVolume, true);
  assert.equal(musicSourceCapabilities("ace-step").ducking, true);
  assert.match(voiceMusicSource, /volume_saved_external_stream/);
  assert.match(voiceMusicSource, /programmatic_volume/);
  assert.match(voiceMusicSource, /external_stream/);
});

test("music gain calculation keeps source volume separate from ducking", () => {
  const normal = computeMusicOutputGain({
    controlEnabled: true,
    mode: "on",
    agentBusy: false,
    source: "library",
    userVolume: 3,
    userSpeaking: false,
    assistantSpeaking: false,
  });
  assert.equal(normal.ducking, false);
  assert.equal(normal.programmaticVolume, true);
  assert.equal(normal.sourceVolume, 3);
  assert.equal(normal.duckingGain, dbToGain(MUSIC_NORMAL_DB));
  assert.equal(normal.outputGain, dbToGain(MUSIC_NORMAL_DB) * 3);

  const ducked = computeMusicOutputGain({
    controlEnabled: true,
    mode: "on",
    agentBusy: false,
    source: "ace-step",
    userVolume: 3,
    userSpeaking: true,
    assistantSpeaking: false,
  });
  assert.equal(ducked.ducking, true);
  assert.equal(ducked.sourceVolume, 3);
  assert.equal(ducked.duckingGain, dbToGain(MUSIC_DUCK_DB));
  assert.equal(ducked.outputGain, dbToGain(MUSIC_DUCK_DB) * 3);

  const externalRadio = computeMusicOutputGain({
    controlEnabled: true,
    mode: "on",
    agentBusy: false,
    source: "somafm",
    userVolume: 3,
    userSpeaking: true,
    assistantSpeaking: false,
  });
  assert.equal(externalRadio.programmaticVolume, false);
  assert.equal(externalRadio.externalStream, true);
  assert.equal(externalRadio.duckingSupported, false);
  assert.equal(externalRadio.ducking, false);
  assert.equal(externalRadio.duckingGain, dbToGain(MUSIC_NORMAL_DB));

  const decodedRadio = computeMusicOutputGain({
    controlEnabled: true,
    mode: "on",
    agentBusy: false,
    source: "somafm-decoded",
    userVolume: 3,
    userSpeaking: true,
    assistantSpeaking: false,
  });
  assert.equal(decodedRadio.programmaticVolume, true);
  assert.equal(decodedRadio.externalStream, false);
  assert.equal(decodedRadio.duckingSupported, true);
  assert.equal(decodedRadio.ducking, true);
  assert.equal(decodedRadio.duckingGain, dbToGain(MUSIC_DUCK_DB));

  const silent = computeMusicOutputGain({
    controlEnabled: true,
    mode: "on",
    agentBusy: false,
    userVolume: 0,
    userSpeaking: false,
    assistantSpeaking: false,
  });
  assert.equal(silent.sourceVolume, 0);
  assert.equal(silent.outputGain, 0);

  const off = computeMusicDucking({
    controlEnabled: false,
    mode: "on",
    agentBusy: false,
    userSpeaking: false,
    assistantSpeaking: false,
  });
  assert.equal(off.audible, false);
  assert.equal(off.duckingGain, 0);
});

test("music volume resumes iOS interrupted audio contexts", () => {
  assert.match(voiceMusicSource, /function resumeAudioContextIfNeeded/);
  assert.match(voiceMusicSource, /context\.state === "running" \|\| context\.state === "closed"/);
  assert.match(voiceMusicSource, /audio_context_state_before/);
  assert.match(voiceMusicSource, /voice_music_playback_resume_failed/);
  assert.doesNotMatch(voiceMusicSource, /state === "suspended"\).*resume/s);
});

test("music volume control protects against stuck speech and stale slots", () => {
  assert.match(voiceMusicSource, /USER_SPEECH_FALLBACK_STOP_MS/);
  assert.match(voiceMusicSource, /voice_music_user_speech_fallback_stop/);
  assert.match(voiceMusicSource, /voice_music_volume_settle/);
  assert.match(voiceMusicSource, /rampSlotSourceVolume/);
  assert.match(voiceMusicSource, /rampSlotDuckingGain/);
  assert.match(voiceMusicSource, /mediaSource\.connect\(sourceGain\)/);
  assert.match(voiceMusicSource, /sourceGain\.connect\(duckingGain\)/);
  assert.match(voiceMusicSource, /duckingGain\.connect\(analyser\)/);
  assert.match(voiceMusicSource, /slot_graph_rms/);
  assert.match(voiceMusicSource, /slot_audio_muted/);
  assert.match(voiceMusicSource, /DecodedSomaFmStream/);
  assert.match(voiceMusicSource, /@audio\/decode-mp3/);
  assert.match(voiceMusicSource, /voice_music_somafm_decoded_started/);
  assert.match(voiceMusicSource, /voice_music_somafm_decode_fallback_to_direct/);
  assert.match(voiceMusicSource, /gain_source/);
  assert.match(voiceMusicSource, /decoded_graph_rms/);
  assert.match(voiceMusicSource, /if \(gainParam\) slot\.audio\.volume = 1/);
  assert.match(voiceMusicSource, /musicUserVolumeToElementVolume\(slot\.sourceVolumeValue\)/);
  assert.match(voiceMusicSource, /slot\.audio\.muted = elementVolume <= 0/);
  assert.match(voiceMusicSource, /return await setMusicVolume\(musicControlVolumeArgToUserVolume\(args\.volume\), "voice_control"\)/);
});

test("Voice UI exposes music source volume slider backed by the shared setter", () => {
  assert.match(voicePageSource, /function MusicLevelControl/);
  assert.match(voicePageSource, /aria-label="Music level"/);
  assert.match(voicePageSource, /MAX_MUSIC_LEVEL_PERCENT/);
  assert.match(voicePageSource, /musicPercentToUserVolume/);
  assert.match(voicePageSource, /musicUserVolumeToPercent/);
  assert.match(voicePageSource, /External stream/);
  assert.match(voicePageSource, /Live radio level/);
  assert.match(voicePageSource, /musicStreamKind=\{realtime\.music\.currentItem\?\.streamKind\}/);
  assert.match(voicePageSource, /realtime\.music\.setMusicVolume\(value, "ui"\)/);
  assert.match(voicePageSource, /musicVolume=\{realtime\.music\.userVolume\}/);
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
  assert.match(voicePageSource, /Enable or disable generated music control|Enable or disable/);

  assert.match(voicePageSource, /onMusicToggle/);
  assert.match(voicePageSource, /mobile-voice-secondary/);
  assert.match(voicePageSource, /voice-secondary-control/);
  assert.doesNotMatch(voicePageSource, /MusicCard/);
});
