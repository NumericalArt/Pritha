import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const toolRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/tool/route.ts", "utf8");
const voicePageSource = readFileSync("interfaces/control-center/src/components/voice/VoiceControlPage.tsx", "utf8");
const legacyScriptSource = readFileSync("scripts/pritha-voice-control.mjs", "utf8");
const interfacesManifest = JSON.parse(readFileSync("interfaces/manifest.json", "utf8"));
const legacyExperimentManifest = JSON.parse(readFileSync("interfaces/experiments/pritha-voice-control/manifest.json", "utf8"));

test("Control Center realtime config exposes filesystem inspection for harness questions", () => {
  assert.match(runtimeSource, /name:\s*"inspect_pritha_files"/);
  assert.match(runtimeSource, /enum:\s*\["status", "list_projects", "tree", "file_info", "read_file", "search"\]/);
  assert.match(runtimeSource, /Use inspect_pritha_files for fast read-only filesystem and harness work/);
  assert.match(runtimeSource, /Prefer it over memory tools whenever the operator asks what files exist/);
  assert.match(runtimeSource, /Use search_pritha_memory for fast, shallow lookup before answering questions about curated Pritha memory/);
});

test("Control Center /api/realtime/tool routes inspect_pritha_files to the filesystem handler", () => {
  assert.match(toolRouteSource, /handlePrithaRealtimeTool\(name, payload\.arguments \|\| \{\}\)/);
  assert.match(runtimeSource, /if \(name === "inspect_pritha_files"\) \{\s*output = await handlePrithaFiles\(args\);/s);
  assert.match(runtimeSource, /async function handlePrithaFiles\(args: PrithaFilesArgs = \{\}\)/);
  assert.match(runtimeSource, /if \(operation === "read_file"\) return readFilesystemFile\(args\);/);
  assert.match(runtimeSource, /if \(operation === "search"\) return searchFilesystem\(args\);/);
});

test("Voice UI fallback tool list includes filesystem inspection", () => {
  assert.match(voicePageSource, /"inspect_pritha_files"/);
  assert.match(voicePageSource, /"recall_rolling_summary"/);
});

test("standalone port 3401 voice experiment is deprecated in favor of Control Center", () => {
  const adapter = interfacesManifest.adapters.find((item) => item.name === "pritha-voice-control");
  assert.equal(adapter.status, "deprecated");
  assert.equal(adapter.replaced_by, "pritha-control-center");
  assert.equal(adapter.replacement_url, "http://127.0.0.1:3420/voice");
  assert.equal(legacyExperimentManifest.status, "deprecated");
  assert.match(legacyScriptSource, /standalone Pritha Voice Control experiment on port 3401 has been retired/);
  assert.match(legacyScriptSource, /http:\/\/127\.0\.0\.1:3420\/voice/);
});
