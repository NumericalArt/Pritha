import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import readline from "node:readline";
import { resolveTechscopeRoot } from "@/lib/realtime/pritha-runtime";

type RpcMessage = {
  id?: string | number;
  method?: string;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type RawRateLimitWindow = {
  usedPercent?: unknown;
  resetsAt?: unknown;
  windowDurationMins?: unknown;
};

type RawCreditsSnapshot = {
  balance?: unknown;
  hasCredits?: unknown;
  unlimited?: unknown;
};

type RawRateLimitSnapshot = {
  credits?: unknown;
  limitId?: unknown;
  limitName?: unknown;
  planType?: unknown;
  primary?: unknown;
  rateLimitReachedType?: unknown;
  secondary?: unknown;
};

type RawRateLimitsResponse = {
  rateLimits?: unknown;
  rateLimitsByLimitId?: unknown;
};

export type CodexRateLimitWindow = {
  usedPercent: number;
  remainingPercent: number;
  resetsAt: number | null;
  resetAtIso: string | null;
  windowDurationMins: number | null;
  label: string;
};

export type CodexRateLimitSnapshot = {
  credits: {
    balance: string | null;
    hasCredits: boolean;
    unlimited: boolean;
  } | null;
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: CodexRateLimitWindow | null;
  rateLimitReachedType: string | null;
  secondary: CodexRateLimitWindow | null;
};

export type CodexRateLimitsProbe = {
  status: "ready" | "unavailable" | "error";
  source: "codex_app_server";
  detail: string;
  checkedAt: string;
  rateLimits: CodexRateLimitSnapshot | null;
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot> | null;
  commands: {
    dashboardUrl: string;
    appStatus: string;
    cliStatus: string;
    cliUsageDaily: string;
    cliUsageWeekly: string;
    cliUsageCumulative: string;
  };
};

let cachedProbe: { expiresAt: number; value: CodexRateLimitsProbe } | null = null;
let cachedCodexAppServerBin: string | null | undefined;

export async function readCodexRateLimits(options: { force?: boolean } = {}): Promise<CodexRateLimitsProbe> {
  if (!options.force && cachedProbe && cachedProbe.expiresAt > Date.now()) return cachedProbe.value;

  const value = await runCodexRateLimitsProbe();
  cachedProbe = { expiresAt: Date.now() + 30_000, value };
  return value;
}

function codexBin() {
  const configured =
    process.env.PRITHA_REALTIME_CODEX_BIN?.trim() || process.env.TECHSCOPE_VOICE_CODEX_BIN?.trim() || process.env.CODEX_BIN?.trim();
  if (configured) return configured;
  if (cachedCodexAppServerBin !== undefined) return cachedCodexAppServerBin || "codex";

  const candidates = [
    "codex",
    "/Applications/Codex.app/Contents/Resources/codex",
    process.env.HOME ? `${process.env.HOME}/Applications/Codex.app/Contents/Resources/codex` : "",
    process.env.HOME ? `${process.env.HOME}/.codex/plugins/.plugin-appserver/codex` : "",
  ].filter(Boolean);

  cachedCodexAppServerBin = candidates.find((candidate) => codexSupportsAppServer(candidate)) || null;
  return cachedCodexAppServerBin || "codex";
}

async function runCodexRateLimitsProbe(): Promise<CodexRateLimitsProbe> {
  if (process.env.PRITHA_CODEX_LIMITS_PROBE === "0" || process.env.PRITHA_CODEX_LIMITS_PROBE === "false") {
    return unavailableProbe("Codex limits probe is disabled by PRITHA_CODEX_LIMITS_PROBE.");
  }

  const selectedCodexBin = codexBin();
  if (!codexSupportsAppServer(selectedCodexBin)) {
    return unavailableProbe(
      `Codex app-server unavailable: ${selectedCodexBin} does not support the app-server command. Set PRITHA_REALTIME_CODEX_BIN to the Codex.app bundled binary.`,
    );
  }

  const connection = new RateLimitsAppServerConnection(selectedCodexBin, resolveTechscopeRoot());
  try {
    await connection.start(8_000);
    await connection.request(
      "initialize",
      {
        clientInfo: { name: "pritha-control-center-limits", version: "0.1" },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
          optOutNotificationMethods: ["thread/tokenUsage/updated"],
        },
      },
      8_000,
    );
    const result = normalizeRateLimitsResponse(await connection.request("account/rateLimits/read", null, 10_000));
    const hasSnapshot = Boolean(result.rateLimits || (result.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length));
    return {
      ...baseProbe(),
      status: hasSnapshot ? "ready" : "unavailable",
      detail: hasSnapshot
        ? "Live read-only limits from Codex App Server. Pritha uses the available Codex session and does not store Codex credentials."
        : "Codex App Server responded, but no rate-limit snapshot was returned.",
      rateLimits: result.rateLimits,
      rateLimitsByLimitId: result.rateLimitsByLimitId,
    };
  } catch (error) {
    return {
      ...baseProbe(),
      status: "error",
      detail: `Machine-readable Codex limits unavailable: ${error instanceof Error ? error.message : "unknown app-server error"}`,
      rateLimits: null,
      rateLimitsByLimitId: null,
    };
  } finally {
    connection.close();
  }
}

function baseProbe(): CodexRateLimitsProbe {
  return {
    status: "unavailable",
    source: "codex_app_server",
    detail: "Use the Codex usage dashboard or Codex slash commands until machine-readable limits are available.",
    checkedAt: new Date().toISOString(),
    rateLimits: null,
    rateLimitsByLimitId: null,
    commands: {
      dashboardUrl: "https://chatgpt.com/codex/settings/usage",
      appStatus: "/status",
      cliStatus: "/status",
      cliUsageDaily: "/usage daily",
      cliUsageWeekly: "/usage weekly",
      cliUsageCumulative: "/usage cumulative",
    },
  };
}

function unavailableProbe(detail: string): CodexRateLimitsProbe {
  return {
    ...baseProbe(),
    status: "unavailable",
    detail,
  };
}

function codexSupportsAppServer(bin: string) {
  if (bin.includes("/") && !existsSync(bin)) return false;
  const result = spawnSync(bin, ["app-server", "--help"], {
    env: codexEnv(),
    encoding: "utf8",
    timeout: 3_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return result.status === 0 && output.includes("Usage: codex app-server");
}

function normalizeRateLimitsResponse(value: unknown) {
  const raw = asObject(value) as RawRateLimitsResponse | null;
  const rateLimits = normalizeSnapshot(raw?.rateLimits);
  const rawByLimitId = asObject(raw?.rateLimitsByLimitId);
  const rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot> = {};
  if (rawByLimitId) {
    for (const [key, snapshot] of Object.entries(rawByLimitId)) {
      const normalized = normalizeSnapshot(snapshot);
      if (normalized) rateLimitsByLimitId[key] = normalized;
    }
  }

  return {
    rateLimits,
    rateLimitsByLimitId: Object.keys(rateLimitsByLimitId).length ? rateLimitsByLimitId : null,
  };
}

function normalizeSnapshot(value: unknown): CodexRateLimitSnapshot | null {
  const raw = asObject(value) as RawRateLimitSnapshot | null;
  if (!raw) return null;
  const credits = asObject(raw.credits) as RawCreditsSnapshot | null;
  return {
    credits: credits
      ? {
          balance: stringOrNull(credits.balance),
          hasCredits: Boolean(credits.hasCredits),
          unlimited: Boolean(credits.unlimited),
        }
      : null,
    limitId: stringOrNull(raw.limitId),
    limitName: stringOrNull(raw.limitName),
    planType: stringOrNull(raw.planType),
    primary: normalizeWindow(raw.primary),
    rateLimitReachedType: stringOrNull(raw.rateLimitReachedType),
    secondary: normalizeWindow(raw.secondary),
  };
}

function normalizeWindow(value: unknown): CodexRateLimitWindow | null {
  const raw = asObject(value) as RawRateLimitWindow | null;
  const usedPercent = numberOrNull(raw?.usedPercent);
  if (!raw || usedPercent === null) return null;
  const windowDurationMins = numberOrNull(raw.windowDurationMins);
  const resetsAt = numberOrNull(raw.resetsAt);
  return {
    usedPercent,
    remainingPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
    resetsAt,
    resetAtIso: resetsAt === null ? null : new Date(resetsAt * 1000).toISOString(),
    windowDurationMins,
    label: windowDurationLabel(windowDurationMins),
  };
}

function windowDurationLabel(minutes: number | null) {
  if (minutes === 300) return "5h window";
  if (minutes === 10080) return "weekly window";
  if (minutes === null) return "window";
  if (minutes % 1440 === 0) return `${minutes / 1440}d window`;
  if (minutes % 60 === 0) return `${minutes / 60}h window`;
  return `${minutes}m window`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberOrNull(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function codexEnv() {
  const env = { ...process.env };
  if (process.env.PRITHA_REALTIME_CODEX_USE_PROXY === "1" || process.env.TECHSCOPE_VOICE_CODEX_USE_PROXY === "1") return env;
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    delete env[key];
  }
  env.NO_PROXY = env.NO_PROXY || "127.0.0.1,localhost";
  env.no_proxy = env.no_proxy || env.NO_PROXY;
  if (!env.TERM || env.TERM === "dumb") env.TERM = "xterm-256color";
  return env;
}

class RateLimitsAppServerConnection {
  private child: ReturnType<typeof spawn> | null = null;
  private nextId = 1;
  private pending = new Map<string | number, PendingRequest>();

  constructor(private readonly bin: string, private readonly cwd: string) {}

  start(timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.bin, ["app-server", "--listen", "stdio://"], {
        cwd: this.cwd,
        env: codexEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Codex App Server startup timed out"));
      }, timeoutMs);
      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.stderr.on("data", () => undefined);
      readline.createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    });
  }

  request(method: string, params: unknown, timeoutMs: number) {
    const stdin = this.child?.stdin;
    if (!stdin?.writable) return Promise.reject(new Error("Codex App Server is not running"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  close() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    this.child?.stdin?.end();
    this.child?.kill("SIGTERM");
    this.child = null;
  }

  private handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: RpcMessage;
    try {
      message = JSON.parse(trimmed) as RpcMessage;
    } catch {
      return;
    }
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message || `${pending.method} failed`));
    else pending.resolve(message.result);
  }
}
