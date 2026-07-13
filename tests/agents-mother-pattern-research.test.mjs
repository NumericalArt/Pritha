import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  extractKeywords,
  logSemanticFailure,
  parsePatternPackSeeds,
  parseSemanticSearchOutput,
  patternPackMarkdown,
  SEMANTIC_FAILURE_LOG_REL,
} from "../scripts/agents-mother/pattern-research.mjs";

test("pattern pack selects memory/domain/semantic matches and extracts external seeds", () => {
  const pack = patternPackMarkdown(
    {
      agentName: "Voice Agent",
      relPath: "11_agents/contracts/2026-06-23-voice-agent-contract.md",
      primaryMission: "Realtime voice controller",
      developmentTaskType: "creation",
    },
    {
      query: "realtime voice codex agent",
      memoryResults: [{
        type: "standard",
        status: "accepted",
        path: "04_standards/realtime-voice-control-for-codex-agents.md",
        title: "Realtime Voice Control",
        heading: "Rule",
        snippet: "OpenAI Realtime WebRTC voice control pattern for Codex deep tasks.",
      }],
      domainResults: {
        agentBuildingKnowledge: [{
          type: "workflow",
          status: "accepted",
          path: "07_workflows/agents-mother.md",
          title: "Agents Mother",
          heading: "Research",
          snippet: "Agent creation must use Pritha memory patterns before scaffold.",
        }],
      },
      semantic: {
        status: "complete",
        rows: [{
          score: 0.72,
          type: "decision",
          status: "accepted",
          path: "05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md",
          heading: "Decision",
          snippet: "Reusable Realtime voice plus Codex App task transport.",
        }],
      },
    },
  );

  assert.equal(pack.status, "complete");
  assert.equal(pack.selectedPatterns.length, 3);
  assert.match(pack.text, /semantic_memory_status: complete/);
  assert.match(pack.text, /Agent Pattern Pack: Voice Agent/);
  assert.ok(pack.externalResearchSeeds.some((seed) => /realtime/i.test(seed)));
  assert.ok(parsePatternPackSeeds(pack).length > 0);
});

test("semantic search output parser reads ranked rows", () => {
  const rows = parseSemanticSearchOutput([
    "Semantic query: realtime voice",
    "Model: sentence-transformers/example",
    "",
    "1. 0.8123 | standard | accepted | 04_standards/realtime.md",
    "   Heading: Rule",
    "   Realtime WebRTC voice pattern.",
  ].join("\n"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, "04_standards/realtime.md");
  assert.equal(rows[0].heading, "Rule");
  assert.equal(rows[0].score, 0.8123);
});

test("semantic failure log is private jsonl and redacts secret-like values", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-semantic-failures-"));
  const relPath = logSemanticFailure(root, {
    status: "unavailable",
    query: "OpenAI Realtime AUTH_TOKEN=super-secret-value",
    stderr: "No embeddings found.",
  });

  assert.equal(relPath, SEMANTIC_FAILURE_LOG_REL);
  const fullPath = path.join(root, relPath);
  assert.equal(existsSync(fullPath), true);
  const line = readFileSync(fullPath, "utf8").trim();
  assert.doesNotMatch(line, /super-secret-value/);
  assert.match(line, /unavailable/);
  assert.match(line, /query_hash/);
});

test("semantic failure log uses external private state when instance isolation is configured", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-semantic-root-"));
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-semantic-state-"));
  const previous = process.env.PRITHA_STATE_ROOT;
  try {
    process.env.PRITHA_STATE_ROOT = stateRoot;
    logSemanticFailure(root, { status: "unavailable", reason: "fixture" });
    assert.equal(existsSync(path.join(stateRoot, "private", "agents-mother", "semantic-memory-failures.jsonl")), true);
    assert.equal(existsSync(path.join(root, ".private", "agents-mother", "semantic-memory-failures.jsonl")), false);
  } finally {
    if (previous === undefined) delete process.env.PRITHA_STATE_ROOT;
    else process.env.PRITHA_STATE_ROOT = previous;
  }
});

test("keyword extraction keeps technology phrases for external enrichment", () => {
  const keywords = extractKeywords("OpenAI Realtime WebRTC voice plus MCP connector and semantic embeddings", 8);
  assert.ok(keywords.some((keyword) => /openai realtime/i.test(keyword) || keyword === "openai"));
  assert.ok(keywords.some((keyword) => /mcp/i.test(keyword)));
});
