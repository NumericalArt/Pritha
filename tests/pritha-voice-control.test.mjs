import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRealtimeSessionConfig,
  handleVoiceTool,
  realtimeTools,
} from "../interfaces/experiments/pritha-voice-control/server.mjs";

test("Pritha voice realtime config exposes narrow tools", () => {
  const config = buildRealtimeSessionConfig();
  assert.equal(config.type, "realtime");
  assert.ok(config.model);
  assert.equal(config.tool_choice, "auto");
  const toolNames = config.tools.map((tool) => tool.name);
  assert.deepEqual(toolNames, [
    "get_pritha_status",
    "search_pritha_memory",
    "read_pritha_artifact",
    "queue_codex_task",
  ]);
  assert.equal(realtimeTools().length, 4);
});

test("Pritha voice memory search works through FTS", async () => {
  const result = await handleVoiceTool("search_pritha_memory", {
    query: "agent interface",
    search_mode: "fts",
    limit: 3,
  });
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.fts));
  assert.ok(result.fts.length > 0);
  assert.deepEqual(result.semantic, { ok: true, text: "" });
});

test("Pritha voice can read a curated artifact by id", async () => {
  const result = await handleVoiceTool("read_pritha_artifact", {
    id_or_path: "agent-interface-experience",
    max_chars: 4000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.document.id, "agent-interface-experience");
  assert.match(result.markdown, /Agent Interface Experience/);
});

test("Pritha voice Codex handoff writes only ignored private state by default", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-voice-test-"));
  const previousRoot = process.env.TECHSCOPE_VOICE_PRIVATE_ROOT;
  const previousMode = process.env.TECHSCOPE_VOICE_CODEX_MODE;
  process.env.TECHSCOPE_VOICE_PRIVATE_ROOT = tmp;
  process.env.TECHSCOPE_VOICE_CODEX_MODE = "queue";
  try {
    const result = await handleVoiceTool("queue_codex_task", {
      task: "Summarize the current Pritha voice experiment.",
      task_type: "analysis",
      requires_internet: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "queue");
    assert.ok(result.request_path.startsWith(tmp));
    assert.match(result.operator_note, /private local queue/i);
  } finally {
    if (previousRoot === undefined) delete process.env.TECHSCOPE_VOICE_PRIVATE_ROOT;
    else process.env.TECHSCOPE_VOICE_PRIVATE_ROOT = previousRoot;
    if (previousMode === undefined) delete process.env.TECHSCOPE_VOICE_CODEX_MODE;
    else process.env.TECHSCOPE_VOICE_CODEX_MODE = previousMode;
    rmSync(tmp, { recursive: true, force: true });
  }
});
