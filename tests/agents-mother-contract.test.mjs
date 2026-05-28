import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { contractData, validateContract } from "../scripts/agents-mother/contract.mjs";

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

test("contract module validates fixture contracts directly", () => {
  assert.deepEqual(validateContract("tests/fixtures/contracts/valid-agent-contract.md", { print: false }), []);
  const issues = validateContract("tests/fixtures/contracts/invalid-agent-contract.md", { print: false });
  assert.ok(issues.some((issue) => issue.includes("invalid Runtime family")));
  assert.ok(issues.some((issue) => issue.includes("Runtime placement profile")));
});

test("contract module extracts structured contract data", () => {
  const data = contractData("tests/fixtures/contracts/valid-agent-contract.md");
  assert.equal(data.fm.type, "agent-contract");
  assert.equal(data.agentName, "Snapshot Agent");
  assert.equal(data.runtimeFamily, "codex-native");
  assert.equal(data.telegramMode, "none");
  assert.ok(data.coreFunctions.length > 0);
});
