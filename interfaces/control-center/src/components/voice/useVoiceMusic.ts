"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MusicMode = "off" | "auto" | "on";
type MusicGenerationStatus = "idle" | "queued" | "generating" | "failed";

type PublicGeneratedTrack = {
  id: string;
  style: string;
  normalizedStyle: string;
  prompt: string;
  localUrl: string;
  durationSec: number;
  createdAt: string;
  aceTaskId: string;
  aceFileUrl: string;
  audioFormat: string;
  sizeBytes: number;
  seed?: number;
  metadata?: Record<string, unknown>;
};

type MusicControlArgs = {
  action?: unknown;
  style?: unknown;
  volume?: unknown;
  mode?: unknown;
};

type MusicSlot = {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  track?: PublicGeneratedTrack;
};

type CodexTaskLike = {
  status: string;
};

const MUSIC_NORMAL_DB = -18;
const MUSIC_DUCK_DB = -42;
const MUSIC_OFF_DB = -80;
const DUCK_ATTACK_SEC = 0.08;
const RELEASE_DELAY_MS = 1800;
const RELEASE_TIME_SEC = 2.5;
const FADE_OUT_SEC = 0.4;
const CROSSFADE_SEC = 2;
const ASSISTANT_SPEECH_RMS_THRESHOLD = 0.012;
const ASSISTANT_SPEECH_HANGOVER_MS = 300;
const DEFAULT_STYLE = "calm organ ambient instrumental background music";

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

function clamp01(value: unknown, fallback = 0.8) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(numeric, 1));
}

function normalizeStyle(value: unknown) {
  return String(value || DEFAULT_STYLE).replace(/\s+/g, " ").trim().slice(0, 180) || DEFAULT_STYLE;
}

function taskIsBusy(task: CodexTaskLike) {
  const status = String(task.status || "").toLowerCase();
  if (!status) return false;
  if (status === "queued" || status === "running") return true;
  if (status === "decision_required" || status === "waiting_for_operator") return false;
  if (status === "complete" || status === "rejected" || status.startsWith("failed")) return false;
  return true;
}

function publicTrackFromPayload(value: unknown): PublicGeneratedTrack | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const track = value as Partial<PublicGeneratedTrack>;
  if (!track.id || !track.localUrl) return undefined;
  return track as PublicGeneratedTrack;
}

export type VoiceMusicState = {
  controlEnabled: boolean;
  mode: MusicMode;
  desiredStyle: string;
  userVolume: number;
  generationStatus: MusicGenerationStatus;
  currentTrack?: PublicGeneratedTrack;
  isPlaying: boolean;
  assistantSpeaking: boolean;
  userSpeaking: boolean;
  agentBusy: boolean;
  error?: string;
};

export function useVoiceMusicController({
  codexTasks,
  logClientEvent,
}: {
  codexTasks: CodexTaskLike[];
  logClientEvent?: (kind: string, payload?: Record<string, unknown>) => void;
}) {
  const [state, setState] = useState<VoiceMusicState>({
    controlEnabled: false,
    mode: "auto",
    desiredStyle: DEFAULT_STYLE,
    userVolume: 0.8,
    generationStatus: "idle",
    isPlaying: false,
    assistantSpeaking: false,
    userSpeaking: false,
    agentBusy: false,
  });

  const stateRef = useRef(state);
  const audioContextRef = useRef<AudioContext | null>(null);
  const slotsRef = useRef<[MusicSlot, MusicSlot] | null>(null);
  const activeSlotIndexRef = useRef(0);
  const releaseTimerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const lastAutoBusyRef = useRef(false);
  const analyserFrameRef = useRef<number | null>(null);
  const assistantMeterRef = useRef<{
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    speaking: boolean;
    lastVoiceAt: number;
  } | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patchState = useCallback((patch: Partial<VoiceMusicState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      stateRef.current = next;
      return next;
    });
  }, []);

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  const targetGain = useCallback(() => {
    const current = stateRef.current;
    const shouldBeAudible =
      current.controlEnabled &&
      !current.error &&
      (current.mode === "on" || (current.mode === "auto" && current.agentBusy));
    if (!shouldBeAudible || current.mode === "off") return dbToGain(MUSIC_OFF_DB);
    const normal = dbToGain(MUSIC_NORMAL_DB) * clamp01(current.userVolume);
    if (current.assistantSpeaking || current.userSpeaking) return Math.min(normal, dbToGain(MUSIC_DUCK_DB));
    return normal;
  }, []);

  const rampSlot = useCallback((slot: MusicSlot | undefined, value: number, seconds: number) => {
    if (!slot || !audioContextRef.current) return;
    const now = audioContextRef.current.currentTime;
    slot.gain.gain.cancelScheduledValues(now);
    slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
    slot.gain.gain.linearRampToValueAtTime(value, now + seconds);
  }, []);

  const applyTargetGain = useCallback((seconds = RELEASE_TIME_SEC) => {
    const slots = slotsRef.current;
    if (!slots) return;
    const target = targetGain();
    rampSlot(slots[activeSlotIndexRef.current], target, seconds);
  }, [rampSlot, targetGain]);

  const ensureAudioContext = useCallback(async () => {
    if (audioContextRef.current && slotsRef.current) {
      if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume().catch(() => undefined);
      return audioContextRef.current;
    }

    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("web_audio_unavailable");
    const context = new AudioContextCtor();
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    const makeSlot = (): MusicSlot => {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = "auto";
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(context.destination);
      return { audio, source, gain };
    };
    audioContextRef.current = context;
    slotsRef.current = [makeSlot(), makeSlot()];
    return context;
  }, []);

  const stopMusic = useCallback(() => {
    clearReleaseTimer();
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    const slots = slotsRef.current;
    if (!slots) {
      patchState({ isPlaying: false });
      return;
    }
    for (const slot of slots) rampSlot(slot, dbToGain(MUSIC_OFF_DB), FADE_OUT_SEC);
    stopTimerRef.current = window.setTimeout(() => {
      for (const slot of slots) {
        slot.audio.pause();
        slot.audio.currentTime = 0;
      }
      patchState({ isPlaying: false });
    }, FADE_OUT_SEC * 1000 + 80);
  }, [clearReleaseTimer, patchState, rampSlot]);

  const playTrack = useCallback(async (track: PublicGeneratedTrack) => {
    await ensureAudioContext();
    const slots = slotsRef.current;
    if (!slots) return;
    const oldIndex = activeSlotIndexRef.current;
    const nextIndex = oldIndex === 0 ? 1 : 0;
    const oldSlot = slots[oldIndex];
    const nextSlot = slots[nextIndex];
    nextSlot.track = track;
    nextSlot.audio.src = track.localUrl;
    nextSlot.audio.currentTime = 0;
    nextSlot.gain.gain.value = 0;
    await nextSlot.audio.play().catch((error) => {
      throw new Error(error instanceof Error ? error.message : "music_playback_failed");
    });
    activeSlotIndexRef.current = nextIndex;
    rampSlot(oldSlot, 0, CROSSFADE_SEC);
    rampSlot(nextSlot, targetGain(), CROSSFADE_SEC);
    window.setTimeout(() => {
      oldSlot.audio.pause();
      oldSlot.audio.removeAttribute("src");
      oldSlot.audio.load();
      oldSlot.track = undefined;
    }, CROSSFADE_SEC * 1000 + 100);
    patchState({ currentTrack: track, isPlaying: true, generationStatus: "idle", error: undefined });
  }, [ensureAudioContext, patchState, rampSlot, targetGain]);

  const pollGeneration = useCallback(
    (generationId: string, expectedStyle: string) => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(() => {
        const params = new URLSearchParams({ generation_id: generationId, style: expectedStyle });
        void fetch(`/api/music/state?${params.toString()}`, { cache: "no-store" })
          .then((response) => response.json())
          .then(async (payload: { generation?: { status?: string; track?: unknown; error?: string } }) => {
            const generation = payload.generation;
            if (!generation) return;
            if (generation.status === "failed") {
              if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              patchState({ generationStatus: "failed", error: generation.error || "music_generation_failed" });
              return;
            }
            if (generation.status === "complete") {
              if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              const track = publicTrackFromPayload(generation.track);
              if (track && stateRef.current.controlEnabled && stateRef.current.desiredStyle === expectedStyle) {
                await playTrack(track);
              }
            }
          })
          .catch(() => undefined);
      }, 2000);
    },
    [patchState, playTrack],
  );

  const ensureTrack = useCallback(
    async (style: string, forceFresh = false) => {
      const current = stateRef.current;
      if (!current.controlEnabled) return { ok: false, error: "music_control_disabled" };
      const desiredStyle = normalizeStyle(style);
      patchState({ desiredStyle, generationStatus: "queued", error: undefined });
      const response = await fetch("/api/music/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: desiredStyle, forceFresh }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "music_generate_non_json" }))) as {
        ok?: boolean;
        status?: string;
        track?: unknown;
        generationId?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        patchState({ generationStatus: "failed", error: payload.error || `music_generate_failed_${response.status}` });
        return payload;
      }
      const track = publicTrackFromPayload(payload.track);
      if (track) await playTrack(track);
      if (payload.generationId) {
        patchState({ generationStatus: payload.status === "generating" ? "generating" : "queued" });
        pollGeneration(payload.generationId, desiredStyle);
      }
      return payload;
    },
    [patchState, playTrack, pollGeneration],
  );

  const recomputeDucking = useCallback(
    (release = false) => {
      clearReleaseTimer();
      const current = stateRef.current;
      if (!current.controlEnabled || current.mode === "off") {
        applyTargetGain(FADE_OUT_SEC);
        return;
      }
      if (current.userSpeaking || current.assistantSpeaking) {
        applyTargetGain(DUCK_ATTACK_SEC);
        return;
      }
      if (release) {
        releaseTimerRef.current = window.setTimeout(() => applyTargetGain(RELEASE_TIME_SEC), RELEASE_DELAY_MS);
      } else {
        applyTargetGain(RELEASE_TIME_SEC);
      }
    },
    [applyTargetGain, clearReleaseTimer],
  );

  const setControlEnabled = useCallback(
    (enabled: boolean) => {
      patchState({ controlEnabled: enabled, error: undefined });
      logClientEvent?.("voice_music_control_gate", { enabled });
      if (!enabled) {
        if (stopTimerRef.current !== null) {
          window.clearTimeout(stopTimerRef.current);
          stopTimerRef.current = null;
        }
        const slots = slotsRef.current;
        if (slots) {
          for (const slot of slots) {
            if (audioContextRef.current) {
              slot.gain.gain.cancelScheduledValues(audioContextRef.current.currentTime);
              slot.gain.gain.value = 0;
            }
            slot.audio.pause();
            slot.audio.currentTime = 0;
            slot.audio.removeAttribute("src");
            slot.audio.load();
            slot.track = undefined;
          }
        }
        if (pollTimerRef.current !== null) {
          window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        if (analyserFrameRef.current !== null) {
          window.cancelAnimationFrame(analyserFrameRef.current);
          analyserFrameRef.current = null;
        }
        assistantMeterRef.current?.source.disconnect();
        assistantMeterRef.current = null;
        if (audioContextRef.current) {
          void audioContextRef.current.close().catch(() => undefined);
          audioContextRef.current = null;
          slotsRef.current = null;
        }
        patchState({
          isPlaying: false,
          assistantSpeaking: false,
          userSpeaking: false,
          agentBusy: false,
          generationStatus: "idle",
        });
        lastAutoBusyRef.current = false;
      }
    },
    [logClientEvent, patchState],
  );

  const onUserSpeechStart = useCallback(() => {
    if (!stateRef.current.controlEnabled) return;
    patchState({ userSpeaking: true });
    recomputeDucking(false);
  }, [patchState, recomputeDucking]);

  const onUserSpeechStop = useCallback(() => {
    if (!stateRef.current.controlEnabled) return;
    patchState({ userSpeaking: false });
    recomputeDucking(true);
  }, [patchState, recomputeDucking]);

  const attachAssistantStream = useCallback(
    async (stream: MediaStream | null) => {
      if (!stream || !stateRef.current.controlEnabled) return;
      await ensureAudioContext().catch(() => undefined);
      const context = audioContextRef.current;
      if (!context) return;
      if (assistantMeterRef.current?.stream === stream) return;
      if (analyserFrameRef.current !== null) window.cancelAnimationFrame(analyserFrameRef.current);
      assistantMeterRef.current?.source.disconnect();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const meter = {
        stream,
        source,
        analyser,
        speaking: false,
        lastVoiceAt: 0,
      };
      assistantMeterRef.current = meter;
      const data = new Float32Array(analyser.fftSize);
      const tick = () => {
        const activeMeter = assistantMeterRef.current;
        if (!activeMeter || !stateRef.current.controlEnabled) return;
        activeMeter.analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > ASSISTANT_SPEECH_RMS_THRESHOLD) {
          activeMeter.lastVoiceAt = now;
          if (!activeMeter.speaking) {
            activeMeter.speaking = true;
            patchState({ assistantSpeaking: true });
            recomputeDucking(false);
          }
        } else if (activeMeter.speaking && now - activeMeter.lastVoiceAt > ASSISTANT_SPEECH_HANGOVER_MS) {
          activeMeter.speaking = false;
          patchState({ assistantSpeaking: false });
          recomputeDucking(true);
        }
        analyserFrameRef.current = window.requestAnimationFrame(tick);
      };
      analyserFrameRef.current = window.requestAnimationFrame(tick);
    },
    [ensureAudioContext, patchState, recomputeDucking],
  );

  const handleMusicControl = useCallback(
    async (args: MusicControlArgs) => {
      if (!stateRef.current.controlEnabled) return { ok: false, error: "music_control_disabled" };
      const action = String(args.action || "");
      if (action === "play") {
        const style = normalizeStyle(args.style || stateRef.current.desiredStyle);
        patchState({ mode: "on", desiredStyle: style });
        await ensureTrack(style);
        return { ok: true, status: "playing_or_generating", state: stateRef.current };
      }
      if (action === "stop") {
        patchState({ mode: "off" });
        stopMusic();
        return { ok: true, status: "stopped", state: stateRef.current };
      }
      if (action === "pause") {
        stopMusic();
        return { ok: true, status: "paused", state: stateRef.current };
      }
      if (action === "resume") {
        const style = stateRef.current.desiredStyle;
        if (stateRef.current.mode === "off") patchState({ mode: "on" });
        await ensureTrack(style);
        return { ok: true, status: "resumed", state: stateRef.current };
      }
      if (action === "set_style") {
        if (!args.style) return { ok: false, error: "style_required" };
        const style = normalizeStyle(args.style);
        patchState({ mode: "on", desiredStyle: style });
        await ensureTrack(style, true);
        return { ok: true, status: "style_set_generation_started", state: stateRef.current };
      }
      if (action === "set_volume") {
        if (typeof args.volume !== "number") return { ok: false, error: "volume_required" };
        patchState({ userVolume: clamp01(args.volume) });
        recomputeDucking(false);
        return { ok: true, status: "volume_set", state: stateRef.current };
      }
      if (action === "set_mode") {
        const mode = String(args.mode || "");
        if (mode !== "off" && mode !== "auto" && mode !== "on") return { ok: false, error: "mode_required" };
        patchState({ mode });
        if (mode === "off") stopMusic();
        if (mode === "on" || (mode === "auto" && stateRef.current.agentBusy)) await ensureTrack(stateRef.current.desiredStyle);
        recomputeDucking(false);
        return { ok: true, status: "mode_set", state: stateRef.current };
      }
      return { ok: false, error: "unknown_music_action", action };
    },
    [ensureTrack, patchState, recomputeDucking, stopMusic],
  );

  useEffect(() => {
    const enabled = stateRef.current.controlEnabled;
    const agentBusy = enabled ? codexTasks.some(taskIsBusy) : false;
    const wasBusy = lastAutoBusyRef.current;
    lastAutoBusyRef.current = agentBusy;
    if (stateRef.current.agentBusy !== agentBusy) patchState({ agentBusy });
    if (!enabled) return;
    if (stateRef.current.mode === "auto" && agentBusy && !wasBusy) {
      void ensureTrack(stateRef.current.desiredStyle).catch(() => undefined);
    }
    if (stateRef.current.mode === "auto" && !agentBusy) {
      recomputeDucking(true);
    }
  }, [codexTasks, ensureTrack, patchState, recomputeDucking]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      if (analyserFrameRef.current !== null) window.cancelAnimationFrame(analyserFrameRef.current);
      void audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  return {
    ...state,
    setControlEnabled,
    handleMusicControl,
    attachAssistantStream,
    onUserSpeechStart,
    onUserSpeechStop,
  };
}
