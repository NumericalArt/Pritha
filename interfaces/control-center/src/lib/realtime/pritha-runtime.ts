import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkCodexAppServerAvailable, PrithaCodexAppServerClient } from "./codex-task/codex-app-server-client";
import type { PrithaCodexTaskPayload, PrithaCodexTaskProgressEvent, PrithaCodexTaskResult, PrithaCodexTaskStatus, PrithaCodexTaskType } from "./codex-task/types";
import {
  buildVoiceBehaviorPromptSections,
  DEFAULT_PRITHA_VOICE,
  DEFAULT_VOICE_BEHAVIOR_PROFILE,
  normalizePrithaVoice,
  normalizeVoiceBehaviorProfile,
  PRITHA_FEMININE_VOICE_OPTIONS,
  VOICE_BEHAVIOR_PROFILE_OPTIONS,
  type PrithaVoiceId,
  type VoiceBehaviorProfile,
} from "./voice-settings";

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
  write_mode?: unknown;
  priority?: unknown;
  requires_internet?: unknown;
  expected_result?: unknown;
  operator_confirmation?: unknown;
};

type InspectCodexTaskArgs = {
  operation?: unknown;
  task_id?: unknown;
  limit?: unknown;
  max_events?: unknown;
};

type CodexTaskApprovalAction = "approve" | "reject";

type CodexTaskApproval = {
  status: "pending" | "approved" | "rejected";
  action_type: string;
  summary: string;
  reasons: string[];
  requested_at: string;
  decided_at?: string;
  decided_by?: string;
};

type DeepTaskPrimaryTransport = "codex-app" | "codex-cli" | "codex-session";

type PrithaRuntimeSettings = {
  deepTaskPrimaryTransport: Extract<DeepTaskPrimaryTransport, "codex-app" | "codex-cli">;
  codexModel: string;
  codexWorkdir: string;
  codexSandbox: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess: boolean;
  codexApproval: "never";
  codexTimeoutMs: number;
  voiceBehaviorProfile: VoiceBehaviorProfile;
  prithaVoice: PrithaVoiceId;
  updatedAt: string;
};

type PrivateEventRow = {
  timestamp?: string;
  kind?: string;
  task_id?: string;
  status?: string;
  reason?: string;
  result_available?: boolean;
  result_chars?: number;
  channel_state?: string;
  response_busy?: boolean;
  [key: string]: unknown;
};

type VoiceMemoryEvent = {
  kind?: string;
  text?: string;
  timestamp?: string;
  taskId?: string;
  status?: string;
};

type VoiceSessionMemoryArgs = {
  session_id?: unknown;
  reason?: unknown;
  events?: unknown;
};

type DeepMemoryArgs = {
  operation?: unknown;
  query?: unknown;
  id_or_path?: unknown;
  node_type?: unknown;
  entity_type?: unknown;
  relation_type?: unknown;
  depth?: unknown;
  limit?: unknown;
  max_chars?: unknown;
  title?: unknown;
  body?: unknown;
  artifact_type?: unknown;
  target_path?: unknown;
  operator_confirmation?: unknown;
};

type PrithaFilesArgs = {
  operation?: unknown;
  project?: unknown;
  path?: unknown;
  query?: unknown;
  depth?: unknown;
  limit?: unknown;
  max_chars?: unknown;
  include_hidden?: unknown;
};

type ChildAgentProject = {
  name: string;
  directory: string;
  aliases: string[];
};

const DEFAULT_MODEL = "gpt-realtime-2";
const DEFAULT_VOICE = DEFAULT_PRITHA_VOICE;
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const DEFAULT_CODEX_TIMEOUT_MS = 300_000;
const MAX_TOOL_TEXT = 8_000;
const EMBEDDING_PROVIDER = "sentence-transformers";
const EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";

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

function redactSensitiveText(value: unknown) {
  return compactText(value, 3_000)
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted-openai-key]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

function slugPart(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "voice-session";
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

function memoryStatsMap() {
  const rows = memoryStats() as Array<{ name?: string; count?: number }>;
  return Object.fromEntries(rows.map((row) => [String(row.name || ""), Number(row.count || 0)]));
}

function autoEmbeddingRebuildEnabled() {
  const value = env("PRITHA_REALTIME_AUTO_EMBEDDINGS", env("TECHSCOPE_VOICE_AUTO_EMBEDDINGS", "1")).toLowerCase();
  return value !== "0" && value !== "false" && value !== "disabled" && value !== "off";
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

function cappedLimit(value: unknown, fallback = 8, max = 30) {
  return Math.max(1, Math.min(Number(value) || fallback, max));
}

function hasOperatorConfirmation(value: unknown) {
  return /confirm|confirmed|approve|approved|yes|write|reindex|подтверж|разреш|да/i.test(String(value || ""));
}

function commandResult(command: string, args: string[]) {
  const root = resolveTechscopeRoot();
  const result = spawnSync(command, args, {
    cwd: root,
    env: envWithoutProxy({ TECHSCOPE_ROOT: root }),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: compactText(result.stdout, 6_000),
    stderr: compactText(result.stderr, 4_000),
  };
}

function embeddingRebuildDir() {
  return path.join(privateRoot(), "embedding-rebuild");
}

function embeddingRebuildStatusPath() {
  return path.join(embeddingRebuildDir(), "status.json");
}

function readEmbeddingRebuildStatus() {
  const statusPath = embeddingRebuildStatusPath();
  if (!existsSync(statusPath)) return null;
  try {
    return JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function processIsAlive(pid: unknown) {
  const numericPid = Number(pid);
  if (!Number.isFinite(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch {
    return false;
  }
}

function embeddingCoverage(options: { includeRebuildStatus?: boolean } = {}) {
  const includeRebuildStatus = options.includeRebuildStatus !== false;
  if (!existsSync(memoryDbPath()) || !sqliteCliAvailable()) {
    return {
      ok: false,
      error: "memory_sqlite_unavailable",
      sqlite: existsSync(memoryDbPath()),
      sqlite_cli: sqliteCliAvailable(),
    };
  }

  const rows = sqliteJson(`
SELECT
  (SELECT COUNT(*)
   FROM chunks c
   JOIN documents d ON d.id = c.document_id
   WHERE d.type != 'template') AS eligible_chunks,
  (SELECT COUNT(*)
   FROM embeddings
   WHERE owner_type = 'chunk'
     AND provider = ${sqlString(EMBEDDING_PROVIDER)}
     AND model = ${sqlString(EMBEDDING_MODEL)}) AS embedded_chunks,
  (SELECT MAX(indexed_at) FROM documents) AS latest_indexed_at,
  (SELECT MAX(created_at)
   FROM embeddings
   WHERE owner_type = 'chunk'
     AND provider = ${sqlString(EMBEDDING_PROVIDER)}
     AND model = ${sqlString(EMBEDDING_MODEL)}) AS latest_embedding_at;
`);
  const row = (rows[0] || {}) as Record<string, unknown>;
  const eligibleChunks = Number(row.eligible_chunks || 0);
  const embeddedChunks = Number(row.embedded_chunks || 0);
  const latestIndexedAt = String(row.latest_indexed_at || "");
  const latestEmbeddingAt = String(row.latest_embedding_at || "");
  const latestIndexedTime = Date.parse(latestIndexedAt);
  const latestEmbeddingTime = Date.parse(latestEmbeddingAt);
  const missing = embeddedChunks === 0;
  const countMismatch = embeddedChunks !== eligibleChunks;
  const timestampStale =
    Boolean(latestIndexedAt && latestEmbeddingAt) &&
    Number.isFinite(latestIndexedTime) &&
    Number.isFinite(latestEmbeddingTime) &&
    latestEmbeddingTime < latestIndexedTime;
  const stale = missing || countMismatch || timestampStale;
  const reason = missing
    ? "missing"
    : countMismatch
      ? "count_mismatch"
      : timestampStale
        ? "older_than_memory_index"
        : "fresh";

  return {
    ok: true,
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_MODEL,
    eligible_chunks: eligibleChunks,
    embedded_chunks: embeddedChunks,
    latest_indexed_at: latestIndexedAt || null,
    latest_embedding_at: latestEmbeddingAt || null,
    semantic_available: embeddedChunks > 0,
    stale,
    reason,
    auto_rebuild_enabled: autoEmbeddingRebuildEnabled(),
    ...(includeRebuildStatus ? { rebuild_status: readEmbeddingRebuildStatus() } : {}),
  };
}

function startEmbeddingRebuild(reason = "requested") {
  if (!autoEmbeddingRebuildEnabled()) {
    return { ok: false, started: false, reason: "auto_embeddings_disabled" };
  }

  const current = readEmbeddingRebuildStatus();
  if (current?.status === "running" && processIsAlive(current.pid)) {
    return {
      ok: true,
      started: false,
      status: "already_running",
      pid: current.pid,
      status_path: rootRelative(resolveTechscopeRoot(), embeddingRebuildStatusPath()),
    };
  }

  const root = resolveTechscopeRoot();
  const rebuildDir = embeddingRebuildDir();
  mkdirSync(rebuildDir, { recursive: true });
  const statusPath = embeddingRebuildStatusPath();
  const stdoutPath = path.join(rebuildDir, "stdout.log");
  const stderrPath = path.join(rebuildDir, "stderr.log");
  const stdoutFd = openSync(stdoutPath, "a");
  const stderrFd = openSync(stderrPath, "a");
  const startedAt = new Date().toISOString();
  const child = spawn("python3", ["scripts/embed-memory.py"], {
    cwd: root,
    env: envWithoutProxy({ TECHSCOPE_ROOT: root }),
    stdio: ["ignore", stdoutFd, stderrFd],
  });

  const initialStatus = {
    status: "running",
    pid: child.pid,
    reason,
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_MODEL,
    started_at: startedAt,
    stdout_path: rootRelative(root, stdoutPath),
    stderr_path: rootRelative(root, stderrPath),
  };
  writeFile(statusPath, `${JSON.stringify(initialStatus, null, 2)}\n`, "utf8").catch(() => undefined);
  logPrivateEvent("embedding_rebuild_started", { reason, pid: child.pid }).catch(() => undefined);

  child.on("close", async (code, signal) => {
    const status = code === 0 ? "complete" : "failed";
    const result = {
      ...initialStatus,
      status,
      code,
      signal,
      completed_at: new Date().toISOString(),
      coverage: embeddingCoverage({ includeRebuildStatus: false }),
    };
    await writeFile(statusPath, `${JSON.stringify(result, null, 2)}\n`, "utf8").catch(() => undefined);
    await logPrivateEvent("embedding_rebuild_finished", { status, code, signal }).catch(() => undefined);
  });

  child.unref();
  return {
    ok: true,
    started: true,
    status: "running",
    pid: child.pid,
    status_path: rootRelative(root, statusPath),
    stdout_path: rootRelative(root, stdoutPath),
    stderr_path: rootRelative(root, stderrPath),
  };
}

function ensureEmbeddingsFresh(reason: string) {
  const coverage = embeddingCoverage();
  if (coverage.ok && "stale" in coverage && coverage.stale) {
    return {
      coverage,
      rebuild: startEmbeddingRebuild(reason),
    };
  }
  return {
    coverage,
    rebuild: null,
  };
}

function semanticMemorySearch(query: string, limit: number) {
  if (!existsSync(memoryDbPath()) || !sqliteCliAvailable()) {
    return { ok: false, error: "memory_sqlite_unavailable" };
  }

  const embeddings = ensureEmbeddingsFresh("semantic_search");
  const coverage = embeddings.coverage as ReturnType<typeof embeddingCoverage> & {
    semantic_available?: boolean;
    reason?: string;
  };
  if (!coverage.semantic_available) {
    return {
      ok: false,
      error: "embeddings_unavailable",
      detail: "No chunk embeddings are ready yet. Automatic embedding rebuild has been requested when enabled.",
      embeddings: coverage,
      rebuild: embeddings.rebuild,
    };
  }

  const result = commandResult("python3", ["scripts/semantic-search.py", query, "--limit", String(limit)]);
  return {
    ...result,
    query,
    limit,
    embeddings: coverage,
    rebuild: "stale" in coverage && coverage.stale ? embeddings.rebuild : null,
  };
}

function hybridMemorySearch(args: DeepMemoryArgs) {
  const query = String(args.query || "").trim();
  if (!query) return { ok: false, error: "missing_query" };
  const limit = cappedLimit(args.limit, 8, 20);
  const maxChars = Math.max(1_000, Math.min(Number(args.max_chars) || 8_000, 20_000));
  const fts = existsSync(memoryDbPath()) && sqliteCliAvailable() ? ftsSearch(query, limit) : markdownFallbackSearch(query, limit);
  const semantic = semanticMemorySearch(query, limit);
  return {
    ok: true,
    operation: "hybrid_search",
    query,
    fts,
    semantic: {
      ...semantic,
      stdout: "stdout" in semantic ? compactText(semantic.stdout, maxChars) : undefined,
      stderr: "stderr" in semantic ? compactText(semantic.stderr, 2_000) : undefined,
    },
  };
}

function searchMemoryEntities(args: DeepMemoryArgs) {
  const query = String(args.query || "").trim();
  if (!query) return { ok: false, error: "missing_query" };
  const limit = cappedLimit(args.limit, 10, 30);
  const entityType = String(args.entity_type || "").trim();
  const like = sqlString(`%${query}%`);
  const typeFilter = entityType ? `AND e.type = ${sqlString(entityType)}` : "";
  const entities = sqliteJson(`
SELECT e.id, e.type, e.name, e.canonical_name, e.description,
       COUNT(r.id) AS relation_count
FROM entities e
LEFT JOIN relations r ON r.target_type = e.type AND r.target_id = e.id
WHERE (e.name LIKE ${like} OR e.canonical_name LIKE ${like} OR e.id LIKE ${like})
  ${typeFilter}
GROUP BY e.id, e.type, e.name, e.canonical_name, e.description
ORDER BY relation_count DESC, e.type, e.name
LIMIT ${limit};
`);

  const related_documents = entities.slice(0, 8).map((entity) => {
    const row = entity as { id?: string; type?: string; name?: string };
    return {
      entity: row,
      documents: sqliteJson(`
SELECT d.id, d.type, d.status, d.path, d.title, r.relation_type
FROM relations r
JOIN documents d ON d.id = r.source_id
WHERE r.source_type = 'document'
  AND r.target_type = ${sqlString(row.type)}
  AND r.target_id = ${sqlString(row.id)}
ORDER BY d.type, d.path
LIMIT 12;
`),
    };
  });

  return { ok: true, operation: "entity_search", query, entity_type: entityType || null, entities, related_documents };
}

function describeMemoryNode(type: string, id: string) {
  if (type === "document") {
    const rows = sqliteJson(`
SELECT id, type, status, path, title
FROM documents
WHERE id = ${sqlString(id)} OR path = ${sqlString(id)}
LIMIT 1;
`);
    return (rows[0] as Record<string, unknown> | undefined) || { id, node_type: type };
  }

  const rows = sqliteJson(`
SELECT id, type, name, canonical_name, description
FROM entities
WHERE id = ${sqlString(id)}
LIMIT 1;
`);
  return (rows[0] as Record<string, unknown> | undefined) || { id, node_type: type };
}

function resolveGraphStart(args: DeepMemoryArgs) {
  const idOrPath = String(args.id_or_path || "").trim();
  if (!idOrPath) return null;
  const requestedType = String(args.node_type || "document").trim();
  if (requestedType === "document") {
    const doc = findDocument(idOrPath);
    if (doc) return { type: "document", id: doc.id, label: doc.path };
  }
  if (requestedType && requestedType !== "document") {
    return { type: requestedType, id: idOrPath, label: idOrPath };
  }
  const entity = sqliteJson(`
SELECT id, type, name
FROM entities
WHERE id = ${sqlString(idOrPath)} OR lower(name) = lower(${sqlString(idOrPath)})
LIMIT 1;
`)[0] as { id?: string; type?: string; name?: string } | undefined;
  if (entity?.id && entity.type) return { type: entity.type, id: entity.id, label: entity.name || entity.id };
  return null;
}

function traverseMemoryGraph(args: DeepMemoryArgs) {
  const start = resolveGraphStart(args);
  if (!start) return { ok: false, error: "missing_or_unknown_start_node" };
  const depth = Math.max(1, Math.min(Number(args.depth) || 2, 4));
  const limit = cappedLimit(args.limit, 40, 120);
  const relationType = String(args.relation_type || "").trim();
  const relationFilter = relationType ? `AND relation_type = ${sqlString(relationType)}` : "";
  const seen = new Set([`${start.type}:${start.id}`]);
  let frontier = [start];
  const relations: unknown[] = [];
  const nodes = new Map([[`${start.type}:${start.id}`, { ...start, detail: describeMemoryNode(start.type, start.id) }]]);

  for (let currentDepth = 1; currentDepth <= depth && frontier.length && relations.length < limit; currentDepth += 1) {
    const next: Array<{ type: string; id: string; label: string }> = [];
    for (const node of frontier) {
      const outgoing = sqliteJson(`
SELECT 'outgoing' AS direction, source_type, source_id, relation_type, target_type, target_id, confidence, evidence_document_id
FROM relations
WHERE source_type = ${sqlString(node.type)} AND source_id = ${sqlString(node.id)}
${relationFilter}
ORDER BY relation_type, target_type, target_id
LIMIT ${limit};
`);
      const incoming = sqliteJson(`
SELECT 'incoming' AS direction, source_type, source_id, relation_type, target_type, target_id, confidence, evidence_document_id
FROM relations
WHERE target_type = ${sqlString(node.type)} AND target_id = ${sqlString(node.id)}
${relationFilter}
ORDER BY relation_type, source_type, source_id
LIMIT ${limit};
`);

      for (const relation of [...outgoing, ...incoming] as Array<Record<string, unknown>>) {
        if (relations.length >= limit) break;
        relations.push({ depth: currentDepth, ...relation });
        const nextType = String(relation.direction) === "incoming" ? String(relation.source_type) : String(relation.target_type);
        const nextId = String(relation.direction) === "incoming" ? String(relation.source_id) : String(relation.target_id);
        const key = `${nextType}:${nextId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const nextNode = { type: nextType, id: nextId, label: nextId };
        nodes.set(key, { ...nextNode, detail: describeMemoryNode(nextType, nextId) });
        next.push(nextNode);
      }
    }
    frontier = next;
  }

  return {
    ok: true,
    operation: "graph_traverse",
    start,
    depth,
    relation_type: relationType || null,
    nodes: Array.from(nodes.values()),
    relations,
    truncated: relations.length >= limit,
  };
}

function listFilesRecursive(directory: string, maxFiles = 200) {
  const files: string[] = [];
  function visit(current: string) {
    if (!existsSync(current) || files.length >= maxFiles) return;
    for (const entry of readdirSync(current)) {
      const fullPath = path.join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) visit(fullPath);
      else files.push(fullPath);
      if (files.length >= maxFiles) break;
    }
  }
  visit(directory);
  return files;
}

function searchRuntimeMemory(args: DeepMemoryArgs) {
  const root = resolveTechscopeRoot();
  const query = String(args.query || "").trim().toLowerCase();
  const limit = cappedLimit(args.limit, 12, 40);
  const maxChars = Math.max(500, Math.min(Number(args.max_chars) || 2_000, 8_000));
  const matches: Array<{ path: string; kind: string; snippet: string }> = [];
  const eventsPath = path.join(privateRoot(), "events.jsonl");

  if (existsSync(eventsPath)) {
    const lines = readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-1_000).reverse();
    for (const line of lines) {
      if (matches.length >= limit) break;
      if (query && !line.toLowerCase().includes(query)) continue;
      matches.push({ path: rootRelative(root, eventsPath), kind: "realtime_event", snippet: redactSensitiveText(line).slice(0, maxChars) });
    }
  }

  const runtimeDirs = [path.join(privateRoot(), "codex-tasks"), path.join(root, ".queue")];
  for (const directory of runtimeDirs) {
    const files = listFilesRecursive(directory, 300)
      .filter((filePath) => /\.(json|jsonl|md|log|txt)$/.test(filePath))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    for (const filePath of files) {
      if (matches.length >= limit) break;
      const text = readFileSync(filePath, "utf8");
      if (query && !text.toLowerCase().includes(query)) continue;
      matches.push({ path: rootRelative(root, filePath), kind: "runtime_file", snippet: redactSensitiveText(text).slice(0, maxChars) });
    }
  }

  return { ok: true, operation: "runtime_search", query: query || null, matches };
}

function curatedMemoryTargetDir(artifactType: string) {
  const root = resolveTechscopeRoot();
  const normalized = artifactType.toLowerCase().replace(/_/g, "-");
  const map: Record<string, string> = {
    brief: "02_briefs",
    review: "03_reviews",
    assessment: "03_reviews",
    standard: "04_standards",
    decision: "05_decisions",
    workflow: "07_workflows",
    wiki: "10_wiki/pages",
    note: "03_reviews",
  };
  return path.join(root, map[normalized] || "03_reviews");
}

function isSafeCuratedMarkdownPath(fullPath: string) {
  const root = resolveTechscopeRoot();
  const allowed = [
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
  ].map((entry) => path.join(root, entry));
  return fullPath.endsWith(".md") && isPathInsideOrSame(root, fullPath) && allowed.some((directory) => isPathInsideOrSame(directory, fullPath));
}

async function validateAndRebuildMemory() {
  const validation = runMemoryCommand("node", ["scripts/validate-memory.mjs"]);
  const rebuild = validation.ok ? runMemoryCommand("node", ["scripts/rebuild-memory.mjs"]) : null;
  const ok = validation.ok && Boolean(rebuild?.ok);
  const embeddings = ok ? startEmbeddingRebuild("memory_rebuilt") : null;
  return { validation, rebuild, embeddings, ok };
}

async function writeDeepMemoryNote(args: DeepMemoryArgs) {
  if (!hasOperatorConfirmation(args.operator_confirmation)) {
    return { ok: false, error: "operator_confirmation_required", detail: "Ask the operator to confirm the memory write before calling this operation." };
  }
  const root = resolveTechscopeRoot();
  const title = compactText(args.title || "Voice Control Memory Note", 140);
  const artifactType = String(args.artifact_type || "review").trim() || "review";
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const targetDir = curatedMemoryTargetDir(artifactType);
  const artifactPath = path.join(targetDir, `${date}-${slugPart(title)}.md`);
  const body = redactSensitiveText(args.body || "");
  if (!body) return { ok: false, error: "missing_body" };
  await mkdir(targetDir, { recursive: true });
  const markdown = [
    "---",
    `id: ${date}-${slugPart(title)}-voice-memory-note`,
    `type: ${artifactType}`,
    "status: draft",
    `created: ${date}`,
    `updated: ${date}`,
    "topics:",
    "  - pritha-control-center",
    "  - memory",
    "sources:",
    "  - voice-control:deep_pritha_memory",
    "privacy: internal",
    "review_status: draft",
    "---",
    "",
    `# ${title}`,
    "",
    body,
    "",
  ].join("\n");
  await writeFile(artifactPath, markdown, "utf8");
  const checks = await validateAndRebuildMemory();
  return { ok: checks.ok, operation: "write_note", path: rootRelative(root, artifactPath), checks };
}

async function appendDeepMemoryArtifact(args: DeepMemoryArgs) {
  if (!hasOperatorConfirmation(args.operator_confirmation)) {
    return { ok: false, error: "operator_confirmation_required", detail: "Ask the operator to confirm the memory update before calling this operation." };
  }
  const root = resolveTechscopeRoot();
  const relative = String(args.target_path || args.id_or_path || "").trim();
  if (!relative) return { ok: false, error: "missing_target_path" };
  const fullPath = path.resolve(root, relative);
  if (!isSafeCuratedMarkdownPath(fullPath) || !existsSync(fullPath)) {
    return { ok: false, error: "unsafe_or_missing_target_path", path: relative };
  }
  const title = compactText(args.title || "Voice Control Memory Update", 120);
  const body = redactSensitiveText(args.body || "");
  if (!body) return { ok: false, error: "missing_body" };
  const stamp = new Date().toISOString();
  await appendFile(fullPath, `\n\n## ${title}\n\n- Source: voice-control:deep_pritha_memory\n- Updated at: ${stamp}\n\n${body}\n`, "utf8");
  const checks = await validateAndRebuildMemory();
  return { ok: checks.ok, operation: "append_artifact", path: rootRelative(root, fullPath), checks };
}

async function handleDeepPrithaMemory(args: DeepMemoryArgs = {}) {
  const operation = String(args.operation || (args.query ? "hybrid_search" : "status")).trim();
  if (!existsSync(memoryDbPath()) || !sqliteCliAvailable()) {
    return { ok: false, operation, error: "memory_sqlite_unavailable", sqlite: existsSync(memoryDbPath()), sqlite_cli: sqliteCliAvailable() };
  }

  if (operation === "status") {
    const embeddings = embeddingCoverage();
    return {
      ok: true,
      operation,
      memory: memoryStats(),
      semantic_available: Boolean("semantic_available" in embeddings && embeddings.semantic_available),
      embeddings,
      write_operations_require_confirmation: true,
    };
  }
  if (operation === "semantic_search") {
    const query = String(args.query || "").trim();
    if (!query) return { ok: false, error: "missing_query" };
    return { operation, ...semanticMemorySearch(query, cappedLimit(args.limit, 8, 20)) };
  }
  if (operation === "hybrid_search") return hybridMemorySearch(args);
  if (operation === "entity_search") return searchMemoryEntities(args);
  if (operation === "graph_traverse") return traverseMemoryGraph(args);
  if (operation === "runtime_search") return searchRuntimeMemory(args);
  if (operation === "reindex") {
    if (!hasOperatorConfirmation(args.operator_confirmation)) {
      return { ok: false, error: "operator_confirmation_required", detail: "Ask the operator to confirm memory reindex before calling this operation." };
    }
    return { ok: true, operation, checks: await validateAndRebuildMemory() };
  }
  if (operation === "rebuild_embeddings") {
    if (!hasOperatorConfirmation(args.operator_confirmation)) {
      return { ok: false, error: "operator_confirmation_required", detail: "Ask the operator to confirm embedding rebuild before calling this operation." };
    }
    return { operation, ...commandResult("python3", ["scripts/embed-memory.py"]) };
  }
  if (operation === "rebuild_embeddings_async") {
    if (!hasOperatorConfirmation(args.operator_confirmation)) {
      return { ok: false, error: "operator_confirmation_required", detail: "Ask the operator to confirm embedding rebuild before calling this operation." };
    }
    return { ok: true, operation, rebuild: startEmbeddingRebuild("operator_confirmed_async"), embeddings: embeddingCoverage() };
  }
  if (operation === "write_note") return writeDeepMemoryNote(args);
  if (operation === "append_artifact") return appendDeepMemoryArtifact(args);
  return { ok: false, error: "unknown_deep_memory_operation", operation };
}

type FileSystemRoot = {
  id: string;
  name: string;
  kind: "pritha" | "child_agent";
  directory: string;
  aliases: string[];
};

const FILESYSTEM_EXCLUDED_NAMES = new Set([
  ".git",
  ".next",
  ".private",
  ".queue",
  ".snapshots",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "logs",
  "tmp",
  "temp",
  "__pycache__",
]);

const FILESYSTEM_EXCLUDED_FILE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /credential/i,
  /secret/i,
  /token/i,
  /password/i,
  /\.sqlite(?:3)?$/i,
  /\.db$/i,
  /\.log$/i,
  /\.pid$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.mobileprovision$/i,
];

const FILESYSTEM_TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".env.example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function prithaFilesystemRoots(): FileSystemRoot[] {
  const root = resolveTechscopeRoot();
  return [
    { id: "pritha", name: "Pritha", kind: "pritha", directory: root, aliases: ["pritha", "techscope", "прита"] },
    ...knownSiblingChildAgentProjects(root).map((project) => ({
      id: project.name,
      name: project.name,
      kind: "child_agent" as const,
      directory: project.directory,
      aliases: project.aliases,
    })),
  ];
}

function compactProjectId(value: unknown) {
  return normalizeAgentAlias(String(value || "")).replace(/\s+/g, "");
}

function filesystemRootForProject(project: unknown) {
  const roots = prithaFilesystemRoots();
  const requested = compactProjectId(project || "pritha");
  return (
    roots.find((root) => root.id.toLowerCase() === String(project || "").toLowerCase()) ||
    roots.find((root) => root.aliases.some((alias) => compactProjectId(alias) === requested || compactProjectId(alias).includes(requested))) ||
    roots[0]
  );
}

function filesystemSafeRelativePath(root: string, requested: unknown) {
  const text = String(requested || ".").trim() || ".";
  const resolved = path.isAbsolute(text) ? path.resolve(text) : path.resolve(root, text);
  if (!isPathInsideOrSame(root, resolved)) return null;
  try {
    const rootReal = realpathSync(root);
    const resolvedReal = existsSync(resolved) ? realpathSync(resolved) : resolved;
    if (!isPathInsideOrSame(rootReal, resolvedReal)) return null;
  } catch {
    return null;
  }
  return resolved;
}

function isExcludedFilesystemEntry(name: string, fullPath: string) {
  if (FILESYSTEM_EXCLUDED_NAMES.has(name)) return true;
  if (name.startsWith(".") && [".env", ".DS_Store"].includes(name)) return true;
  const relative = rootRelative(resolveTechscopeRoot(), fullPath);
  return FILESYSTEM_EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(name) || pattern.test(relative));
}

function isLikelyTextFile(filePath: string) {
  const basename = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (FILESYSTEM_TEXT_EXTENSIONS.has(extension) || FILESYSTEM_TEXT_EXTENSIONS.has(extension.replace(/^\./, "."))) return true;
  if (["AGENTS.md", "README.md", "package.json", "tsconfig.json", "next.config.mjs"].includes(basename)) return true;
  return false;
}

function safeFileStat(filePath: string) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function filesystemEntry(root: string, fullPath: string) {
  const stat = safeFileStat(fullPath);
  if (!stat) return null;
  const relative = rootRelative(root, fullPath) || ".";
  return {
    name: path.basename(fullPath),
    path: relative,
    kind: stat.isDirectory() ? "directory" : "file",
    size: stat.isFile() ? stat.size : undefined,
    modified_at: stat.mtime.toISOString(),
  };
}

function listFilesystemTree(args: PrithaFilesArgs) {
  const rootInfo = filesystemRootForProject(args.project);
  const target = filesystemSafeRelativePath(rootInfo.directory, args.path);
  if (!target || !existsSync(target)) return { ok: false, operation: "tree", error: "path_not_found_or_outside_allowed_root" };
  const startStat = safeFileStat(target);
  if (!startStat?.isDirectory()) return { ok: false, operation: "tree", error: "path_is_not_directory", path: rootRelative(rootInfo.directory, target) };

  const maxDepth = Math.max(0, Math.min(Number(args.depth) || 2, 6));
  const limit = Math.max(1, Math.min(Number(args.limit) || 120, 400));
  const includeHidden = Boolean(args.include_hidden);
  const entries: Array<Record<string, unknown>> = [];

  function visit(directory: string, depth: number) {
    if (entries.length >= limit || depth > maxDepth) return;
    const children = readdirSync(directory)
      .filter((name) => includeHidden || !name.startsWith("."))
      .filter((name) => !isExcludedFilesystemEntry(name, path.join(directory, name)))
      .sort((a, b) => a.localeCompare(b));

    for (const child of children) {
      if (entries.length >= limit) break;
      const fullPath = path.join(directory, child);
      const entry = filesystemEntry(rootInfo.directory, fullPath);
      if (!entry) continue;
      entries.push({ ...entry, depth });
      if (entry.kind === "directory") visit(fullPath, depth + 1);
    }
  }

  visit(target, 0);
  return {
    ok: true,
    operation: "tree",
    project: rootInfo.name,
    root_kind: rootInfo.kind,
    path: rootRelative(rootInfo.directory, target) || ".",
    max_depth: maxDepth,
    truncated: entries.length >= limit,
    entries,
  };
}

function fileInfo(args: PrithaFilesArgs) {
  const rootInfo = filesystemRootForProject(args.project);
  const target = filesystemSafeRelativePath(rootInfo.directory, args.path);
  if (!target || !existsSync(target)) return { ok: false, operation: "file_info", error: "path_not_found_or_outside_allowed_root" };
  const entry = filesystemEntry(rootInfo.directory, target);
  return {
    ok: Boolean(entry),
    operation: "file_info",
    project: rootInfo.name,
    root_kind: rootInfo.kind,
    entry,
    text_readable: entry?.kind === "file" ? isLikelyTextFile(target) : undefined,
  };
}

async function readFilesystemFile(args: PrithaFilesArgs) {
  const rootInfo = filesystemRootForProject(args.project);
  const target = filesystemSafeRelativePath(rootInfo.directory, args.path);
  if (!target || !existsSync(target)) return { ok: false, operation: "read_file", error: "path_not_found_or_outside_allowed_root" };
  const stat = safeFileStat(target);
  const basename = path.basename(target);
  if (!stat?.isFile()) return { ok: false, operation: "read_file", error: "path_is_not_file", path: rootRelative(rootInfo.directory, target) };
  if (isExcludedFilesystemEntry(basename, target)) return { ok: false, operation: "read_file", error: "file_excluded_by_policy", path: rootRelative(rootInfo.directory, target) };
  if (!isLikelyTextFile(target)) return { ok: false, operation: "read_file", error: "non_text_or_unsupported_file", path: rootRelative(rootInfo.directory, target), size: stat.size };
  if (stat.size > 700_000) return { ok: false, operation: "read_file", error: "file_too_large", path: rootRelative(rootInfo.directory, target), size: stat.size };
  const maxChars = Math.max(500, Math.min(Number(args.max_chars) || 12_000, 40_000));
  const text = await readFile(target, "utf8");
  return {
    ok: true,
    operation: "read_file",
    project: rootInfo.name,
    root_kind: rootInfo.kind,
    path: rootRelative(rootInfo.directory, target),
    size: stat.size,
    modified_at: stat.mtime.toISOString(),
    truncated: text.length > maxChars,
    text: compactText(text, maxChars),
  };
}

function searchFilesystem(args: PrithaFilesArgs) {
  const rootInfo = filesystemRootForProject(args.project);
  const start = filesystemSafeRelativePath(rootInfo.directory, args.path);
  if (!start || !existsSync(start)) return { ok: false, operation: "search", error: "path_not_found_or_outside_allowed_root" };
  const query = String(args.query || "").trim().toLowerCase();
  if (!query) return { ok: false, operation: "search", error: "missing_query" };
  const limit = Math.max(1, Math.min(Number(args.limit) || 40, 120));
  const maxChars = Math.max(200, Math.min(Number(args.max_chars) || 800, 2_000));
  const matches: Array<Record<string, unknown>> = [];

  function visit(current: string) {
    if (matches.length >= limit) return;
    const stat = safeFileStat(current);
    if (!stat) return;
    const name = path.basename(current);
    if (isExcludedFilesystemEntry(name, current)) return;
    if (stat.isDirectory()) {
      for (const child of readdirSync(current).sort((a, b) => a.localeCompare(b))) {
        if (matches.length >= limit) break;
        if (child.startsWith(".")) continue;
        visit(path.join(current, child));
      }
      return;
    }
    if (!stat.isFile()) return;
    const relative = rootRelative(rootInfo.directory, current);
    const filenameMatch = relative.toLowerCase().includes(query);
    let contentMatch = false;
    let snippet = "";
    if (isLikelyTextFile(current) && stat.size <= 350_000) {
      const text = readFileSync(current, "utf8");
      const index = text.toLowerCase().indexOf(query);
      contentMatch = index >= 0;
      if (contentMatch) {
        const startIndex = Math.max(0, index - 220);
        snippet = compactText(text.slice(startIndex, startIndex + maxChars), maxChars);
      }
    }
    if (filenameMatch || contentMatch) {
      matches.push({
        path: relative,
        kind: "file",
        size: stat.size,
        modified_at: stat.mtime.toISOString(),
        match: filenameMatch && contentMatch ? "filename_and_content" : filenameMatch ? "filename" : "content",
        snippet,
      });
    }
  }

  visit(start);
  return {
    ok: true,
    operation: "search",
    project: rootInfo.name,
    root_kind: rootInfo.kind,
    path: rootRelative(rootInfo.directory, start) || ".",
    query,
    truncated: matches.length >= limit,
    matches,
  };
}

function listFilesystemProjects() {
  return prithaFilesystemRoots().map((root) => ({
    id: root.id,
    name: root.name,
    kind: root.kind,
    path: rootRelative(resolveTechscopeRoot(), root.directory) || ".",
    absolute_path: root.directory,
    aliases: root.aliases.slice(0, 8),
  }));
}

async function handlePrithaFiles(args: PrithaFilesArgs = {}) {
  const operation = String(args.operation || "status").trim();
  if (operation === "status" || operation === "list_projects") {
    return {
      ok: true,
      operation,
      policy: {
        read_only: true,
        allowed_roots: "Pritha root and sibling child-agent folders with AGENTS.md",
        excluded: Array.from(FILESYSTEM_EXCLUDED_NAMES),
        file_limits: "text files only, max 700KB per read, max_chars capped",
      },
      projects: listFilesystemProjects(),
    };
  }
  if (operation === "tree") return listFilesystemTree(args);
  if (operation === "file_info") return fileInfo(args);
  if (operation === "read_file") return readFilesystemFile(args);
  if (operation === "search") return searchFilesystem(args);
  return { ok: false, error: "unknown_pritha_files_operation", operation };
}

export function buildPrithaRealtimeTools(): RealtimeToolDefinition[] {
  return [
    {
      type: "function",
      name: "search_pritha_memory",
      description:
        "Read-only access to Pritha memory. Use operation=status, search, recent, open, or read. Use this before answering questions about Pritha standards, decisions, workflows, child agents, prior experiments, or stored project knowledge.",
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
      name: "deep_pritha_memory",
      description:
        "Deep Pritha memory operations. Use for semantic or hybrid retrieval, entity/graph traversal, runtime/task log lookup, confirmed reindexing, confirmed embedding rebuilds, and confirmed curated memory writes. Ask the operator how deep to search when uncertain.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: [
              "status",
              "semantic_search",
              "hybrid_search",
              "entity_search",
              "graph_traverse",
              "runtime_search",
              "reindex",
              "rebuild_embeddings",
              "rebuild_embeddings_async",
              "write_note",
              "append_artifact",
            ],
          },
          query: { type: "string" },
          id_or_path: { type: "string" },
          node_type: { type: "string" },
          entity_type: { type: "string" },
          relation_type: { type: "string" },
          depth: { type: "number" },
          limit: { type: "number" },
          max_chars: { type: "number" },
          title: { type: "string" },
          body: { type: "string" },
          artifact_type: { type: "string" },
          target_path: { type: "string" },
          operator_confirmation: {
            type: "string",
            description: "Required for write_note, append_artifact, reindex, rebuild_embeddings, and rebuild_embeddings_async after explicit operator confirmation.",
          },
        },
      },
    },
    {
      type: "function",
      name: "inspect_pritha_files",
      description:
        "Fast read-only filesystem inspection for Pritha and sibling child-agent projects. Use for listing available agent projects, viewing folder trees, reading safe text files, checking file metadata, and searching filenames or text content without starting a Codex task.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["status", "list_projects", "tree", "file_info", "read_file", "search"],
          },
          project: {
            type: "string",
            description: "Project id/name/alias. Use pritha for the main project, or a child-agent name such as FESPA26, FunnyTeacher, or StupidJoke.",
          },
          path: {
            type: "string",
            description: "Relative path inside the selected project. Defaults to project root.",
          },
          query: {
            type: "string",
            description: "Search query for operation=search. Matches filenames and safe text-file content.",
          },
          depth: { type: "number" },
          limit: { type: "number" },
          max_chars: { type: "number" },
          include_hidden: {
            type: "boolean",
            description: "Default false. Sensitive/private hidden directories remain excluded even when true.",
          },
        },
      },
    },
    {
      type: "function",
      name: "inspect_codex_task",
      description:
        "Read-only Codex task status inspection for realtime voice. Use to answer operator questions about running, queued, completed, failed, timed-out, stale, or approval-gated Codex sidecar tasks without starting a new task.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["list_active", "status", "brief", "timeline", "diagnose"],
            description: "Use brief for a short voice-safe answer; diagnose for stuck/error questions; timeline for recent safe operational events.",
          },
          task_id: {
            type: "string",
            description: "Optional Codex task id. If omitted, the most recent active or voice-handoff-required task is used for status/brief/timeline/diagnose.",
          },
          limit: { type: "number" },
          max_events: { type: "number" },
        },
      },
    },
    {
      type: "function",
      name: "run_codex_task",
      description:
        "Start or queue a Codex sidecar task in the current Pritha environment. Use for implementation, repo inspection, deep analysis, review, or internet/current-source research. Do not claim the task is complete unless the returned status says complete.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          task_type: {
            type: "string",
            enum: ["analysis", "research", "implementation", "review", "agent_creation", "system_change"],
          },
          write_mode: {
            type: "string",
            enum: ["read_only", "workspace_write"],
            description:
              "Use workspace_write only when the operator explicitly asked Codex to edit files, implement code, or create a child-agent project. Use read_only for analysis, review, status checks, and research.",
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
  const settings = getPrithaRuntimeSettings();
  return [
    "You are Pritha, a Codex-native agent factory and knowledge assistant.",
    "Speak with the operator in Russian unless they switch language.",
    "This is an experimental realtime voice interface. Keep answers concise, calm and operational.",
    "You have exactly five tools: search_pritha_memory, deep_pritha_memory, inspect_pritha_files, inspect_codex_task and run_codex_task.",
    "Use search_pritha_memory for fast, shallow lookup before answering ordinary questions about Pritha memory, standards, decisions, workflows, child agents, previous UI/realtime experiments, or stored project knowledge.",
    "For exact details after search, call search_pritha_memory with operation=read and id_or_path from a prior result.",
    "Use deep_pritha_memory when the operator asks for deeper or more correct memory work: semantic or hybrid search, entity/graph relation traversal, runtime/task-log memory lookup, reindexing, embedding rebuilds, or curated memory writes/updates.",
    "If you are unsure whether the operator needs quick memory lookup or deep memory investigation, ask how deeply to search before calling deep_pritha_memory.",
    "For deep_pritha_memory write_note, append_artifact, reindex, rebuild_embeddings, or rebuild_embeddings_async, get explicit operator confirmation first and pass it in operator_confirmation. Semantic and hybrid searches may automatically start a background embedding rebuild when embeddings are missing or stale.",
    "Use inspect_pritha_files for fast read-only filesystem work: listing Pritha or child-agent projects, reading AGENTS.md/README/package files, checking folder structure, or searching filenames/text content. It cannot write files and intentionally excludes secrets, private runtime folders, logs, queues, node_modules, build outputs and credentials.",
    "Use inspect_pritha_files instead of run_codex_task when the operator only needs a quick filesystem view or a lightweight comment about how an agent is organized. Escalate to run_codex_task when the operator asks for edits, implementation, deep code reasoning, tests, or a durable review.",
    "Use inspect_codex_task for read-only status checks on Codex sidecar tasks. Use it when the operator asks what is happening with a task, whether it is stuck, whether it failed, what needs approval, or whether there is a recent progress timeline.",
    "inspect_codex_task exposes only safe operational status, phase, last activity, bounded progress events and concise operator briefs. Do not ask for or expose chain-of-thought, raw reasoning deltas, secrets, private memory, or full logs.",
    "Use run_codex_task for implementation, codebase changes, deep repo analysis, reviews, or internet/current-source research. If internet is needed, set requires_internet=true; Codex handles web access.",
    "run_codex_task has one public tool surface but routes internally through the configured deep task transport. Codex App is the default primary transport; Codex CLI is the v1 fallback. A future session-contract transport is reserved but not active.",
    "Voice Control and Codex thread have the same implementation path through run_codex_task. Risky actions are not hard-blocked by voice; the runtime will hold service install, scheduler enablement, deployment, deletion, credential writes or danger-full-access requests as decision_required until the operator approves them in the UI task card.",
    "For creating a new child agent or scaffold project, call run_codex_task with task_type=agent_creation and write_mode=workspace_write after the operator clearly requests that creation. Child-agent projects may be created as sibling folders next to Pritha according to AGENTS.md. Do not copy secrets, .env, private memory, runtime queues, logs or credentials.",
    "For ordinary implementation tasks, set task_type=implementation and write_mode=workspace_write only when the operator asked for code/file changes. Use read_only for analysis, review, research and status checks.",
    "When the operator asks to continue implementation work on an existing or newly created child-agent project, include the exact project/folder name in the task, call run_codex_task with task_type=implementation and write_mode=workspace_write; the runtime will add the matching sibling AGENTS.md project as a writable Codex root.",
    "Do not claim Codex work is complete after starting or queueing a task. Report the task id, status and next operator-visible path.",
    "After run_codex_task returns a running or queued task, do not start another Codex task just to poll that task's status. Use inspect_codex_task for status, brief, timeline or diagnose requests. The Voice UI also monitors Codex task readiness and sends later completion/failure messages when a terminal result or operator brief is available.",
    "If the UI later adds a message that starts with 'Codex sidecar task' and includes 'Result:', treat it as the authoritative completion notification for that task. Summarize the result to the operator immediately instead of saying that you do not automatically know whether Codex finished.",
    "For proactive task updates, stay quiet unless a task finishes, fails, times out, needs approval, appears stale, or has been running for a long time. Keep updates short and do not interrupt the operator with frequent progress chatter.",
    "Do not ask for secrets or expose credentials. For credentials, route the operator to the child-agent credential UI. For publish, deletion, service install, launchd/cron or broad system changes, create a Codex task and let the UI decision gate collect approval.",
    "Realtime tools must not mutate curated Markdown directly except through confirmed deep_pritha_memory memory-write operations or through run_codex_task when its sandbox/write mode permits it. Keep edits narrowly scoped.",
    buildVoiceBehaviorPromptSections(settings.voiceBehaviorProfile),
  ].join("\n\n");
}

export function buildRealtimeSessionConfig() {
  const runtimeSettings = getPrithaRuntimeSettings();
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
        voice: runtimeSettings.prithaVoice,
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

function codexTaskProgressPath(taskDir: string) {
  return path.join(taskDir, "progress.jsonl");
}

function sanitizeCodexTaskProgressEvent(event: PrithaCodexTaskProgressEvent): PrithaCodexTaskProgressEvent {
  const cleaned: Record<string, unknown> = {
    timestamp: event.timestamp || new Date().toISOString(),
    phase: compactText(event.phase || "unknown", 80),
    level: ["info", "warning", "error", "heartbeat", "complete"].includes(String(event.level || ""))
      ? event.level
      : "info",
  };
  for (const [key, value] of Object.entries(event)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) continue;
    if (key in cleaned) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") cleaned[key] = value;
    else if (typeof value === "string") cleaned[key] = compactText(value, key === "message" ? 900 : 240);
  }
  return cleaned as PrithaCodexTaskProgressEvent;
}

async function appendCodexTaskProgress(taskId: unknown, progressPath: string, event: PrithaCodexTaskProgressEvent) {
  const id = safeTaskId(String(taskId || ""));
  if (!id) return;
  const payload = sanitizeCodexTaskProgressEvent({ task_id: id, ...event });
  await appendFile(progressPath, `${JSON.stringify(payload)}\n`, "utf8").catch(() => undefined);
}

function readCodexTaskProgress(progressPath: string, maxEvents = 20) {
  if (!existsSync(progressPath)) return [];
  const max = Math.max(1, Math.min(Number(maxEvents) || 20, 80));
  const lines = readFileSync(progressPath, "utf8").trim().split(/\r?\n/).filter(Boolean).slice(-400);
  const events: PrithaCodexTaskProgressEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as PrithaCodexTaskProgressEvent;
      if (parsed && typeof parsed === "object") events.push(sanitizeCodexTaskProgressEvent(parsed));
    } catch {
      continue;
    }
  }
  return events.slice(-max);
}

function latestProgressEvent(events: PrithaCodexTaskProgressEvent[]) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.timestamp || events[i]?.phase || events[i]?.message) return events[i];
  }
  return undefined;
}

function elapsedMsSince(value: unknown, fallbackEnd: number = Date.now()) {
  const start = Date.parse(String(value || ""));
  if (!Number.isFinite(start)) return undefined;
  return Math.max(0, fallbackEnd - start);
}

function secondsLabel(ms: number | undefined) {
  if (!Number.isFinite(ms || NaN)) return "unknown time";
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${(minutes % 60).toString().padStart(2, "0")}m`;
}

function activeCodexStatus(status: string) {
  return status === "running" || status === "queued" || status === "decision_required";
}

function runtimeSettingsPath() {
  return path.join(privateRoot(), "runtime-settings.json");
}

function defaultRuntimeSettings(): PrithaRuntimeSettings {
  return {
    deepTaskPrimaryTransport: "codex-app",
    codexModel: env("PRITHA_REALTIME_CODEX_MODEL", env("TECHSCOPE_VOICE_CODEX_MODEL", "")),
    codexWorkdir: resolveTechscopeRoot(),
    codexSandbox: "auto",
    codexNetworkAccess: true,
    codexApproval: "never",
    codexTimeoutMs: codexTimeoutMs(),
    voiceBehaviorProfile: normalizeVoiceBehaviorProfile(
      env("PRITHA_REALTIME_BEHAVIOR_PROFILE", env("TECHSCOPE_VOICE_BEHAVIOR_PROFILE", DEFAULT_VOICE_BEHAVIOR_PROFILE)),
    ),
    prithaVoice: normalizePrithaVoice(
      env("PRITHA_REALTIME_VOICE", env("TECHSCOPE_VOICE_REALTIME_VOICE", env("OPENAI_REALTIME_VOICE", DEFAULT_VOICE))),
    ),
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeRuntimeSettings(raw: unknown): PrithaRuntimeSettings {
  const defaults = defaultRuntimeSettings();
  const value = typeof raw === "object" && raw !== null ? (raw as Partial<PrithaRuntimeSettings>) : {};
  const transport = value.deepTaskPrimaryTransport === "codex-cli" ? "codex-cli" : "codex-app";
  const sandbox = ["auto", "read-only", "workspace-write", "danger-full-access"].includes(String(value.codexSandbox))
    ? (value.codexSandbox as PrithaRuntimeSettings["codexSandbox"])
    : defaults.codexSandbox;
  const timeout = Number(value.codexTimeoutMs);
  return {
    deepTaskPrimaryTransport: transport,
    codexModel: String(value.codexModel ?? defaults.codexModel ?? "").trim(),
    codexWorkdir: String(value.codexWorkdir || defaults.codexWorkdir),
    codexSandbox: sandbox,
    codexNetworkAccess: typeof value.codexNetworkAccess === "boolean" ? value.codexNetworkAccess : defaults.codexNetworkAccess,
    codexApproval: "never",
    codexTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.max(10_000, Math.min(timeout, 3_600_000)) : defaults.codexTimeoutMs,
    voiceBehaviorProfile: normalizeVoiceBehaviorProfile(value.voiceBehaviorProfile, defaults.voiceBehaviorProfile),
    prithaVoice: normalizePrithaVoice(value.prithaVoice, defaults.prithaVoice),
    updatedAt: String(value.updatedAt || defaults.updatedAt),
  };
}

export function getPrithaRuntimeSettings() {
  const settingsPath = runtimeSettingsPath();
  if (!existsSync(settingsPath)) return defaultRuntimeSettings();
  try {
    return normalizeRuntimeSettings(JSON.parse(readFileSync(settingsPath, "utf8")));
  } catch {
    return defaultRuntimeSettings();
  }
}

export async function updatePrithaRuntimeSettings(patch: Partial<PrithaRuntimeSettings>) {
  const current = getPrithaRuntimeSettings();
  const next = normalizeRuntimeSettings({ ...current, ...patch, updatedAt: new Date().toISOString() });
  await mkdir(path.dirname(runtimeSettingsPath()), { recursive: true });
  await writeFile(runtimeSettingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await logPrivateEvent("runtime_settings_updated", {
    deepTaskPrimaryTransport: next.deepTaskPrimaryTransport,
    codexSandbox: next.codexSandbox,
    codexNetworkAccess: next.codexNetworkAccess,
    codexTimeoutMs: next.codexTimeoutMs,
    voiceBehaviorProfile: next.voiceBehaviorProfile,
    prithaVoice: next.prithaVoice,
  });
  return next;
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

function normalizeVoiceMemoryEvents(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-80).map((event) => {
    const item = (typeof event === "object" && event !== null ? event : {}) as VoiceMemoryEvent;
    return {
      kind: compactText(item.kind || "event", 40),
      timestamp: compactText(item.timestamp || "", 40),
      taskId: compactText(item.taskId || "", 140),
      status: compactText(item.status || "", 80),
      text: redactSensitiveText(item.text || ""),
    };
  }).filter((event) => event.text);
}

function classifyVoiceSessionMemory(events: ReturnType<typeof normalizeVoiceMemoryEvents>) {
  const text = events.map((event) => `${event.kind} ${event.taskId} ${event.status} ${event.text}`).join(" ").toLowerCase();
  const durableTerms = [
    "pritha",
    "child agent",
    "child-agent",
    "agent",
    "архитект",
    "architecture",
    "ui",
    "ux",
    "voice",
    "realtime",
    "codex",
    "memory",
    "памят",
    "roadmap",
    "settings",
    "deployment",
    "operations",
    "telemetry",
    "handoff",
    "контекст",
  ];
  const disposableTerms = ["bitcoin", "btc", "weather", "price", "курс", "погода"];
  const score = durableTerms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  const disposableScore = disposableTerms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  const userPreference = /\b(prefer|preference|i like|i want|my default)\b|предпоч|я хочу|мне нужно/i.test(text);
  if (score < 2 || (disposableScore > score && score < 4)) {
    return { decision: "skip", reason: "session_does_not_look_like_durable_pritha_or_agent_memory", score, disposableScore };
  }
  if (userPreference && score < 4) {
    return { decision: "private-user-memory", reason: "looks_like_user_preference_without_broad_pritha_architecture_context", score, disposableScore };
  }
  return { decision: "tracked-curated-artifact", reason: "durable_pritha_or_child_agent_design_context", score, disposableScore };
}

function bulletLines(events: ReturnType<typeof normalizeVoiceMemoryEvents>, limit = 12) {
  return events.slice(-limit).map((event) => {
    const head = [event.timestamp, event.kind, event.taskId].filter(Boolean).join(" ");
    return `- ${head ? `${head}: ` : ""}${compactText(event.text, 420)}`;
  });
}

function runMemoryCommand(command: string, args: string[]) {
  const root = resolveTechscopeRoot();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: compactText(result.stdout, 1_000),
    stderr: compactText(result.stderr, 1_000),
  };
}

export async function promoteVoiceSessionMemory(args: VoiceSessionMemoryArgs = {}) {
  const root = resolveTechscopeRoot();
  const sessionId = slugPart(args.session_id || `voice-${new Date().toISOString()}`);
  const events = normalizeVoiceMemoryEvents(args.events);
  const classified = classifyVoiceSessionMemory(events);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const indexDir = path.join(privateRoot(), "session-memory");
  const indexPath = path.join(indexDir, `${sessionId}.json`);
  await mkdir(indexDir, { recursive: true });

  if (!events.length) {
    const result = { ok: true, saved: false, decision: "skip", reason: "empty_session_events" };
    await writeFile(indexPath, `${JSON.stringify({ ...result, updated_at: now.toISOString() }, null, 2)}\n`, "utf8");
    return result;
  }

  if (classified.decision === "skip") {
    const result = { ok: true, saved: false, ...classified };
    await writeFile(indexPath, `${JSON.stringify({ ...result, updated_at: now.toISOString(), event_count: events.length }, null, 2)}\n`, "utf8");
    await logPrivateEvent("voice_session_memory_skipped", { session_id: sessionId, reason: classified.reason, event_count: events.length });
    return result;
  }

  const title = `Voice Session Memory: ${sessionId}`;
  const summaryLines = bulletLines(events);

  if (classified.decision === "private-user-memory") {
    const privateDir = path.join(root, ".private", "user-memory");
    await mkdir(privateDir, { recursive: true });
    const privatePath = path.join(privateDir, `${date}-${sessionId}.md`);
    const body = [
      "---",
      `id: ${date}-${sessionId}-private-user-memory`,
      "type: private-user-memory",
      "status: draft",
      `created: ${date}`,
      `updated: ${date}`,
      "privacy: local-private",
      "retention: indefinite",
      "source_type: voice-session-summary",
      `source_session_id: ${sessionId}`,
      "---",
      "",
      `# ${title}`,
      "",
      "## Curated Summary",
      "",
      ...summaryLines,
      "",
      "## Suggested Target",
      "",
      "- Target: local-private user memory note.",
      `- Path: ${rootRelative(root, privatePath)}`,
      "",
      "## Risks And Open Questions",
      "",
      "- This note is generated from a bounded session summary, not from a full reviewed transcript.",
      "- Promote to a tracked artifact only if the preference affects Pritha or child-agent product behavior.",
      "",
      "Raw transcript was not stored.",
      "",
    ].join("\n");
    await writeFile(privatePath, body, "utf8");
    const result = { ok: true, saved: true, decision: classified.decision, path: rootRelative(root, privatePath), event_count: events.length };
    await writeFile(indexPath, `${JSON.stringify({ ...result, updated_at: now.toISOString() }, null, 2)}\n`, "utf8");
    await logPrivateEvent("voice_session_memory_saved", { session_id: sessionId, path: result.path, decision: classified.decision });
    return result;
  }

  const artifactDir = path.join(root, "03_reviews");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `${date}-${sessionId}-voice-session-memory.md`);
  const artifactId = `${date}-${sessionId}-voice-session-memory`;
  const body = [
    "---",
    `id: ${artifactId}`,
    "type: review",
    "status: draft",
    `created: ${date}`,
    `updated: ${date}`,
    "topics:",
    "  - pritha-control-center",
    "  - realtime-voice",
    "  - codex-sidecar",
    "  - session-memory",
    "tools:",
    "  - OpenAI Realtime API",
    "  - Codex",
    "sources:",
    `  - voice-session:${sessionId}`,
    "related:",
    "  workflows:",
    "    - 07_workflows/2026-06-12-control-center-voice-page-roadmap.md",
    "supersedes: []",
    "superseded_by: []",
    "memory_domain: pritha-self",
    "memory_domains:",
    "  - pritha-self",
    "  - agent-building-knowledge",
    "subject:",
    "  kind: voice-session-memory",
    `  id: ${sessionId}`,
    "privacy: internal",
    "retention: durable",
    "review_status: draft",
    "confidence: medium",
    "---",
    "",
    `# ${title}`,
    "",
    "## Why This Matters",
    "",
    "This is an automatically curated memory note from the Pritha voice-control session. It preserves durable product, architecture, UI, realtime, Codex, memory or operations signals without storing the raw transcript.",
    "",
    "## Durable Signals",
    "",
    ...summaryLines,
    "",
    "## UI And Backend Behavior Clarified",
    "",
    "- The session contained durable signals about Pritha voice control, Codex sidecar operation, memory policy or operator UI behavior.",
    "- This generated note should be treated as a draft evidence artifact, not as a final standard.",
    "",
    "## Child-Agent Implications",
    "",
    "- Patterns captured here may inform future child-agent voice control, session recall, task handoff and curated-memory behavior.",
    "- Before promotion into a standard, compare against child-agent contracts and post-creation reviews.",
    "",
    "## Risks And Open Questions",
    "",
    "- The classifier is intentionally conservative and heuristic; it needs eval examples before it can be trusted for broad automatic writes.",
    "- Duplicate detection and artifact-type routing need more evidence from real voice sessions.",
    "- This artifact does not contain raw transcript, so follow-up reviews may need task ids, telemetry or operator notes for exact provenance.",
    "",
    "## Suggested Target Artifact",
    "",
    "- Suggested type: review.",
    `- Suggested path: ${rootRelative(root, artifactPath)}`,
    "- Promotion path: review evidence first; only later convert stable patterns into decisions, workflows or standards.",
    "",
    "## Routing Decision",
    "",
    `- Decision: ${classified.decision}`,
    `- Reason: ${classified.reason}`,
    `- Durable score: ${classified.score}`,
    `- Disposable score: ${classified.disposableScore}`,
    "",
    "## Exclusions",
    "",
    "- Raw transcript was not stored.",
    "- Secrets, tokens and credential-shaped strings were redacted before writing.",
    "- One-off factual queries are not treated as durable memory unless they clarify Pritha or child-agent behavior.",
    "",
  ].join("\n");
  await writeFile(artifactPath, body, "utf8");
  const checks = await validateAndRebuildMemory();
  const result = {
    ok: checks.ok,
    saved: true,
    decision: classified.decision,
    path: rootRelative(root, artifactPath),
    event_count: events.length,
    validation: checks.validation,
    rebuild: checks.rebuild,
    embeddings: checks.embeddings,
  };
  await writeFile(indexPath, `${JSON.stringify({ ...result, updated_at: now.toISOString() }, null, 2)}\n`, "utf8");
  await logPrivateEvent("voice_session_memory_saved", { session_id: sessionId, path: result.path, decision: classified.decision, ok: result.ok });
  return result;
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
  const result = spawnSync(codexBin(), ["--version"], {
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

function codexBin() {
  return env("PRITHA_REALTIME_CODEX_BIN", env("TECHSCOPE_VOICE_CODEX_BIN", env("CODEX_BIN", "codex")));
}

function codexAppAvailable() {
  const root = resolveTechscopeRoot();
  try {
    const result = checkCodexAppServerAvailable(codexBin(), root);
    return {
      available: result.available,
      detail: compactText(result.detail, 1_200),
    };
  } catch (error) {
    return {
      available: false,
      detail: error instanceof Error ? error.message : "Codex App availability check failed",
    };
  }
}

function codexWorkspaceWriteAllowed() {
  const value = env("PRITHA_REALTIME_CODEX_WRITE_ENABLED", env("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", "explicit")).toLowerCase();
  return value !== "0" && value !== "false" && value !== "disabled" && value !== "read-only";
}

function codexLegacyWriteEnabled() {
  const value = env("PRITHA_REALTIME_CODEX_WRITE_ENABLED", env("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", "explicit")).toLowerCase();
  return value === "1" || value === "true" || value === "workspace-write";
}

function normalizeCodexWriteMode(value: unknown) {
  const text = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (text === "workspace_write") return "workspace_write";
  return "read_only";
}

function isDirectory(directory: string) {
  try {
    return statSync(directory).isDirectory() ? directory : null;
  } catch {
    return null;
  }
}

function splitAgentName(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function normalizeAgentAlias(value: string) {
  return splitAgentName(value).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").replace(/\s+/g, " ").trim();
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function childAgentCompatibilityAliases(directoryName: string) {
  if (directoryName === "StupidJoke") return ["Глупые шутки"];
  return [];
}

function childAgentAliases(directoryName: string) {
  const spaced = splitAgentName(directoryName);
  const normalized = normalizeAgentAlias(spaced);
  const compact = normalized.replace(/\s+/g, "");
  const words = normalized.split(" ").filter(Boolean);
  const pluralLastWord = words.length ? [...words.slice(0, -1), `${words.at(-1)}s`].join(" ") : "";
  return uniqueValues([directoryName, spaced, normalized, compact, pluralLastWord, ...childAgentCompatibilityAliases(directoryName)].map(normalizeAgentAlias));
}

function knownSiblingChildAgentProjects(root: string) {
  const parent = path.dirname(root);
  const rootName = path.basename(root);
  let entries: string[] = [];
  try {
    entries = readdirSync(parent);
  } catch {
    return [];
  }

  return entries.flatMap((entry): ChildAgentProject[] => {
    if (!entry || entry.startsWith(".") || entry === rootName) return [];
    const directory = path.join(parent, entry);
    if (!isDirectory(directory) || !existsSync(path.join(directory, "AGENTS.md"))) return [];
    return [{ name: entry, directory, aliases: childAgentAliases(entry) }];
  });
}

function taskSearchText(task: Record<string, unknown>) {
  const text = [
    task.task,
    task.expected_result,
    task.operator_confirmation,
  ].map((value) => compactText(value, 8_000)).join("\n");
  return normalizeAgentAlias(text);
}

function codexSandboxForTask(taskType: string, writeMode: string) {
  const configured = getPrithaRuntimeSettings().codexSandbox;
  const override = configured === "auto" ? env("PRITHA_REALTIME_CODEX_SANDBOX", env("TECHSCOPE_VOICE_CODEX_SANDBOX", "")).toLowerCase() : configured;
  if (["read-only", "workspace-write", "danger-full-access"].includes(override)) return override;
  if (!codexWorkspaceWriteAllowed()) return "read-only";
  const normalizedTaskType = taskType.toLowerCase();
  if (writeMode === "workspace_write" && ["implementation", "agent_creation", "system_change"].includes(normalizedTaskType)) return "workspace-write";
  if (normalizedTaskType === "agent_creation") return "workspace-write";
  if (codexLegacyWriteEnabled() && ["implementation", "system_change"].includes(normalizedTaskType)) return "workspace-write";
  return "read-only";
}

function existingCodexTaskApproval(task: Record<string, unknown>) {
  return typeof task.approval === "object" && task.approval !== null ? (task.approval as Partial<CodexTaskApproval>) : null;
}

function normalizeCodexTaskApproval(value: Partial<CodexTaskApproval> | null, task: Record<string, unknown>) {
  const status = value?.status === "pending" || value?.status === "approved" || value?.status === "rejected" ? value.status : null;
  if (!status) return null;
  const source = value || {};
  return {
    status,
    action_type: source.action_type || "system_change",
    summary: source.summary || "This Voice Control Codex task needs explicit UI approval before execution.",
    reasons: Array.isArray(source.reasons) ? source.reasons.map((item) => String(item)).filter(Boolean) : codexTaskApprovalReasons(task),
    requested_at: source.requested_at || String(task.created_at || new Date().toISOString()),
    decided_at: source.decided_at,
    decided_by: source.decided_by,
  } satisfies CodexTaskApproval;
}

function codexTaskApprovalReasons(task: Record<string, unknown>) {
  const taskType = String(task.task_type || "analysis").toLowerCase();
  const writeMode = String(task.write_mode || "read_only").toLowerCase();
  const taskText = [
    task.task,
    task.expected_result,
    task.operator_confirmation,
  ].map((value) => compactText(value, 8_000).toLowerCase()).join("\n");
  const sandbox = codexSandboxForTask(taskType, writeMode);
  const reasons: string[] = [];

  if (sandbox === "danger-full-access") reasons.push("danger_full_access_sandbox");
  if (taskType === "system_change") reasons.push("system_change_task_type");
  if (/(deploy|deployment|publish|release|push\s+to\s+github|gh\s+pr|git\s+push)/.test(taskText)) reasons.push("external_publish_or_deployment");
  if (/(delete|remove|destroy|wipe|drop|rm\s+-rf|erase)\b/.test(taskText)) reasons.push("destructive_change");
  if (/(secret|credential|token|api\s*key|password|\.env\.local|private\s+key)/.test(taskText)) reasons.push("credential_or_secret_change");
  if (/(launchctl|launchd|cron|crontab|daemon|service|autostart|startup|background\s+process|heartbeat|queue\s+watcher)/.test(taskText)) {
    if (/(add|create|install|enable|start|load|register|turn\s+on|configure|schedule|set\s+up|activate)/.test(taskText)) {
      reasons.push("scheduler_or_service_enablement");
    }
  }

  return [...new Set(reasons)];
}

function codexTaskApprovalFor(task: Record<string, unknown>, requestedAt = new Date().toISOString()): CodexTaskApproval | null {
  const current = normalizeCodexTaskApproval(existingCodexTaskApproval(task), task);
  if (current?.status === "approved" || current?.status === "rejected") return current;
  const reasons = codexTaskApprovalReasons(task);
  if (!reasons.length) return null;
  const actionType = reasons.includes("credential_or_secret_change")
    ? "credential_or_secret_change"
    : reasons.includes("scheduler_or_service_enablement")
      ? "scheduler_or_service_enablement"
      : reasons.includes("external_publish_or_deployment")
        ? "external_publish_or_deployment"
        : reasons.includes("destructive_change")
          ? "destructive_change"
          : reasons.includes("danger_full_access_sandbox")
            ? "danger_full_access_sandbox"
            : "system_change";
  return {
    status: "pending",
    action_type: actionType,
    summary: "This Voice Control Codex task needs explicit UI approval before execution.",
    reasons,
    requested_at: requestedAt,
  };
}

function codexAdditionalWritableDirs(root: string, task: Record<string, unknown>, sandbox: string) {
  if (sandbox !== "workspace-write") return [];
  const taskType = String(task.task_type || "").toLowerCase();
  if (taskType.toLowerCase() !== "agent_creation") return [];
  return [path.dirname(root)];
}

function codexExistingChildAgentWritableDirs(root: string, task: Record<string, unknown>) {
  const text = taskSearchText(task);
  if (!text) return [];
  return uniqueValues(
    knownSiblingChildAgentProjects(root)
      .filter((project) => project.aliases.some((alias) => alias && text.includes(alias)))
      .map((project) => project.directory),
  );
}

function codexWritableRootEntries(root: string, additionalWritableDirs: string[]) {
  return [root, ...additionalWritableDirs].map((directory) => ({
    path: rootRelative(root, directory) || ".",
    absolute_path: directory,
  }));
}

function codexTimeoutMs() {
  const value = Number(env("PRITHA_REALTIME_CODEX_TIMEOUT_MS", env("TECHSCOPE_VOICE_CODEX_TIMEOUT_MS", String(DEFAULT_CODEX_TIMEOUT_MS))));
  return Number.isFinite(value) && value > 0 ? Math.max(10_000, Math.min(value, 3_600_000)) : DEFAULT_CODEX_TIMEOUT_MS;
}

function codexEffectiveTimeoutMs() {
  return getPrithaRuntimeSettings().codexTimeoutMs || codexTimeoutMs();
}

function buildCodexPrompt(task: Record<string, unknown>) {
  const root = resolveTechscopeRoot();
  const childAgentProjects = knownSiblingChildAgentProjects(root);
  const childAgentList = childAgentProjects
    .map((project) => rootRelative(root, project.directory))
    .sort()
    .slice(0, 20)
    .join(", ");
  return [
    "You are the Codex sidecar for Pritha Control Center realtime voice.",
    "Work in the current Pritha repository and follow AGENTS.md.",
    "Return a concise non-empty final result for the voice operator. Do not expose secrets.",
    "If the task needs current internet facts, browse or use available network-capable tools through Codex.",
    "For write/system-change requests, make only narrowly scoped changes and report verification.",
    "If task_type is agent_creation, you may create a new sibling child-agent project folder next to Pritha when the task asks for it. Use the parent directory from the task payload as the sibling-agent parent. Follow AGENTS.md, create the required contract/scaffold/report artifacts, and do not copy secrets, .env, private memory, queues, logs or credentials.",
    "Do not modify unrelated sibling projects in the sibling-agent parent. Use that parent only to create or update the child-agent project requested by the operator.",
    childAgentList
      ? `Existing sibling child-agent projects with AGENTS.md: ${childAgentList}. If the task explicitly asks to work on one of them, use that sibling project and keep edits inside it unless the operator separately asks for Pritha or Control Center changes.`
      : "If the task explicitly asks to work on an existing sibling child-agent project but no matching sibling AGENTS.md project is available, report the missing writable project as the blocker.",
    "If the active sandbox is read-only and the task needs writes, report the blocker instead of pretending the files were changed.",
    "Do not publish, delete, install services, change launchd/cron, or make broad deployment changes unless this task payload includes an approved UI decision gate.",
    "If the task involves credentials or secrets, do not write secret values from voice/model context. Use Control Center credential UI, .env.example placeholders, or operator-facing instructions.",
    "If the request is unsafe, ambiguous, or impossible, say so and return the smallest useful next step.",
    "",
    "Task payload:",
    JSON.stringify(task, null, 2),
  ].join("\n");
}

function normalizeCodexTaskType(value: unknown): PrithaCodexTaskType {
  const text = String(value || "analysis").trim();
  if (["analysis", "research", "implementation", "review", "agent_creation", "system_change"].includes(text)) return text as PrithaCodexTaskType;
  return "analysis";
}

function genericCodexTaskExpectedSchema() {
  return {
    status: "ok|error|decision_required",
    text: "concise operator-facing result or completion summary",
    data: {
      summary: "short technical summary",
      refs: ["file paths, commands, or source references"],
      changedFiles: ["changed file paths"],
      nextActions: ["operator-visible next actions"],
      structuredJson: "optional JSON string for task-specific details",
    },
    errors: ["error text"],
    warnings: ["warning text"],
  };
}

function buildPrithaCodexTaskPayload(task: Record<string, unknown>): PrithaCodexTaskPayload {
  const root = resolveTechscopeRoot();
  return {
    requestId: String(task.id || randomUUID()),
    userId: "pritha-voice-operator",
    taskType: normalizeCodexTaskType(task.task_type),
    userIntent: compactText(task.task || "", 8_000),
    projectContext: {
      project: "Pritha",
      cwd: root,
      interface: "realtime",
      focus: ["Pritha", "Control Center", "child agents", "memory", "voice control"],
    },
    data: {
      source: "pritha-control-center-realtime",
      writeMode: task.write_mode,
      priority: task.priority,
      requiresInternet: task.requires_internet,
      expectedResult: task.expected_result,
      operatorConfirmation: task.operator_confirmation,
      prompt: buildCodexPrompt(task),
      siblingAgentParent: task.sibling_agent_parent_absolute,
    },
    constraints: [
      "Do not expose secrets, .env values, credentials, private memory, runtime queues, or unnecessary raw logs.",
      "Use the existing Pritha and Control Center conventions.",
      "For write/system-change tasks, make narrowly scoped changes and report changed files plus verification.",
      "For agent_creation tasks, create or update sibling child-agent projects only when explicitly requested by the operator.",
      String(task.requires_internet) === "true" || Boolean(task.requires_internet)
        ? "Current-source research and network access are allowed for this task."
        : "Do not browse unless needed to verify unstable or external facts.",
    ],
    expectedResponse: {
      format: "json",
      schema: genericCodexTaskExpectedSchema(),
    },
  };
}

function statusForCodexAppError(error: unknown): "failed_timeout" | "failed" {
  return error instanceof Error && /timeout|timed out/i.test(error.message) ? "failed_timeout" : "failed";
}

function codexAppResultText(result: PrithaCodexTaskResult) {
  const lines = [
    result.text || result.data?.summary || "",
    result.warnings.length ? `\nWarnings:\n${result.warnings.map((item) => `- ${item}`).join("\n")}` : "",
    result.errors.length ? `\nErrors:\n${result.errors.map((item) => `- ${item}`).join("\n")}` : "",
    result.data ? `\nStructured result:\n${JSON.stringify(result.data, null, 2)}` : "",
  ];
  return `${lines.filter(Boolean).join("\n").trim() || "Codex App completed without an operator-facing text result."}\n`;
}

function codexAppSandboxPolicyForTask(task: Record<string, unknown>, sandbox: string, writableRoots: Array<{ absolute_path: string }>) {
  if (sandbox === "workspace-write") {
    return {
      type: "workspaceWrite",
      writableRoots: writableRoots.map((entry) => entry.absolute_path),
      networkAccess: getPrithaRuntimeSettings().codexNetworkAccess,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };
  }
  if (sandbox === "danger-full-access") return { type: "dangerFullAccess" };
  return { type: "readOnly", networkAccess: getPrithaRuntimeSettings().codexNetworkAccess };
}

async function startCodexAppTask(
  task: Record<string, unknown>,
  paths: { resultPath: string; statusPath: string; stdoutPath: string; stderrPath: string; progressPath: string },
) {
  const root = resolveTechscopeRoot();
  const taskType = String(task.task_type || "analysis");
  const sandbox = codexSandboxForTask(taskType, String(task.write_mode || "read_only"));
  const additionalWritableDirs = [
    ...codexAdditionalWritableDirs(root, task, sandbox),
    ...(sandbox === "workspace-write" ? codexExistingChildAgentWritableDirs(root, task) : []),
  ];
  const writableRoots = codexWritableRootEntries(root, additionalWritableDirs);
  const timeoutMs = codexEffectiveTimeoutMs();
  const startedAt = new Date().toISOString();
  const payload = buildPrithaCodexTaskPayload(task);
  const taskId = String(task.id || payload.requestId);
  const progress = (event: PrithaCodexTaskProgressEvent) => appendCodexTaskProgress(taskId, paths.progressPath, event);

  await writeFile(
    paths.statusPath,
    `${JSON.stringify(
      {
        status: "running",
        phase: "runner_started",
        transport: "codex-app",
        sandbox,
        writable_roots: writableRoots,
        timeout_ms: timeoutMs,
        started_at: startedAt,
        result_path: rootRelative(root, paths.resultPath),
        stdout_path: rootRelative(root, paths.stdoutPath),
        stderr_path: rootRelative(root, paths.stderrPath),
      },
      null,
      2,
    )}\n`,
    "utf8",
  ).catch(() => undefined);
  await progress({
    phase: "runner_started",
    level: "info",
    status: "running",
    transport: "codex-app",
    message: "Codex App sidecar started in the local Pritha environment.",
  });

  const client = new PrithaCodexAppServerClient({
    codexBin: codexBin(),
    cwd: root,
    clientName: "pritha-voice-control",
    buildSandboxPolicy: () => codexAppSandboxPolicyForTask(task, sandbox, writableRoots),
  });
  const heartbeat = setInterval(() => {
    void progress({
      phase: "heartbeat",
      level: "heartbeat",
      status: "running",
      transport: "codex-app",
      message: "Codex App task is still running.",
      elapsed_ms: elapsedMsSince(startedAt),
    });
  }, 30_000);
  heartbeat.unref();

  void client.runTask(payload, { timeoutMs, userId: "pritha-voice-operator", onProgress: progress }).then(async (raw) => {
    clearInterval(heartbeat);
    const finishedAt = new Date().toISOString();
    const result = normalizeCodexTaskResult(raw, payload.requestId, startedAt, "codex-app");
    const status = result.status === "ok" || result.status === "decision_required" ? "complete" : "failed";
    await writeFile(paths.resultPath, codexAppResultText(result), "utf8").catch(() => undefined);
    await writeFile(
      paths.statusPath,
      `${JSON.stringify(
        {
          status,
          phase: status === "complete" ? "completed" : "failed",
          transport: "codex-app",
          codex_app_status: result.status,
          sandbox,
          writable_roots: writableRoots,
          timeout_ms: timeoutMs,
          started_at: startedAt,
          completed_at: finishedAt,
          result_path: rootRelative(root, paths.resultPath),
          stdout_path: rootRelative(root, paths.stdoutPath),
          stderr_path: rootRelative(root, paths.stderrPath),
          warnings: result.warnings,
          errors: result.errors,
        },
        null,
        2,
      )}\n`,
      "utf8",
    ).catch(() => undefined);
    await progress({
      phase: status === "complete" ? "completed" : "failed",
      level: status === "complete" ? "complete" : "error",
      status,
      transport: "codex-app",
      message: status === "complete" ? "Codex App task completed." : "Codex App task failed.",
      elapsed_ms: elapsedMsSince(startedAt, Date.parse(finishedAt)),
    });
  }).catch(async (error) => {
    clearInterval(heartbeat);
    const finishedAt = new Date().toISOString();
    const status = statusForCodexAppError(error);
    const message = error instanceof Error ? error.message : "Codex App task failed";
    const fallbackTask = {
      ...task,
      effective_transport: "codex-cli",
      fallback_from: "codex-app",
      fallback_reason: message,
    };

    if (String(task.fallback_transport || "") === "codex-cli" && codexAvailable().available) {
      await progress({
        phase: "fallback_started",
        level: "warning",
        status: "running",
        transport: "codex-cli",
        message: `Codex App transport failed; starting Codex CLI fallback. ${compactText(message, 500)}`,
        elapsed_ms: elapsedMsSince(startedAt, Date.parse(finishedAt)),
      });
      await appendFile(paths.stderrPath, `${finishedAt} Codex App transport failed: ${message}\n${finishedAt} Starting Codex CLI fallback for the same task.\n`, "utf8").catch(() => undefined);
      await startCodexExec(fallbackTask, paths);
      return;
    }

    await writeFile(paths.resultPath, `Codex App transport failed.\n\n${compactText(message, 4_000)}\n`, "utf8").catch(() => undefined);
    await appendFile(paths.stderrPath, `${finishedAt} ${message}\n`, "utf8").catch(() => undefined);
    await writeFile(
      paths.statusPath,
      `${JSON.stringify(
        {
          status,
          phase: status,
          transport: "codex-app",
          error: message,
          sandbox,
          writable_roots: writableRoots,
          timeout_ms: timeoutMs,
          started_at: startedAt,
          completed_at: finishedAt,
          result_path: rootRelative(root, paths.resultPath),
          stdout_path: rootRelative(root, paths.stdoutPath),
          stderr_path: rootRelative(root, paths.stderrPath),
        },
        null,
        2,
      )}\n`,
      "utf8",
    ).catch(() => undefined);
    await progress({
      phase: status,
      level: "error",
      status,
      transport: "codex-app",
      message,
      elapsed_ms: elapsedMsSince(startedAt, Date.parse(finishedAt)),
    });
  });

  return {
    transport: "codex-app",
    sandbox,
    writable_roots: writableRoots,
    timeout_ms: timeoutMs,
    result_path: rootRelative(root, paths.resultPath),
  };
}

function normalizeCodexTaskResult(raw: unknown, requestId: string, startedAt: string, transport: string): PrithaCodexTaskResult {
  const finishedAt = new Date().toISOString();
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const allowed: PrithaCodexTaskStatus[] = ["ok", "error", "timeout", "unavailable", "decision_required"];
  const status = allowed.includes(value.status as PrithaCodexTaskStatus) ? (value.status as PrithaCodexTaskStatus) : "error";
  const errors = Array.isArray(value.errors) ? value.errors.map((item) => String(item)).filter(Boolean).slice(0, 12) : [];
  const warnings = Array.isArray(value.warnings) ? value.warnings.map((item) => String(item)).filter(Boolean).slice(0, 12) : [];
  const data = typeof value.data === "object" && value.data !== null && !Array.isArray(value.data) ? (value.data as Record<string, unknown>) : undefined;
  return {
    requestId,
    status,
    text: typeof value.text === "string" ? value.text.trim() : undefined,
    data,
    errors,
    warnings,
    startedAt,
    finishedAt,
    transport: typeof value.transport === "string" ? value.transport : transport,
  };
}

async function startCodexExec(
  task: Record<string, unknown>,
  paths: { resultPath: string; statusPath: string; stdoutPath: string; stderrPath: string; progressPath: string },
) {
  const root = resolveTechscopeRoot();
  const settings = getPrithaRuntimeSettings();
  const taskType = String(task.task_type || "analysis");
  const sandbox = codexSandboxForTask(taskType, String(task.write_mode || "read_only"));
  const additionalWritableDirs = [
    ...codexAdditionalWritableDirs(root, task, sandbox),
    ...(sandbox === "workspace-write" ? codexExistingChildAgentWritableDirs(root, task) : []),
  ];
  const writableRoots = codexWritableRootEntries(root, additionalWritableDirs);
  const config = ['approval_policy="never"'];
  if (sandbox === "workspace-write") config.push(`sandbox_workspace_write.network_access=${settings.codexNetworkAccess ? "true" : "false"}`);
  if (sandbox === "read-only") config.push(`sandbox_read_only.network_access=${settings.codexNetworkAccess ? "true" : "false"}`);

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
    ...additionalWritableDirs.flatMap((directory) => ["--add-dir", directory]),
    "-o",
    paths.resultPath,
    "-",
  ];
  const model = settings.codexModel || env("PRITHA_REALTIME_CODEX_MODEL", env("TECHSCOPE_VOICE_CODEX_MODEL", ""));
  if (model) args.splice(1, 0, "-m", model);

  const stdoutFd = openSync(paths.stdoutPath, "a");
  const stderrFd = openSync(paths.stderrPath, "a");
  const timeoutMs = codexEffectiveTimeoutMs();
  const startedAt = new Date().toISOString();
  const taskId = String(task.id || "");
  const progress = (event: PrithaCodexTaskProgressEvent) => appendCodexTaskProgress(taskId, paths.progressPath, event);
  let killedByTimeout = false;
  const child = spawn(codexBin(), args, {
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
          phase: "runner_started",
          transport: "codex-cli",
          pid: child.pid,
        sandbox,
        writable_roots: writableRoots,
        timeout_ms: timeoutMs,
        started_at: startedAt,
        result_path: rootRelative(root, paths.resultPath),
        stdout_path: rootRelative(root, paths.stdoutPath),
        stderr_path: rootRelative(root, paths.stderrPath),
      },
      null,
      2,
    )}\n`,
    "utf8",
  ).catch(() => undefined);
  await progress({
    phase: "runner_started",
    level: "info",
    status: "running",
    transport: "codex-cli",
    message: "Codex CLI sidecar process started.",
    pid: child.pid,
  });

  const heartbeat = setInterval(() => {
    void progress({
      phase: "heartbeat",
      level: "heartbeat",
      status: "running",
      transport: "codex-cli",
      message: "Codex CLI task is still running.",
      elapsed_ms: elapsedMsSince(startedAt),
    });
  }, 30_000);
  heartbeat.unref();

  const timer = setTimeout(() => {
    killedByTimeout = true;
    void progress({
      phase: "timeout_signal",
      level: "warning",
      status: "running",
      transport: "codex-cli",
      message: "Codex CLI task reached its timeout; sending termination signal.",
      elapsed_ms: elapsedMsSince(startedAt),
    });
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
  }, timeoutMs);
  timer.unref();

  child.on("close", async (code, signal) => {
    clearTimeout(timer);
    clearInterval(heartbeat);
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
          phase: status === "complete" ? "completed" : status,
          transport: "codex-cli",
          fallback_from: typeof task.fallback_from === "string" ? task.fallback_from : undefined,
          code,
          signal,
          killed_by_timeout: killedByTimeout,
          sandbox,
          writable_roots: writableRoots,
          timeout_ms: timeoutMs,
          started_at: startedAt,
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
    await progress({
      phase: status === "complete" ? "completed" : status,
      level: status === "complete" ? "complete" : "error",
      status,
      transport: "codex-cli",
      message:
        status === "complete"
          ? "Codex CLI task completed."
          : status === "failed_timeout"
            ? "Codex CLI task timed out before producing a final result."
            : status === "failed_empty_result"
              ? "Codex CLI task exited without a final operator-facing result."
              : "Codex CLI task failed.",
      code: code ?? undefined,
      signal: signal ?? undefined,
      elapsed_ms: elapsedMsSince(startedAt),
    });
  });

  child.unref();
  return {
    pid: child.pid,
    sandbox,
    writable_roots: writableRoots,
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

  const settings = getPrithaRuntimeSettings();
  const requestedMode = codexMode();
  const requestedTransport = settings.deepTaskPrimaryTransport;
  const cli = codexAvailable();
  const app = requestedMode === "queue" ? { available: false, detail: "disabled by queue mode" } : codexAppAvailable();
  const fallbackTransport = requestedTransport === "codex-app" ? "codex-cli" : "codex-app";
  const effectiveTransport: DeepTaskPrimaryTransport | "queue" =
    requestedMode === "queue"
      ? "queue"
      : requestedTransport === "codex-app" && app.available
        ? "codex-app"
        : requestedTransport === "codex-cli" && cli.available
          ? "codex-cli"
          : fallbackTransport === "codex-app" && app.available
            ? "codex-app"
            : fallbackTransport === "codex-cli" && cli.available
              ? "codex-cli"
              : "queue";
  const effectiveMode = effectiveTransport === "queue" ? "queue" : "exec";
  const task: Record<string, unknown> = {
    id: taskId,
    created_at: now.toISOString(),
    source: "pritha-control-center-realtime",
    status: effectiveMode === "exec" ? "running" : "queued",
    task: taskText.slice(0, 8_000),
    task_type: String(args.task_type || "analysis"),
    write_mode: normalizeCodexWriteMode(args.write_mode),
    priority: String(args.priority || "normal"),
    requires_internet: Boolean(args.requires_internet),
    expected_result: String(args.expected_result || "concise operator-facing answer"),
    operator_confirmation: String(args.operator_confirmation || ""),
    root: rootRelative(root, root),
    sibling_agent_parent: rootRelative(root, path.dirname(root)),
    sibling_agent_parent_absolute: path.dirname(root),
    requested_transport: requestedTransport,
    fallback_transport: fallbackTransport,
    effective_transport: effectiveTransport,
  };
  const approval = codexTaskApprovalFor(task, now.toISOString());
  if (approval?.status === "pending") {
    task.status = "decision_required";
    task.approval = approval;
  }

  const requestPath = path.join(taskDir, "request.json");
  const promptPath = path.join(taskDir, "prompt.md");
  const statusPath = path.join(taskDir, "status.json");
  const resultPath = path.join(taskDir, "result.md");
  const stdoutPath = path.join(taskDir, "stdout.log");
  const stderrPath = path.join(taskDir, "stderr.log");
  const progressPath = codexTaskProgressPath(taskDir);
  const progress = (event: PrithaCodexTaskProgressEvent) => appendCodexTaskProgress(taskId, progressPath, event);

  await writeFile(requestPath, `${JSON.stringify(task, null, 2)}\n`, "utf8");
  await writeFile(promptPath, `${buildCodexPrompt(task)}\n`, "utf8");
  await writeFile(statusPath, `${JSON.stringify({ status: task.status, phase: task.status, created_at: task.created_at, approval: task.approval }, null, 2)}\n`, "utf8");
  await progress({
    phase: String(task.status || "created"),
    level: task.status === "decision_required" ? "warning" : "info",
    status: String(task.status || "created"),
    transport: String(effectiveTransport),
    message:
      task.status === "decision_required"
        ? "Codex task captured and waiting for explicit operator approval."
        : effectiveTransport === "queue"
          ? "Codex task captured in the private local queue."
          : "Codex task created and ready for sidecar execution.",
  });

  let exec: Awaited<ReturnType<typeof startCodexExec>> | Awaited<ReturnType<typeof startCodexAppTask>> | null = null;
  if (task.status === "decision_required") {
    await logPrivateEvent("codex_task_decision_required", { task_id: taskId, approval });
  } else if (effectiveTransport === "codex-app") {
    exec = await startCodexAppTask(task, { resultPath, statusPath, stdoutPath, stderrPath, progressPath });
  } else if (effectiveTransport === "codex-cli") {
    exec = await startCodexExec(task, { resultPath, statusPath, stdoutPath, stderrPath, progressPath });
  }

  return {
    ok: true,
    task_id: taskId,
    status: task.status,
    mode: task.status === "decision_required" ? "approval" : effectiveMode,
    requested_mode: requestedMode,
    requested_transport: requestedTransport,
    effective_transport: effectiveTransport,
    fallback_transport: fallbackTransport,
    transport_availability: {
      codex_app: app,
      codex_cli: cli,
      codex_session: {
        available: false,
        detail: "Reserved for a future Pritha session-contract transport.",
      },
    },
    request_path: rootRelative(root, requestPath),
    prompt_path: rootRelative(root, promptPath),
    status_path: rootRelative(root, statusPath),
    result_path: rootRelative(root, resultPath),
    progress_path: rootRelative(root, progressPath),
    approval,
    exec,
    operator_note:
      task.status === "decision_required"
        ? "Codex task is waiting for explicit approval in the Pritha UI task card."
        : effectiveTransport === "codex-app"
        ? "Codex App sidecar started in the local Pritha environment."
        : effectiveTransport === "codex-cli"
          ? "Codex CLI sidecar started in the local Pritha environment."
          : "Task captured in private local queue because Codex transports are unavailable or disabled.",
  };
}

function safeTaskId(taskId: string) {
  const id = String(taskId || "").trim();
  return /^[0-9A-Za-z._:-]+$/.test(id) && !id.includes("/") && !id.includes("\\") && id.length <= 120 ? id : "";
}

function taskTelemetryFromEvents(taskId?: string) {
  const eventsPath = path.join(privateRoot(), "events.jsonl");
  if (!existsSync(eventsPath)) return [];
  const lines = readFileSync(eventsPath, "utf8").trim().split(/\r?\n/).filter(Boolean).slice(-600);
  const rows: PrivateEventRow[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as PrivateEventRow;
      const eventTaskId = typeof event.task_id === "string" ? event.task_id : "";
      const payloadTaskId =
        typeof event.payload === "object" && event.payload !== null && "task_id" in event.payload
          ? String((event.payload as { task_id?: unknown }).task_id || "")
          : "";
      if (!taskId || eventTaskId === taskId || payloadTaskId === taskId) rows.push(event);
    } catch {
      continue;
    }
  }
  return rows.slice(-30);
}

function lastPrivateEvent(events: PrivateEventRow[], kind: string) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].kind === kind) return events[i];
  }
  return undefined;
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

const TERMINAL_CODEX_TASK_STATUSES = new Set(["complete", "failed", "failed_timeout", "failed_empty_result", "rejected"]);

function codexTaskActivity(params: {
  status: Record<string, unknown> | null;
  request: Record<string, unknown> | null;
  statusValue: string;
  complete: boolean;
  statMtime: string;
  progress: PrithaCodexTaskProgressEvent[];
}) {
  const lastProgress = latestProgressEvent(params.progress);
  const phase = String(params.status?.phase || lastProgress?.phase || (params.complete ? params.statusValue : params.statusValue || "unknown"));
  const lastActivityAt = String(lastProgress?.timestamp || params.status?.updated_at || params.status?.completed_at || params.status?.started_at || params.request?.created_at || params.statMtime || "");
  const lastActivity = compactText(lastProgress?.message || params.status?.error || phase || params.statusValue, 260);
  const createdAt = String(params.request?.created_at || params.status?.started_at || "");
  const completedAt = String(params.status?.completed_at || "");
  const endMs = params.complete && Date.parse(completedAt) ? Date.parse(completedAt) : Date.now();
  const elapsedMs = elapsedMsSince(createdAt, Number.isFinite(endMs) ? endMs : Date.now());
  const timeoutMs = Number(params.status?.timeout_ms || params.request?.timeout_ms || codexEffectiveTimeoutMs());
  const lastActivityMs = Date.parse(lastActivityAt);
  const staleThresholdMs = Math.min(Math.max(90_000, Number.isFinite(timeoutMs) ? timeoutMs / 2 : 120_000), 300_000);
  const stale =
    activeCodexStatus(params.statusValue) &&
    Number.isFinite(lastActivityMs) &&
    Date.now() - lastActivityMs > staleThresholdMs;
  return {
    phase,
    lastActivityAt,
    lastActivity,
    elapsedMs,
    stale,
  };
}

function codexTaskOperatorBrief(params: {
  id: string;
  statusValue: string;
  task: unknown;
  resultText: string;
  approval: unknown;
  complete: boolean;
  phase: string;
  elapsedMs?: number;
  stale: boolean;
  lastActivity: string;
  lastActivityAt: string;
}) {
  const shortId = params.id.slice(0, 28);
  const elapsed = secondsLabel(params.elapsedMs);
  const task = compactText(params.task || params.id, 120);
  const result = compactText(params.resultText, 700);
  if (params.statusValue === "decision_required") {
    const approval = typeof params.approval === "object" && params.approval !== null ? (params.approval as { summary?: unknown; action_type?: unknown }) : {};
    return compactText(
      `Codex task ${shortId} is waiting for UI approval (${approval.action_type || "decision_required"}). ${approval.summary || "Approve or reject it in the Codex task card."}`,
      900,
    );
  }
  if (params.statusValue === "failed_timeout") {
    return compactText(
      result ||
        `Codex task ${shortId} timed out after ${elapsed}. It did not produce a final operator-facing result. Last activity: ${params.lastActivity || params.phase}.`,
      900,
    );
  }
  if (params.statusValue === "failed_empty_result") {
    return compactText(result || `Codex task ${shortId} exited without a final operator-facing result after ${elapsed}.`, 900);
  }
  if (params.statusValue.startsWith("failed")) {
    return compactText(result || `Codex task ${shortId} failed after ${elapsed}. Last activity: ${params.lastActivity || params.phase}.`, 900);
  }
  if (params.statusValue === "rejected") {
    return compactText(result || `Codex task ${shortId} was rejected before execution.`, 900);
  }
  if (params.statusValue === "complete") {
    return compactText(result || `Codex task ${shortId} completed after ${elapsed}.`, 900);
  }
  if (params.stale) {
    return compactText(
      `Codex task ${shortId} may be stalled. It has been ${elapsed}; last activity was ${params.lastActivityAt || "unknown"} (${params.lastActivity || params.phase}).`,
      900,
    );
  }
  if (activeCodexStatus(params.statusValue)) {
    return compactText(`Codex task ${shortId} is ${params.statusValue} after ${elapsed}. Phase: ${params.phase}. Last activity: ${params.lastActivity || "not recorded yet"}.`, 900);
  }
  return compactText(`Codex task ${shortId} status is ${params.statusValue || "unknown"}. Task: ${task}.`, 900);
}

async function repairStaleCodexTaskStatus(
  id: string,
  request: Record<string, unknown> | null,
  status: Record<string, unknown> | null,
  paths: { statusPath: string; resultPath: string; progressPath: string },
  resultText: string,
) {
  const statusValue = String(status?.status || request?.status || "unknown");
  if (statusValue !== "running") return { status, resultText, repaired: false };

  const startedAt = String(status?.started_at || request?.created_at || "");
  const startedMs = Date.parse(startedAt);
  const timeoutMs = Number(status?.timeout_ms || request?.timeout_ms || codexEffectiveTimeoutMs());
  const stale = Number.isFinite(startedMs) && Date.now() - startedMs > Math.max(1_000, timeoutMs) + 30_000;
  const pid = status?.pid;
  const livePid = pid ? processIsAlive(pid) : false;
  if (!stale && (!pid || livePid)) return { status, resultText, repaired: false };

  const repairedStatus = resultText.trim() ? "complete" : "failed_timeout";
  const now = new Date().toISOString();
  const nextResultText = resultText.trim()
    ? resultText
    : [
        "Codex task did not produce a final result before the runner stopped or timed out.",
        "",
        `Task id: ${id}`,
        `Previous status: ${statusValue}`,
        `Started at: ${startedAt || "unknown"}`,
        `Timeout ms: ${Number.isFinite(timeoutMs) ? timeoutMs : "unknown"}`,
      ].join("\n");
  if (!resultText.trim()) await writeFile(paths.resultPath, `${nextResultText}\n`, "utf8").catch(() => undefined);

  const repaired = {
    ...(status || {}),
    status: repairedStatus,
    phase: repairedStatus === "complete" ? "completed" : "stale_repaired",
    repaired_stale_status: true,
    previous_status: statusValue,
    completed_at: String(status?.completed_at || now),
    updated_at: now,
    stale_reason: pid && !livePid ? "runner_pid_not_alive" : "timeout_elapsed_without_terminal_status",
  };
  await writeFile(paths.statusPath, `${JSON.stringify(repaired, null, 2)}\n`, "utf8").catch(() => undefined);
  await appendCodexTaskProgress(id, paths.progressPath, {
    phase: "stale_repaired",
    level: repairedStatus === "complete" ? "complete" : "error",
    status: repairedStatus,
    message:
      repairedStatus === "complete"
        ? "Stale running status repaired after result file was found."
        : "Codex task did not produce a final result before the runner stopped or timed out.",
    reason: repaired.stale_reason,
  });
  await logPrivateEvent("codex_task_stale_status_repaired", { task_id: id, status: repairedStatus, reason: repaired.stale_reason });
  return { status: repaired, resultText: nextResultText, repaired: true };
}

async function codexTaskSummary(id: string) {
  const root = resolveTechscopeRoot();
  const taskDir = path.join(privateRoot(), "codex-tasks", id);
  const requestPath = path.join(taskDir, "request.json");
  const statusPath = path.join(taskDir, "status.json");
  const resultPath = path.join(taskDir, "result.md");
  const progressPath = codexTaskProgressPath(taskDir);
  const request = await readJsonFile(requestPath);
  const initialStatus = await readJsonFile(statusPath);
  const initialResultText = await readFile(resultPath, "utf8").catch(() => "");
  const repaired = await repairStaleCodexTaskStatus(id, request, initialStatus, { statusPath, resultPath, progressPath }, initialResultText);
  const status = repaired.status;
  const resultText = repaired.resultText;
  const statusValue = String(status?.status || request?.status || "unknown");
  const stat = statSync(taskDir);
  const complete = TERMINAL_CODEX_TASK_STATUSES.has(statusValue);
  const telemetry = taskTelemetryFromEvents(id);
  const progress = readCodexTaskProgress(progressPath, 12);
  const lastProgress = latestProgressEvent(progress);
  const handoffSent = lastPrivateEvent(telemetry, "codex_task_result_handoff_sent");
  const handoffSkipped = lastPrivateEvent(telemetry, "codex_task_result_handoff_skipped");
  const handoffStatus = handoffSent ? "sent" : handoffSkipped ? "skipped" : "pending";
  const handoffReason = handoffSkipped ? String(handoffSkipped.reason || "unknown") : undefined;
  const approval = request?.approval || (status && "approval" in status ? status.approval : null);
  const activity = codexTaskActivity({
    status,
    request,
    statusValue,
    complete,
    statMtime: stat.mtime.toISOString(),
    progress,
  });
  const operatorBrief = codexTaskOperatorBrief({
    id,
    statusValue,
    task: request?.task || id,
    resultText,
    approval,
    complete,
    phase: activity.phase,
    elapsedMs: activity.elapsedMs,
    stale: activity.stale,
    lastActivity: activity.lastActivity,
    lastActivityAt: activity.lastActivityAt,
  });

  return {
    task_id: id,
    status: statusValue,
    complete,
    phase: activity.phase,
    elapsed_ms: activity.elapsedMs,
    last_activity_at: activity.lastActivityAt,
    last_activity: activity.lastActivity,
    stale: activity.stale,
    operator_brief: operatorBrief,
    voice_handoff_required: (complete || statusValue === "decision_required" || activity.stale) && handoffStatus === "pending",
    created_at: String(request?.created_at || stat.birthtime.toISOString()),
    updated_at: String(status?.updated_at || stat.mtime.toISOString()),
    task: compactText(request?.task || id, 240),
    task_type: String(request?.task_type || "analysis"),
    result_available: Boolean(resultText.trim()),
    result_excerpt: compactText(resultText, 900),
    approval,
    handoff_status: handoffStatus,
    handoff_reason: handoffReason,
    paths: {
      request: rootRelative(root, requestPath),
      status: rootRelative(root, statusPath),
      result: rootRelative(root, resultPath),
      progress: rootRelative(root, progressPath),
    },
    progress_timeline: progress.map((event) => ({
      timestamp: event.timestamp,
      phase: event.phase,
      level: event.level,
      message: event.message,
      status: event.status,
      transport: event.transport,
    })),
    telemetry: telemetry.slice(-8).map((event) => ({
      timestamp: event.timestamp,
      kind: event.kind,
      status: event.status,
      reason: event.reason,
      channel_state: event.channel_state,
      result_available: event.result_available,
      result_chars: event.result_chars,
    })),
  };
}

export async function listPrithaCodexTasks(limit = 5) {
  const root = privateRoot();
  const tasksRoot = path.join(root, "codex-tasks");
  if (!existsSync(tasksRoot)) return { ok: true, tasks: [] };
  const max = Math.max(1, Math.min(Number(limit) || 5, 20));
  const ids = readdirSync(tasksRoot)
    .filter((entry) => safeTaskId(entry) === entry)
    .map((entry) => ({ id: entry, mtime: statSync(path.join(tasksRoot, entry)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, max)
    .map((entry) => entry.id);

  const tasks = [];
  for (const id of ids) {
    tasks.push(await codexTaskSummary(id));
  }
  await logPrivateEvent("codex_task_list_readback", { ok: true, count: tasks.length });
  return { ok: true, tasks };
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
  const progressPath = codexTaskProgressPath(taskDir);
  const request = await readJsonFile(requestPath);
  const initialStatus = await readJsonFile(statusPath);
  const initialResultText = await readFile(resultPath, "utf8").catch(() => "");
  const repaired = await repairStaleCodexTaskStatus(id, request, initialStatus, { statusPath, resultPath, progressPath }, initialResultText);
  const status = repaired.status;
  const resultText = repaired.resultText;
  const stdoutText = await readFile(stdoutPath, "utf8").catch(() => "");
  const stderrText = await readFile(stderrPath, "utf8").catch(() => "");
  const statusValue = String(status?.status || request?.status || "unknown");
  const complete = TERMINAL_CODEX_TASK_STATUSES.has(statusValue);
  const resultAvailable = Boolean(resultText.trim());
  const telemetry = taskTelemetryFromEvents(id);
  const progress = readCodexTaskProgress(progressPath, 30);
  const approval = request?.approval || (status && "approval" in status ? status.approval : null);
  const stat = statSync(taskDir);
  const handoffSent = lastPrivateEvent(telemetry, "codex_task_result_handoff_sent");
  const handoffSkipped = lastPrivateEvent(telemetry, "codex_task_result_handoff_skipped");
  const handoffStatus = handoffSent ? "sent" : handoffSkipped ? "skipped" : "pending";
  const activity = codexTaskActivity({
    status,
    request,
    statusValue,
    complete,
    statMtime: stat.mtime.toISOString(),
    progress,
  });
  const operatorBrief = codexTaskOperatorBrief({
    id,
    statusValue,
    task: request?.task || id,
    resultText,
    approval,
    complete,
    phase: activity.phase,
    elapsedMs: activity.elapsedMs,
    stale: activity.stale,
    lastActivity: activity.lastActivity,
    lastActivityAt: activity.lastActivityAt,
  });

  await logPrivateEvent("codex_task_readback", {
    ok: true,
    task_id: id,
    status: statusValue,
    phase: activity.phase,
    complete,
    result_available: resultAvailable,
  });

  return {
    ok: true,
    task_id: id,
    status: statusValue,
    complete,
    phase: activity.phase,
    elapsed_ms: activity.elapsedMs,
    last_activity_at: activity.lastActivityAt,
    last_activity: activity.lastActivity,
    stale: activity.stale,
    operator_brief: operatorBrief,
    voice_handoff_required: (complete || statusValue === "decision_required" || activity.stale) && handoffStatus === "pending",
    request,
    status_detail: status,
    approval,
    telemetry,
    result_available: resultAvailable,
    result_excerpt: compactText(resultText, 5_000),
    stdout_excerpt: compactText(stdoutText, 2_000),
    stderr_excerpt: compactText(stderrText, 2_000),
    paths: {
      request: rootRelative(root, requestPath),
      status: rootRelative(root, statusPath),
      result: rootRelative(root, resultPath),
      stdout: rootRelative(root, stdoutPath),
      stderr: rootRelative(root, stderrPath),
      progress: rootRelative(root, progressPath),
    },
    progress_timeline: progress,
  };
}

function codexTaskToolView(task: Record<string, unknown>, maxEvents = 8) {
  return {
    task_id: task.task_id,
    status: task.status,
    complete: task.complete,
    phase: task.phase,
    elapsed_ms: task.elapsed_ms,
    last_activity_at: task.last_activity_at,
    last_activity: task.last_activity,
    stale: task.stale,
    task: task.task || (typeof task.request === "object" && task.request !== null ? (task.request as { task?: unknown }).task : undefined),
    task_type: task.task_type || (typeof task.request === "object" && task.request !== null ? (task.request as { task_type?: unknown }).task_type : undefined),
    result_available: task.result_available,
    result_excerpt: compactText(task.result_excerpt, 900),
    approval: task.approval,
    operator_brief: task.operator_brief,
    voice_handoff_required: task.voice_handoff_required,
    handoff_status: task.handoff_status,
    handoff_reason: task.handoff_reason,
    progress_timeline: Array.isArray(task.progress_timeline) ? task.progress_timeline.slice(-maxEvents) : [],
    paths: task.paths,
  };
}

function codexTaskDiagnosis(task: Record<string, unknown>) {
  const status = String(task.status || "unknown");
  if (status === "decision_required") return "approval_required";
  if (status === "failed_timeout") return "timeout";
  if (status === "failed_empty_result") return "empty_result";
  if (status.startsWith("failed")) return "failed";
  if (status === "complete") return "complete";
  if (task.stale) return "possibly_stale";
  if (status === "running") return "running";
  if (status === "queued") return "queued";
  if (status === "rejected") return "rejected";
  return "unknown";
}

async function latestCodexTaskForInspection(limit: number) {
  const listed = await listPrithaCodexTasks(limit);
  if (!listed.ok) return null;
  const tasks = Array.isArray(listed.tasks) ? listed.tasks : [];
  return tasks.find((task) => activeCodexStatus(String(task.status || "")) || task.voice_handoff_required) || tasks[0] || null;
}

async function inspectCodexTask(args: InspectCodexTaskArgs = {}) {
  const operation = String(args.operation || (args.task_id ? "status" : "list_active"));
  const limit = Math.max(1, Math.min(Number(args.limit) || 8, 20));
  const maxEvents = Math.max(1, Math.min(Number(args.max_events) || 8, 30));

  if (operation === "list_active") {
    const listed = await listPrithaCodexTasks(limit);
    if (!listed.ok) return listed;
    const tasks = (listed.tasks || []).filter((task) => activeCodexStatus(String(task.status || "")) || task.voice_handoff_required);
    return {
      ok: true,
      operation,
      count: tasks.length,
      tasks: tasks.map((task) => codexTaskToolView(task as Record<string, unknown>, maxEvents)),
    };
  }

  if (!["status", "brief", "timeline", "diagnose"].includes(operation)) {
    return { ok: false, operation, error: "unknown_codex_task_operation" };
  }

  const requestedId = safeTaskId(String(args.task_id || ""));
  const selected = requestedId ? null : await latestCodexTaskForInspection(limit);
  const taskId = requestedId || String(selected?.task_id || "");
  if (!taskId) return { ok: false, operation, error: "no_codex_tasks" };

  const detail = await getPrithaCodexTask(taskId);
  if (!detail.ok) return { operation, ...detail };
  const view = codexTaskToolView(detail as Record<string, unknown>, maxEvents);
  if (operation === "brief") {
    return {
      ok: true,
      operation,
      task_id: taskId,
      status: view.status,
      phase: view.phase,
      stale: view.stale,
      operator_brief: view.operator_brief,
    };
  }
  if (operation === "timeline") {
    return {
      ok: true,
      operation,
      task_id: taskId,
      status: view.status,
      phase: view.phase,
      progress_timeline: view.progress_timeline,
      operator_brief: view.operator_brief,
    };
  }
  if (operation === "diagnose") {
    return {
      ok: true,
      operation,
      task_id: taskId,
      diagnosis: codexTaskDiagnosis(view),
      status: view.status,
      phase: view.phase,
      stale: view.stale,
      voice_handoff_required: view.voice_handoff_required,
      operator_brief: view.operator_brief,
      last_activity_at: view.last_activity_at,
      last_activity: view.last_activity,
    };
  }
  return { ok: true, operation, ...view };
}

export async function decidePrithaCodexTask(taskId: string, action: CodexTaskApprovalAction) {
  const id = safeTaskId(taskId);
  if (!id) {
    await logPrivateEvent("codex_task_approval_decision", { ok: false, error: "invalid_task_id" });
    return { ok: false, error: "invalid_task_id" };
  }

  const root = resolveTechscopeRoot();
  const taskDir = path.join(privateRoot(), "codex-tasks", id);
  if (!isPathInsideOrSame(privateRoot(), taskDir) || !existsSync(taskDir)) {
    await logPrivateEvent("codex_task_approval_decision", { ok: false, error: "task_not_found", task_id: id });
    return { ok: false, error: "task_not_found", task_id: id };
  }

  const requestPath = path.join(taskDir, "request.json");
  const promptPath = path.join(taskDir, "prompt.md");
  const statusPath = path.join(taskDir, "status.json");
  const resultPath = path.join(taskDir, "result.md");
  const stdoutPath = path.join(taskDir, "stdout.log");
  const stderrPath = path.join(taskDir, "stderr.log");
  const progressPath = codexTaskProgressPath(taskDir);
  const progress = (event: PrithaCodexTaskProgressEvent) => appendCodexTaskProgress(id, progressPath, event);
  const request = await readJsonFile(requestPath);
  if (!request) {
    await logPrivateEvent("codex_task_approval_decision", { ok: false, error: "request_missing", task_id: id });
    return { ok: false, error: "request_missing", task_id: id };
  }

  const currentApproval = normalizeCodexTaskApproval(existingCodexTaskApproval(request), request) || codexTaskApprovalFor(request, String(request.created_at || new Date().toISOString()));
  if (!currentApproval || currentApproval.status !== "pending") {
    await logPrivateEvent("codex_task_approval_decision", { ok: false, error: "approval_not_pending", task_id: id });
    return { ok: false, error: "approval_not_pending", task_id: id };
  }

  const decidedAt = new Date().toISOString();
  const approval: CodexTaskApproval = {
    ...currentApproval,
    status: action === "approve" ? "approved" : "rejected",
    decided_at: decidedAt,
    decided_by: "pritha-control-center-ui",
  };
  const nextRequest: Record<string, unknown> = {
    ...request,
    approval,
    operator_confirmation: action === "approve" ? "Approved through Pritha Control Center UI decision gate." : String(request.operator_confirmation || ""),
    status: action === "approve" ? request.status : "rejected",
  };

  if (action === "reject") {
    nextRequest.status = "rejected";
    await writeFile(requestPath, `${JSON.stringify(nextRequest, null, 2)}\n`, "utf8");
    await writeFile(resultPath, "Codex task rejected by the operator before execution.\n", "utf8").catch(() => undefined);
    await writeFile(
      statusPath,
      `${JSON.stringify(
        {
          status: "rejected",
          phase: "rejected",
          approval,
          completed_at: decidedAt,
          result_path: rootRelative(root, resultPath),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await progress({
      phase: "rejected",
      level: "warning",
      status: "rejected",
      message: "Codex task rejected by the operator before execution.",
    });
    await logPrivateEvent("codex_task_approval_decision", { ok: true, task_id: id, action, status: "rejected" });
    return getPrithaCodexTask(id);
  }

  const effectiveTransport = String(request.effective_transport || "queue");
  nextRequest.status = effectiveTransport === "queue" ? "queued" : "running";
  await writeFile(requestPath, `${JSON.stringify(nextRequest, null, 2)}\n`, "utf8");
  await writeFile(promptPath, `${buildCodexPrompt(nextRequest)}\n`, "utf8");

  let exec: Awaited<ReturnType<typeof startCodexExec>> | Awaited<ReturnType<typeof startCodexAppTask>> | null = null;
  await progress({
    phase: "approval_approved",
    level: "info",
    status: String(nextRequest.status || "running"),
    message: "Operator approved the Codex task decision gate.",
  });
  if (effectiveTransport === "codex-app") {
    exec = await startCodexAppTask(nextRequest, { resultPath, statusPath, stdoutPath, stderrPath, progressPath });
  } else if (effectiveTransport === "codex-cli") {
    exec = await startCodexExec(nextRequest, { resultPath, statusPath, stdoutPath, stderrPath, progressPath });
  } else {
    await writeFile(
      statusPath,
      `${JSON.stringify(
        {
          status: "queued",
          phase: "queued",
          approval,
          updated_at: decidedAt,
          result_path: rootRelative(root, resultPath),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await progress({
      phase: "queued",
      level: "info",
      status: "queued",
      message: "Approved Codex task remains queued because no execution transport is available.",
    });
  }

  await logPrivateEvent("codex_task_approval_decision", { ok: true, task_id: id, action, status: nextRequest.status, effective_transport: effectiveTransport });
  return { ...(await getPrithaCodexTask(id)), exec };
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
  } else if (name === "deep_pritha_memory") {
    output = await handleDeepPrithaMemory(args);
  } else if (name === "inspect_pritha_files") {
    output = await handlePrithaFiles(args);
  } else if (name === "inspect_codex_task") {
    output = await inspectCodexTask(args);
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
  const codexApp = codexAppAvailable();
  const runtimeSettings = getPrithaRuntimeSettings();
  return {
    ok: true,
    root,
    model: config.model,
    voice: config.audio.output.voice,
    voice_behavior_profile: runtimeSettings.voiceBehaviorProfile,
    voice_options: PRITHA_FEMININE_VOICE_OPTIONS,
    behavior_profile_options: VOICE_BEHAVIOR_PROFILE_OPTIONS,
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
      primary_transport: runtimeSettings.deepTaskPrimaryTransport,
      available: codex.available,
      detail: codex.detail,
      write_enabled: codexWorkspaceWriteAllowed(),
      settings: runtimeSettings,
      transports: {
        codex_app: codexApp,
        codex_cli: codex,
        codex_session: {
          available: false,
          detail: "Reserved for a future Pritha session-contract transport.",
        },
      },
    },
    private_root: rootRelative(root, privateRoot()),
  };
}
