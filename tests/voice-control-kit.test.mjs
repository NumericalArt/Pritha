import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("voice-control-kit exposes the FESPA26 reference plan", () => {
  const result = spawnSync("node", ["scripts/voice-control-kit.mjs", "plan"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pritha voice-control kit/);
  assert.match(result.stdout, /FESPA26 local implementation/);
});

test("voice-control-kit copies the reference pack into a child interface folder", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-"));
  try {
    const result = spawnSync(
      "node",
      ["scripts/voice-control-kit.mjs", "copy", "--target", dir],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Copied voice-control reference/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Pritha voice-kit alias delegates to the kit command", () => {
  const result = spawnSync("node", ["scripts/pritha.mjs", "voice-kit", "list"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manifest\.json/);
  assert.match(result.stdout, /source\/lib\/openai\/realtime-tools\.ts/);
});
