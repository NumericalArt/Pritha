import { spawnSync } from "node:child_process";
import { checkCodexAppServerAvailable, resolveCodexBinary } from "@/lib/realtime/codex-task/codex-app-server-client";
import { resolveTechscopeRoot } from "@/lib/realtime/pritha-runtime";

function codexBin() {
  return resolveCodexBinary();
}

function runCodexVersion() {
  const result = spawnSync(codexBin(), ["--version"], {
    cwd: resolveTechscopeRoot(),
    encoding: "utf8",
    timeout: 5_000,
  });
  return {
    available: result.status === 0,
    detail: result.status === 0 ? (result.stdout || result.stderr || "").trim() : (result.stderr || result.error?.message || "Codex CLI unavailable").trim(),
  };
}

export function getCodexAuthStatus() {
  const root = resolveTechscopeRoot();
  const cli = runCodexVersion();
  const appServer = checkCodexAppServerAvailable(codexBin(), root);
  return {
    codexBin: codexBin(),
    root,
    cli,
    appServer,
    auth: {
      status: "unknown" as const,
      method: "external" as const,
      detail: "Codex authentication is managed by Codex App / CLI. Pritha uses the available Codex session and does not store Codex credentials.",
    },
    commands: {
      chatgptLogin: "codex login",
      deviceLogin: "codex login --device-auth",
      openApp: `codex app ${JSON.stringify(root)}`,
      check: "codex doctor",
    },
  };
}

export function codexLoginPlan(kind: "chatgpt" | "device") {
  const command = kind === "device" ? "codex login --device-auth" : "codex login";
  return {
    ok: true,
    command,
    executionMode: "manual" as const,
    reason: "Run this in a trusted terminal. Pritha does not collect ChatGPT credentials or write Codex auth files from Settings.",
  };
}
