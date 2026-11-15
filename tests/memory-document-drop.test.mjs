import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { archivedMemoryDocumentsSince, documentDropFinding } from "../scripts/lib/memory-document-drop.mjs";

test("documents moved by agent removal explain a drop; anything more is still a regression", t => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-drop-"));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const manifest = (name, removedAt, status, moves) => {
    mkdirSync(path.join(stateRoot, "archive", "agents", name), { recursive: true });
    writeFileSync(path.join(stateRoot, "archive", "agents", name, "manifest.json"), JSON.stringify({ status, removedAt, moves }));
  };
  const memory = (n) => Array.from({ length: n }, (_, i) => ({ kind: "memory", from: `/state/agents/reports/r${i}.md` }));
  manifest("old-2026-11-01", "2026-11-01T10:00:00.000Z", "removed", memory(5));
  manifest("mood-2026-11-15", "2026-11-15T19:00:00.000Z", "removed", [...memory(4), { kind: "project", from: "/children/mood" }, { kind: "memory", from: "/state/agents/research/a.json" }]);
  manifest("yes-2026-11-15", "2026-11-15T19:01:00.000Z", "restored", memory(3));
  mkdirSync(path.join(stateRoot, "archive", "agents", "broken"));
  assert.equal(archivedMemoryDocumentsSince(stateRoot, "2026-11-15T18:00:00.000Z"), 4, "only removals after the previous run, only .md memory moves");
  assert.equal(archivedMemoryDocumentsSince(stateRoot, ""), 0);
  assert.equal(archivedMemoryDocumentsSince(path.join(stateRoot, "missing"), "2026-11-15T18:00:00.000Z"), 0);
  assert.equal(documentDropFinding(1204, 1210, 0), null);
  assert.equal(documentDropFinding(1204, 1204, 0), null);
  assert.equal(documentDropFinding(1204, 1033, 178).kind, "warning");
  const unexplained = documentDropFinding(1204, 1033, 100);
  assert.equal(unexplained.kind, "regression"); assert.equal(unexplained.severity, "critical");
  assert.match(unexplained.message, /only 100 were moved to the agent archive/);
  assert.equal(documentDropFinding(10, 9, 0).id, "document-count-drop");
});
