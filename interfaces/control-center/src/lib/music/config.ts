import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type MusicRuntimeConfig = {
  root: string;
  storageRoot: string;
  tracksRoot: string;
  indexPath: string;
  aceStepBaseUrl: string;
  aceStepApiKey: string;
  aceStepModel: string;
  aceStepThinking: boolean;
  audioFormat: "mp3" | "flac" | "opus" | "aac" | "wav" | "wav32";
  defaultDurationSec: number;
  maxDurationSec: number;
  pollIntervalMs: number;
  generationTimeoutMs: number;
  cacheMaxBytes: number;
  cacheMaxTracks: number;
  defaultStyle: string;
};

let envLoaded = false;

export function resolvePrithaRoot() {
  if (process.env.TECHSCOPE_ROOT) {
    const envRoot = path.resolve(process.env.TECHSCOPE_ROOT);
    if (existsSync(envRoot)) return envRoot;
  }

  let cursor = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(cursor, "AGENTS.md")) && existsSync(path.join(cursor, "11_agents"))) return cursor;
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }

  return process.cwd();
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadMusicRuntimeEnv() {
  if (envLoaded) return;
  envLoaded = true;
  const root = resolvePrithaRoot();
  loadEnvFile(path.join(root, ".env"));
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const extraEnvFile = process.env.PRITHA_CONTROL_CENTER_ENV_FILE;
  if (extraEnvFile) loadEnvFile(path.resolve(extraEnvFile));
}

export function musicEnv(name: string, fallback = "") {
  loadMusicRuntimeEnv();
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(musicEnv(name, String(fallback)));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(value, max));
}

function boolEnv(name: string, fallback: boolean) {
  const value = musicEnv(name, fallback ? "true" : "false").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function audioFormat(value: string): MusicRuntimeConfig["audioFormat"] {
  const normalized = value.toLowerCase();
  if (["mp3", "flac", "opus", "aac", "wav", "wav32"].includes(normalized)) {
    return normalized as MusicRuntimeConfig["audioFormat"];
  }
  return "mp3";
}

export function getMusicRuntimeConfig(): MusicRuntimeConfig {
  const root = resolvePrithaRoot();
  const storageRoot = path.join(root, ".private", "interface-lab", "pritha-control-center", "music");
  const maxDurationSec = numberEnv("ACE_STEP_MAX_DURATION_SEC", 120, 30, 120);

  return {
    root,
    storageRoot,
    tracksRoot: path.join(storageRoot, "tracks"),
    indexPath: path.join(storageRoot, "index.json"),
    aceStepBaseUrl: musicEnv("ACE_STEP_BASE_URL", musicEnv("ACESTEP_BASE_URL", "http://127.0.0.1:8001")).replace(/\/$/, ""),
    aceStepApiKey: musicEnv("ACE_STEP_API_KEY", musicEnv("ACESTEP_API_KEY", "")),
    aceStepModel: musicEnv("ACE_STEP_MODEL", musicEnv("ACESTEP_MODEL", "acestep-v15-turbo")),
    aceStepThinking: boolEnv("ACE_STEP_THINKING", true),
    audioFormat: audioFormat(musicEnv("ACE_STEP_AUDIO_FORMAT", "mp3")),
    defaultDurationSec: Math.min(numberEnv("ACE_STEP_DEFAULT_DURATION_SEC", 60, 30, 120), maxDurationSec),
    maxDurationSec,
    pollIntervalMs: numberEnv("ACE_STEP_POLL_INTERVAL_MS", 1000, 250, 10_000),
    generationTimeoutMs: numberEnv("ACE_STEP_GENERATION_TIMEOUT_MS", 120_000, 10_000, 600_000),
    cacheMaxBytes: numberEnv("MUSIC_CACHE_MAX_BYTES", 500 * 1024 * 1024, 10 * 1024 * 1024, 5 * 1024 * 1024 * 1024),
    cacheMaxTracks: numberEnv("MUSIC_CACHE_MAX_TRACKS", 100, 1, 500),
    defaultStyle: musicEnv("MUSIC_DEFAULT_STYLE", "calm organ ambient instrumental background music"),
  };
}

export function clampMusicDuration(value: unknown, config = getMusicRuntimeConfig()) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return config.defaultDurationSec;
  return Math.max(30, Math.min(Math.round(numeric), config.maxDurationSec));
}
