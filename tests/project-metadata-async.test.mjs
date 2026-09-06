import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readProjectMetadataAsync } from "../scripts/agents-mother/project-metadata-async.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-project-metadata-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "operations"));
  return root;
}

test("bounded worker reads manifest and credential metadata without modifying the project", async t => {
  const root = fixture(t);
  writeFileSync(path.join(root, "operations/manifest.json"), JSON.stringify({ agent: "fixture", health_command: { argv: ["node", "health.mjs"] } }));
  writeFileSync(path.join(root, ".env.example"), "DEMO_API_KEY=\n");
  writeFileSync(path.join(root, ".env.local"), "DEMO_API_KEY=synthetic-value\n", { mode: 0o600 });
  const result = await readProjectMetadataAsync(root);
  assert.equal(result.manifest.manifest.agent, "fixture");
  assert.equal(result.manifest.issue, null);
  assert.equal(result.envExample.status, "read");
  assert.equal(result.envLocal.text, "DEMO_API_KEY=synthetic-value\n");
  assert.equal(result.envLocal.mode, "0600");
});

test("missing metadata differs from symlinks and special files", async t => {
  const root = fixture(t);
  const absent = await readProjectMetadataAsync(root);
  assert.equal(absent.manifest.present, false);
  assert.equal(absent.manifest.issue, null);
  assert.equal(absent.envLocal.status, "missing");
  writeFileSync(path.join(root, "private-source"), "DO_NOT_DISCLOSE");
  symlinkSync(path.join(root, "private-source"), path.join(root, ".env.local"));
  assert.equal(spawnSync("mkfifo", [path.join(root, "operations/manifest.json")]).status, 0);
  const unsafe = await readProjectMetadataAsync(root);
  assert.equal(unsafe.manifest.issue, "operations-manifest-invalid-or-unsafe");
  assert.equal(unsafe.envLocal.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(unsafe), /DO_NOT_DISCLOSE/);
});

test("blocked OS file opens cannot freeze the host or outlive the queued request deadline", async t => {
  const root = fixture(t);
  const codeRoot = path.join(root, "host");
  mkdirSync(path.join(codeRoot, "scripts/agents-mother"), { recursive: true });
  const fifo = path.join(root, "blocked-open");
  assert.equal(spawnSync("mkfifo", [fifo]).status, 0);
  writeFileSync(path.join(codeRoot, "scripts/agents-mother/project-metadata-worker.mjs"),
    `import {readFileSync} from 'node:fs'; process.on('SIGTERM',()=>{}); readFileSync(${JSON.stringify(fifo)});`);
  let ticks = 0;
  const ticker = setInterval(() => { ticks++; }, 10);
  const started = Date.now();
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => readProjectMetadataAsync(root, { codeRoot, timeoutMs: 250 })));
    assert.ok(ticks >= 5, "host event loop must remain responsive during blocked file opens");
    assert.ok(Date.now() - started < 1800, "queue wait belongs to the same deadline");
    assert.ok(results.every(result => result.manifest.issue === "project-metadata-timeout"));
    assert.ok(results.every(result => result.envLocal.status === "unavailable" && !result.envLocal.text));
  } finally { clearInterval(ticker); }
});
