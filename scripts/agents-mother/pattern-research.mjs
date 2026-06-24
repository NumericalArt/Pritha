import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { today } from "../lib/date.mjs";

export const SEMANTIC_FAILURE_LOG_REL = ".private/agents-mother/semantic-memory-failures.jsonl";

const STOP_WORDS = new Set([
  "about",
  "after",
  "agent",
  "agents",
  "and",
  "before",
  "child",
  "codex",
  "current",
  "data",
  "from",
  "harness",
  "into",
  "memory",
  "must",
  "new",
  "not",
  "only",
  "pattern",
  "patterns",
  "project",
  "pritha",
  "report",
  "research",
  "scaffold",
  "should",
  "status",
  "task",
  "that",
  "the",
  "this",
  "tool",
  "tools",
  "use",
  "user",
  "with",
  "workflow",
  "workflows",
  "для",
  "или",
  "как",
  "при",
  "что",
  "это",
]);

const TECH_SEED_PATTERN = /\b(openai|realtime|webrtc|voice|speech|telegram|bot api|mcp|connector|embeddings?|semantic|vector|rag|sqlite|next\.?js|react|launchd|cron|tailscale|oauth|webhook|browser|sandbox|codex app|codex cli|agents sdk|api)\b/i;

function compact(value, maxChars = 2000) {
  const text = redactSensitiveText(String(value || "").replace(/\s+/g, " ").trim());
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(/\b(sk|pk|rk|ak|sess|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(AUTH_TOKEN|CT0|API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*[^,\s)]+/gi, "$1=[REDACTED]")
    .replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\b\s*[:=]\s*[^,\s)]+/gi, "$1=[REDACTED]");
}

function yamlScalar(value) {
  return String(value || "")
    .replaceAll("\n", " ")
    .replaceAll(":", " -");
}

function slug(value, fallback = "pattern") {
  const text = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return text || fallback;
}

function queryHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function domainLabel(key) {
  if (key === "agentBuildingKnowledge") return "agent-building-knowledge";
  if (key === "prithaSelf") return "pritha-self";
  if (key === "childAgents") return "child-agents";
  return key || "general";
}

export function buildAgentDevelopmentQuery(data = {}) {
  return [
    data.agentName,
    data.primaryMission,
    data.runtimeFamily,
    data.runtimePlacementProfile,
    data.primaryInterface,
    data.secondaryInterfaces,
    data.telegramMode,
    data.memoryModel,
    data.indexingSearchNeeds,
    data.toolSystem,
    data.inputDataTypes,
    data.dependencies,
    data.taskDescription,
    Array.isArray(data.coreFunctions) ? data.coreFunctions.join(" ") : data.coreFunctions,
    Array.isArray(data.criticalWorkflows) ? data.criticalWorkflows.join(" ") : data.criticalWorkflows,
    "agent harness scaffold tool memory security evaluation interface operations",
  ].filter(Boolean).join(" ");
}

export function logSemanticFailure(root, failure = {}) {
  const logPath = path.join(root, SEMANTIC_FAILURE_LOG_REL);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    status: compact(failure.status || "failed", 80),
    reason: compact(failure.reason || failure.error || "semantic_search_failed", 240),
    contract: compact(failure.contract || "", 240),
    project: compact(failure.project || "", 240),
    query_hash: queryHash(failure.query || ""),
    query: compact(failure.query || "", 600),
    stderr: compact(failure.stderr || "", 1200),
  };
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  return path.relative(root, logPath);
}

function semanticFailureStatus(result) {
  const text = `${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
  if (result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM") return "timeout";
  if (/no embeddings found|embeddings_unavailable|run: python3 scripts\/embed-memory\.py/.test(text)) return "unavailable";
  if (/no module named|modulenotfounderror|sentence_transformers/.test(text)) return "unavailable";
  return "failed";
}

export function runSemanticPatternSearch(root, query, options = {}) {
  const mode = String(options.semanticMode || options["semantic-mode"] || "auto").trim().toLowerCase();
  if (mode === "off" || mode === "skip" || mode === "false") {
    return {
      ok: false,
      status: "skipped",
      rows: [],
      stdout: "",
      stderr: "",
      failureLog: "",
    };
  }

  const limit = Math.max(1, Math.min(Number(options.semanticLimit || options["semantic-limit"] || options.limit || 8) || 8, 20));
  const timeoutMs = Math.max(5_000, Math.min(Number(options.semanticTimeoutMs || options["semantic-timeout-ms"] || 60_000) || 60_000, 180_000));
  const result = spawnSync("python3", ["scripts/semantic-search.py", query, "--limit", String(limit)], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });

  if (result.status !== 0) {
    const status = semanticFailureStatus(result);
    const failureLog = logSemanticFailure(root, {
      status,
      reason: result.error?.message || result.stderr || result.stdout || "semantic search failed",
      query,
      contract: options.contract,
      project: options.project,
      stderr: result.stderr || result.stdout || "",
    });
    return {
      ok: false,
      status,
      rows: [],
      stdout: compact(result.stdout, 4_000),
      stderr: compact(result.stderr || result.error?.message || "", 4_000),
      failureLog,
    };
  }

  return {
    ok: true,
    status: "complete",
    rows: parseSemanticSearchOutput(result.stdout),
    stdout: compact(result.stdout, 8_000),
    stderr: compact(result.stderr, 2_000),
    failureLog: "",
  };
}

export function parseSemanticSearchOutput(stdout) {
  const rows = [];
  const lines = String(stdout || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(\d+)\.\s+([0-9.]+)\s+\|\s+([^|]+)\|\s+([^|]+)\|\s+(.+)\s*$/);
    if (!match) continue;
    let heading = "";
    let snippet = "";
    const next = lines[index + 1] || "";
    if (/^\s*Heading:\s*/.test(next)) {
      heading = next.replace(/^\s*Heading:\s*/, "").trim();
      snippet = (lines[index + 2] || "").trim();
    } else {
      snippet = next.trim();
    }
    rows.push({
      rank: Number(match[1]),
      score: Number(match[2]),
      type: match[3].trim(),
      status: match[4].trim(),
      path: match[5].trim(),
      title: "",
      heading,
      snippet,
    });
  }
  return rows;
}

export function extractKeywords(value, max = 12) {
  const text = String(value || "").toLowerCase();
  const tokens = text
    .replace(/[^\p{L}\p{N}.+#-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, "").trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token));
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const phrases = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const phrase = `${tokens[index]} ${tokens[index + 1]}`;
    if (TECH_SEED_PATTERN.test(phrase)) phrases.push(phrase);
  }
  return [...new Set([
    ...phrases,
    ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token),
  ])].slice(0, max);
}

function rowPatternKind(row, sourceKind) {
  const relPath = String(row.path || "");
  if (relPath.startsWith("04_standards/")) return "standard";
  if (relPath.startsWith("07_workflows/")) return "workflow";
  if (relPath.startsWith("05_decisions/")) return "decision";
  if (relPath.startsWith("11_agents/reports/")) return "lifecycle-evidence";
  if (relPath.startsWith("11_agents/profiles/")) return "child-agent-profile";
  if (sourceKind === "semantic") return "semantic-memory-match";
  return "memory-match";
}

function confidenceFor(row, kind, sourceKind) {
  if (kind === "standard" || kind === "workflow" || kind === "decision") return "high";
  if (sourceKind === "semantic" && Number(row.score || 0) >= 0.45) return "medium";
  if (kind === "lifecycle-evidence" || kind === "child-agent-profile") return "medium";
  return "medium";
}

function applicabilityFor(kind, sourceKind) {
  if (kind === "standard") return "Use as a normative Pritha pattern unless the task has a recorded exception.";
  if (kind === "workflow") return "Use as process guidance for sequencing, gates and reports.";
  if (kind === "decision") return "Use as prior decision evidence and recheck if the technology changed.";
  if (kind === "lifecycle-evidence") return "Use as evidence of successful or failed child-agent patterns; do not clone blindly.";
  if (sourceKind === "semantic") return "Use as semantic memory evidence and confirm against primary files before implementation.";
  return "Use as candidate reusable context after checking fit with the current task.";
}

export function extractPatternCandidates(inputs = {}, options = {}) {
  const rows = [];
  for (const row of inputs.memoryResults || []) rows.push({ ...row, sourceKind: "fts", domain: "general" });
  for (const [key, values] of Object.entries(inputs.domainResults || {})) {
    for (const row of values || []) rows.push({ ...row, sourceKind: "domain", domain: domainLabel(key) });
  }
  for (const row of inputs.semantic?.rows || []) rows.push({ ...row, sourceKind: "semantic", domain: "semantic" });

  const seen = new Set();
  const candidates = [];
  for (const row of rows) {
    const key = [row.path, row.heading, compact(row.snippet, 120)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = rowPatternKind(row, row.sourceKind);
    const text = [row.path, row.title, row.heading, row.snippet].filter(Boolean).join(" ");
    const keywords = extractKeywords(text, 10);
    candidates.push({
      id: `pattern-${String(candidates.length + 1).padStart(2, "0")}`,
      status: "selected",
      sourceKind: row.sourceKind,
      memoryDomain: row.domain || "general",
      kind,
      confidence: confidenceFor(row, kind, row.sourceKind),
      path: row.path || "unknown",
      title: row.title || row.path || "Memory pattern",
      heading: row.heading || "n/a",
      snippet: compact(row.snippet || "", 500),
      score: row.score,
      applicability: applicabilityFor(kind, row.sourceKind),
      keywords,
      rationale: "Selected because it matched the agent-development task through memory, domain or semantic retrieval.",
    });
  }

  const max = Math.max(1, Math.min(Number(options.maxPatterns || options["max-patterns"] || 24) || 24, 60));
  return candidates.slice(0, max);
}

export function externalResearchSeedsForPatterns(patterns, max = 16) {
  const seeds = [];
  for (const pattern of patterns || []) {
    for (const keyword of pattern.keywords || []) {
      if (!TECH_SEED_PATTERN.test(keyword)) continue;
      seeds.push(keyword);
    }
  }
  return [...new Set(seeds.map((seed) => seed.trim()).filter(Boolean))].slice(0, max);
}

function formatPattern(pattern) {
  return [
    `### ${pattern.id}: ${pattern.title}`,
    "",
    `- Status: ${pattern.status}`,
    `- Source kind: ${pattern.sourceKind}`,
    `- Memory domain: ${pattern.memoryDomain}`,
    `- Pattern kind: ${pattern.kind}`,
    `- Confidence: ${pattern.confidence}`,
    `- Path: ${pattern.path}`,
    `- Heading: ${pattern.heading || "n/a"}`,
    `- Applicability: ${pattern.applicability}`,
    `- Rationale: ${pattern.rationale}`,
    `- Keywords: ${(pattern.keywords || []).join(", ") || "none"}`,
    pattern.score === undefined ? "" : `- Semantic score: ${pattern.score}`,
    `- Evidence snippet: ${pattern.snippet || "n/a"}`,
  ].filter(Boolean).join("\n");
}

export function patternPackMarkdown(data = {}, inputs = {}, options = {}) {
  const date = today();
  const agentSlug = slug(data.agentName, "agent");
  const query = inputs.query || buildAgentDevelopmentQuery(data);
  const semantic = inputs.semantic || { status: "skipped", rows: [], failureLog: "" };
  const patterns = extractPatternCandidates(inputs, options);
  const seeds = externalResearchSeedsForPatterns(patterns);
  const status = patterns.length > 0 ? "complete" : "memory-insufficient";
  const sources = [
    data.relPath,
    ...patterns.map((pattern) => pattern.path),
  ].filter(Boolean);
  const uniqueSources = [...new Set(sources)].slice(0, 60);

  const text = `---
id: ${date}-${agentSlug}-agent-pattern-pack
type: review
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - pattern-research
  - ${agentSlug}
tools:
  - Codex
  - Pritha memory
sources:
${uniqueSources.map((source) => `  - ${yamlScalar(source)}`).join("\n") || "  - unknown"}
related:
  agent_contracts:
    - ${yamlScalar(data.relPath || "unknown")}
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
pattern_pack_status: ${status}
semantic_memory_status: ${semantic.status || "skipped"}
semantic_failure_log: ${semantic.failureLog || "none"}
selected_pattern_count: ${patterns.length}
external_research_seed_count: ${seeds.length}
verified: pending
---

# Agent Pattern Pack: ${data.agentName || agentSlug}

Date: ${date}
Status: draft

## Task Basis

- Contract/project: ${data.relPath || data.projectPath || "unknown"}
- Agent/task: ${data.agentName || "unknown"}
- Query: ${compact(query, 1200)}
- Development task type: ${data.developmentTaskType || "creation-or-improvement"}

## Semantic/Embedding Search Status

- Status: ${semantic.status || "skipped"}
- Rows: ${semantic.rows?.length || 0}
- Failure log: ${semantic.failureLog || "none"}
- Behavior on failure: continue with warning, FTS/domain memory and external discovery; review the failure log later.

## Selected Patterns

${patterns.length ? patterns.map(formatPattern).join("\n\n") : "- No reusable local patterns were found. Broaden memory queries and use external discovery before implementation."}

## External Research Seeds

${seeds.length ? seeds.map((seed) => `- ${seed}`).join("\n") : "- No technology-specific seeds were extracted from local patterns. Use the contract/task text for external discovery."}

## Implementation Guidance

- Codex must read this pattern pack before scaffold or agent improvement implementation.
- Apply selected standards/workflows directly when they fit the task.
- Treat child-agent reports as evidence, not as templates to clone.
- Use external research to confirm, update or reject these patterns before changing harness, memory, tools, skills, MCP, interfaces or operations.
`;

  return {
    text,
    status,
    semantic,
    patterns,
    selectedPatterns: patterns,
    externalResearchSeeds: seeds,
  };
}

export function parsePatternPackSeeds(patternPack) {
  if (!patternPack) return [];
  if (Array.isArray(patternPack.externalResearchSeeds)) return patternPack.externalResearchSeeds;
  const text = typeof patternPack === "string" ? patternPack : String(patternPack.text || "");
  const match = text.match(/^## External Research Seeds\s*\n([\s\S]*?)(?:\n## |$)/m);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, "").trim())
    .filter((line) => line && !/^no technology-specific/i.test(line));
}
