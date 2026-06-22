import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { CodexReasoningEffort, CodexServiceTier } from "../pritha-runtime";
import type { PrithaCodexTaskClient, PrithaCodexTaskPayload, PrithaCodexTaskRunOptions } from "./types";

type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type CodexAppServerClientOptions = {
  codexBin?: string;
  cwd: string;
  branch?: string;
  registryPath?: string;
  clientName?: string;
  buildSandboxPolicy: (payload: PrithaCodexTaskPayload) => Record<string, unknown>;
  getRuntimeSettings?: () => {
    codexModel: string;
    codexReasoningEffort: CodexReasoningEffort;
    codexServiceTier: CodexServiceTier;
  };
};

const BUNDLED_CODEX_APP_BIN = "/Applications/Codex.app/Contents/Resources/codex";

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "text", "data", "errors", "warnings"],
  properties: {
    status: { enum: ["ok", "error", "decision_required"] },
    text: { type: "string" },
    data: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "refs", "changedFiles", "nextActions", "structuredJson"],
      properties: {
        summary: { type: "string" },
        refs: { type: "array", items: { type: "string" } },
        changedFiles: { type: "array", items: { type: "string" } },
        nextActions: { type: "array", items: { type: "string" } },
        structuredJson: { type: "string" },
      },
    },
    errors: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

export class PrithaCodexAppServerClient implements PrithaCodexTaskClient {
  private readonly codexBin: string;
  private readonly cwd: string;
  private readonly branch: string;
  private readonly registryPath?: string;
  private readonly clientName: string;
  private readonly buildSandboxPolicy: (payload: PrithaCodexTaskPayload) => Record<string, unknown>;
  private readonly getRuntimeSettings?: CodexAppServerClientOptions["getRuntimeSettings"];

  constructor(options: CodexAppServerClientOptions) {
    this.codexBin = resolveCodexBinary(options.codexBin);
    this.cwd = path.resolve(options.cwd);
    this.branch = options.branch || currentBranch(this.cwd);
    this.registryPath = options.registryPath;
    this.clientName = options.clientName || "pritha-voice-control";
    this.buildSandboxPolicy = options.buildSandboxPolicy;
    this.getRuntimeSettings = options.getRuntimeSettings;
  }

  async runTask(payload: PrithaCodexTaskPayload, options: PrithaCodexTaskRunOptions) {
    if (looksLikePath(this.codexBin) && !fs.existsSync(this.codexBin)) {
      throw new Error(`Codex binary not found: ${this.codexBin}`);
    }

    const connection = new AppServerConnection(this.codexBin, this.cwd);
    const startedAt = Date.now();
    let target: { threadId: string; threadName: string } | null = null;
    let turnId = "";
    const emitProgress = async (phase: string, message: string, extra: Record<string, unknown> = {}) => {
      await options.onProgress?.({
        timestamp: new Date().toISOString(),
        phase,
        level: "info",
        message,
        status: "running",
        transport: "codex-app",
        elapsed_ms: Date.now() - startedAt,
        ...extra,
      });
    };

    try {
      await connection.start(options.timeoutMs);
      await emitProgress("codex_app_started", "Codex App sidecar process started.");
      await connection.request(
        "initialize",
        {
          clientInfo: { name: this.clientName, version: "0.1" },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
            optOutNotificationMethods: [
              "thread/tokenUsage/updated",
              "item/reasoning/textDelta",
              "item/reasoning/summaryTextDelta",
            ],
          },
        },
        remainingMs(startedAt, options.timeoutMs),
      );
      await emitProgress("codex_app_initialized", "Codex App sidecar initialized.");

      target = await this.resolveTaskThread(connection, payload, remainingMs(startedAt, options.timeoutMs));
      await emitProgress("thread_resolved", "Codex App task thread resolved.", {
        thread_id: target.threadId,
        thread_name: target.threadName,
      });
      await this.injectThreadReport(connection, target.threadId, buildTaskReport("started", payload, target.threadName), remainingMs(startedAt, options.timeoutMs));
      const runtimeSettings = this.getRuntimeSettings?.();

      const turnResponse = (await connection.request(
        "turn/start",
        {
          threadId: target.threadId,
          input: [{ type: "text", text: buildPrompt(payload), text_elements: [] }],
          cwd: this.cwd,
          model: runtimeSettings?.codexModel || undefined,
          approvalPolicy: "never",
          sandboxPolicy: this.buildSandboxPolicy(payload),
          outputSchema: RESULT_SCHEMA,
          effort: runtimeSettings?.codexReasoningEffort || effortForTask(payload.taskType),
          summary: "none",
          personality: "pragmatic",
        },
        remainingMs(startedAt, options.timeoutMs),
      )) as { turn?: { id?: string; items?: unknown[] } };

      turnId = String(turnResponse.turn?.id || "");
      if (!turnId) throw new Error("Codex app-server did not return a turn id");
      await emitProgress("turn_started", "Codex App turn started; waiting for completion.", { turn_id: turnId });

      const completed = await connection.waitForTurnCompleted(target.threadId, turnId, remainingMs(startedAt, options.timeoutMs));
      await emitProgress("turn_completed", "Codex App turn completed.", { turn_id: turnId, level: "complete", status: "complete" });
      const text = extractAssistantText(completed) || connection.agentTextForTurn(turnId);
      const result = parseCodexJson(text);
      await this.injectThreadReport(connection, target.threadId, buildTaskReport("completed", payload, target.threadName, result, Date.now() - startedAt), remainingMs(startedAt, options.timeoutMs));
      return { ...result, transport: "codex-app" };
    } catch (error) {
      await options.onProgress?.({
        timestamp: new Date().toISOString(),
        phase: "failed",
        level: "error",
        message: error instanceof Error ? error.message : "Codex App task failed.",
        status: "failed",
        transport: "codex-app",
        elapsed_ms: Date.now() - startedAt,
      });
      if (target) {
        await this.injectThreadReport(connection, target.threadId, buildTaskReport("failed", payload, target.threadName, error, Date.now() - startedAt), Math.min(5_000, remainingMs(startedAt, options.timeoutMs)));
      }
      throw error;
    } finally {
      connection.close();
    }
  }

  private async resolveTaskThread(connection: AppServerConnection, payload: PrithaCodexTaskPayload, timeoutMs: number) {
    const overrideThreadId = process.env.PRITHA_CODEX_APP_THREAD_ID?.trim() || process.env.CODEX_APP_THREAD_ID?.trim();
    const reuseControlThread = ["1", "true", "yes"].includes(String(process.env.PRITHA_CODEX_APP_REUSE_CONTROL_THREAD || "").toLowerCase());
    if (overrideThreadId || reuseControlThread) return this.resolveControlThread(connection, timeoutMs);

    const threadName = taskThreadName(this.cwd, this.branch, payload.requestId);
    const thread = await this.startNamedThread(connection, threadName, timeoutMs);
    return { threadId: String(thread.id), threadName };
  }

  private async resolveControlThread(connection: AppServerConnection, timeoutMs: number) {
    const threadName = controlThreadName(this.cwd, this.branch);
    const overrideThreadId = process.env.PRITHA_CODEX_APP_THREAD_ID?.trim() || process.env.CODEX_APP_THREAD_ID?.trim();

    if (overrideThreadId) {
      const thread = await this.resumeThread(connection, overrideThreadId, timeoutMs);
      this.saveThread(threadName, thread);
      return { threadId: String(thread.id), threadName };
    }

    const registered = getVoiceCodexThread({ projectRoot: this.cwd, branch: this.branch, role: "control" }, this.registryPath);
    if (registered?.threadId) {
      try {
        const thread = await this.resumeThread(connection, registered.threadId, timeoutMs);
        this.saveThread(threadName, thread);
        return { threadId: String(thread.id), threadName };
      } catch {
        // Stale registry entries are local hints only.
      }
    }

    const listed = (await connection.request("thread/list", { limit: 20, cwd: this.cwd, archived: false, searchTerm: threadName }, timeoutMs)) as { data?: Array<Record<string, unknown>> };
    const exact = (listed.data || [])
      .filter((thread) => thread.name === threadName && thread.cwd === this.cwd)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
    if (exact?.id) {
      const thread = await this.resumeThread(connection, String(exact.id), timeoutMs);
      this.saveThread(threadName, thread);
      return { threadId: String(thread.id), threadName };
    }

    const thread = await this.startNamedThread(connection, threadName, timeoutMs);
    this.saveThread(threadName, thread);
    return { threadId: String(thread.id), threadName };
  }

  private async startNamedThread(connection: AppServerConnection, threadName: string, timeoutMs: number) {
    const started = (await connection.request(
      "thread/start",
      {
        cwd: this.cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        personality: "pragmatic",
        threadSource: "user",
      },
      timeoutMs,
    )) as { thread?: Record<string, unknown> };
    const thread = started.thread;
    if (!thread?.id) throw new Error("Codex app-server did not create a thread");
    await connection.request("thread/name/set", { threadId: thread.id, name: threadName }, timeoutMs);
    return thread;
  }

  private async resumeThread(connection: AppServerConnection, threadId: string, timeoutMs: number) {
    const resumed = (await connection.request(
      "thread/resume",
      {
        threadId,
        cwd: this.cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        personality: "pragmatic",
      },
      timeoutMs,
    )) as { thread?: Record<string, unknown> };
    if (!resumed.thread?.id) throw new Error(`Codex app-server did not resume thread ${threadId}`);
    return resumed.thread;
  }

  private saveThread(threadName: string, thread: Record<string, unknown>) {
    saveVoiceCodexThread(
      {
        projectRoot: this.cwd,
        projectSlug: projectSlug(this.cwd),
        branch: this.branch,
        role: "control",
        threadName,
        threadId: String(thread.id),
        sessionId: stringOrNull(thread.sessionId),
        updatedAt: new Date().toISOString(),
      },
      this.registryPath,
    );
  }

  private async injectThreadReport(connection: AppServerConnection, threadId: string, report: string, timeoutMs: number) {
    if (process.env.PRITHA_CODEX_APP_THREAD_REPORTS === "0" || process.env.PRITHA_CODEX_APP_THREAD_REPORTS === "false") return;
    try {
      await connection.request(
        "thread/inject_items",
        {
          threadId,
          items: [{ type: "message", role: "user", content: [{ type: "input_text", text: report }] }],
        },
        Math.min(Math.max(1_000, timeoutMs), 5_000),
      );
    } catch {
      // Audit-only thread reports must not block the operator task.
    }
  }
}

class AppServerConnection {
  private child: ReturnType<typeof spawn> | null = null;
  private nextId = 1;
  private pending = new Map<string | number, PendingRequest>();
  private turnWaiters = new Map<string, PendingRequest>();
  private turnErrors = new Map<string, string>();
  private agentText = new Map<string, string>();

  constructor(private readonly codexBin: string, private readonly cwd: string) {}

  start(timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.codexBin, ["app-server", "--listen", "stdio://"], {
        cwd: this.cwd,
        env: codexEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Codex app-server startup timed out"));
      }, Math.min(timeoutMs, 10_000));
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
    if (!stdin?.writable) return Promise.reject(new Error("Codex app-server is not running"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, Math.max(1_000, timeoutMs));
      this.pending.set(id, { resolve, reject, timer });
      stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  waitForTurnCompleted(threadId: string, turnId: string, timeoutMs: number) {
    const key = `${threadId}:${turnId}`;
    const priorError = this.turnErrors.get(key);
    if (priorError) {
      this.turnErrors.delete(key);
      return Promise.reject(new Error(priorError));
    }
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.turnWaiters.delete(key);
        reject(new Error(`Codex app-server turn timed out: ${turnId}`));
      }, Math.max(1_000, timeoutMs));
      this.turnWaiters.set(key, { resolve, reject, timer });
    });
  }

  agentTextForTurn(turnId: string) {
    return this.agentText.get(turnId) || "";
  }

  close() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    for (const waiter of this.turnWaiters.values()) clearTimeout(waiter.timer);
    this.pending.clear();
    this.turnWaiters.clear();
    this.turnErrors.clear();
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
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || "Codex app-server JSON-RPC error"));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "item/agentMessage/delta") {
      const turnId = String(message.params?.turnId || "");
      const delta = String(message.params?.delta || "");
      if (turnId && delta) this.agentText.set(turnId, `${this.agentText.get(turnId) || ""}${delta}`);
      return;
    }
    if (message.method === "error") {
      const threadId = String(message.params?.threadId || "");
      const turnId = String(message.params?.turnId || "");
      const error = asObject(message.params?.error);
      const key = `${threadId}:${turnId}`;
      const waiter = this.turnWaiters.get(key);
      const messageText = String(error?.message || "Codex app-server turn failed");
      if (waiter) {
        this.turnWaiters.delete(key);
        clearTimeout(waiter.timer);
        waiter.reject(new Error(messageText));
      } else if (threadId && turnId) {
        this.turnErrors.set(key, messageText);
      }
      return;
    }
    if (message.method === "turn/completed") {
      const threadId = String(message.params?.threadId || "");
      const turn = asObject(message.params?.turn);
      const turnId = String(turn?.id || "");
      const waiter = this.turnWaiters.get(`${threadId}:${turnId}`);
      if (waiter) {
        this.turnWaiters.delete(`${threadId}:${turnId}`);
        clearTimeout(waiter.timer);
        waiter.resolve(turn);
      }
    }
  }
}

export function checkCodexAppServerAvailable(codexBin: string, cwd: string) {
  const result = spawnSync(codexBin, ["app-server", "--help"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const hasAppServerHelp = /Usage:\s+codex app-server\b/.test(detail) && /--listen\s+<URL>/.test(detail);
  return {
    available: result.status === 0 && hasAppServerHelp && !/unknown|unrecognized|invalid/i.test(detail),
    detail,
  };
}

export function resolveCodexBinary(explicit?: string) {
  const configured = explicit?.trim() || process.env.PRITHA_REALTIME_CODEX_BIN?.trim() || process.env.TECHSCOPE_VOICE_CODEX_BIN?.trim() || process.env.CODEX_BIN?.trim();
  if (configured) return configured;
  if (fs.existsSync(BUNDLED_CODEX_APP_BIN)) return BUNDLED_CODEX_APP_BIN;
  return "codex";
}

function buildPrompt(payload: PrithaCodexTaskPayload) {
  return [
    "You are the Codex App control thread for Pritha Control Center realtime voice.",
    "Complete the task using the current Pritha workspace and the evidence in the payload.",
    "Return JSON only. The final response must match the provided output schema.",
    "Put task-specific structured payload into data.structuredJson as a JSON string.",
    "",
    "Operational constraints:",
    "- Do not expose secrets, tokens, credentials, private memory, runtime queues, or unnecessary raw logs.",
    "- For system_change and implementation tasks, make narrowly scoped code/config/documentation changes and report changed files plus verification.",
    "- For analysis, research, review, and read-only tasks, inspect without changing files unless the payload explicitly grants workspace write.",
    "- For agent_creation tasks, sibling child-agent projects may be created next to Pritha only when requested by the operator.",
    "- If evidence is insufficient, return status=error with a concise explanation and next required data.",
    "",
    "Output schema:",
    JSON.stringify(RESULT_SCHEMA, null, 2),
    "",
    "Task payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildTaskReport(status: "started" | "completed" | "failed", payload: PrithaCodexTaskPayload, threadName: string, resultOrError?: unknown, durationMs?: number) {
  const result = asObject(resultOrError);
  const data = asObject(result?.data);
  const report = {
    marker: "PRITHA_CODEX_APP_TASK_REPORT",
    status,
    request_id: payload.requestId,
    user_id: payload.userId,
    task_type: payload.taskType,
    thread_name: threadName,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs ?? null,
    intent: truncate(payload.userIntent, 600),
    result_status: stringOrNull(result?.status),
    result_text: truncate(String(result?.text || ""), 1_000),
    changed_files: stringArray(data?.changedFiles).slice(0, 20),
    refs: stringArray(data?.refs).slice(0, 20),
    warnings: stringArray(result?.warnings).slice(0, 10),
    errors: status === "failed" ? [truncate(errorMessage(resultOrError), 1_000)] : stringArray(result?.errors).slice(0, 10),
  };
  return [
    "[Pritha Codex App task report]",
    "This is an automatic audit note from the Pritha Voice Control Codex App adapter. No response is required.",
    JSON.stringify(report, null, 2),
  ].join("\n");
}

function parseCodexJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return errorResult("Codex App returned an empty response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
      .map((match) => match[1]?.trim())
      .filter(Boolean)
      .reverse();
    for (const fenced of fencedMatches) {
      try {
        return JSON.parse(fenced as string);
      } catch {
        continue;
      }
    }

    for (const candidate of extractJsonObjects(trimmed).reverse()) {
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
    }

    return {
      status: "error",
      text: trimmed.slice(0, 2_000),
      data: { summary: trimmed.slice(0, 2_000), refs: [], changedFiles: [], nextActions: [], structuredJson: "{}" },
      errors: ["Codex App returned non-JSON output"],
      warnings: [],
    };
  }
}

function extractJsonObjects(text: string) {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function errorResult(message: string) {
  return {
    status: "error",
    text: "",
    data: { summary: "", refs: [], changedFiles: [], nextActions: [], structuredJson: "{}" },
    errors: [message],
    warnings: [],
  };
}

function extractAssistantText(turn: unknown) {
  const turnObject = asObject(turn);
  const items = Array.isArray(turnObject?.items) ? (turnObject.items as unknown[]) : [];
  const messages = items
    .map(asObject)
    .filter((item): item is Record<string, unknown> => item?.type === "agentMessage")
    .map((item) => String(item.text || "").trim())
    .filter(Boolean);
  return messages.at(-1) || "";
}

function currentBranch(cwd: string) {
  const result = spawnSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" });
  return result.stdout?.trim() || "main";
}

function effortForTask(taskType: string) {
  return ["analysis", "research"].includes(taskType) ? "low" : "medium";
}

function remainingMs(startedAt: number, timeoutMs: number) {
  return Math.max(1_000, timeoutMs - (Date.now() - startedAt));
}

function codexEnv() {
  const env = { ...process.env };
  if (process.env.PRITHA_REALTIME_CODEX_USE_PROXY === "1" || process.env.TECHSCOPE_VOICE_CODEX_USE_PROXY === "1") return env;
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    delete env[key];
  }
  env.NO_PROXY = env.NO_PROXY || "127.0.0.1,localhost";
  env.no_proxy = env.no_proxy || env.NO_PROXY;
  return env;
}

type VoiceCodexThreadEntry = {
  projectRoot: string;
  projectSlug: string;
  branch: string;
  role: "control" | "task" | "worktree";
  threadName: string;
  threadId: string;
  sessionId: string | null;
  updatedAt: string;
};

function defaultVoiceCodexRegistryPath() {
  return process.env.PRITHA_VOICE_CODEX_REGISTRY_PATH?.trim() || process.env.VOICE_CODEX_REGISTRY_PATH?.trim() || path.join(os.homedir(), ".config", "voice-codex", "projects.json");
}

function projectSlug(projectRoot: string) {
  return (path.basename(projectRoot).trim() || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function controlThreadName(projectRoot: string, branch: string) {
  return `VC · ${projectSlug(projectRoot)} · ${branch || "main"} · control`;
}

function taskThreadName(projectRoot: string, branch: string, requestId: string) {
  const shortId = (requestId || randomUUID()).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 32);
  return `VC · ${projectSlug(projectRoot)} · ${branch || "main"} · task · ${shortId}`;
}

function registryKey(input: { projectRoot: string; branch: string; role: string }) {
  return `${path.resolve(input.projectRoot)}::${input.branch || "main"}::${input.role}`;
}

function readVoiceCodexRegistry(registryPath = defaultVoiceCodexRegistryPath()) {
  if (!fs.existsSync(registryPath)) return { version: 1, threads: {} as Record<string, VoiceCodexThreadEntry> };
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { threads?: Record<string, VoiceCodexThreadEntry> };
    return { version: 1, threads: parsed.threads && typeof parsed.threads === "object" ? parsed.threads : {} };
  } catch {
    return { version: 1, threads: {} as Record<string, VoiceCodexThreadEntry> };
  }
}

function getVoiceCodexThread(input: { projectRoot: string; branch: string; role: "control" | "task" | "worktree" }, registryPath = defaultVoiceCodexRegistryPath()) {
  return readVoiceCodexRegistry(registryPath).threads[registryKey(input)] || null;
}

function saveVoiceCodexThread(entry: VoiceCodexThreadEntry, registryPath = defaultVoiceCodexRegistryPath()) {
  const registry = readVoiceCodexRegistry(registryPath);
  registry.threads[registryKey({ projectRoot: entry.projectRoot, branch: entry.branch, role: entry.role })] = { ...entry, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return entry;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function looksLikePath(value: string) {
  return value.includes("/") || value.startsWith(".");
}

export function prithaCodexAppResultSchema() {
  return RESULT_SCHEMA;
}
