import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DESKTOP_CODEX_BIN_CANDIDATES = [
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/Applications/Codex.app/Contents/Resources/codex",
] as const;

type CodexBinaryResolverOptions = {
  env?: NodeJS.ProcessEnv;
  existsSync?: (candidate: string) => boolean;
  homeDir?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isDesktopCodexBinary(candidate: string) {
  return /\/(?:ChatGPT|Codex)\.app\/Contents\/Resources\/codex$/.test(candidate);
}

export function desktopCodexBinaryCandidates(homeDir = os.homedir()) {
  return [
    ...DESKTOP_CODEX_BIN_CANDIDATES,
    path.join(homeDir, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
    path.join(homeDir, "Applications", "Codex.app", "Contents", "Resources", "codex"),
  ];
}

export function resolveCodexAppBinary(explicit?: string, options: CodexBinaryResolverOptions = {}) {
  const env = options.env ?? process.env;
  const exists = options.existsSync ?? fs.existsSync;
  const configured = clean(explicit)
    || clean(env.PRITHA_REALTIME_CODEX_BIN)
    || clean(env.TECHSCOPE_VOICE_CODEX_BIN);
  if (configured) return configured;

  const legacy = clean(env.CODEX_BIN);
  if (legacy && isDesktopCodexBinary(legacy)) return legacy;

  return desktopCodexBinaryCandidates(options.homeDir).find((candidate) => exists(candidate)) || "";
}

export function resolveCodexCliBinary(explicit?: string, options: CodexBinaryResolverOptions = {}) {
  const env = options.env ?? process.env;
  const exists = options.existsSync ?? fs.existsSync;
  const configured = clean(explicit)
    || clean(env.PRITHA_REALTIME_CODEX_CLI_BIN)
    || clean(env.TECHSCOPE_VOICE_CODEX_CLI_BIN);
  if (configured) return configured;

  const legacy = clean(env.CODEX_BIN);
  if (legacy && !isDesktopCodexBinary(legacy)) return legacy;

  const homeDir = options.homeDir ?? os.homedir();
  const candidates = [
    path.join(homeDir, ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
  ];
  return candidates.find((candidate) => exists(candidate)) || "codex";
}
