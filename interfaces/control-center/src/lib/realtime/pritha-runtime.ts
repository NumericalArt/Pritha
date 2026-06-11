import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RealtimeToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

type RealtimeSessionResponse = {
  client_secret: {
    value: string;
    expires_at?: number;
  };
};

type RawSessionResponse = {
  client_secret?:
    | {
        value?: string;
        expires_at?: number;
      }
    | string;
  value?: string;
  expires_at?: number;
};

type ProviderErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    type?: string;
    param?: string | null;
  };
};

type MemorySearchRow = {
  id: string;
  type?: string;
  status?: string;
  path: string;
  title?: string;
  heading?: string;
  snippet?: string;
};

type CodexTaskArgs = {
  task?: unknown;
  task_type?: unknown;
  priority?: unknown;
  requires_internet?: unknown;
  expected_result?: unknown;
  operator_confirmation?: unknown;
};

const DEFAULT_MODEL = "gpt-realtime-2";
const DEFAULT_VOICE = "marin";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const DEFAULT_CODEX_TIMEOUT_MS = 300_000;
const MAX_TOOL_TEXT = 8_000;

let envLoaded = false;

export class RealtimeProviderError extends Error {
  status: number;
  providerCode?: string;

  constructor(params: { status: number; providerCode?: string; message: string }) {
    super(params.message);
    this.name = "RealtimeProviderError";
    this.status = params.status;
    this.providerCode = params.providerCode;
  }
}

export function resolveTechscopeRoot() {
  if (process.env.TECHSCOPE_ROOT) return path.resolve(process.env.TECHSCOPE_ROOT);

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
  if (!existsSync(filePath)) return false;
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
  return true;
}

function loadRuntimeEnv() {
  if (envLoaded) return;
  envLoaded = true;
  const root = resolveTechscopeRoot();
  loadEnvFile(path.join(root, ".env"));
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const extraEnvFile = process.env.PRITHA_CONTROL_CENTER_ENV_FILE;
  if (extraEnvFile) loadEnvFile(path.resolve(extraEnvFile));
}

function env(name: string, fallback = "") {
  loadRuntimeEnv();
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function realtimeBaseUrl() {
  return env("OPENAI_REALTIME_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
}

function sqlString(value: unknown) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function ftsQuery(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || String(value ?? "");
}

function compactText(value: unknown, maxChars = MAX_TOOL_TEXT) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function rootRelative(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function isPathInsideOrSame(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function memoryDbPath(root = resolveTechscopeRoot()) {
  return path.join(root, ".memory", "techscope.sqlite");
}

function sqliteCliAvailable() {
  const result = spawnSync("sqlite3", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0;
}

function sqliteJson(sql: string) {
  const root = resolveTechscopeRoot();
  const result = spawnSync("sqlite3", ["-json", memoryDbPath(root), sql], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "sqlite3 failed").trim());
  }
  const output = result.stdout.trim();
  return output ? (JSON.parse(output) as unknown[]) : [];
}

function readScalar(text: string, key: string) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "");
}

function firstHeading(text: string) {
  const match = text.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function markdownFiles(root: string) {
  const directories = [
    "00_inbox",
    "01_sources",
    "02_briefs",
    "03_reviews",
    "04_standards",
    "05_decisions",
    "07_workflows",
    "10_wiki",
    "11_agents",
    "12_marketing",
  ];
  const files: string[] = [];

  function visit(directory: string) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (entry.endsWith(".md")) files.push(absolute);
    }
  }

  for (const directory of directories) visit(path.join(root, directory));
  return files.sort();
}

function markdownFallbackSearch(query: string, limit: number): MemorySearchRow[] {
  const root = resolveTechscopeRoot();
  const terms = ftsQuery(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return [];

  const rows: Array<MemorySearchRow & { score: number }> = [];
  for (const filePath of markdownFiles(root)) {
    const text = readFileSync(filePath, "utf8");
    const lower = text.toLowerCase();
    const score = terms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);
    if (!score) continue;
    const firstTerm = terms.find((term) => lower.includes(term)) || terms[0];
    const index = Math.max(0, lower.indexOf(firstTerm));
    const start = Math.max(0, index - 160);
    const snippet = compactText(text.slice(start, index + 360), 520);
    rows.push({
      id: path.basename(filePath, ".md"),
      path: rootRelative(root, filePath),
      type: readScalar(text, "type"),
      status: readScalar(text, "status"),
      title: firstHeading(text) || path.basename(filePath, ".md"),
      snippet,
      score,
    });
  }

  return rows.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}

function memoryStats() {
  if (!existsSync(memoryDbPath()) || !sqliteCliAvailable()) return [];
  return sqliteJson(`
SELECT 'documents' AS name, COUNT(*) AS count FROM documents
UNION ALL SELECT 'chunks', COUNT(*) FROM chunks
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'relations', COUNT(*) FROM relations
UNION ALL SELECT 'embeddings', COUNT(*) FROM embeddings;
`);
}

function recentItems(limit = 8) {
  return sqliteJson(`
SELECT id, type, status, path, title, updated_at
FROM documents
ORDER BY COALESCE(NULLIF(updated_at, ''), indexed_at) DESC, path
LIMIT ${Math.max(1, Math.min(Number(limit) || 8, 30))};
`);
}

function openItems(limit = 8) {
  return sqliteJson(`
SELECT id, type, status, path, title
FROM documents
WHERE status IN ('new', 'draft', 'proposed')
  AND type != 'template'
ORDER BY type, path
LIMIT ${Math.max(1, Math.min(Number(limit) || 8, 30))};
`);
}

function ftsSearch(query: string, limit = 6) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 6, 12));
  if (!query.trim()) return [];
  return sqliteJson(`
SELECT d.id, d.type, d.status, d.path, d.title, c.heading,
       snippet(chunks_fts, 0, '[', ']', ' ... ', 18) AS snippet
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.chunk_id
JOIN documents d ON d.id = chunks_fts.document_id
WHERE chunks_fts MATCH ${sqlString(ftsQuery(query))}
ORDER BY rank
LIMIT ${cappedLimit};
`) as MemorySearchRow[];
}

function findDocument(identifier: unknown) {
  const idOrPath = String(identifier || "").trim();
  if (!idOrPath) return null;
  const rows = sqliteJson(`
SELECT id, path, type, status, title, updated_at
FROM documents
WHERE id = ${sqlString(idOrPath)}
   OR path = ${sqlString(idOrPath)}
LIMIT 1;
`);
  return (rows[0] as { id: string; path: string; type?: string; status?: string; title?: string; updated_at?: string }) || null;
}

async function readArtifact(identifier: unknown, maxChars = 8_000) {
  const root = resolveTechscopeRoot();
  const doc = existsSync(memoryDbPath(root)) && sqliteCliAvailable() ? findDocument(identifier) : null;
  const requestedPath = String(identifier || "").trim();
  const relative = doc?.path || requestedPath;
  const fullPath = path.resolve(root, relative);

  if (!relative || !isPathInsideOrSame(root, fullPath)) {
    return { ok: false, error: "path_outside_root", path: relative };
  }
  if (!existsSync(fullPath)) {
    return { ok: false, error: "artifact_not_found", identifier: requestedPath };
  }

  const markdown = await readFile(fullPath, "utf8");
  let relations: unknown[] = [];
  if (doc) {
    relations = sqliteJson(`
SELECT relation_type, target_type, target_id
FROM relations
WHERE source_id = ${sqlString(doc.id)}
ORDER BY relation_type, target_type, target_id
LIMIT 40;
`);
  }

  return {
    ok: true,
    document: doc ?? {
      id: path.basename(fullPath, ".md"),
      path: rootRelative(root, fullPath),
      type: readScalar(markdown, "type"),
      status: readScalar(markdown, "status"),
      title: firstHeading(markdown),
    },
    markdown: compactText(markdown, Math.max(500, Math.min(Number(maxChars) || 8_000, 20_000))),
    relations,
  };
}

export function buildPrithaRealtimeTools(): RealtimeToolDefinition[] {
  return [
    {
      type: "function",
      name: "search_pritha_memory",
      description:
        "Read-only access to Pritha/Techscope memory. Use operation=status, search, recent, open, or read. Use this before answering questions about Pritha standards, decisions, workflows, child agents, prior experiments, or stored project knowledge.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["status", "search", "recent", "open", "read"] },
          query: { type: "string" },
          id_or_path: { type: "string" },
          search_mode: { type: "string", enum: ["fts", "markdown"] },
          limit: { type: "number" },
          max_chars: { type: "number" },
        },
      },
    },
    {
      type: "function",
      name: "run_codex_task",
      description:
        "Start or queue a Codex sidecar task in the current Techscope environment. Use for implementation, repo inspection, deep analysis, review, or internet/current-source research. Do not claim the task is complete unless the returned status says complete.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          task_type: {
            type: "string",
            enum: ["analysis", "research", "implementation", "review", "system_change"],
          },
          priority: { type: "string", enum: ["normal", "high"] },
          requires_internet: { type: "boolean" },
          expected_result: { type: "string" },
          operator_confirmation: { type: "string" },
        },
        required: ["task"],
      },
    },
  ];
}

export function buildRealtimeInstructions() {
  return [
    "You are Pritha, a Codex-native agent factory and Techscope knowledge assistant.",
    "Speak with the operator in Russian unless they switch language.",
    "This is an experimental realtime voice interface. Keep answers concise, calm and operational.",
    "You have exactly two tools: search_pritha_memory and run_codex_task.",
    "Use search_pritha_memory before answering questions about Pritha memory, standards, decisions, workflows, child agents, previous UI/realtime experiments, or stored project knowledge.",
    "For exact details after search, call search_pritha_memory with operation=read and id_or_path from a prior result.",
    "Use run_codex_task for implementation, codebase changes, deep repo analysis, reviews, or internet/current-source research. If internet is needed, set requires_internet=true; Codex handles web access.",
    "Do not claim Codex work is complete after starting or queueing a task. Report the task id, status and next operator-visible path.",
    "After run_codex_task returns a running or queued task, do not start another Codex task just to poll that task's status. The Voice UI monitors Codex task readiness and will send a later completion message when result.md is available.",
    "If the UI later adds a message that starts with 'Codex sidecar task' and includes 'Result:', treat it as the authoritative completion notification for that task. Summarize the result to the operator immediately instead of saying that you do not automatically know whether Codex finished.",
    "Do not ask for secrets, expose credentials, publish, delete files, install services, change launchd/cron, or make broad system changes without explicit operator confirmation.",
    "For now, voice tools may read memory and create private Codex task handoffs; they must not mutate curated Markdown directly.",
  ].join("\n");
}

export function buildRealtimeSessionConfig() {
  return {
    type: "realtime",
    model: env("TECHSCOPE_VOICE_MODEL", env("OPENAI_REALTIME_MODEL", DEFAULT_MODEL)),
    instructions: buildRealtimeInstructions(),
    tool_choice: "auto",
    tools: buildPrithaRealtimeTools(),
    audio: {
      input: {
        turn_detection: {
          type: "semantic_vad",
        },
        transcription: {
          model: env("TECHSCOPE_VOICE_TRANSCRIPTION_MODEL", env("OPENAI_INPUT_TRANSCRIBE_MODEL", DEFAULT_TRANSCRIPTION_MODEL)),
        },
      },
      output: {
        voice: env("TECHSCOPE_VOICE_REALTIME_VOICE", env("OPENAI_REALTIME_VOICE", DEFAULT_VOICE)),
      },
    },
  };
}

function normalizeClientSecret(result: RawSessionResponse) {
  if (typeof result.client_secret === "string") {
    return {
      value: result.client_secret,
      expires_at: result.expires_at,
    };
  }

  if (typeof result.client_secret?.value === "string") {
    return {
      value: result.client_secret.value,
      expires_at: result.client_secret.expires_at ?? result.expires_at,
    };
  }

  if (typeof result.value === "string") {
    return {
      value: result.value,
      expires_at: result.expires_at,
    };
  }

  return undefined;
}

export async function createEphemeralRealtimeSession() {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) {
    throw new RealtimeProviderError({
      status: 503,
      providerCode: "missing_openai_api_key",
      message: "OPENAI_API_KEY is not configured for Pritha Control Center.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${realtimeBaseUrl()}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: buildRealtimeSessionConfig(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ProviderErrorResponse;
      throw new RealtimeProviderError({
        status: response.status,
        providerCode: body.error?.code,
        message: body.error?.message ?? "Realtime session creation failed",
      });
    }

    const result = (await response.json()) as RawSessionResponse;
    const clientSecret = normalizeClientSecret(result);
    if (!clientSecret) {
      throw new RealtimeProviderError({
        status: 502,
        providerCode: "invalid_provider_payload",
        message: "Provider response missing client secret.",
      });
    }

    return {
      client_secret: clientSecret,
    } satisfies RealtimeSessionResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createRealtimeCall(offerSdp: string, ephemeralKey: string) {
  if (!offerSdp.trim()) {
    throw new RealtimeProviderError({ status: 400, providerCode: "missing_offer_sdp", message: "Missing offer SDP." });
  }
  if (!ephemeralKey.trim()) {
    throw new RealtimeProviderError({ status: 400, providerCode: "missing_ephemeral_key", message: "Missing ephemeral key." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${realtimeBaseUrl()}/realtime/calls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      body: offerSdp,
      signal: controller.signal,
    });

    if (!response.ok) {
      const providerBody = (await response.json().catch(() => ({}))) as ProviderErrorResponse;
      throw new RealtimeProviderError({
        status: response.status,
        providerCode: providerBody.error?.code,
        message: providerBody.error?.message ?? "Realtime call failed",
      });
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function privateRoot() {
  return path.join(resolveTechscopeRoot(), ".private", "interface-lab", "pritha-control-center", "realtime");
}

async function logPrivateEvent(kind: string, payload: Record<string, unknown> = {}) {
  const root = privateRoot();
  await mkdir(root, { recursive: true });
  await appendFile(
    path.join(root, "events.jsonl"),
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      kind,
      ...payload,
    })}\n`,
    "utf8",
  ).catch(() => undefined);
}

export async function logPrithaRealtimeClientEvent(kind: string, payload: Record<string, unknown> = {}) {
  const safeKind = /^[a-z0-9_.:-]{1,80}$/i.test(kind) ? kind : "client_event";
  await logPrivateEvent(safeKind, payload);
  return { ok: true, kind: safeKind };
}

function envWithoutProxy(extra: Record<string, string> = {}) {
  const childEnv = { ...process.env, ...extra };
  if (extra.TECHSCOPE_KEEP_PROXY === "1") return childEnv;
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    delete childEnv[key];
  }
  childEnv.NO_PROXY = childEnv.NO_PROXY || "127.0.0.1,localhost";
  childEnv.no_proxy = childEnv.no_proxy || childEnv.NO_PROXY;
  return childEnv;
}

function codexMode() {
  const mode = env("PRITHA_REALTIME_CODEX_MODE", env("TECHSCOPE_VOICE_CODEX_MODE", "exec")).toLowerCase();
  return mode === "queue" ? "queue" : "exec";
}

function codexAvailable() {
  const result = spawnSync(env("PRITHA_REALTIME_CODEX_BIN", env("TECHSCOPE_VOICE_CODEX_BIN", "codex")), ["--version"], {
    cwd: resolveTechscopeRoot(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  return {
    available: result.status === 0,
    detail: compactText(result.stdout || result.stderr || "", 1_200),
  };
}

function codexSandboxForTask(taskType: string) {
  const override = env("PRITHA_REALTIME_CODEX_SANDBOX", env("TECHSCOPE_VOICE_CODEX_SANDBOX", "")).toLowerCase();
  if (["read-only", "workspace-write", "danger-full-access"].includes(override)) return override;
  const writeEnabled = env("PRITHA_REALTIME_CODEX_WRITE_ENABLED", env("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", "0")) === "1";
  if (!writeEnabled) return "read-only";
  return taskType === "implementation" || taskType === "system_change" ? "workspace-write" : "read-only";
}

function codexTimeoutMs() {
  const value = Number(env("PRITHA_REALTIME_CODEX_TIMEOUT_MS", env("TECHSCOPE_VOICE_CODEX_TIMEOUT_MS", String(DEFAULT_CODEX_TIMEOUT_MS))));
  return Number.isFinite(value) && value > 0 ? Math.max(10_000, Math.min(value, 3_600_000)) : DEFAULT_CODEX_TIMEOUT_MS;
}

function buildCodexPrompt(task: Record<string, unknown>) {
  return [
    "You are the Codex sidecar for Pritha Control Center realtime voice.",
    "Work in the current Techscope repository and follow AGENTS.md.",
    "Return a concise non-empty final result for the voice operator. Do not expose secrets.",
    "If the task needs current internet facts, browse or use available network-capable tools through Codex.",
    "For write/system-change requests, make only narrowly scoped changes and report verification.",
    "Do not publish, delete, install services, change launchd/cron, or make broad deployment changes unless the task includes explicit operator confirmation.",
    "If the request is unsafe, ambiguous, or impossible, say so and return the smallest useful next step.",
    "",
    "Task payload:",
    JSON.stringify(task, null, 2),
  ].join("\n");
}

async function startCodexExec(task: Record<string, unknown>, paths: { resultPath: string; statusPath: string; stdoutPath: string; stderrPath: string }) {
  const root = resolveTechscopeRoot();
  const codexBin = env("PRITHA_REALTIME_CODEX_BIN", env("TECHSCOPE_VOICE_CODEX_BIN", "codex"));
  const taskType = String(task.task_type || "analysis");
  const sandbox = codexSandboxForTask(taskType);
  const config = ['approval_policy="never"'];
  if (sandbox === "workspace-write") config.push("sandbox_workspace_write.network_access=true");
  if (sandbox === "read-only") config.push("sandbox_read_only.network_access=true");

  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color",
    "never",
    "-s",
    sandbox,
    ...config.flatMap((entry) => ["-c", entry]),
    "-C",
    root,
    "-o",
    paths.resultPath,
    "-",
  ];
  const model = env("PRITHA_REALTIME_CODEX_MODEL", env("TECHSCOPE_VOICE_CODEX_MODEL", ""));
  if (model) args.splice(1, 0, "-m", model);

  const stdoutFd = openSync(paths.stdoutPath, "a");
  const stderrFd = openSync(paths.stderrPath, "a");
  const timeoutMs = codexTimeoutMs();
  let killedByTimeout = false;
  const child = spawn(codexBin, args, {
    cwd: root,
    env:
      env("PRITHA_REALTIME_CODEX_USE_PROXY", env("TECHSCOPE_VOICE_CODEX_USE_PROXY", "0")) === "1"
        ? { ...process.env, TECHSCOPE_ROOT: root }
        : envWithoutProxy({ TECHSCOPE_ROOT: root }),
    stdio: ["pipe", stdoutFd, stderrFd],
  });

  child.stdin?.end(buildCodexPrompt(task));
  await writeFile(
    paths.statusPath,
    `${JSON.stringify(
      {
        status: "running",
        pid: child.pid,
        sandbox,
        timeout_ms: timeoutMs,
        started_at: new Date().toISOString(),
        result_path: rootRelative(root, paths.resultPath),
        stdout_path: rootRelative(root, paths.stdoutPath),
        stderr_path: rootRelative(root, paths.stderrPath),
      },
      null,
      2,
    )}\n`,
    "utf8",
  ).catch(() => undefined);

  const timer = setTimeout(() => {
    killedByTimeout = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
  }, timeoutMs);
  timer.unref();

  child.on("close", async (code, signal) => {
    clearTimeout(timer);
    const resultText = await readFile(paths.resultPath, "utf8").catch(() => "");
    const hasResult = Boolean(resultText.trim());
    const status = killedByTimeout ? "failed_timeout" : code === 0 && hasResult ? "complete" : code === 0 ? "failed_empty_result" : "failed";
    if (status === "failed_empty_result") {
      const stderrText = await readFile(paths.stderrPath, "utf8").catch(() => "");
      await writeFile(
        paths.resultPath,
        `Codex sidecar exited without a final operator-facing result.\n\nLast stderr excerpt:\n${compactText(stderrText.slice(-4_000), 3_000)}\n`,
        "utf8",
      ).catch(() => undefined);
    }
    await writeFile(
      paths.statusPath,
      `${JSON.stringify(
        {
          status,
          code,
          signal,
          killed_by_timeout: killedByTimeout,
          completed_at: new Date().toISOString(),
          result_path: rootRelative(root, paths.resultPath),
          stdout_path: rootRelative(root, paths.stdoutPath),
          stderr_path: rootRelative(root, paths.stderrPath),
        },
        null,
        2,
      )}\n`,
      "utf8",
    ).catch(() => undefined);
  });

  child.unref();
  return {
    pid: child.pid,
    sandbox,
    timeout_ms: timeoutMs,
    result_path: rootRelative(root, paths.resultPath),
  };
}

async function runCodexTask(args: CodexTaskArgs = {}) {
  const root = resolveTechscopeRoot();
  const taskText = String(args.task || "").trim();
  if (!taskText) return { ok: false, error: "missing_task" };

  const now = new Date();
  const taskId = `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const taskDir = path.join(privateRoot(), "codex-tasks", taskId);
  await mkdir(taskDir, { recursive: true });

  const requestedMode = codexMode();
  const codex = codexAvailable();
  const effectiveMode = requestedMode === "exec" && codex.available ? "exec" : "queue";
  const task = {
    id: taskId,
    created_at: now.toISOString(),
    source: "pritha-control-center-realtime",
    status: effectiveMode === "exec" ? "running" : "queued",
    task: taskText.slice(0, 8_000),
    task_type: String(args.task_type || "analysis"),
    priority: String(args.priority || "normal"),
    requires_internet: Boolean(args.requires_internet),
    expected_result: String(args.expected_result || "concise operator-facing answer"),
    operator_confirmation: String(args.operator_confirmation || ""),
    root: rootRelative(root, root),
  };

  const requestPath = path.join(taskDir, "request.json");
  const promptPath = path.join(taskDir, "prompt.md");
  const statusPath = path.join(taskDir, "status.json");
  const resultPath = path.join(taskDir, "result.md");
  const stdoutPath = path.join(taskDir, "stdout.log");
  const stderrPath = path.join(taskDir, "stderr.log");

  await writeFile(requestPath, `${JSON.stringify(task, null, 2)}\n`, "utf8");
  await writeFile(promptPath, `${buildCodexPrompt(task)}\n`, "utf8");
  await writeFile(statusPath, `${JSON.stringify({ status: task.status, created_at: task.created_at }, null, 2)}\n`, "utf8");

  let exec: Awaited<ReturnType<typeof startCodexExec>> | null = null;
  if (effectiveMode === "exec") {
    exec = await startCodexExec(task, { resultPath, statusPath, stdoutPath, stderrPath });
  }

  return {
    ok: true,
    task_id: taskId,
    status: task.status,
    mode: effectiveMode,
    requested_mode: requestedMode,
    request_path: rootRelative(root, requestPath),
    prompt_path: rootRelative(root, promptPath),
    status_path: rootRelative(root, statusPath),
    result_path: rootRelative(root, resultPath),
    exec,
    operator_note:
      effectiveMode === "exec"
        ? "Codex sidecar started in the local Techscope environment."
        : "Task captured in private local queue because Codex exec is unavailable or disabled.",
  };
}

function safeTaskId(taskId: string) {
  const id = String(taskId || "").trim();
  return /^[0-9A-Za-z._:-]+$/.test(id) && !id.includes("/") && !id.includes("\\") && id.length <= 120 ? id : "";
}

async function readJsonFile(filePath: string) {
  const text = await readFile(filePath, "utf8").catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getPrithaCodexTask(taskId: string) {
  const id = safeTaskId(taskId);
  if (!id) {
    await logPrivateEvent("codex_task_readback", { ok: false, error: "invalid_task_id" });
    return { ok: false, error: "invalid_task_id" };
  }

  const root = resolveTechscopeRoot();
  const taskDir = path.join(privateRoot(), "codex-tasks", id);
  if (!isPathInsideOrSame(privateRoot(), taskDir) || !existsSync(taskDir)) {
    await logPrivateEvent("codex_task_readback", { ok: false, error: "task_not_found", task_id: id });
    return { ok: false, error: "task_not_found", task_id: id };
  }

  const requestPath = path.join(taskDir, "request.json");
  const statusPath = path.join(taskDir, "status.json");
  const resultPath = path.join(taskDir, "result.md");
  const stdoutPath = path.join(taskDir, "stdout.log");
  const stderrPath = path.join(taskDir, "stderr.log");
  const request = await readJsonFile(requestPath);
  const status = await readJsonFile(statusPath);
  const resultText = await readFile(resultPath, "utf8").catch(() => "");
  const statusValue = String(status?.status || request?.status || "unknown");
  const complete = ["complete", "failed", "failed_timeout", "failed_empty_result"].includes(statusValue);
  const resultAvailable = Boolean(resultText.trim());

  await logPrivateEvent("codex_task_readback", {
    ok: true,
    task_id: id,
    status: statusValue,
    complete,
    result_available: resultAvailable,
  });

  return {
    ok: true,
    task_id: id,
    status: statusValue,
    complete,
    request,
    status_detail: status,
    result_available: resultAvailable,
    result_excerpt: compactText(resultText, 5_000),
    paths: {
      request: rootRelative(root, requestPath),
      status: rootRelative(root, statusPath),
      result: rootRelative(root, resultPath),
      stdout: rootRelative(root, stdoutPath),
      stderr: rootRelative(root, stderrPath),
    },
  };
}

export async function handlePrithaRealtimeTool(name: string, args: Record<string, unknown> = {}) {
  await logPrivateEvent("tool_call_started", { name, args });

  let output: unknown;
  if (name === "search_pritha_memory") {
    const operation = String(args.operation || (args.id_or_path ? "read" : args.query ? "search" : "status"));
    const limit = Math.max(1, Math.min(Number(args.limit) || 6, 12));

    if (operation === "status") {
      output = {
        ok: true,
        operation,
        memory: memoryStats(),
        sqlite: existsSync(memoryDbPath()),
        sqlite_cli: sqliteCliAvailable(),
      };
    } else if (operation === "recent") {
      output = { ok: true, operation, recent: recentItems(limit) };
    } else if (operation === "open") {
      output = { ok: true, operation, open: openItems(limit) };
    } else if (operation === "read") {
      output = await readArtifact(args.id_or_path, Number(args.max_chars) || 8_000);
    } else if (operation === "search") {
      const query = String(args.query || "").trim();
      if (!query) {
        output = { ok: false, error: "missing_query" };
      } else {
        const searchMode = String(args.search_mode || "fts");
        const canUseFts = searchMode !== "markdown" && existsSync(memoryDbPath()) && sqliteCliAvailable();
        const rows = canUseFts ? ftsSearch(query, limit) : markdownFallbackSearch(query, limit);
        output = {
          ok: true,
          operation,
          query,
          search_mode: canUseFts ? "fts" : "markdown",
          results: rows,
        };
      }
    } else {
      output = { ok: false, error: "unknown_memory_operation", operation };
    }
  } else if (name === "run_codex_task") {
    output = await runCodexTask(args);
  } else {
    output = { ok: false, error: "unknown_tool", name };
  }

  await logPrivateEvent("tool_call_finished", {
    name,
    ok: typeof output === "object" && output !== null && "ok" in output ? Boolean((output as { ok?: unknown }).ok) : false,
  });
  return output;
}

export function getPrithaRealtimeStatus() {
  const config = buildRealtimeSessionConfig();
  const root = resolveTechscopeRoot();
  const codex = codexAvailable();
  return {
    ok: true,
    root,
    model: config.model,
    voice: config.audio.output.voice,
    transcription_model: config.audio.input.transcription.model,
    tools: config.tools.map((tool) => tool.name),
    openai_key_configured: Boolean(env("OPENAI_API_KEY")),
    realtime_base_url: realtimeBaseUrl(),
    memory: {
      sqlite: existsSync(memoryDbPath(root)),
      sqlite_cli: sqliteCliAvailable(),
      stats: existsSync(memoryDbPath(root)) && sqliteCliAvailable() ? memoryStats() : [],
    },
    codex: {
      mode: codexMode(),
      available: codex.available,
      detail: codex.detail,
      write_enabled: env("PRITHA_REALTIME_CODEX_WRITE_ENABLED", env("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", "0")) === "1",
    },
    private_root: rootRelative(root, privateRoot()),
  };
}
