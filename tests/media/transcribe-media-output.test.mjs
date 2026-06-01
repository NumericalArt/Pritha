import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("transcribe-media writes generic media artifacts", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-media-"));
  const sample = path.join(dir, "sample.wav");
  writeFileSync(sample, Buffer.from("not a real wav; mock mode avoids decoding"));

  const result = spawnSync("node", ["scripts/transcribe-media.mjs", sample, "--language", "en", "--json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PRITHA_TRANSCRIBE_MEDIA_MOCK: "1",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.artifact_dir, /^01_sources\/raw\/media\//);
  assert.doesNotMatch(payload.artifact_dir, /you(?:tube)?/i);

  const sourceJson = JSON.parse(readFileSync(payload.source_json, "utf8"));
  assert.equal(sourceJson.schema, "pritha-media-source-v1");
  assert.equal(sourceJson.source_kind, "local-file");
  assert.equal(sourceJson.transcription.language, "en");
  assert.deepEqual(Object.keys(sourceJson).filter((key) => /you(?:tube)?/i.test(key)), []);

  const markdown = readFileSync(payload.transcript_md, "utf8");
  assert.match(markdown, /^# Media Transcript: sample\.wav/m);
  assert.doesNotMatch(markdown, /Channel:/);
  assert.doesNotMatch(markdown, /You(?:Tube)? Transcript/i);

  rmSync(path.join(process.cwd(), payload.artifact_dir), { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});
