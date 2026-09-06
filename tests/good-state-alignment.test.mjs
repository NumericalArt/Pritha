import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/good-state-alignment.mjs");

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 10_000, killSignal: "SIGKILL", ...options });
}

function seedIndex(root, database, id) {
  const reportPath = `11_agents/reports/${id}-good-state-baseline.md`;
  mkdirSync(path.dirname(path.join(root, reportPath)), { recursive: true });
  writeFileSync(path.join(root, reportPath), `---\nid: ${id}\nstatus: accepted\nupdated: 2026-09-05\n---\n\n# Good State Baseline: probes\n\n## Accepted Behavior\n\nProbes preserve the ${id} instance.\n`);
  mkdirSync(path.dirname(database), { recursive: true });
  const result = run("sqlite3", [database, `
    CREATE TABLE documents(id TEXT, type TEXT, status TEXT, path TEXT, title TEXT, updated_at TEXT, indexed_at TEXT);
    INSERT INTO documents VALUES('${id}', 'agent-operations-report', 'accepted', '${reportPath}', 'Good State Baseline: probes', '2026-09-05', '2026-09-05');
  `]);
  assert.equal(result.status, 0, result.stderr);
}

for (const scenario of [
  { name: "loads instance state from checkout .env", file: ".env", expected: "configured" },
  { name: "loads instance state from checkout .env.local", file: ".env.local", expected: "configured" },
  { name: "preserves an explicit state-root override", file: ".env", override: "override", expected: "override" },
  { name: "preserves legacy index fallback without external configuration", expected: "legacy" },
  { name: "does not fall back to legacy memory when the configured index is missing", override: "missing", expected: null },
]) {
  test(`Good State Alignment ${scenario.name}`, () => {
    const base = mkdtempSync(path.join(os.tmpdir(), "pritha-baseline-env-"));
    const root = path.join(base, "Pritha");
    try {
      seedIndex(root, path.join(root, ".memory", "techscope.sqlite"), "legacy");
      for (const id of ["configured", "override"]) {
        seedIndex(root, path.join(base, id, "memory", "techscope.sqlite"), id);
      }
      if (scenario.file) writeFileSync(path.join(root, scenario.file), `PRITHA_STATE_ROOT=${path.join(base, "configured")}\n`);
      const env = { ...process.env, TECHSCOPE_ROOT: root };
      delete env.PRITHA_STATE_ROOT;
      if (scenario.override) env.PRITHA_STATE_ROOT = path.join(base, scenario.override);
      const result = run(process.execPath, [script, "--scope", "probes", "--limit", "1", "--json"], { cwd: root, env });
      assert.equal(result.status, scenario.expected ? 0 : 2, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(payload.baselines.map((baseline) => baseline.id), scenario.expected ? [scenario.expected] : []);
      if (!scenario.expected) assert.equal(payload.status, "memory-index-missing");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}
