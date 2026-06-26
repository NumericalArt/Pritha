import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function runBootstrap(args) {
  return spawnSync("node", ["scripts/bootstrap.mjs", ...args], {
    encoding: "utf8",
  });
}

test("bootstrap plan is machine-readable and non-mutating", () => {
  const result = runBootstrap(["plan", "--profile", "minimal", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, "pritha-bootstrap-v1");
  assert.equal(payload.status, "planned");
  assert.equal(payload.profile, "minimal");
  assert.ok(payload.steps.some((step) => step.id === "setup-state"));
  assert.ok(payload.steps.some((step) => step.id === "memory-rebuild"));
  assert.ok(payload.steps.some((step) => step.id === "memory-embeddings-deferred"));
  assert.ok(payload.steps.some((step) => step.id === "env-doctor"));
  assert.ok(payload.steps.some((step) => step.id === "memory-stats"));
  assert.equal(payload.steps.some((step) => step.id === "web-search-searxng-install"), false);
  assert.equal(payload.steps.some((step) => step.id === "control-center-npm-ci"), false);
  assert.equal(payload.steps.some((step) => step.startsForegroundProcess), false);
});

test("bootstrap prepare builds local memory and semantic embeddings", () => {
  const result = runBootstrap(["prepare", "--profile", "local", "--dry-run", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "planned");
  assert.deepEqual(payload.phases, ["install", "verify"]);
  assert.ok(payload.steps.some((step) => step.id === "python-core"));
  assert.ok(payload.steps.some((step) => step.id === "memory-rebuild" && step.writes));
  assert.ok(payload.steps.some((step) => step.id === "memory-embeddings" && step.writes));
  assert.ok(payload.steps.some((step) => step.id === "web-search-searxng-install" && step.writes));
  assert.ok(payload.steps.some((step) => step.id === "web-search-searxng-status" && !step.writes));
  assert.ok(payload.steps.some((step) => step.id === "semantic-search-sanity" && !step.writes));
  assert.equal(payload.steps.some((step) => step.startsForegroundProcess), false);
});

test("bootstrap start target pulls in Control Center install and foreground start", () => {
  const result = runBootstrap(["plan", "--profile", "local", "--start", "control-center", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "planned");
  assert.equal(payload.startTarget, "control-center");
  assert.ok(payload.steps.some((step) => step.id === "control-center-npm-ci"));
  assert.ok(payload.steps.some((step) => step.id === "control-center-typecheck"));
  assert.ok(payload.steps.some((step) => step.id === "web-search-searxng-install"));
  assert.ok(payload.steps.some((step) => step.id === "web-search-searxng-start" && step.writes));
  assert.ok(payload.steps.some((step) => step.id === "control-center-dev" && step.startsForegroundProcess));
  assert.ok(payload.steps.some((step) => step.id === "control-center-dev" && step.timeoutMs === 0));
  assert.equal(payload.steps.some((step) => /launchd|cron/i.test(step.commandText || step.detail || "")), false);
});

test("bootstrap verify minimal performs read-only prerequisite checks", () => {
  const result = runBootstrap(["verify", "--profile", "minimal", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "pass");
  assert.deepEqual(payload.phases, ["verify"]);
  assert.ok(payload.steps.every((step) => step.writes === false));
  assert.ok(payload.steps.some((step) => step.id === "validate-memory" && step.status === "pass"));
});
