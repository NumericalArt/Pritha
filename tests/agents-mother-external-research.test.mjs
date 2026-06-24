import test from "node:test";
import assert from "node:assert/strict";

import {
  applyExternalResearchEvidence,
  externalEvidenceCoverage,
  normalizeExternalResearchEvidence,
  redactSensitiveText,
} from "../scripts/agents-mother/external-research.mjs";
import { deriveExternalResearchTopics } from "../scripts/agents-mother/external-research-topics.mjs";

const realtimeContract = {
  relPath: "11_agents/contracts/voice-agent-contract.md",
  runtimeFamily: "codex-native",
  primaryInterface: "web realtime voice",
  telegramMode: "none",
  serviceMode: "none",
  autostart: "disabled",
  proactiveMode: "none",
  dependencies: "none",
  coreFunctions: ["Realtime voice control"],
};

function pendingReport() {
  return [
    "---",
    "id: voice-agent-research",
    "type: review",
    "status: draft",
    "created: 2026-06-22",
    "updated: 2026-06-22",
    "verified: pending",
    "research_gate_status: pending",
    "memory_research_status: complete",
    "external_research_status: pending",
    "external_research_backend: pending",
    "external_research_completed_at: pending",
    "synthesis_status: pending",
    "---",
    "",
    "# Voice Agent Research",
    "",
    "## External Research Evidence",
    "",
    "- Pending.",
    "",
    "## Memory vs External Comparison",
    "",
    "- Pending.",
    "",
    "## Scaffold Gate Decision",
    "",
    "- Status: pending",
    "",
  ].join("\n");
}

test("external research evidence normalization redacts secret-like values", () => {
  const text = "AUTH_TOKEN=super-secret-value api_key: another-secret ghp_abcdefghijklmnopqrstuvwxyz";
  const redacted = redactSensitiveText(text);
  assert.doesNotMatch(redacted, /super-secret-value/);
  assert.doesNotMatch(redacted, /another-secret/);
  assert.doesNotMatch(redacted, /ghp_abcdefghijklmnopqrstuvwxyz/);

  const evidence = normalizeExternalResearchEvidence({
    backend: "codex-web",
    items: [{
      topic_id: "openai-realtime",
      source_url: "https://example.test?token=not-captured",
      claim: text,
    }],
  });
  assert.equal(evidence.backend, "codex-web");
  assert.match(evidence.items[0].claim, /\[REDACTED/);
});

test("external evidence coverage requires every required topic", () => {
  const topics = deriveExternalResearchTopics(realtimeContract);
  assert.deepEqual(topics.map((topic) => topic.id), ["openai-realtime"]);

  const missing = externalEvidenceCoverage(topics, normalizeExternalResearchEvidence({ items: [] }));
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missingTopicIds, ["openai-realtime"]);

  const covered = externalEvidenceCoverage(topics, normalizeExternalResearchEvidence({
    items: [{ topic_id: "openai-realtime", source_url: "https://platform.openai.com/docs" }],
  }));
  assert.equal(covered.complete, true);
  assert.deepEqual(covered.missingTopicIds, []);
});

test("applying complete external evidence updates frontmatter and sections", () => {
  const result = applyExternalResearchEvidence(pendingReport(), realtimeContract, {
    backend: "codex-web",
    completed_at: "2026-06-22T12:00:00Z",
    items: [{
      topic_id: "openai-realtime",
      source_url: "https://platform.openai.com/docs/guides/realtime",
      source_title: "OpenAI Realtime API docs",
      source_type: "official-docs",
      source_updated: "2026-06-22",
      retrieved_at: "2026-06-22T12:00:00Z",
      claim: "Realtime voice uses current session configuration.",
      evidence_summary: "Official docs checked for session and WebRTC behavior.",
      confidence: "high",
    }],
  });

  assert.equal(result.complete, true);
  assert.match(result.text, /research_gate_status: complete/);
  assert.match(result.text, /external_research_status: complete/);
  assert.match(result.text, /synthesis_status: complete/);
  assert.match(result.text, /OpenAI Realtime API docs/);
  assert.match(result.text, /Every required external research topic has at least one evidence item/);
  assert.match(result.text, /Decision: scaffold may proceed/);
});

test("applying incomplete external evidence keeps gate pending", () => {
  const result = applyExternalResearchEvidence(pendingReport(), realtimeContract, {
    backend: "manual",
    items: [{
      topic_id: "other-topic",
      source_url: "https://example.test",
      claim: "Irrelevant evidence.",
    }],
  });

  assert.equal(result.complete, false);
  assert.match(result.text, /research_gate_status: pending/);
  assert.match(result.text, /external_research_status: pending/);
  assert.match(result.text, /Missing required topics: openai-realtime/);
});
