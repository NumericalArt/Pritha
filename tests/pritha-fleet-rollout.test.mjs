import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const FLEET_SCRIPT = path.resolve("scripts/pritha-fleet.mjs");

test("fleet pins one release and stops mutating instances after the first rollout failure", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-fleet-safety-"));
  const target = "a".repeat(40);
  try {
    const scripts = path.join(root, "scripts");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(path.join(scripts, "pritha-instance.mjs"), `
import { appendFileSync } from "node:fs";
import path from "node:path";
const command = process.argv[2] || "status";
const id = process.env.PRITHA_INSTANCE_ID;
const stateRoot = process.env.PRITHA_STATE_ROOT;
appendFileSync(path.join(stateRoot, "calls.log"), command + "\\n");
if (command === "status") {
  console.log(JSON.stringify({
    ok: true,
    instance: { state_root: stateRoot, agent_parent: process.env.PRITHA_AGENT_PARENT },
    git: { branch: "main", clean: true },
    runtime: { memory_documents: 1, health: { ok: true, status: 200 } },
    isolation: { agent_state: { sha256: "agent-" + id }, protected_state: { sha256: "state-" + id }, registry_sha256: "registry-" + id },
  }));
} else {
  const ok = id !== "blocked";
  console.log(JSON.stringify({
    ok,
    status: ok ? "deployed" : "health-failed-rolled-back",
    finalHead: ${JSON.stringify(target)},
    finalGitClean: true,
    health: { ok, status: ok ? 200 : 0 },
    isolationMatch: true,
    memoryDocuments: 1,
  }));
  if (!ok) process.exitCode = 1;
}
`);

    const instances = ["canary", "blocked", "later"].map((id, index) => {
      const checkout = path.join(root, id, "Pritha");
      const stateRoot = path.join(root, "state", id);
      const agentParent = path.join(root, id);
      mkdirSync(checkout, { recursive: true });
      mkdirSync(stateRoot, { recursive: true });
      return { id, role: "replica", checkout, state_root: stateRoot, agent_parent: agentParent, port: 7000 + index };
    });
    const manifest = path.join(root, "fleet.json");
    writeFileSync(manifest, `${JSON.stringify({ schema: "pritha-fleet-v1", instances }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      FLEET_SCRIPT,
      "rollout",
      "--apply",
      "--yes",
      "--target-sha",
      target,
      "--manifest",
      manifest,
      "--json",
    ], {
      cwd: root,
      env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: path.join(root, "state", "orchestrator") },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.target_commit, target);
    assert.equal(payload.preflight.length, 3);
    assert.equal(payload.instances.length, 2);
    assert.equal(payload.instances[0].id, "canary");
    assert.equal(payload.instances[0].ok, true);
    assert.equal(payload.instances[1].id, "blocked");
    assert.equal(payload.instances[1].ok, false);
    assert.equal(payload.stopped_after, "blocked");
    assert.deepEqual(readFileSync(path.join(root, "state", "later", "calls.log"), "utf8").trim().split("\n"), ["status"]);
    assert.equal(existsSync(path.join(root, "state", "canary", "calls.log")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
