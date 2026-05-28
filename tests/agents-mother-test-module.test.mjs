import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { detectProject, fileExists, readJsonIfExists } from "../scripts/agents-mother/test.mjs";

const root = path.resolve(".");

test("Agents Mother test module detects the TechScope harness", () => {
  const detection = detectProject(root);
  assert.equal(detection.classification, "agent-project");
  assert.ok(detection.signals.some((signal) => signal.includes("AGENTS.md")));
  assert.ok(fileExists(root, "scripts/agents-mother.mjs"));
});

test("test module reads optional JSON manifests safely", () => {
  assert.equal(readJsonIfExists(root, "missing/manifest.json"), null);
  const pkg = readJsonIfExists(root, "package.json");
  assert.equal(typeof pkg, "object");
  assert.equal(typeof pkg.scripts, "object");
});

test("Agents Mother test command still supports no-report mode through wrapper and direct entrypoint", () => {
  for (const entrypoint of ["scripts/agents-mother.mjs", "scripts/agents-mother/index.mjs"]) {
    const result = spawnSync("node", [entrypoint, "test", ".", "--no-report"], { encoding: "utf8" });
    assert.equal(result.status, 0, `${entrypoint}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Classification: agent-project/);
    assert.match(result.stdout, /Report: skipped \(--no-report\)/);
  }
});
