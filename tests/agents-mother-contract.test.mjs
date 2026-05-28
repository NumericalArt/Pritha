import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("valid fixture contract passes Agents Mother validation", () => {
  const result = spawnSync("node", [
    "scripts/agents-mother.mjs",
    "validate",
    "tests/fixtures/contracts/valid-agent-contract.md",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Contract validation passed/);
});

test("invalid fixture contract fails with actionable messages", () => {
  const result = spawnSync("node", [
    "scripts/agents-mother.mjs",
    "validate",
    "tests/fixtures/contracts/invalid-agent-contract.md",
  ], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Contract validation failed/);
  assert.match(output, /Runtime placement profile/);
  assert.match(output, /invalid Runtime family/);
});
