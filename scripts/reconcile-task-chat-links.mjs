#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function repoRoot() {
  return process.env.TECHSCOPE_ROOT ? path.resolve(process.env.TECHSCOPE_ROOT) : process.cwd();
}

function privateTaskRoot(root) {
  const stateRoot = process.env.PRITHA_STATE_ROOT ? path.resolve(process.env.PRITHA_STATE_ROOT) : root;
  return stateRoot === root
    ? path.join(root, ".private", "interface-lab", "pritha-control-center", "realtime", "codex-tasks")
    : path.join(stateRoot, "private", "interface-lab", "pritha-control-center", "realtime", "codex-tasks");
}

function candidates(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((taskId) => {
    const progressPath = path.join(directory, taskId, "progress.jsonl");
    if (!existsSync(progressPath)) return [];
    const events = readFileSync(progressPath, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    const resolved = events.filter((event) => String(event.phase || "").endsWith("thread_resolved") && event.thread_id);
    return resolved.length ? [{ taskId, resolvedThreads: new Set(resolved.map((event) => String(event.thread_id))).size }] : [];
  });
}

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;
const root = repoRoot();
const rows = candidates(privateTaskRoot(root));

if (dryRun) {
  process.stdout.write(`${JSON.stringify({ mode: "dry-run", candidateTasks: rows.length, candidateThreads: rows.reduce((sum, row) => sum + row.resolvedThreads, 0) }, null, 2)}\n`);
  process.exit(0);
}

const port = Number(process.env.PRITHA_CONTROL_CENTER_PORT || 3420);
let cursor = null;
let linkedThreads = 0;
do {
  const query = new URLSearchParams({ group: "voice_work", limit: "50" });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`http://127.0.0.1:${port}/api/codex-chat/v1/threads?${query}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Task Chat reconciliation failed with HTTP ${response.status}`);
  const payload = await response.json();
  linkedThreads += Array.isArray(payload?.data?.data) ? payload.data.data.length : 0;
  cursor = typeof payload?.data?.nextCursor === "string" ? payload.data.nextCursor : null;
} while (cursor);
process.stdout.write(`${JSON.stringify({ mode: "apply", candidateTasks: rows.length, linkedThreads }, null, 2)}\n`);
