import { spawn } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
import { createCodexModelCatalogLoader } from "./codex-model-catalog";

const BUNDLED_CODEX_APP_BIN = "/Applications/Codex.app/Contents/Resources/codex";
const CODEX_MODEL_LIST_TIMEOUT_MS = 3_000;
const CODEX_MODEL_CATALOG_TTL_MS = 5 * 60_000;

type RpcResponse = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

function resolveCodexBinary() {
  const configured = process.env.PRITHA_REALTIME_CODEX_BIN?.trim()
    || process.env.TECHSCOPE_VOICE_CODEX_BIN?.trim()
    || process.env.CODEX_BIN?.trim();
  if (configured) return configured;
  if (fs.existsSync(BUNDLED_CODEX_APP_BIN)) return BUNDLED_CODEX_APP_BIN;
  return "codex";
}

async function requestCodexModelList(timeoutMs = CODEX_MODEL_LIST_TIMEOUT_MS) {
  const child = spawn(resolveCodexBinary(), ["app-server", "--listen", "stdio://"], {
    cwd: process.env.TECHSCOPE_ROOT?.trim() || process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const deadline = Date.now() + timeoutMs;
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  const lines = readline.createInterface({ input: child.stdout });

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };

  child.stdin.on("error", (error) => rejectPending(error));

  const writeNotification = (message: unknown) => new Promise<void>((resolve, reject) => {
    if (!child.stdin.writable || child.stdin.destroyed) {
      reject(new Error("Codex app-server stdin is unavailable"));
      return;
    }
    child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  lines.on("line", (line) => {
    let message: RpcResponse;
    try {
      message = JSON.parse(line) as RpcResponse;
    } catch {
      return;
    }
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message || "Codex app-server request failed"));
    else request.resolve(message.result);
  });

  const request = (method: string, params: unknown) => {
    const id = nextId++;
    const remaining = Math.max(1, deadline - Date.now());
    if (!child.stdin.writable || child.stdin.destroyed) {
      return Promise.reject(new Error("Codex app-server stdin is unavailable"));
    }
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, remaining);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (!error) return;
        const pendingRequest = pending.get(id);
        if (!pendingRequest) return;
        pending.delete(id);
        clearTimeout(pendingRequest.timer);
        pendingRequest.reject(error);
      });
    });
  };

  const spawned = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Codex app-server startup timed out")), Math.max(1, deadline - Date.now()));
    child.once("spawn", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  child.once("close", () => rejectPending(new Error("Codex app-server closed before returning its model catalog")));

  try {
    await spawned;
    await request("initialize", {
      clientInfo: { name: "pritha-control-center", title: "Pritha Control Center", version: "0.1" },
      capabilities: { experimentalApi: true },
    });
    await writeNotification({ method: "initialized", params: {} });
    return await request("model/list", { limit: 100, includeHidden: false });
  } finally {
    lines.close();
    rejectPending(new Error("Codex model catalog request finished"));
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
    const forceKill = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 250);
    forceKill.unref();
    child.once("close", () => clearTimeout(forceKill));
  }
}

const loadCodexModelCatalog = createCodexModelCatalogLoader(
  () => requestCodexModelList(CODEX_MODEL_LIST_TIMEOUT_MS),
  { ttlMs: CODEX_MODEL_CATALOG_TTL_MS },
);

export function getCodexModelCatalog() {
  return loadCodexModelCatalog();
}
