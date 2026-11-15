import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ControlCenterStatus } from "./types";

// The Developer page answers three questions from saved evidence: what is
// installed, what the factory is doing and where it is stuck, and which agents
// need the user. Everything here is read-only and bounded.

export type DeveloperRelease = {
  name: string;
  status: string;
  commit: string;
  build: string;
  previousBuild: string | null;
  at: string | null;
  checks: Array<{ id: string; status: string }>;
  rollbackRetained: boolean;
};

export type DeveloperBuild = {
  agent: string;
  runId: string;
  status: string;
  phase: string;
  iteration: number;
  maxIterations: number;
  tokensUsed: number;
  maxTokens: number;
  builder: string | null;
  updatedAt: string | null;
  windowEndsAt: string | null;
  windowEnded: boolean;
  blocker: { code: string; summary: string } | null;
  failedChecks: Array<{ id: string; detail: string }>;
  chatHref: string | null;
};

export type DeveloperAttention = { id: string; name: string; reason: string };

export type DeveloperConsole = {
  release: DeveloperRelease | null;
  builds: DeveloperBuild[];
  attention: DeveloperAttention[];
};

const MAX_RUNS = 400;
const readJson = (file: string): Record<string, unknown> | null => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
};
const dirs = (dir: string) => {
  try { return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => path.join(dir, entry.name)); } catch { return []; }
};
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
// Saved output is already redacted; this also hides home paths from the page.
const tidy = (value: string) => value.replace(/\/(?:Users|home)\/[^\s'"]+/g, (match) => path.basename(match)).replace(/\s+/g, " ").trim().slice(0, 220);

function latestRelease(stateRoot: string): DeveloperRelease | null {
  const rows = dirs(path.join(stateRoot, "releases")).flatMap((dir) => {
    const value = readJson(path.join(dir, "release.json"));
    return value ? [{ dir, value, at: text(value.updatedAt) || statSync(dir).mtime.toISOString() }] : [];
  }).sort((a, b) => b.at.localeCompare(a.at));
  const latest = rows[0];
  if (!latest) return null;
  const value = latest.value;
  const checkIds = ["strictHealth", "operationalHealth", "desktopMobileUi", "typecheck", "postInstallSelfTest", "fleet", "finalIsolation"];
  return {
    name: path.basename(latest.dir),
    status: text(value.status, "unknown"),
    commit: text(value.commit).slice(0, 12),
    build: text(value.build || value.liveBuild),
    previousBuild: text(value.previousBuild) || null,
    at: latest.at,
    checks: checkIds.filter((id) => typeof value[id] === "string").map((id) => ({ id, status: String(value[id]) })),
    rollbackRetained: value.rollbackRetained === true,
  };
}

function failedChecks(runDir: string) {
  const results = path.join(runDir, "trial-results");
  let files: string[] = [];
  try { files = readdirSync(results).filter((name) => /^verification-\d+\.json$/.test(name)).sort(); } catch { return []; }
  const latest = files.at(-1);
  const value = latest ? readJson(path.join(results, latest)) : null;
  const trials = Array.isArray(value?.trials) ? (value.trials as Array<Record<string, unknown>>) : [];
  return trials.filter((trial) => trial.status !== "passed").slice(0, 4).map((trial) => {
    const execution = (trial.execution || {}) as Record<string, unknown>;
    const lines = `${text(execution.stderr)}\n${text(execution.stdout)}`.split("\n").map((line) => line.trim()).filter(Boolean);
    const line = lines.find((entry) => /Error|failed|must|expected/i.test(entry) && !/^at /.test(entry)) || lines[0] || text(trial.status);
    return { id: text(trial.id, "trial"), detail: tidy(line) };
  });
}

function buildRuns(stateRoot: string): DeveloperBuild[] {
  const sessions = new Map<string, string>();
  for (const dir of dirs(path.join(stateRoot, "agents", "voice-factory"))) {
    const session = readJson(path.join(dir, "session.json"));
    if (session && typeof session.runId === "string" && typeof session.chatId === "string") sessions.set(session.runId, session.chatId);
  }
  const runs = dirs(path.join(stateRoot, "builds")).flatMap(dirs).slice(0, MAX_RUNS).flatMap((dir) => {
    const ledger = readJson(path.join(dir, "build-state.json"));
    return ledger ? [{ dir, ledger }] : [];
  });
  return runs.map(({ dir, ledger }) => {
    const budget = (ledger.budget || {}) as Record<string, unknown>;
    const turns = Array.isArray(budget.accounted_turns) ? (budget.accounted_turns as Array<Record<string, unknown>>) : [];
    const last = turns.at(-1);
    const blocker = Array.isArray(ledger.blockers) ? (ledger.blockers[0] as Record<string, unknown> | undefined) : undefined;
    const created = Date.parse(text(ledger.created_at));
    const windowEnd = Number.isFinite(created) && number(budget.max_elapsed_ms) ? created + number(budget.max_elapsed_ms) : null;
    const runId = text(ledger.run_id, path.basename(dir));
    const chatId = sessions.get(runId);
    const status = text(ledger.status, "unknown");
    return {
      agent: text(ledger.agent_slug, path.basename(path.dirname(dir))),
      runId,
      status,
      phase: text(ledger.phase),
      iteration: number(ledger.iteration),
      maxIterations: number(budget.max_iterations),
      tokensUsed: number(budget.tokens_used),
      maxTokens: number(budget.max_tokens),
      builder: last ? text(last.model_observed || last.model_requested) || null : null,
      updatedAt: text(ledger.updated_at) || null,
      windowEndsAt: windowEnd ? new Date(windowEnd).toISOString() : null,
      windowEnded: Boolean(windowEnd && Date.now() >= windowEnd && !["verified", "accepted", "abandoned", "awaiting_acceptance"].includes(status)),
      blocker: blocker ? { code: text(blocker.code), summary: tidy(text(blocker.summary)) } : null,
      failedChecks: ["verified", "accepted", "awaiting_acceptance"].includes(status) ? [] : failedChecks(dir),
      chatHref: chatId ? `/task-chat?group=all&chat=${encodeURIComponent(chatId)}` : null,
    };
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 12);
}

function attention(status: ControlCenterStatus): DeveloperAttention[] {
  return status.childAgents.flatMap((agent) => {
    const verification = agent.resultReadiness?.verification?.status;
    const reasons: string[] = [];
    if (verification === "failed") reasons.push("Its checks failed on the current version.");
    if (agent.readiness?.status === "blocked" && agent.agentKind?.kind !== "legacy-unclassified") reasons.push(agent.readiness.summary || "Blocked.");
    if (agent.credentials && typeof agent.credentials === "object" && "missingRequired" in agent.credentials && Number(agent.credentials.missingRequired) > 0) reasons.push("A required credential is missing.");
    return reasons.length ? [{ id: agent.id, name: agent.name, reason: reasons.join(" ") }] : [];
  }).slice(0, 12);
}

export function readDeveloperConsole(status: ControlCenterStatus, stateRoot: string): DeveloperConsole {
  if (!existsSync(stateRoot)) return { release: null, builds: [], attention: [] };
  return { release: latestRelease(stateRoot), builds: buildRuns(stateRoot), attention: attention(status) };
}
