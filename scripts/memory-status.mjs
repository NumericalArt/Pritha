#!/usr/bin/env node
import { resolvePrithaMemoryDatabase } from "./lib/state-files.mjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { printStatus, readJson, run } from "./status-lib.mjs";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolvePrithaRoot } from "./lib/paths.mjs";

const root = resolvePrithaRoot();
loadPrithaRuntimeEnv({ root });
const manifest = readJson("memory/manifest.json");
const stats = run("node", ["scripts/query-memory.mjs", "stats"]);
const databasePath = resolvePrithaMemoryDatabase();
const status = {
  name: "memory",
  ok: Boolean(manifest.source_of_truth) && existsSync(databasePath) && stats.ok,
  agent: manifest.agent || "unknown",
  profile: manifest.profile || "unknown",
  source_of_truth: manifest.source_of_truth || "unknown",
  sqlite: existsSync(databasePath),
  stats: stats.ok ? "available" : "failed",
  items: [
    ...(manifest.directories || []).map((dir) => ({ name: dir, status: existsSync(path.join(root, dir)) ? "present" : "missing" })),
    ...(manifest.derived_indexes || []).map((item) => ({ name: item, status: "derived" })),
  ],
};

printStatus(status);
if (!status.ok) process.exit(1);
