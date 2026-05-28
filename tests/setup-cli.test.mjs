import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runSetup(dir) {
  return spawnSync(
    "node",
    [
      "scripts/setup.mjs",
      "--non-interactive",
      "--config",
      "tests/fixtures/setup-minimal.json",
      "--state",
      path.join(dir, ".techscope-setup.json"),
      "--env",
      path.join(dir, ".env.local"),
      "--skip-quality",
      "--json",
    ],
    { encoding: "utf8" },
  );
}

test("setup CLI writes private env and idempotent state", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "techscope-setup-cli-"));
  try {
    const first = runSetup(dir);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstPayload = JSON.parse(first.stdout);
    assert.equal(firstPayload.schema, "techscope-setup-state-v1");
    assert.equal(firstPayload.status, "completed");
    assert.equal(firstPayload.sections.codex.status, "configured");

    const envPath = path.join(dir, ".env.local");
    assert.match(readFileSync(envPath, "utf8"), /^TECHSCOPE_ROOT=/m);
    assert.equal((statSync(envPath).mode & 0o777), 0o600);

    const second = runSetup(dir);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondPayload = JSON.parse(second.stdout);
    assert.equal(secondPayload.status, "completed");
    assert.equal(existsSync(`${envPath}.bak`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
