import { deriveExternalResearchTopics } from "./external-research-topics.mjs";

const DEFAULT_BACKEND = "manual";
const DEFAULT_CONFIDENCE = "medium";

function compact(value, maxChars = 2000) {
  const text = redactSensitiveText(String(value || "").replace(/\s+/g, " ").trim());
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactSensitiveText(value) {
  return String(value || "")
    .replace(/\b(sk|pk|rk|ak|sess|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(AUTH_TOKEN|CT0|API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*[^,\s)]+/gi, "$1=[REDACTED]")
    .replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\b\s*[:=]\s*[^,\s)]+/gi, "$1=[REDACTED]");
}

export function normalizeExternalResearchEvidence(input, options = {}) {
  const payload = typeof input === "string" ? JSON.parse(input) : input || {};
  const backend = compact(options.backend || payload.backend || DEFAULT_BACKEND, 80) || DEFAULT_BACKEND;
  const completedAt = compact(payload.completed_at || payload.completedAt || new Date().toISOString(), 80);
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.evidence)
      ? payload.evidence
      : [];

  const items = rawItems.map((item = {}) => ({
    topic_id: compact(item.topic_id || item.topicId || item.topic || "", 120),
    topic: compact(item.topic || item.topic_title || item.topicTitle || "", 240),
    source_url: compact(item.source_url || item.url || item.link || "", 800),
    source_title: compact(item.source_title || item.title || "", 240),
    source_type: compact(item.source_type || item.sourceType || "unknown", 80),
    source_published: compact(item.source_published || item.published || item.published_at || "unknown", 80),
    source_updated: compact(item.source_updated || item.updated || item.updated_at || "unknown", 80),
    retrieved_at: compact(item.retrieved_at || item.retrieved || completedAt, 80),
    claim: compact(item.claim || item.finding || item.summary || "", 1200),
    evidence_summary: compact(item.evidence_summary || item.evidence || item.notes || "", 1600),
    risk_note: compact(item.risk_note || item.risk || "", 1000),
    confidence: compact(item.confidence || DEFAULT_CONFIDENCE, 40),
  })).filter((item) => item.topic_id || item.topic || item.source_url || item.claim || item.evidence_summary);

  return {
    backend,
    completedAt,
    items,
  };
}

export function externalEvidenceCoverage(topics, evidence) {
  const requiredTopicIds = topics.filter((topic) => topic.required !== false).map((topic) => topic.id);
  const coveredTopicIds = new Set(
    evidence.items
      .map((item) => item.topic_id)
      .filter(Boolean),
  );
  const missingTopicIds = requiredTopicIds.filter((id) => !coveredTopicIds.has(id));
  return {
    requiredTopicIds,
    coveredTopicIds: [...coveredTopicIds],
    missingTopicIds,
    complete: requiredTopicIds.length > 0 && missingTopicIds.length === 0 && evidence.items.length > 0,
  };
}

function replaceFrontmatterField(markdown, key, value) {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return markdown;
  const raw = markdown.slice(4, end);
  const body = markdown.slice(end + 5);
  const lines = raw.split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.match(new RegExp(`^${escapeRegExp(key)}:`))) {
      replaced = true;
      return `${key}: ${value}`;
    }
    return line;
  });
  if (!replaced) nextLines.push(`${key}: ${value}`);
  return `---\n${nextLines.join("\n")}\n---\n${body}`;
}

function replaceSection(markdown, heading, content) {
  const escaped = escapeRegExp(heading);
  const replacement = `## ${heading}\n\n${content.trim()}\n\n`;
  const pattern = new RegExp(`^## ${escaped}\\s*\\n[\\s\\S]*?(?=^##\\s|(?![\\s\\S]))`, "m");
  if (pattern.test(markdown)) return markdown.replace(pattern, replacement);
  return `${markdown.trimEnd()}\n\n${replacement}`;
}

function formatEvidenceItems(evidence) {
  if (!evidence.items.length) return "- No external evidence items were provided.";
  return evidence.items.map((item, index) => {
    const title = item.source_title || item.source_url || item.topic || item.topic_id || `Evidence ${index + 1}`;
    const lines = [
      `### ${index + 1}. ${title}`,
      "",
      `- Topic ID: ${item.topic_id || "unknown"}`,
      `- Backend: ${evidence.backend}`,
      `- Source URL: ${item.source_url || "unknown"}`,
      `- Source type: ${item.source_type || "unknown"}`,
      `- Source published: ${item.source_published || "unknown"}`,
      `- Source updated: ${item.source_updated || "unknown"}`,
      `- Retrieved: ${item.retrieved_at || evidence.completedAt}`,
      `- Confidence: ${item.confidence || DEFAULT_CONFIDENCE}`,
      `- Claim: ${item.claim || "not specified"}`,
      `- Evidence summary: ${item.evidence_summary || "not specified"}`,
      `- Risk note: ${item.risk_note || "none"}`,
    ];
    return lines.join("\n");
  }).join("\n\n");
}

function formatComparison(topics, evidence, coverage) {
  const topicLabels = new Map(topics.map((topic) => [topic.id, topic.topic]));
  if (!evidence.items.length) {
    return [
      "- No external evidence is available yet.",
      `- Missing required topics: ${coverage.missingTopicIds.join(", ") || "unknown"}.`,
      "- Local memory remains the only basis; scaffold must stay blocked unless explicitly overridden.",
    ].join("\n");
  }

  const lines = [
    `- Backend used: ${evidence.backend}.`,
    `- Required topics covered: ${coverage.coveredTopicIds.filter((id) => coverage.requiredTopicIds.includes(id)).length}/${coverage.requiredTopicIds.length}.`,
  ];
  if (coverage.missingTopicIds.length) {
    lines.push(`- Missing required topics: ${coverage.missingTopicIds.map((id) => `${id}${topicLabels.has(id) ? ` (${topicLabels.get(id)})` : ""}`).join("; ")}.`);
    lines.push("- Scaffold gate remains pending until every required topic has acceptable evidence.");
  } else {
    lines.push("- Every required external research topic has at least one evidence item.");
    lines.push("- Treat community/social evidence as signal only; primary docs and source dates remain authoritative for runtime/API choices.");
  }
  return lines.join("\n");
}

function formatScaffoldDecision(status, coverage) {
  if (status === "complete") {
    return [
      "- Status: complete",
      "- Decision: scaffold may proceed if all other contract checks pass.",
      "- Required next action: review the evidence summaries during implementation and keep volatile choices version-bound.",
    ].join("\n");
  }
  return [
    "- Status: pending",
    "- Decision: do not scaffold without explicit experimental override.",
    `- Missing required topics: ${coverage.missingTopicIds.join(", ") || "none identified"}.`,
    "- Required next action: add external evidence for the missing topics or mark them explicitly not applicable with reason.",
  ].join("\n");
}

export function applyExternalResearchEvidence(reportMarkdown, contractData, input, options = {}) {
  const topics = options.topics || deriveExternalResearchTopics(contractData, options);
  const evidence = normalizeExternalResearchEvidence(input, options);
  const coverage = externalEvidenceCoverage(topics, evidence);
  const complete = coverage.complete;
  const externalStatus = complete ? "complete" : "pending";
  const synthesisStatus = complete ? "complete" : "pending";
  const researchGateStatus = complete ? "complete" : "pending";
  const completedAt = complete ? evidence.completedAt : "pending";
  const verified = complete ? todayIsoDate() : "pending";

  let next = String(reportMarkdown || "");
  for (const [key, value] of [
    ["research_gate_status", researchGateStatus],
    ["memory_research_status", "complete"],
    ["external_research_status", externalStatus],
    ["external_research_backend", evidence.backend],
    ["external_research_completed_at", completedAt],
    ["synthesis_status", synthesisStatus],
    ["verified", verified],
  ]) {
    next = replaceFrontmatterField(next, key, value);
  }

  next = replaceSection(next, "External Research Evidence", formatEvidenceItems(evidence));
  next = replaceSection(next, "Memory vs External Comparison", formatComparison(topics, evidence, coverage));
  next = replaceSection(next, "Scaffold Gate Decision", formatScaffoldDecision(researchGateStatus, coverage));

  return {
    text: next,
    status: researchGateStatus,
    externalStatus,
    synthesisStatus,
    evidence,
    coverage,
    complete,
  };
}
