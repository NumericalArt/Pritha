import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("self-test exposes a dry-run JSON contract without writing baseline", () => {
  const result = spawnSync("node", ["scripts/self-test.mjs", "--dry-run", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, "techscope-self-test-v1");
  assert.equal(payload.status, "pass");
  assert.equal(payload.dry_run, true);
  assert.equal(payload.quality_gate.profile, "self-test");
});
