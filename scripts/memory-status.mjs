#!/usr/bin/env node
import { exists, printStatus, readJson, run } from "./status-lib.mjs";

const manifest = readJson("memory/manifest.json");
const stats = run("node", ["scripts/query-memory.mjs", "stats"]);
const status = {
  name: "memory",
  ok: Boolean(manifest.source_of_truth) && exists(".memory/techscope.sqlite") && stats.ok,
  agent: manifest.agent || "unknown",
  profile: manifest.profile || "unknown",
  source_of_truth: manifest.source_of_truth || "unknown",
  sqlite: exists(".memory/techscope.sqlite"),
  stats: stats.ok ? "available" : "failed",
  items: [
    ...(manifest.directories || []).map((dir) => ({ name: dir, status: exists(dir) ? "present" : "missing" })),
    ...(manifest.derived_indexes || []).map((item) => ({ name: item, status: "derived" })),
  ],
};

printStatus(status);
if (!status.ok) process.exit(1);
