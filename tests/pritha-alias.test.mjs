import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Pritha entrypoint preserves Agents Mother test behavior", () => {
  const result = spawnSync("node", ["scripts/pritha.mjs", "test", ".", "--no-report"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Classification: agent-project/);
  assert.match(result.stdout, /Report: skipped \(--no-report\)/);
});

test("legacy Agents Mother wrapper remains compatible and prints a deprecation note", () => {
  const result = spawnSync("node", ["scripts/agents-mother.mjs", "test", ".", "--no-report"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Classification: agent-project/);
  assert.match(result.stderr, /Deprecation notice: Agents Mother is now Pritha/);
});

test("Pritha aliases expose create, publish and lineage surfaces", () => {
  const help = spawnSync("node", ["scripts/pritha.mjs", "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /Pritha aliases:/);
  assert.match(help.stdout, /create --name/);
  assert.match(help.stdout, /publish <project-path>/);
  assert.match(help.stdout, /lineage/);

  const publish = spawnSync("node", ["scripts/pritha.mjs", "publish", "."], { encoding: "utf8" });
  assert.equal(publish.status, 0, publish.stderr || publish.stdout);
  assert.match(publish.stdout, /Report: skipped \(--no-report\)/);
});
