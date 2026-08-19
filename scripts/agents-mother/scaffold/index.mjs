import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../../lib/frontmatter.mjs";
import { normalizeGitHubRepositoryUrl, normalizeRepositoryModulePath } from "../../lib/github-repository-radar.mjs";
import { redactSensitiveText } from "../../lib/redaction.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaAgentParent, resolveTechscopeRoot } from "../../lib/paths.mjs";
import { readBoundedRegularFile } from "../../lib/safe-file-read.mjs";
import { slug as makeSlug } from "../../lib/slug.mjs";
import { today } from "../../lib/date.mjs";
import { AUTOSTART_MODES, PROACTIVE_MODES, RUNTIME_PLACEMENT_PROFILES, SERVICE_MODES, bodyValue, canonicalRepositoryPin, contractData, sectionItems, validateContract } from "../contract.mjs";
import { researchGateDecisionForReport } from "../research-gate.mjs";
import { verifyRepositoryResearchIntegrity } from "../github-research.mjs";
import { selectSkillsForContract, skillPolicyFor, skillRowForManifest } from "../skills.mjs";
import { newestArtifactPathsFirst, writeUniqueArtifact } from "../artifact-selection.mjs";
import { latestOutcomeSpecForContract, verifyOutcomeApproval } from "../outcome-spec.mjs";

const ROOT = resolveTechscopeRoot();
const AGENT_MEMORY_ROOT = resolvePrithaAgentMemoryRoot({ root: ROOT });
const REPORT_DIR = path.join(AGENT_MEMORY_ROOT, "reports");
const RESEARCH_DIR = path.join(AGENT_MEMORY_ROOT, "research");
const slug = (value, fallback = "agent") => makeSlug(value, { fallback });

function ensureDirs() {
  mkdirSync(REPORT_DIR, { recursive: true });
}

function bulletList(items) {
  const list = Array.isArray(items) && items.length > 0 ? items : ["TBD"];
  return list.map((item) => `- ${markdownValue(item, "TBD")}`).join("\n");
}

function scalar(value, fallback = "TBD") {
  const text = String(value || "").trim();
  return text || fallback;
}

function safeScalar(value, fallback = "TBD") {
  return redactSensitiveText(scalar(value, fallback));
}

function javascriptLiteral(value, fallback = "") {
  return JSON.stringify(safeScalar(value, fallback))
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function shellArgument(value, fallback = ".") {
  const text = safeScalar(value, fallback);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", `'"'"'`)}'`;
}

function xmlText(value, fallback = "") {
  return safeScalar(value, fallback)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeProjectRelativeDirectory(value, fallback = "logs/") {
  const raw = safeScalar(value, fallback).replace(/\/+$/, "");
  const segments = raw.split("/");
  if (
    !raw
    || raw.startsWith("/")
    || raw.includes("\\")
    || segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    return fallback;
  }
  return `${segments.join("/")}/`;
}

const SHELL_COMMAND_META_PATTERN = /[;&|<>`$\\'"()\n\r]/;

function commandArgvFromText(value) {
  const text = scalar(value, "");
  if (!text || SHELL_COMMAND_META_PATTERN.test(text)) return [];
  return text.split(/\s+/).filter(Boolean);
}

function yamlScalar(value) {
  return JSON.stringify(redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim() || "none");
}

function markdownValue(value, fallback = "not-applicable", max = 2000) {
  const raw = redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim() || fallback;
  const text = raw.length <= max ? raw : `${raw.slice(0, Math.max(0, max - 3)).trim()}...`;
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("|", "&#124;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;");
}

function normalizeInterfaceName(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "none") return "";
  if (/(realtime|voice|speech|microphone|audio|\u0433\u043e\u043b\u043e\u0441)/iu.test(text)) return "realtime-voice";
  if (text.includes("telegram")) return "telegram";
  if (text.includes("codex")) return "codex-project";
  if (text.includes("cli")) return "cli";
  if (text.includes("web")) return "web";
  if (text.includes("api")) return "api";
  return slug(text, "custom");
}

function selectedInterfaces(data) {
  const names = new Set(["cli"]);
  const primary = normalizeInterfaceName(data.primaryInterface);
  if (primary) names.add(primary);
  for (const item of String(data.secondaryInterfaces || "").split(/[;,]/)) {
    const name = normalizeInterfaceName(item);
    if (name) names.add(name);
  }
  if (data.telegramMode && data.telegramMode !== "none") names.add("telegram");
  if (usesRealtimeVoice(data)) names.add("realtime-voice");
  return [...names].sort();
}

function usesRealtimeVoice(data) {
  const text = [
    data.primaryInterface,
    data.secondaryInterfaces,
    data.interfaceMode,
    data.coreFunctions?.join(" "),
    data.criticalWorkflows?.join(" "),
    data.toolSystem,
  ].filter(Boolean).join(" ").toLowerCase();
  return /(realtime|voice|speech|microphone|audio|\u0433\u043e\u043b\u043e\u0441|\u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d)/iu.test(text);
}

function memoryProfileFor(data) {
  const memoryText = String(data.memoryModel || "").toLowerCase();
  const indexText = String(data.indexingSearchNeeds || "").toLowerCase();
  const text = `${memoryText} ${indexText}`;
  if (/(external|qdrant|lancedb|neo4j|kuzu|graph|vector)/.test(text)) return "external-or-specialized";
  if (/(embedding|semantic|\u0441\u0435\u043c\u0430\u043d\u0442\u0438\u0447\u0435\u0441|vector)/.test(text)) return "markdown-embeddings";
  if (/(sqlite|index|fts|search|\u043f\u043e\u0438\u0441\u043a)/.test(text)) return "markdown-sqlite";
  if (/(none|minimal|\u043d\u0435\u0442|\u0431\u0435\u0437 \u043f\u0430\u043c\u044f\u0442\u0438)/.test(memoryText)) return "minimal-markdown";
  return "markdown-first";
}

function memoryProfileDetails(profile) {
  const profiles = {
    "minimal-markdown": {
      directories: ["memory/notes"],
      description: "Minimal Markdown notes. No database or embeddings by default.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep"],
    },
    "markdown-first": {
      directories: ["memory/notes", "memory/decisions"],
      description: "Markdown source of truth with lightweight notes and decisions.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/decisions/.gitkeep"],
    },
    "markdown-sqlite": {
      directories: ["memory/notes", "memory/decisions", "memory/index"],
      description: "Markdown source of truth with a documented SQLite sidecar placeholder.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/decisions/.gitkeep", "memory/index/README.md"],
    },
    "markdown-embeddings": {
      directories: ["memory/notes", "memory/decisions", "memory/index", "memory/embeddings"],
      description: "Markdown source of truth with placeholders for index and embeddings.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/decisions/.gitkeep", "memory/index/README.md", "memory/embeddings/README.md"],
    },
    "external-or-specialized": {
      directories: ["memory/notes", "memory/external"],
      description: "Markdown source of truth plus documented external/specialized memory integration.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/external/README.md"],
    },
  };
  return profiles[profile] || profiles["markdown-first"];
}

function toolProfilesFor(data) {
  const text = `${data.toolSystem || ""} ${data.primaryInterface || ""} ${data.telegramMode || ""}`.toLowerCase();
  const profiles = new Set(["cli-script", "workflow"]);
  const skillPolicy = skillPolicyFor(data);
  if (skillPolicy.skillNeeds !== "none") profiles.add("skill-pack");
  if (/(mcp|api|oauth|service|openai agents sdk)/.test(text)) profiles.add("mcp-api");
  if (/(browser|web|visual|rendered|manual)/.test(text)) profiles.add("browser-manual");
  if (data.telegramMode && data.telegramMode !== "none") profiles.add("telegram-adapter");
  if (usesRealtimeVoice(data)) profiles.add("realtime-voice-codex");
  return [...profiles].sort();
}

function toolProfileDetails(name) {
  const details = {
    "cli-script": {
      boundary: "CLI/script",
      purpose: "Local deterministic commands, file checks, smoke tests and repeatable project scripts.",
      risk: "Shell commands can mutate local files; keep commands narrow and documented.",
    },
    workflow: {
      boundary: "skill/workflow",
      purpose: "Project procedure and agent operating discipline.",
      risk: "Overlong workflow text can create context noise; keep rules concise.",
    },
    "skill-pack": {
      boundary: "codex-skill",
      purpose: "Reviewed reusable procedural knowledge loaded on demand from local SKILL.md files.",
      risk: "Skills can become stale or unsafe; keep provenance, hashes, candidates and mutation policy explicit.",
    },
    "mcp-api": {
      boundary: "MCP/API",
      purpose: "External services, auth-heavy integrations, SaaS APIs or remote execution.",
      risk: "Requires explicit credentials, version checks, auditability and least privilege.",
    },
    "browser-manual": {
      boundary: "browser/manual",
      purpose: "Rendered page inspection, visual QA and human judgment.",
      risk: "Can be slow or brittle; use only when rendered state matters.",
    },
    "telegram-adapter": {
      boundary: "interface adapter",
      purpose: "Telegram ingress, queueing and human-readable responses.",
      risk: "Requires token isolation, allowlist and queue/retry policy.",
    },
    "realtime-voice-codex": {
      boundary: "voice interface + server tools + Codex sidecar",
      purpose: "Live voice UX, narrow realtime tools and deep-task routing through Codex App/CLI/session transport.",
      risk: "Requires microphone/cost approval, server-side API key isolation, tool gates and failure handling.",
    },
  };
  return details[name] || {
    boundary: "custom",
    purpose: "Custom tool profile selected by contract.",
    risk: "Requires dedicated design before production use.",
  };
}

function normalizeServiceMode(value, fallback = "none") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback;
  if (text.includes("launchd")) return "launchd";
  if (text.includes("external") || text.includes("systemd") || text.includes("cloud")) return "external";
  if (text.includes("manual") || text.includes("service") || text.includes("long-running")) return "manual";
  if (SERVICE_MODES.has(text)) return text;
  return fallback;
}

function normalizeAutostartMode(value, serviceMode = "none") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "disabled";
  if (text.includes("launchd") || text.includes("approval")) return "launchd-on-approval";
  if (text.includes("optional")) return "optional";
  if (text.includes("external") || serviceMode === "external") return "external";
  if (text.includes("disable") || text.includes("none") || text.includes("no")) return "disabled";
  if (AUTOSTART_MODES.has(text)) return text;
  return "disabled";
}

function normalizeProactiveMode(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "none" || text.includes("manual")) return text.includes("manual") ? "manual" : "none";
  if (text.includes("queue")) return "queue-watcher";
  if (text.includes("event") || text.includes("webhook")) return "event-driven";
  if (text.includes("heart") || text.includes("pulse") || text.includes("\u043f\u0443\u043b\u044c\u0441")) return "heartbeat";
  if (text.includes("cron") || text.includes("chrono") || text.includes("\u0445\u0440\u043e\u043d\u043e\u0441") || text.includes("schedule")) return "scheduled";
  if (text.includes("hybrid") || text.includes("mixed")) return "hybrid";
  if (PROACTIVE_MODES.has(text)) return text;
  return "manual";
}

function normalizeRuntimePlacementProfile(value, runtimeFamily = "codex-native") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    if (runtimeFamily === "local-model") return "local-first";
    if (runtimeFamily === "hybrid") return "hybrid";
    return "frontier-first";
  }
  if (text.includes("determin")) return "deterministic-first";
  if (text.includes("frontier") || text.includes("codex") || text.includes("cloud")) return "frontier-first";
  if (text.includes("local")) return "local-first";
  if (text.includes("hybrid") || text.includes("mixed")) return "hybrid";
  if (RUNTIME_PLACEMENT_PROFILES.has(text)) return text;
  return "unknown";
}

function operationProfileFor(data) {
  const serviceMode = normalizeServiceMode(data.serviceMode || data.expectedHosting || "none");
  const autostart = normalizeAutostartMode(data.autostart || "disabled", serviceMode);
  const proactiveMode = normalizeProactiveMode(data.proactiveMode || "none");
  const requestedHealthcheckCommand = safeScalar(data.healthcheckCommand, "node scripts/healthcheck.mjs");
  const healthcheckCommand = "node scripts/healthcheck.mjs";
  return {
    serviceMode,
    autostart,
    deploymentTarget: safeScalar(data.deploymentTarget || data.expectedHosting, "local Mac"),
    deploymentProfile: safeScalar(data.deploymentProfile, "local-development"),
    startCommand: safeScalar(data.startCommand, "node scripts/agent-cli.mjs status"),
    stopCommand: safeScalar(data.stopCommand, serviceMode === "none" ? "not-applicable" : "manual stop; define before production"),
    healthcheckCommand,
    requestedHealthcheckCommand,
    healthcheckArgv: commandArgvFromText(healthcheckCommand),
    logPath: safeProjectRelativeDirectory(data.logPath, "logs/"),
    restartPolicy: serviceMode === "launchd" ? "launchd template only; install after explicit user approval" : "manual unless contract is updated",
    serviceLabel: `com.local.${slug(data.agentName, "agent")}`,
    proactiveMode,
    triggerSources: safeScalar(data.triggerSources, proactiveMode === "none" ? "manual user request" : "TBD"),
    schedule: safeScalar(data.schedule, proactiveMode === "scheduled" ? "TBD cron/launchd calendar interval" : "not-applicable"),
    heartbeatInterval: safeScalar(data.heartbeatInterval, proactiveMode === "heartbeat" ? "TBD" : "not-applicable"),
    idleBehavior: safeScalar(data.idleBehavior, "sleep until trigger"),
  };
}

function stableLocalPort(agentSlug) {
  let hash = 0;
  for (const char of String(agentSlug || "agent")) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  }
  return 4800 + hash;
}

function extractBodyComment(fn) {
  const source = fn.toString();
  const start = source.indexOf("/*");
  const end = source.lastIndexOf("*/");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Missing embedded script body.");
  }
  return `${source.slice(start + 2, end).trimStart()}\n`;
}

const SHARED_REDACTION_SCRIPT = readFileSync(new URL("../../lib/redaction.mjs", import.meta.url), "utf8");

const SKILLS_STATUS_SCRIPT = extractBodyComment(function skillsStatusScriptSource() {/*
#!/usr/bin/env node

import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import path from "node:path";
import { containsHighRiskInstruction, redactSensitiveText } from "./redaction.mjs";

const ROOT = realpathSync(process.cwd());
const SKILLS_PATH = path.join(ROOT, "skills");
const issues = [];

function inside(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

let SKILLS_ROOT = "";
try {
  const stat = lstatSync(SKILLS_PATH);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe skills root");
  SKILLS_ROOT = realpathSync(SKILLS_PATH);
  if (!inside(SKILLS_ROOT, ROOT)) throw new Error("skills root outside project");
} catch {
  console.error("Skill status failed:\n- missing or unsafe skills directory");
  process.exit(1);
}

function readSafe(relativePath, maxBytes) {
  const requested = path.resolve(ROOT, relativePath);
  if (!inside(requested, SKILLS_PATH)) throw new Error("path outside skills root");
  const requestedStat = lstatSync(requested);
  if (!requestedStat.isFile() || requestedStat.isSymbolicLink()) throw new Error("file must be regular and not symlink");
  const real = realpathSync(requested);
  if (!inside(real, SKILLS_ROOT)) throw new Error("resolved path outside skills root");
  const fd = openSync(real, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error("file size limit exceeded");
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    if (offset > maxBytes) throw new Error("file size limit exceeded");
    return buffer.subarray(0, offset).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function validateJson(value) {
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > 20000 || current.depth > 16) throw new Error("JSON structure limit exceeded");
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      if (current.value.length > 1000) throw new Error("JSON array limit exceeded");
      for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    const keys = Object.keys(current.value);
    if (keys.length > 1000 || keys.some((key) => ["__proto__", "constructor", "prototype"].includes(key))) {
      throw new Error("JSON object shape rejected");
    }
    for (const child of Object.values(current.value)) stack.push({ value: child, depth: current.depth + 1 });
  }
}

function readJson(relativePath) {
  const text = readSafe(relativePath, 1_000_000);
  if (redactSensitiveText(text) !== text || containsHighRiskInstruction(text)) {
    throw new Error("metadata contains secret-like, private-endpoint or high-risk instruction material");
  }
  const value = JSON.parse(text);
  validateJson(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON root must be object");
  return value;
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function safeName(value) {
  return /^[a-z0-9][a-z0-9-]*$/.test(String(value || ""));
}

function safeSourcePath(value) {
  const candidate = String(value || "").trim().replaceAll("\\", "/");
  if (!candidate || candidate.length > 500 || path.posix.isAbsolute(candidate)) return "";
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return "";
  if (segments.some((segment) => /^(?:\.env(?:\..*)?|\.private|\.memory(?:-private)?|\.queue|\.logs|\.snapshots|\.state)$/i.test(segment))) return "";
  if (candidate.startsWith("10_wiki/")) return "";
  return candidate;
}

function safeSourcePaths(value) {
  return Array.isArray(value)
    && value.length <= 100
    && value.every((item) => typeof item === "string" && safeSourcePath(item) === item);
}

function securityTuple(value = {}) {
  return {
    name: String(value.name || ""),
    version: String(value.version || ""),
    source: String(value.source || ""),
    trust_level: String(value.trust_level || ""),
    review_status: String(value.review_status || ""),
    risk_level: String(value.risk_level || ""),
    requires_toolsets: Array.isArray(value.requires_toolsets) ? value.requires_toolsets.map(String) : [],
    source_paths: Array.isArray(value.source_paths) ? value.source_paths.map(String) : [],
  };
}

function unquoteScalar(value) {
  const text = String(value || "").trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text); } catch { return ""; }
  }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
  return text;
}

function parseSkillSecurityMetadata(text) {
  const source = String(text || "");
  if (!source.startsWith("---\n")) return {};
  const end = source.indexOf("\n---\n", 4);
  if (end === -1) return {};
  const wanted = new Set(["name", "version", "source", "trust_level", "review_status", "risk_level", "requires_toolsets", "source_paths"]);
  const listFields = new Set(["requires_toolsets", "source_paths"]);
  const result = {};
  let activeList = "";
  for (const line of source.slice(4, end).split(/\r?\n/)) {
    const keyMatch = line.match(/^([a-z_]+):(?:\s*(.*))?$/);
    if (keyMatch) {
      activeList = "";
      const key = keyMatch[1];
      if (!wanted.has(key)) continue;
      if (listFields.has(key)) {
        result[key] = [];
        activeList = key;
      } else {
        result[key] = unquoteScalar(keyMatch[2]);
      }
      continue;
    }
    const listMatch = activeList ? line.match(/^\s+-\s+(.+)$/) : null;
    if (listMatch) result[activeList].push(unquoteScalar(listMatch[1]));
    else if (line.trim()) activeList = "";
  }
  return result;
}

function validSecurityTuple(value) {
  const tuple = securityTuple(value);
  return safeName(tuple.name)
    && tuple.version.length > 0
    && tuple.source.length > 0
    && ["local", "local-reviewed", "trusted"].includes(tuple.trust_level)
    && ["reviewed", "accepted"].includes(tuple.review_status)
    && ["low", "medium", "high"].includes(tuple.risk_level)
    && tuple.requires_toolsets.length > 0
    && tuple.requires_toolsets.every((item) => typeof item === "string" && item.length > 0 && item.length <= 200)
    && safeSourcePaths(tuple.source_paths);
}

let manifest = { installed: [], candidates: [] };
let candidates = { candidates: [] };
let lock = { installed: [] };
try {
  readSafe("skills/README.md", 1_000_000);
  manifest = readJson("skills/manifest.json");
  candidates = readJson("skills/candidates.json");
  lock = readJson("skills/lock.json");
} catch {
  issues.push("missing, unsafe, oversized or invalid required skills metadata");
}

for (const [label, value] of [["manifest", manifest], ["candidates", candidates], ["lock", lock]]) {
  if (value.version !== 1) issues.push(`${label} schema version must be 1`);
}
if (!Array.isArray(manifest.installed) || !Array.isArray(manifest.candidates)) issues.push("manifest skill lists must be arrays");
if (!Array.isArray(candidates.candidates)) issues.push("candidates list must be an array");
if (!Array.isArray(lock.installed)) issues.push("lock installed list must be an array");

const installed = Array.isArray(manifest.installed) ? manifest.installed.slice(0, 101) : [];
const lockedEntries = Array.isArray(lock.installed) ? lock.installed.slice(0, 101) : [];
if (installed.length > 100 || lockedEntries.length > 100) issues.push("installed skill count exceeds limit");
const names = installed.map((entry) => String(entry?.name || ""));
if (new Set(names).size !== names.length) issues.push("duplicate installed skill names");
const lockNames = lockedEntries.map((entry) => String(entry?.name || ""));
if (new Set(lockNames).size !== lockNames.length) issues.push("duplicate lock skill names");

const locked = new Map();
for (const entry of lockedEntries) {
  if (!safeName(entry?.name) || !/^sha256:[a-f0-9]{64}$/i.test(String(entry?.hash || ""))) {
    issues.push("invalid lock entry");
    continue;
  }
  if (!safeSourcePaths(entry.source_paths)) issues.push(`invalid lock source_paths for ${entry.name}`);
  if (!validSecurityTuple(entry)) issues.push(`invalid lock security metadata for ${entry.name}`);
  locked.set(entry.name, entry);
}

for (const entry of installed) {
  if (!safeName(entry?.name)) {
    issues.push("invalid installed skill name");
    continue;
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(String(entry.hash || ""))) {
    issues.push(`invalid installed skill hash for ${entry.name}`);
    continue;
  }
  if (!safeSourcePaths(entry.source_paths)) issues.push(`invalid installed source_paths for ${entry.name}`);
  if (!validSecurityTuple(entry)) issues.push(`invalid installed security metadata for ${entry.name}`);
  let skillText = "";
  try {
    skillText = readSafe(`skills/${entry.name}/SKILL.md`, 256_000);
  } catch {
    issues.push(`missing or unsafe installed skill: ${entry.name}`);
    continue;
  }
  if (redactSensitiveText(skillText) !== skillText) issues.push(`sensitive material detected in installed skill: ${entry.name}`);
  if (containsHighRiskInstruction(skillText)) issues.push(`high-risk instruction detected in installed skill: ${entry.name}`);
  if (sha256(skillText) !== entry.hash) issues.push(`hash drift for ${entry.name}`);
  const lockedEntry = locked.get(entry.name);
  if (lockedEntry?.hash !== entry.hash) issues.push(`lock mismatch for ${entry.name}`);
  if (JSON.stringify(lockedEntry?.source_paths) !== JSON.stringify(entry.source_paths)) issues.push(`source_paths lock mismatch for ${entry.name}`);
  if (JSON.stringify(securityTuple(lockedEntry)) !== JSON.stringify(securityTuple(entry))) issues.push(`security metadata lock mismatch for ${entry.name}`);
  const frontmatterMetadata = parseSkillSecurityMetadata(skillText);
  if (JSON.stringify(securityTuple(frontmatterMetadata)) !== JSON.stringify(securityTuple(entry))) {
    issues.push(`skill frontmatter security metadata mismatch for ${entry.name}`);
  }
}
if (locked.size !== installed.length) issues.push("lock and manifest installed sets differ");

if (issues.length > 0) {
  console.error("Skill status failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Agent: ${manifest.agent || "unknown"}`);
console.log(`Skill policy: needs=${manifest.policy?.skill_needs || "unknown"}; install=${manifest.policy?.install_mode || "unknown"}; mutation=${manifest.policy?.agent_mutation || "unknown"}`);
console.log(`Installed skills: ${installed.length}`);
for (const entry of installed) console.log(`- ${entry.name}: ${entry.version}; ${entry.trust_level}; ${entry.risk_level}`);
console.log(`Candidate skills: ${candidates.candidates.length}`);
*/});

const CONTROL_CENTER_RUNTIME_SCRIPT = extractBodyComment(function controlCenterRuntimeScriptSource() {/*
#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const action = process.argv[2] || "status";
const manifestPath = path.join(ROOT, "operations", "manifest.json");

if (!["status", "start", "stop"].includes(action)) {
  console.error("Usage: node scripts/control-center-runtime.mjs status|start|stop");
  process.exit(2);
}

if (!existsSync(manifestPath)) {
  console.error("Missing operations/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const runtime = manifest.control_center_runtime || {};
const manager = runtime.manager || "none";

function run(bin, args, options = {}) {
  try {
    const output = execFileSync(bin, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout || 30000,
      env: { ...process.env, ...(runtime.env || {}) },
    }).trim();
    return { ok: true, output };
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    if (options.allowFail) return { ok: false, output };
    console.error(output || error.message);
    process.exit(1);
  }
}

function pidFilePath() {
  const pidFile = runtime.pid_file;
  if (!pidFile) return "";
  const stateRoot = path.join(ROOT, ".state");
  const resolved = path.resolve(ROOT, String(pidFile));
  if (!resolved.startsWith(stateRoot + path.sep)) {
    console.error("control_center_runtime.pid_file must remain inside .state/");
    process.exit(1);
  }
  return resolved;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPidFile() {
  const filePath = pidFilePath();
  if (!filePath || !existsSync(filePath)) return 0;
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64) return 0;
  const pid = Number(readFileSync(filePath, "utf8").trim());
  return Number.isInteger(pid) ? pid : 0;
}

function writePidFile(pid) {
  const filePath = pidFilePath();
  if (!filePath) return;
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(filePath), 0o700);
  if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
    console.error("Refusing symlink pid file.");
    process.exit(1);
  }
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${pid}\n`, { mode: 0o600 });
  renameSync(temporaryPath, filePath);
  chmodSync(filePath, 0o600);
}

function removePidFile() {
  const filePath = pidFilePath();
  if (filePath && existsSync(filePath)) rmSync(filePath);
}

function screenSessionExists(session) {
  if (!session) return false;
  const result = run(runtime.screen_bin || "screen", ["-ls"], { allowFail: true });
  if (!result.output) return false;
  return result.output.split(/\r?\n/).some((line) => line.includes(`.${session}`) || line.trim() === session);
}

function fallbackProcessSpec() {
  const spec = runtime.fallback_stop_process;
  if (!spec || typeof spec !== "object") return null;
  const port = Number(spec.port);
  const commandContains = Array.isArray(spec.command_contains) ? spec.command_contains.map(String).filter(Boolean) : [];
  if (!Number.isInteger(port) || port <= 0 || commandContains.length === 0) return null;
  return {
    port,
    commandContains,
    cwd: path.resolve(ROOT, String(spec.cwd || ".")),
    signal: String(spec.signal || "SIGTERM"),
    timeoutMs: Number(spec.timeout_ms || runtime.stop_timeout_ms || 10000),
  };
}

function listeningPids(port) {
  const result = run("lsof", ["-nP", `-tiTCP:${port}`, "-sTCP:LISTEN"], { allowFail: true });
  return result.output
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function processCommand(pid) {
  return run("ps", ["-p", String(pid), "-o", "command="], { allowFail: true }).output.trim();
}

function processCwd(pid) {
  const result = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { allowFail: true });
  const line = result.output.split(/\r?\n/).find((entry) => entry.startsWith("n"));
  return line ? line.slice(1).trim() : "";
}

function matchesManagedProcess(pid) {
  const argv = Array.isArray(runtime.start_argv) ? runtime.start_argv.map(String).filter(Boolean) : [];
  if (argv.length === 0) return false;
  const cwd = processCwd(pid);
  const command = processCommand(pid);
  return cwd === ROOT && argv.every((token) => command.includes(token));
}

function matchingFallbackPids() {
  const spec = fallbackProcessSpec();
  if (!spec) return [];
  return listeningPids(spec.port).filter((pid) => {
    const cwd = processCwd(pid);
    const command = processCommand(pid);
    return cwd === spec.cwd && spec.commandContains.every((token) => command.includes(token));
  });
}

async function stopFallbackProcesses(reason) {
  const spec = fallbackProcessSpec();
  if (!spec) return false;
  const pids = matchingFallbackPids();
  if (pids.length === 0) return false;
  console.log(`${reason}; stopping matching fallback process pid(s): ${pids.join(", ")}`);
  for (const pid of pids) {
    try {
      process.kill(pid, spec.signal);
    } catch (error) {
      console.error(`Failed to signal pid ${pid}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  const health = await waitForHealth("down", spec.timeoutMs);
  if (health.status === "ok") {
    console.error(`Fallback process stop requested but health is still ok: ${health.url || "unknown url"}`);
    process.exit(1);
  }
  console.log(`Stopped fallback process pid(s): ${pids.join(", ")}`);
  return true;
}

function runPrestart() {
  const argv = runtime.prestart_argv;
  if (!Array.isArray(argv) || argv.length === 0) return;
  console.log(`Running prestart: ${argv.join(" ")}`);
  run(argv[0], argv.slice(1), { timeout: Number(runtime.prestart_timeout_ms || 120000) });
}

function launchdTarget() {
  const uid = process.getuid ? process.getuid() : "";
  const label = runtime.launchd_label || manifest.service_label;
  return {
    domain: uid === "" ? "" : `gui/${uid}`,
    label,
    target: uid === "" ? label : `gui/${uid}/${label}`,
    plist: String(runtime.launch_agent_path || manifest.launch_agent_path || "").replace(/^~[/]/, `${process.env.HOME || ""}/`),
  };
}

async function probeHealth() {
  const url = runtime.health_url || manifest.health_url || (manifest.local_upstream_url ? `${String(manifest.local_upstream_url).replace(/[/]$/, "")}/api/health` : "");
  if (!url || typeof fetch !== "function") return { status: "unknown", detail: "No health URL or fetch unavailable." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    return { status: response.ok ? "ok" : "failed", detail: `HTTP ${response.status}`, url };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : "health probe failed", url };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth(expected, timeoutMs = 10000) {
  const started = Date.now();
  let last = await probeHealth();
  while (Date.now() - started <= timeoutMs) {
    last = await probeHealth();
    if (expected === "up" && last.status === "ok") return last;
    if (expected === "down" && last.status !== "ok") return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

async function printStatus() {
  console.log(`Agent: ${manifest.agent || manifest.id || "unknown"}`);
  console.log(`Manager: ${manager}`);
  if (manager === "detached-node-process") {
    const pid = readPidFile();
    console.log(`Pid file: ${runtime.pid_file || "missing"}; pid=${pid || "none"}; alive=${processAlive(pid)}`);
  }
  if (manager === "screen") console.log(`Screen session: ${runtime.screen_session || "missing"}; exists=${screenSessionExists(runtime.screen_session)}`);
  if (manager === "launchd") {
    const target = launchdTarget();
    const status = run("launchctl", ["print", target.target], { allowFail: true });
    console.log(`Launchd target: ${target.target}; loaded=${status.ok}`);
  }
  const health = await probeHealth();
  console.log(`Health: ${health.status}; ${health.detail}`);
}

async function startDetachedNodeProcess() {
  const argv = runtime.start_argv;
  if (!Array.isArray(argv) || argv.length === 0) {
    console.error("detached-node-process manager requires control_center_runtime.start_argv.");
    process.exit(1);
  }
  const existingPid = readPidFile();
  if (processAlive(existingPid)) {
    if (!matchesManagedProcess(existingPid)) {
      removePidFile();
      console.error("Stale pid file points to a process outside this managed runtime; refusing to reuse it.");
      process.exit(1);
    }
    const health = await waitForHealth("up", Number(runtime.readiness_timeout_ms || 10000));
    if (health.status === "ok") {
      console.log(`Detached process already running: ${existingPid}`);
      return;
    }
    console.error(`Pid file process is alive but health did not pass: ${health.detail}`);
    process.exit(1);
  }
  const currentHealth = await probeHealth();
  if (currentHealth.status === "ok") {
    console.log(`Health already ok without pid file: ${currentHealth.url || "unknown url"}`);
    return;
  }
  runPrestart();
  const child = spawn(argv[0], argv.slice(1), {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...(runtime.env || {}) },
  });
  child.unref();
  writePidFile(child.pid);
  const health = await waitForHealth("up", Number(runtime.readiness_timeout_ms || 10000));
  if (health.status !== "ok") {
    if (processAlive(child.pid)) process.kill(child.pid, "SIGTERM");
    removePidFile();
    console.error(`Started detached process but health did not pass: ${health.detail}`);
    process.exit(1);
  }
  console.log(`Started detached process: ${child.pid}`);
}

async function stopDetachedNodeProcess() {
  const pid = readPidFile();
  if (processAlive(pid)) {
    if (!matchesManagedProcess(pid)) {
      removePidFile();
      console.error("Stale pid file points to a process outside this managed runtime; refusing to signal it.");
      process.exit(1);
    }
    process.kill(pid, runtime.stop_signal || "SIGTERM");
    const health = await waitForHealth("down", Number(runtime.stop_timeout_ms || 10000));
    if (health.status === "ok") {
      console.error(`Stopped pid ${pid} but health is still ok: ${health.url || "unknown url"}`);
      process.exit(1);
    }
    removePidFile();
    console.log(`Stopped detached process: ${pid}`);
    return;
  }
  removePidFile();
  if (await stopFallbackProcesses("Pid file is missing while fallback process is listening")) return;
  console.log("Detached process is not running.");
}

async function startScreen() {
  const session = runtime.screen_session;
  const argv = runtime.start_argv;
  if (!session || !Array.isArray(argv) || argv.length === 0) {
    console.error("screen manager requires control_center_runtime.screen_session and start_argv.");
    process.exit(1);
  }
  if (screenSessionExists(session)) {
    console.log(`Screen session already exists: ${session}`);
    return;
  }
  const currentHealth = await probeHealth();
  if (currentHealth.status === "ok") {
    console.error(`Health is ok but managed screen session is missing: ${currentHealth.url || "unknown url"}`);
    process.exit(1);
  }
  runPrestart();
  run(runtime.screen_bin || "screen", ["-dmS", session, ...argv]);
  const health = await waitForHealth("up", Number(runtime.readiness_timeout_ms || 10000));
  if (health.status !== "ok") {
    console.error(`Started screen session but health did not pass: ${health.detail}`);
    process.exit(1);
  }
  console.log(`Started screen session: ${session}`);
}

async function stopScreen() {
  const session = runtime.screen_session;
  if (!session) {
    console.error("screen manager requires control_center_runtime.screen_session.");
    process.exit(1);
  }
  if (!screenSessionExists(session)) {
    const health = await probeHealth();
    if (health.status === "ok") {
      if (await stopFallbackProcesses("Screen session is missing while health is ok")) return;
      console.error(`Screen session is not running but health is still ok: ${health.url || "unknown url"}`);
      process.exit(1);
    }
    console.log(`Screen session is not running: ${session}`);
    return;
  }
  run(runtime.screen_bin || "screen", ["-S", session, "-X", "quit"], { allowFail: true });
  const health = await waitForHealth("down", Number(runtime.stop_timeout_ms || 10000));
  if (health.status === "ok") {
    if (await stopFallbackProcesses("Screen stop left health ok")) return;
    console.error(`Stopped screen session but health is still ok: ${health.url || "unknown url"}`);
    process.exit(1);
  }
  console.log(`Stopped screen session: ${session}`);
}

async function startLaunchd() {
  const target = launchdTarget();
  if (!target.label || !target.plist) {
    console.error("launchd manager requires service_label/launchd_label and launch_agent_path.");
    process.exit(1);
  }
  runPrestart();
  const loaded = run("launchctl", ["print", target.target], { allowFail: true }).ok;
  if (!loaded) {
    if (!existsSync(target.plist)) {
      console.error(`LaunchAgent plist is missing: ${target.plist}`);
      process.exit(1);
    }
    run("launchctl", ["bootstrap", target.domain, target.plist]);
  }
  run("launchctl", ["enable", target.target], { allowFail: true });
  run("launchctl", ["kickstart", "-k", target.target], { allowFail: true });
  const health = await waitForHealth("up", Number(runtime.readiness_timeout_ms || 15000));
  if (health.status !== "ok") {
    console.error(`Launchd start did not become healthy: ${health.detail}`);
    process.exit(1);
  }
  console.log(`Started launchd target: ${target.target}`);
}

async function stopLaunchd() {
  const target = launchdTarget();
  if (!target.label) {
    console.error("launchd manager requires service_label/launchd_label.");
    process.exit(1);
  }
  run("launchctl", ["bootout", target.target], { allowFail: true });
  if (target.domain && target.plist) run("launchctl", ["bootout", target.domain, target.plist], { allowFail: true });
  const health = await waitForHealth("down", Number(runtime.stop_timeout_ms || 10000));
  if (health.status === "ok") {
    console.error(`Launchd stop requested but health is still ok: ${health.url || "unknown url"}`);
    process.exit(1);
  }
  console.log(`Stopped launchd target: ${target.target}`);
}

if (action === "status") {
  await printStatus();
} else if (manager === "detached-node-process" && action === "start") {
  await startDetachedNodeProcess();
} else if (manager === "detached-node-process" && action === "stop") {
  await stopDetachedNodeProcess();
} else if (manager === "screen" && action === "start") {
  await startScreen();
} else if (manager === "screen" && action === "stop") {
  await stopScreen();
} else if (manager === "launchd" && action === "start") {
  await startLaunchd();
} else if (manager === "launchd" && action === "stop") {
  await stopLaunchd();
} else {
  console.error(`Control Center runtime manager is not executable: ${manager}`);
  process.exit(1);
}
*/});

function resolveTargetPath(data, options = {}) {
  const explicitOutput = scalar(options.output || "", "");
  if (explicitOutput) return path.resolve(ROOT, explicitOutput);
  const contractTarget = scalar(data.targetFolder || "", "");
  if (!contractTarget || /^sibling of (?:pritha|techscope)$/i.test(contractTarget)) {
    return path.join(resolvePrithaAgentParent({ root: ROOT }), slug(data.agentName));
  }
  return path.resolve(ROOT, contractTarget);
}

function ensureWritableTarget(targetPath) {
  const requested = path.resolve(targetPath);
  if (existsSync(targetPath)) {
    const targetStat = lstatSync(targetPath);
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
      throw new Error(`Target folder must be a regular directory and not a symlink: ${targetPath}`);
    }
    const entries = readdirSync(targetPath).filter((entry) => entry !== ".DS_Store");
    if (entries.length > 0) {
      throw new Error(`Target folder is not empty: ${targetPath}`);
    }
  } else {
    let ancestor = path.dirname(requested);
    while (!existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    const ancestorStat = lstatSync(ancestor);
    if (!ancestorStat.isDirectory() || ancestorStat.isSymbolicLink()) {
      throw new Error(`Target folder has an unsafe nearest existing ancestor: ${ancestor}`);
    }
    mkdirSync(requested, { recursive: true });
  }
  const createdStat = lstatSync(requested);
  if (!createdStat.isDirectory() || createdStat.isSymbolicLink()) {
    throw new Error(`Target folder must remain a regular directory and not a symlink: ${targetPath}`);
  }
  return realpathSync(requested);
}

function writeProjectFile(projectRoot, relPath, content) {
  const canonicalRoot = realpathSync(projectRoot);
  const normalizedRelative = String(relPath || "").replaceAll("\\", "/");
  if (!normalizedRelative || path.posix.isAbsolute(normalizedRelative) || normalizedRelative.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe generated project path: ${relPath}`);
  }
  const fullPath = path.resolve(canonicalRoot, normalizedRelative);
  if (fullPath === canonicalRoot || !fullPath.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`Generated project path escapes target: ${relPath}`);
  }
  const parentPath = path.dirname(fullPath);
  mkdirSync(parentPath, { recursive: true });
  const parentStat = lstatSync(parentPath);
  const realParent = realpathSync(parentPath);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (realParent !== canonicalRoot && !realParent.startsWith(`${canonicalRoot}${path.sep}`))) {
    throw new Error(`Generated project parent is unsafe: ${relPath}`);
  }
  if (existsSync(fullPath)) throw new Error(`Refusing to overwrite existing file: ${fullPath}`);
  writeFileSync(fullPath, content, { flag: "wx" });
  return relPath;
}

function contractStatus(data) {
  return String(data.fm?.status || "").trim().toLowerCase();
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function frontmatterReferencesContract(frontmatter, relPath) {
  const related = frontmatter?.related && typeof frontmatter.related === "object" ? frontmatter.related : {};
  return [...asList(frontmatter?.sources), ...asList(related.agent_contracts)].includes(relPath);
}

export function researchReportStatus(data) {
  if (!existsSync(RESEARCH_DIR)) return { status: "missing", path: "" };
  let files;
  try {
    const directoryStat = lstatSync(RESEARCH_DIR);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return { status: "missing", path: "" };
    const memoryRoot = realpathSync(AGENT_MEMORY_ROOT);
    const researchRoot = realpathSync(RESEARCH_DIR);
    if (researchRoot !== memoryRoot && !researchRoot.startsWith(`${memoryRoot}${path.sep}`)) {
      return { status: "missing", path: "" };
    }
    files = newestArtifactPathsFirst(readdirSync(researchRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".md"))
      .map((entry) => path.join(researchRoot, entry.name)));
  } catch {
    return { status: "missing", path: "" };
  }
  let newestFingerprintMismatch = null;
  for (const filePath of files) {
    let text;
    try {
      text = readBoundedRegularFile(filePath, {
        maxBytes: 1_000_000,
        allowedRoots: [AGENT_MEMORY_ROOT],
      }).text;
    } catch {
      continue;
    }
    const frontmatter = parseFrontmatterData(text);
    if (
      frontmatter?.type === "review"
      && frontmatter.research_gate_status !== undefined
      && frontmatterReferencesContract(frontmatter, data.relPath)
    ) {
      const result = {
        status: "found",
        path: path.relative(ROOT, filePath),
        gate: researchGateDecisionForReport(data, text),
        repositoryPayload: verifyRepositoryResearchIntegrity(text).payload,
        repositoryLock: String(frontmatter.repository_research_lock || ""),
      };
      if (frontmatter.contract_fingerprint === data.fingerprint) return result;
      if (!newestFingerprintMismatch) newestFingerprintMismatch = result;
    }
  }
  return newestFingerprintMismatch || { status: "missing", path: "" };
}

export function generatedAgentFiles(data, options = {}) {
  const agentName = safeScalar(data.agentName, "New Agent");
  const agentSlug = slug(agentName);
  const voiceCopyTarget = safeScalar(options.voiceCopyTarget, `sibling:${agentSlug}`);
  const voiceCopyCommand = `node scripts/voice-control-kit.mjs copy --target ${shellArgument(voiceCopyTarget)}`;
  const telegramEnabled = data.telegramMode && data.telegramMode !== "none";
  const repositoryModuleSelected = String(data.repositoryAdoptionMode || "none").toLowerCase() === "selected-module";
  const selectedRepositoryUrl = String(data.selectedGitHubRepositories || "").trim().replace(/\/$/, "");
  const repositoryResearchPayload = options.research?.repositoryPayload || null;
  const repositoryResearchCandidate = Array.isArray(repositoryResearchPayload?.candidates)
    ? repositoryResearchPayload.candidates.find((candidate) => String(candidate?.repository || "").toLowerCase() === selectedRepositoryUrl.toLowerCase())
    : null;
  const repositoryVerificationAuthorized = Boolean(options.research?.gate?.ok && repositoryResearchCandidate);
  const scaffoldExperimental = Boolean(options.experimental || !repositoryVerificationAuthorized);
  const selectedRepositoryUrls = String(data.selectedGitHubRepositories || "")
    .split(/[;,\s]+/)
    .map((value) => value.trim())
    .map((value) => normalizeGitHubRepositoryUrl(value)?.url || "")
    .filter(Boolean);
  const repositoryManifest = repositoryModuleSelected ? {
    version: 1,
    generated_by: "Pritha",
    adoption_mode: "selected-module",
    repositories: selectedRepositoryUrls,
    module: normalizeRepositoryModulePath(data.selectedRepositoryModule) || "pending",
    immutable_pin: canonicalRepositoryPin(data.repositoryPin) || "pending",
    verified_pin_sha: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_pin_sha || "") : "",
    verified_module_path: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_module_path || "") : "",
    verified_module_sha: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_module_sha || "") : "",
    verified_module_type: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_module_type || "") : "",
    verification_source_url: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verification_source_url || "") : "",
    repository_research_lock: repositoryVerificationAuthorized ? String(options.research?.repositoryLock || "") : "",
    verified_license_path: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_path || "") : "",
    verified_license_blob_sha: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_blob_sha || "") : "",
    verified_license_content_sha256: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_content_sha256 || "") : "",
    verified_license_spdx: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_spdx || "") : "",
    verified_license_source_url: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_source_url || "") : "",
    verified_license_scope: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_scope || "") : "",
    license_evidence_source_url: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_source_url || "") : "",
    verification_status: repositoryVerificationAuthorized ? "verified-by-pritha-research-gate" : "experimental-unverified",
    experimental_scaffold: scaffoldExperimental,
    license_decision: safeScalar(data.repositoryLicenseDecision, "pending"),
    security_review: safeScalar(data.repositorySecurityReview, "pending"),
    permissions: safeScalar(data.repositoryPermissions, "pending"),
    eval_status: safeScalar(data.repositoryEvalStatus, "pending"),
    user_approval: safeScalar(data.repositoryUserApproval, "pending"),
    installation_status: "not-installed",
    trust_boundary: "Only the reviewed module at the immutable pin is approved; all other repository content remains untrusted.",
  } : null;
  const repositoryManifestContent = repositoryManifest ? `${JSON.stringify(repositoryManifest, null, 2)}\n` : "";
  const repositoryManifestSha256 = repositoryManifestContent
    ? `sha256:${createHash("sha256").update(repositoryManifestContent).digest("hex")}`
    : "";
  const repositoryProvenanceCheck = repositoryModuleSelected ? `
const repositoryManifestPath = path.join(ROOT, "sources", "repository-modules.json");
const expectedRepositoryManifestSha256 = ${JSON.stringify(repositoryManifestSha256)};
const expectedRepositoryResearchLock = ${JSON.stringify(repositoryManifest?.repository_research_lock || "")};
function readSafeRepositoryManifest() {
  const parent = path.dirname(repositoryManifestPath);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error("repository manifest parent must be a regular directory");
  const manifestStat = lstatSync(repositoryManifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 1_000_000) throw new Error("repository manifest must be a bounded regular file");
  const canonicalRoot = realpathSync(ROOT);
  const canonicalManifest = realpathSync(repositoryManifestPath);
  if (!canonicalManifest.startsWith(canonicalRoot + path.sep)) throw new Error("repository manifest resolves outside project");
  return readFileSync(canonicalManifest, "utf8");
}
function githubContentUrlMatches(value, repositoryValue, kind, pin, relativePath) {
  try {
    const url = new URL(String(value || ""));
    const repository = new URL(String(repositoryValue || ""));
    if (url.protocol !== "https:" || repository.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || repository.hostname.toLowerCase() !== "github.com" || url.search || url.hash || url.username || url.password) return false;
    const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    const repositoryParts = repository.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    return parts.length >= 5
      && repositoryParts.length === 2
      && parts[0].toLowerCase() === repositoryParts[0].toLowerCase()
      && parts[1].toLowerCase() === repositoryParts[1].toLowerCase()
      && parts[2] === kind
      && parts[3].toLowerCase() === String(pin || "").toLowerCase()
      && parts.slice(4).join("/") === relativePath;
  } catch {
    return false;
  }
}
if (existsSync(repositoryManifestPath)) {
  try {
    const repositoryManifestText = readSafeRepositoryManifest();
    const actualManifestSha256 = "sha256:" + createHash("sha256").update(repositoryManifestText).digest("hex");
    if (actualManifestSha256 !== expectedRepositoryManifestSha256) issues.push("repository manifest content lock mismatch");
    const repositoryManifest = JSON.parse(repositoryManifestText);
    const repositories = Array.isArray(repositoryManifest.repositories) ? repositoryManifest.repositories : [];
    if (repositoryManifest.version !== 1) issues.push("repository manifest version must be 1");
    if (repositoryManifest.adoption_mode !== "selected-module") issues.push("repository manifest adoption_mode must be selected-module");
    if (repositories.length !== 1 || !/^https:\\/\\/github\\.com\\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\\/[A-Za-z0-9_.-]{1,100}$/.test(repositories[0] || "")) issues.push("repository manifest must contain one canonical repository");
    if (!repositoryManifest.module || /^(?:pending|none|not-applicable)$/i.test(repositoryManifest.module)) issues.push("repository manifest module missing");
    if (String(repositoryManifest.module || "").split("/").some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._@+-]+$/.test(segment))) issues.push("repository manifest module must be a safe repository-relative path");
    const pin = String(repositoryManifest.immutable_pin || "");
    const immutableSha = /^(?:(?:commit|tree-sha):)?[a-f0-9]{40}$/i.test(pin);
    if (!immutableSha) issues.push("repository manifest immutable_pin must be a commit/tree SHA");
    const pinSha = pin.replace(/^(?:commit|tree-sha):/i, "").toLowerCase();
    if (repositoryManifest.verification_status === "verified-by-pritha-research-gate") {
      if (!/^sha256:[a-f0-9]{64}$/i.test(expectedRepositoryResearchLock) || repositoryManifest.repository_research_lock !== expectedRepositoryResearchLock) issues.push("repository manifest research lock mismatch");
      if (String(repositoryManifest.verified_pin_sha || "").toLowerCase() !== pinSha) issues.push("repository manifest verified_pin_sha mismatch");
      if (repositoryManifest.verified_module_path !== repositoryManifest.module) issues.push("repository manifest verified module path mismatch");
      if (!/^[a-f0-9]{40}$/i.test(String(repositoryManifest.verified_module_sha || ""))) issues.push("repository manifest verified_module_sha invalid");
      if (repositoryManifest.verified_module_type !== "tree") issues.push("repository manifest verified_module_type must be tree");
      if (!githubContentUrlMatches(repositoryManifest.verification_source_url, repositories[0], "tree", pinSha, repositoryManifest.module)) issues.push("repository manifest verification source invalid");
      if (!String(repositoryManifest.verified_license_path || "").startsWith(repositoryManifest.module + "/")) issues.push("repository manifest module-local license path invalid");
      if (!/^[a-f0-9]{40}$/i.test(String(repositoryManifest.verified_license_blob_sha || ""))) issues.push("repository manifest license blob SHA invalid");
      if (!/^[a-f0-9]{64}$/i.test(String(repositoryManifest.verified_license_content_sha256 || ""))) issues.push("repository manifest license content SHA-256 invalid");
      if (!repositoryManifest.verified_license_spdx) issues.push("repository manifest verified license SPDX missing");
      if (repositoryManifest.verified_license_scope !== "module-local") issues.push("repository manifest license scope must be module-local");
      if (repositoryManifest.license_evidence_source_url !== repositoryManifest.verified_license_source_url) issues.push("repository manifest license evidence source mismatch");
      if (!githubContentUrlMatches(repositoryManifest.verified_license_source_url, repositories[0], "blob", pinSha, repositoryManifest.verified_license_path)) issues.push("repository manifest pin-bound license evidence invalid");
    } else if (repositoryManifest.verification_status === "experimental-unverified") {
      if (repositoryManifest.experimental_scaffold !== true) issues.push("unverified repository manifest must be experimental");
    } else {
      issues.push("repository manifest verification_status invalid");
    }
    for (const field of ["license_decision", "security_review", "permissions", "eval_status", "user_approval"]) {
      if (!repositoryManifest[field] || /^(?:pending|unknown|not-applicable)$/i.test(String(repositoryManifest[field]))) issues.push("repository manifest " + field + " missing");
    }
    if (repositoryManifest.installation_status !== "not-installed") issues.push("repository module must remain not-installed at scaffold");
  } catch (error) {
    issues.push("repository manifest is invalid JSON: " + (error instanceof Error ? error.message : String(error)));
  }
}
` : "";
  const interfaces = selectedInterfaces(data);
  const memoryProfile = memoryProfileFor(data);
  const memoryDetails = memoryProfileDetails(memoryProfile);
  const toolProfiles = toolProfilesFor(data);
  const operationProfile = operationProfileFor(data);
  const controlCenterPort = stableLocalPort(agentSlug);
  const controlCenterLocalUrl = `http://127.0.0.1:${controlCenterPort}`;
  const controlCenterHealthUrl = `${controlCenterLocalUrl}/api/health`;
  const controlCenterServiceMode = operationProfile.serviceMode === "none" ? "manual" : operationProfile.serviceMode;
  const jsAgentName = javascriptLiteral(agentName, "New Agent");
  const jsRuntimeFamily = javascriptLiteral(data.runtimeFamily, "codex-native");
  const jsPrimaryInterface = javascriptLiteral(data.primaryInterface, "Codex project");
  const jsTelegramMode = javascriptLiteral(data.telegramMode, "none");
  const jsControlCenterLocalUrl = javascriptLiteral(controlCenterLocalUrl);
  const jsServiceLabel = javascriptLiteral(operationProfile.serviceLabel);
  const skillSelection = selectSkillsForContract(data);
  const skillPolicy = skillSelection.policy;
  const installedSkillRows = skillSelection.installed.map((row) => skillRowForManifest(row, "installed"));
  const candidateSkillRows = [
    ...skillSelection.candidates.map((row) => skillRowForManifest(row, "not-installed")),
    ...skillSelection.blocked.map((row) => skillRowForManifest(row, "blocked")),
  ];
  const interfaceManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    primary_interface: safeScalar(data.primaryInterface, "Codex project"),
    telegram_mode: safeScalar(data.telegramMode, "none"),
    adapters: interfaces.map((name) => ({
      name,
      enabled: true,
      required_secrets: name === "telegram"
        ? ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USER_IDS"]
        : name === "realtime-voice"
          ? ["OPENAI_API_KEY"]
          : [],
      status_command: name === "telegram"
        ? "node scripts/telegram-bot.mjs queue-status"
        : name === "realtime-voice"
          ? "node scripts/interface-status.mjs # plus realtime transport readiness"
          : "node scripts/interface-status.mjs",
    })),
  };
  const memoryManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    profile: memoryProfile,
    description: memoryDetails.description,
    source_of_truth: "Markdown",
    directories: memoryDetails.directories,
    indexing_search_needs: safeScalar(data.indexingSearchNeeds, "none for v1 unless contract is updated"),
    rules: [
      "Do not store secrets in memory files.",
      "Keep raw source material separate from curated notes.",
      "Add database, embeddings or graph storage only after the contract requires it.",
    ],
  };
  const toolsManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    profiles: toolProfiles.map((name) => ({ name, ...toolProfileDetails(name) })),
    default_rule: "Choose the narrowest reliable tool boundary before adding capabilities.",
  };
  const skillsManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    policy: {
      skill_needs: skillPolicy.skillNeeds,
      external_skills: skillPolicy.allowedSkillSources === "local-only"
        ? "disabled"
        : "candidate-only-pending-pinned-bundle-workflow",
      install_mode: skillPolicy.skillInstallMode,
      agent_mutation: skillPolicy.skillMutationPolicy,
      generated_wiki_allowed: false,
    },
    installed: installedSkillRows,
    candidates: candidateSkillRows,
  };
  const skillsLock = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    installed: installedSkillRows.map((row) => ({
      name: row.name,
      version: row.version,
      source: row.source,
      trust_level: row.trust_level,
      review_status: row.review_status,
      risk_level: row.risk_level,
      requires_toolsets: row.requires_toolsets,
      hash: row.hash,
      source_paths: row.source_paths,
    })),
  };
  const operationsManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    deployment_target: operationProfile.deploymentTarget,
    deployment_profile: operationProfile.deploymentProfile,
    service_mode: controlCenterServiceMode,
    autostart: operationProfile.autostart,
    control_center_managed: true,
    autostart_policy: "configurable; never install or enable autostart from scaffold without explicit user approval",
    control_center_contract: {
      version: 1,
      command_shape: "structured-argv",
      executor: "scripts/control-center-runtime.mjs",
      default_execution: "control-center-managed-local-runtime",
      legacy_strings_executable: false,
      confirmation_required: false,
      managed_runtime: "detached-node-process",
      planned_start_command: "node scripts/control-center-agent-service.mjs",
      planned_stop_command: "node scripts/control-center-runtime.mjs stop",
    },
    control_center_runtime: {
      manager: "detached-node-process",
      service_boundary: "project-local-control-center-runtime",
      pid_file: ".state/control-center-runtime.pid",
      prestart_argv: [],
      start_argv: ["node", "scripts/control-center-agent-service.mjs"],
      env: {
        CONTROL_CENTER_AGENT_PORT: String(controlCenterPort),
      },
      fallback_stop_process: {
        port: controlCenterPort,
        cwd: ".",
        command_contains: ["node", "scripts/control-center-agent-service.mjs"],
        signal: "SIGTERM",
        timeout_ms: 10000,
        reason: "Stops an orphaned project-local Control Center runtime only when it is listening on this agent's managed port from this project folder.",
      },
      health_url: controlCenterHealthUrl,
      readiness_timeout_ms: 10000,
      stop_timeout_ms: 10000,
    },
    start_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "start"],
      cwd: ".",
      control_center_managed: true,
      background: true,
      timeout_ms: 30000,
      success_exit_codes: [0],
      readiness: {
        kind: "health_url",
        url: controlCenterHealthUrl,
        timeout_ms: 10000,
      },
      description: "Control Center start for the project-local child-agent runtime.",
    },
    stop_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "stop"],
      cwd: ".",
      control_center_managed: true,
      timeout_ms: 30000,
      success_exit_codes: [0],
      description: "Control Center stop for the project-local child-agent runtime.",
    },
    healthcheck_command: operationProfile.healthcheckCommand,
    requested_healthcheck_command: operationProfile.requestedHealthcheckCommand,
    healthcheck_argv: operationProfile.healthcheckArgv,
    healthcheck_command_executable: operationProfile.healthcheckArgv.length > 0,
    local_upstream_url: controlCenterLocalUrl,
    health_url: controlCenterHealthUrl,
    log_path: operationProfile.logPath,
    restart_policy: operationProfile.restartPolicy,
    service_label: operationProfile.serviceLabel,
    launch_agent_path: `~/Library/LaunchAgents/${operationProfile.serviceLabel}.plist`,
    deploy_script: "scripts/deploy-service.mjs",
    launchd_template: operationProfile.serviceMode === "launchd" || operationProfile.autostart === "launchd-on-approval"
      ? `operations/launchd/com.local.${agentSlug}.plist.template`
      : null,
    proactivity: {
      mode: operationProfile.proactiveMode,
      trigger_sources: operationProfile.triggerSources,
      schedule: operationProfile.schedule,
      heartbeat_interval: operationProfile.heartbeatInterval,
      idle_behavior: operationProfile.idleBehavior,
      user_interruption_policy: safeScalar(data.userInterruptionPolicy, "do not interrupt unless configured by user"),
    },
  };
  const files = [];
  const outcome = options.outcome || null;

  files.push({
    path: "delivery/outcome-lineage.json",
    content: `${JSON.stringify({
      schema: "pritha-child-outcome-lineage-v1",
      outcome_spec_id: outcome?.id || null,
      outcome_spec_path: outcome?.relPath || null,
      outcome_spec_status: outcome?.status || "missing",
      outcome_semantic_lock: outcome?.semanticLock || null,
      outcome_document_lock: outcome?.documentLock || null,
      approval_evidence_valid: outcome?.approvalValid === true,
      contract_fingerprint: data.fingerprint,
      delivery_status: "not-started",
      source_of_truth: "Pritha host; this file is lineage metadata and is not an editable Outcome Spec",
    }, null, 2)}\n`,
  });
  files.push({
    path: "delivery/README.md",
    content: `# Outcome delivery\n\nThe approved Outcome Spec, Trial plan, approval evidence and delivery ledger remain host-owned by Pritha.\n\nThis project may be changed by the bounded build executor, but it must not treat \`delivery/outcome-lineage.json\` as permission to rewrite the goal or verifier. Run delivery from Pritha with \`node scripts/pritha.mjs deliver <outcome-spec> --project <this-project>\`. Machine verification, user acceptance, merge and deployment are separate states.\n`,
  });

  files.push({
    path: "AGENTS.md",
    content: `# ${markdownValue(agentName, "New Agent", 300)}: Codex Agent Instructions

## Mission

${markdownValue(data.primaryMission, "TBD")}

## Operating Rules

- Work from the local project files first.
- Keep changes scoped to the current agent project.
- Do not copy secrets from Pritha or any other project.
- Use \`.env\` for local secrets and keep \`.env.example\` as the documented contract.
- Prefer small, verifiable steps and run the smoke test before handoff.
- Treat the host-approved Outcome Spec and compiled Trials as immutable delivery inputs; never weaken the verifier to make a build pass.
- If an external source, API, runtime or dependency may have changed, verify current documentation before relying on it.

## User and Scope

- Target user: ${markdownValue(data.targetUser, "TBD")}
- Success criteria: ${markdownValue(data.successCriteria, "TBD")}
- Out of scope: ${markdownValue(bodyValue(data.text, "Out of scope"), "TBD")}

## Runtime and Interface

- Runtime family: ${markdownValue(data.runtimeFamily, "codex-native")}
- Primary interface: ${markdownValue(data.primaryInterface, "Codex project")}
- Interface adapters: ${interfaces.join(", ")}
- Telegram mode: ${markdownValue(data.telegramMode, "none")}
- Expected hosting: ${markdownValue(data.expectedHosting, "local Mac")}
- Deployment target: ${markdownValue(operationProfile.deploymentTarget, "local Mac")}
- Deployment profile: ${markdownValue(operationProfile.deploymentProfile, "local-development")}
- Service mode: ${controlCenterServiceMode}
- Autostart: ${operationProfile.autostart}
- Proactive mode: ${operationProfile.proactiveMode}

## Harness Inventory

- Information boundaries: keep project instructions concise; put detailed procedures in \`07_workflows/\`.
- Tool system: use local scripts first; add external APIs only when documented in the contract.
- Execution orchestration: follow \`07_workflows/agent-operating-workflow.md\`.
- Memory and state: ${markdownValue(data.memoryModel, "Markdown-first")} (\`${memoryProfile}\`)
- Tool profiles: ${toolProfiles.join(", ")}
- Evaluation and observability: run \`node scripts/smoke-test.mjs\`; inspect logs before declaring done.
- Constraints and recovery: stop on missing secrets, failed tests or unclear permissions.

## Operations

- Operations profile lives in \`operations/manifest.json\`.
- Check service readiness with \`node scripts/operations-status.mjs\`.
- Autostart is configurable, but must never be installed or enabled without explicit user approval.
- If \`launchd\` is selected, use the generated plist as a reviewed template, not as an automatically installed service.
- Proactivity must be explicit: no background pulse, heartbeat, queue watcher or scheduled task unless \`operations/manifest.json\` says so.

## Telegram

${telegramEnabled ? "Telegram is enabled by contract. Use the adapter only with TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_IDS set in .env." : "Telegram is not part of v1 unless the contract is updated."}

## Interface Adapter Policy

- Interface adapters are specified by the contract and listed in \`interfaces/manifest.json\`.
- CLI is always present as a local maintenance interface.
- Telegram files are generated only when Telegram mode is not \`none\`.
- Web/API/custom adapters start as documented placeholders until their runtime is explicitly implemented.

## Memory and Tools

- Memory profile is documented in \`memory/manifest.json\`.
- Tool boundaries are documented in \`tools/manifest.json\`.
- Add heavier memory or external tools only after updating the contract.

## Harness Evolution Protocol

When changing this agent's harness, do not rely only on local guesses or generic model knowledge.

A harness change includes changes to instructions, memory, tools, skills, MCP, interfaces, operations, deployment, proactivity, security, model routing, evals, tests, or recovery behavior.

Required order:

1. Inspect this child agent's current project state and contract.
2. Consult Pritha memory for relevant standards, workflows, prior decisions, and child-agent lifecycle evidence.
3. If the affected technology may have changed, verify current primary documentation.
4. Only then design and implement the harness change.
5. Record the decision or result in this agent's local memory/report, and send reusable lessons back to Pritha when they may improve future agents.

## Skills

- Skill policy and provenance live in \`skills/manifest.json\`.
- Before reading or using an installed skill, run \`node scripts/skills-status.mjs\` and require a successful deterministic audit.
- After that audit succeeds, read only the exact audited \`skills/<name>/SKILL.md\`, check \`When to Use\`, follow \`Pitfalls\` and complete \`Verification\`.
- Fail closed on hash, provenance or security-metadata drift; do not read the changed skill as instructions.
- Do not use entries from \`skills/candidates.json\` as active instructions.
- Do not modify skills unless the contract allows skill mutation.
- External skills remain inactive candidates until Pritha implements a dedicated pinned-bundle verification and approval workflow; approval text alone is insufficient.
`,
  });

  files.push({
    path: "README.md",
    content: `# ${markdownValue(agentName, "New Agent", 300)}

Generated by Pritha.

## Mission

${markdownValue(data.primaryMission, "TBD")}

## Quick Start

\`\`\`sh
cp .env.example .env
chmod 600 .env
node scripts/smoke-test.mjs
node scripts/agent-cli.mjs help
node scripts/interface-status.mjs
node scripts/memory-status.mjs
node scripts/tools-status.mjs
node scripts/skills-status.mjs
node scripts/operations-status.mjs
\`\`\`

${telegramEnabled ? `## Telegram

Keep \`.env\` mode at \`0600\`, fill \`TELEGRAM_BOT_TOKEN\` and \`TELEGRAM_ALLOWED_USER_IDS\`, then run:

\`\`\`sh
node scripts/telegram-bot.mjs healthcheck
\`\`\`
` : ""}
## Project Structure

- \`AGENTS.md\`: operating instructions for Codex.
- \`07_workflows/agent-operating-workflow.md\`: normal work cycle.
- \`interfaces/manifest.json\`: selected interface adapters.
- \`interfaces/README.md\`: interface contract and adapter notes.
- \`memory/manifest.json\`: memory profile and boundaries.
- \`tools/manifest.json\`: tool profiles and boundaries.
- \`skills/manifest.json\`: reviewed installed skills, candidate skills, hashes and mutation policy.
- \`operations/manifest.json\`: deployment target, service profile, proactivity, autostart policy, healthcheck and log path.
- \`docs/user-training-guide.md\`: first user exercise and handoff notes.
- \`scripts/smoke-test.mjs\`: structure and configuration smoke test.
- \`scripts/agent-cli.mjs\`: minimal local command interface.
- \`scripts/interface-status.mjs\`: adapter status overview.
- \`scripts/operations-status.mjs\`: service readiness and autostart policy overview.
- \`scripts/deploy-service.mjs\`: launchd deployment automation with explicit approval gates.

## Contract Summary

- Runtime family: ${markdownValue(data.runtimeFamily, "codex-native")}
- Primary interface: ${markdownValue(data.primaryInterface, "Codex project")}
- Interface adapters: ${interfaces.join(", ")}
- Telegram mode: ${markdownValue(data.telegramMode, "none")}
- Memory model: ${markdownValue(data.memoryModel, "Markdown-first")}
- Memory profile: ${memoryProfile}
- Tool profiles: ${toolProfiles.join(", ")}
- Skill policy: needs=${skillPolicy.skillNeeds}; sources=${skillPolicy.allowedSkillSources}; install=${skillPolicy.skillInstallMode}; mutation=${skillPolicy.skillMutationPolicy}
- Deployment target: ${markdownValue(operationProfile.deploymentTarget, "local Mac")}
- Deployment profile: ${markdownValue(operationProfile.deploymentProfile, "local-development")}
- Service mode: ${controlCenterServiceMode}
- Autostart: ${operationProfile.autostart}
- Proactive mode: ${operationProfile.proactiveMode}
`,
  });

  files.push({
    path: ".env.example",
    content: `${telegramEnabled ? "TELEGRAM_BOT_TOKEN=\nTELEGRAM_ALLOWED_USER_IDS=\n" : ""}AGENT_NAME=${agentSlug}
LOG_LEVEL=info
`,
  });

  files.push({
    path: "package.json",
    content: `{
  "name": "${agentSlug}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "smoke": "node scripts/smoke-test.mjs",
    "health": "node scripts/healthcheck.mjs",
    "help": "node scripts/agent-cli.mjs help",
    "status": "node scripts/agent-cli.mjs status",
    "interfaces": "node scripts/interface-status.mjs",
    "memory": "node scripts/memory-status.mjs",
    "tools": "node scripts/tools-status.mjs",
    "skills": "node scripts/skills-status.mjs",
    "operations": "node scripts/operations-status.mjs",
    "control-center:status": "node scripts/control-center-runtime.mjs status",
    "control-center:start": "node scripts/control-center-runtime.mjs start",
    "control-center:stop": "node scripts/control-center-runtime.mjs stop",
    "deploy:plan": "node scripts/deploy-service.mjs plan",
    "deploy:status": "node scripts/deploy-service.mjs status",
    "deploy:install": "node scripts/deploy-service.mjs install",
    "deploy:uninstall": "node scripts/deploy-service.mjs uninstall"${telegramEnabled ? ',\n    "telegram:healthcheck": "node scripts/telegram-bot.mjs healthcheck",\n    "telegram:queue": "node scripts/telegram-bot.mjs queue-status",\n    "telegram:poll:dry": "node scripts/telegram-bot.mjs poll-once --dry-run"' : ""}
  }
}
`,
  });

  files.push({
    path: "interfaces/manifest.json",
    content: `${JSON.stringify(interfaceManifest, null, 2)}
`,
  });

  files.push({
    path: "interfaces/README.md",
    content: `# Interface Adapters

Interfaces are selected by the agent contract. This scaffold includes only the adapters needed for v1 plus CLI as a local maintenance surface.

## Selected Adapters

${interfaces.map((name) => `- \`${name}\``).join("\n")}

## Rules

- Do not add Telegram, web, API or other external adapters unless the contract selects them.
- Keep each adapter behind a small local command and a clear environment contract.
- Never store secrets in this directory.
- User-facing replies should be concise and useful; technical file paths belong in logs unless the user asks.

## Commands

\`\`\`sh
node scripts/interface-status.mjs
${telegramEnabled ? "node scripts/telegram-bot.mjs queue-status\nnode scripts/telegram-bot.mjs poll-once --dry-run" : ""}
\`\`\`
`,
  });

  for (const name of interfaces) {
    files.push({
      path: `interfaces/${name}/README.md`,
      content: `# ${name} adapter

Status: ${name === "telegram" ? "generated" : name === "cli" ? "generated" : "documented-placeholder"}

## Purpose

${name === "cli"
  ? "Local maintenance and smoke-test interface."
  : name === "telegram"
    ? `Telegram adapter selected by contract as ${markdownValue(data.telegramMode, "none")}.`
    : "Adapter placeholder selected by contract. Implement runtime behavior only after a dedicated design step."}

## Notes

- Contract primary interface: ${markdownValue(data.primaryInterface, "Codex project")}
- Telegram mode: ${markdownValue(data.telegramMode, "none")}
- Runtime family: ${markdownValue(data.runtimeFamily, "codex-native")}
`,
    });
  }

  if (usesRealtimeVoice(data)) {
    files.push({
      path: "interfaces/realtime-voice/pattern-manifest.json",
      content: `${JSON.stringify({
        profile: "realtime-voice-codex",
        status: "documented-placeholder",
        selected_by_contract: true,
        pritha_reference: "11_agents/reference-implementations/fespa26-voice-control",
        workflow: "07_workflows/realtime-voice-control-kit.md",
        standard: "04_standards/realtime-voice-control-for-codex-agents.md",
        copy_command_from_pritha_root: voiceCopyCommand,
        required_readiness: [
          "realtime credentials",
          "server-side tool route",
          "memory/search tool if selected",
          "Codex App/CLI/session transport if selected",
          "operator confirmation gates",
        ],
      }, null, 2)}
`,
    });
    files.push({
      path: "interfaces/realtime-voice/FESPA26_REFERENCE.md",
      content: `# Realtime Voice Interface

Status: documented-placeholder

This agent contract selected a voice/realtime interface. Start from Pritha's
FESPA26 reference implementation only after adapting the domain tools and
safety gates.

## Pritha Reference

- Standard: \`04_standards/realtime-voice-control-for-codex-agents.md\`
- Workflow: \`07_workflows/realtime-voice-control-kit.md\`
- Code pack: \`11_agents/reference-implementations/fespa26-voice-control/\`

From the Pritha root:

\`\`\`sh
node scripts/voice-control-kit.mjs plan
${voiceCopyCommand}
\`\`\`

## Required Adaptation

- Replace reference tool names with this agent's domain tools.
- Keep \`OPENAI_API_KEY\` server-side and issue only ephemeral Realtime credentials.
- Route complex work through Codex App, Codex CLI, a session contract or a validated queue.
- Require explicit operator confirmation for destructive, public or deployment actions.
- Record readiness for realtime, memory, Codex transport, tools, interfaces and operations.
`,
    });
  }

  files.push({
    path: "memory/manifest.json",
    content: `${JSON.stringify(memoryManifest, null, 2)}
`,
  });

  files.push({
    path: "memory/README.md",
    content: `# Memory Profile

Profile: \`${memoryProfile}\`

${memoryDetails.description}

## Rules

- Markdown is the source of truth.
- Do not store secrets, tokens or credentials in memory files.
- Keep raw dumps out of curated memory unless the contract explicitly requires raw-source retention.
- Add SQLite, embeddings, graph storage or external memory only after updating the contract.

## Directories

${memoryDetails.directories.map((dir) => `- \`${dir}\``).join("\n")}

## Commands

\`\`\`sh
node scripts/memory-status.mjs
\`\`\`
`,
  });

  for (const dir of memoryDetails.directories) {
    if (dir.endsWith("/index")) {
      files.push({
        path: `${dir}/README.md`,
        content: `# Memory Index

This is a placeholder for a rebuildable local index. Do not treat generated database files as source of truth.
`,
      });
    } else if (dir.endsWith("/embeddings")) {
      files.push({
        path: `${dir}/README.md`,
        content: `# Memory Embeddings

This is a placeholder for generated embeddings. Keep embeddings rebuildable from Markdown.
`,
      });
    } else if (dir.endsWith("/external")) {
      files.push({
        path: `${dir}/README.md`,
        content: `# External Memory

Document external memory/vector/graph services here before connecting them. Include version, auth boundary and rebuild strategy.
`,
      });
    } else {
      files.push({ path: `${dir}/.gitkeep`, content: "" });
    }
  }

  files.push({
    path: "tools/manifest.json",
    content: `${JSON.stringify(toolsManifest, null, 2)}
`,
  });

  files.push({
    path: "tools/README.md",
    content: `# Tool Profiles

Tool access is intentionally narrow. Before adding a capability, choose the smallest reliable boundary.

## Selected Profiles

${toolProfiles.map((name) => {
  const detail = toolProfileDetails(name);
  return `### ${name}

- Boundary: ${detail.boundary}
- Purpose: ${detail.purpose}
- Risk: ${detail.risk}`;
}).join("\n\n")}

## Rules

- Prefer local scripts for deterministic local work.
- Prefer workflow notes for repeatable agent procedure.
- Prefer MCP/API only when auth, remote service boundaries or auditability matter.
- Prefer browser/manual checks when rendered state or human judgment is required.
`,
  });

  for (const profile of toolProfiles) {
    const detail = toolProfileDetails(profile);
    files.push({
      path: `tools/${profile}/README.md`,
      content: `# ${profile}

- Boundary: ${detail.boundary}
- Purpose: ${detail.purpose}
- Risk: ${detail.risk}

Status: scaffolded profile. Add concrete commands or integrations only after the contract calls for them.
`,
    });
  }

  files.push({
    path: "skills/manifest.json",
    content: `${JSON.stringify(skillsManifest, null, 2)}
`,
  });

  files.push({
    path: "skills/candidates.json",
    content: `${JSON.stringify({
      version: 1,
      generated_by: "Pritha",
      policy: skillsManifest.policy,
      candidates: candidateSkillRows,
    }, null, 2)}
`,
  });

  files.push({
    path: "skills/lock.json",
    content: `${JSON.stringify(skillsLock, null, 2)}
`,
  });

  files.push({
    path: "skills/README.md",
    content: `# Skills

Skills are reviewed procedural knowledge for this agent. Use \`skills/manifest.json\` as the source of truth.

## Policy

- Skill needs: \`${skillPolicy.skillNeeds}\`
- Allowed sources: \`${skillPolicy.allowedSkillSources}\`
- Install mode: \`${skillPolicy.skillInstallMode}\`
- Mutation policy: \`${skillPolicy.skillMutationPolicy}\`
- Generated wiki pages allowed as direct provenance: \`false\`

## Rules

- Run \`node scripts/skills-status.mjs\` successfully before reading an installed skill.
- Read only the exact audited \`SKILL.md\` after the deterministic audit succeeds; fail closed on drift.
- Check \`When to Use\`, \`Pitfalls\` and \`Verification\`.
- Treat \`skills/candidates.json\` as recommendations only.
- Do not install, link, runtime-install or modify external skills without explicit approval.

## Commands

\`\`\`sh
node scripts/skills-status.mjs
\`\`\`
`,
  });

  for (const row of skillSelection.installed) {
    files.push({
      path: `skills/${row.skill.name}/SKILL.md`,
      content: row.skill.text,
    });
  }

  files.push({
    path: "operations/manifest.json",
    content: `${JSON.stringify(operationsManifest, null, 2)}
`,
  });

  files.push({
    path: "operations/README.md",
    content: `# Operations Profile

Deployment target: ${markdownValue(operationProfile.deploymentTarget, "local Mac")}
Deployment profile: ${markdownValue(operationProfile.deploymentProfile, "local-development")}
Service mode: \`${operationProfile.serviceMode}\`
Autostart: \`${operationProfile.autostart}\`
Proactive mode: \`${operationProfile.proactiveMode}\`

## Commands

\`\`\`sh
node scripts/operations-status.mjs
${operationProfile.healthcheckArgv.length > 0 ? operationProfile.healthcheckArgv.join(" ") : "# Define operations/manifest.json healthcheck_argv before deployment install"}
\`\`\`

## Policy

- Scaffold never starts long-running processes.
- Scaffold never installs autostart.
- Autostart is configurable through the contract, but enabling it requires an explicit user-approved deployment step.
- Control Center start/stop use structured argv only. Legacy command strings are planning evidence, not executable input.
- Healthcheck execution uses \`healthcheck_argv\` only. Legacy \`healthcheck_command\` is planning/display metadata.
- Keep healthcheck argv, runtime manager, start argv, stop behavior and log paths documented before treating this as a service.
- Deployment automation is available through \`node scripts/deploy-service.mjs plan|status|install|uninstall\`.
- \`install\` and \`uninstall\` require \`--yes\` and refuse incompatible service/autostart modes.

## Current Profile

- Control Center managed: \`false\`
- Runtime manager: \`none\`
- Planned start command: ${markdownValue(operationProfile.startCommand, "not configured")}
- Planned stop command: ${markdownValue(operationProfile.stopCommand, "not configured")}
- Healthcheck argv: \`${operationProfile.healthcheckArgv.length > 0 ? operationProfile.healthcheckArgv.join(" ") : "not configured"}\`
- Legacy healthcheck command: \`${operationProfile.healthcheckCommand}\`
- Log path: ${markdownValue(operationProfile.logPath, "logs/")}
- Restart policy: ${operationProfile.restartPolicy}
- Service label: \`${operationProfile.serviceLabel}\`

## Proactivity

- Mode: \`${operationProfile.proactiveMode}\`
- Trigger sources: ${markdownValue(operationProfile.triggerSources, "manual user request")}
- Schedule: ${markdownValue(operationProfile.schedule, "not-applicable")}
- Heartbeat interval: ${markdownValue(operationProfile.heartbeatInterval, "not-applicable")}
- Idle behavior: ${markdownValue(operationProfile.idleBehavior, "sleep until trigger")}
- User interruption policy: ${markdownValue(data.userInterruptionPolicy, "do not interrupt unless configured by user")}

${operationsManifest.launchd_template ? `## launchd

A launchd plist template is available at \`${operationsManifest.launchd_template}\`.

Review and customize it before copying it to \`~/Library/LaunchAgents/\`. Do not install it until the user explicitly approves autostart for this agent.
` : "## launchd\n\nNo launchd template is generated for the current service mode.\n"}
`,
  });

  if (operationsManifest.launchd_template) {
    files.push({
      path: operationsManifest.launchd_template,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlText(operationProfile.serviceLabel)}</string>
  <key>WorkingDirectory</key>
  <string>__PROJECT_ROOT__</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>scripts/control-center-agent-service.mjs</string>
  </array>
  <key>RunAtLoad</key>
  <${operationProfile.autostart === "launchd-on-approval" ? "true" : "false"}/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>__PROJECT_ROOT__/${xmlText(operationProfile.logPath.replace(/\/$/, ""), "logs")}/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>__PROJECT_ROOT__/${xmlText(operationProfile.logPath.replace(/\/$/, ""), "logs")}/launchd.err.log</string>
</dict>
</plist>
`,
    });
  }

  files.push({
    path: "07_workflows/agent-operating-workflow.md",
    content: `# Workflow: agent operating workflow

## Goal

Run ${markdownValue(agentName, "New Agent", 300)} in small, verifiable steps.

## Steps

1. Read \`AGENTS.md\` and the current task.
2. Confirm the target input, expected output and constraints.
3. Use local files and scripts before adding external tools.
4. If external information may be stale, verify current sources.
5. Execute the smallest useful step.
6. Run \`node scripts/smoke-test.mjs\`.
7. Report what changed, what was verified and what remains open.

## Completion Criteria

- The requested output exists.
- Smoke test passes.
- Missing secrets or external dependencies are clearly documented.
- User can reproduce the first check from \`docs/user-training-guide.md\`.
`,
  });

  files.push({
    path: "docs/user-training-guide.md",
    content: `# User Training Guide

## First Exercise

1. Open this folder in Codex.
2. Run:

\`\`\`sh
node scripts/smoke-test.mjs
node scripts/agent-cli.mjs status
\`\`\`

3. Ask the agent to explain its mission and v1 scope.
4. Confirm whether the output matches the contract.

## What This Agent Should Do First

${bulletList(data.coreFunctions)}

## Deferred Functions

These are intentionally not part of the first acceptance check:

${bulletList(sectionItems(data.text, "Deferred functions"))}
`,
  });

  files.push({
    path: "scripts/control-center-agent-service.mjs",
    content: `#!/usr/bin/env node

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, "operations", "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const runtime = manifest.control_center_runtime || {};
const port = Number(process.env.CONTROL_CENTER_AGENT_PORT || runtime.port || new URL(manifest.local_upstream_url || ${jsControlCenterLocalUrl}).port || ${controlCenterPort});
const host = process.env.CONTROL_CENTER_AGENT_HOST || "127.0.0.1";

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function html(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const startedAt = new Date().toISOString();
const server = createServer((req, res) => {
  const url = new URL(req.url || "/", \`http://\${req.headers.host || \`\${host}:\${port}\`}\`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const agent = escapeHtml(manifest.agent || ${jsAgentName});
    const serviceMode = escapeHtml(manifest.service_mode || "manual");
    const started = escapeHtml(startedAt);
    html(res, 200, \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>\${agent}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
    main { width: min(720px, calc(100vw - 32px)); }
    h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.1; letter-spacing: 0; }
    p { margin: 0 0 20px; color: color-mix(in srgb, CanvasText 72%, transparent); line-height: 1.55; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 10px 16px; margin: 0 0 24px; }
    dt { color: color-mix(in srgb, CanvasText 60%, transparent); }
    dd { margin: 0; font-weight: 600; }
    nav { display: flex; gap: 10px; flex-wrap: wrap; }
    a { color: CanvasText; border: 1px solid color-mix(in srgb, CanvasText 28%, transparent); border-radius: 8px; padding: 9px 12px; text-decoration: none; }
    a:hover { border-color: CanvasText; }
  </style>
</head>
<body>
  <main>
    <h1>\${agent}</h1>
    <p>Control Center managed local runtime is running.</p>
    <dl>
      <dt>Status</dt><dd>running</dd>
      <dt>Service mode</dt><dd>\${serviceMode}</dd>
      <dt>Started</dt><dd>\${started}</dd>
    </dl>
    <nav>
      <a href="/api/health">Health</a>
      <a href="/api/status">Status</a>
    </nav>
  </main>
</body>
</html>\`);
    return;
  }
  if (url.pathname === "/api/health" || url.pathname === "/api/status") {
    json(res, 200, {
      ok: true,
      status: "ok",
      agent: manifest.agent || ${jsAgentName},
      service: "control-center-agent-service",
      startedAt,
    });
    return;
  }
  json(res, 404, { ok: false, error: "not_found", status_endpoint: "/api/status" });
});

server.listen(port, host, () => {
  console.log(\`Control Center agent service listening on http://\${host}:\${port}\`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
`,
  });

  files.push({
    path: "scripts/agent-cli.mjs",
    content: `#!/usr/bin/env node

import { readFileSync } from "node:fs";

const command = process.argv[2] || "help";

function readText(path) {
  return readFileSync(new URL(\`../\${path}\`, import.meta.url), "utf8");
}

if (command === "help") {
  console.log(\`Usage:
  node scripts/agent-cli.mjs help
  node scripts/agent-cli.mjs status\`);
  process.exit(0);
}

if (command === "status") {
  const readme = readText("README.md");
  const title = readme.match(/^#\\\\s+(.+)$/m)?.[1] || ${jsAgentName};
  console.log(\`Agent: \${title}\`);
  console.log("Runtime: " + ${jsRuntimeFamily});
  console.log("Interface: " + ${jsPrimaryInterface});
  console.log("Telegram: " + ${jsTelegramMode});
  console.log("Smoke test: node scripts/smoke-test.mjs");
  process.exit(0);
}

console.error(\`Unknown command: \${command}\`);
process.exit(1);
`,
  });

  files.push({
    path: "scripts/interface-status.mjs",
    content: `#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "interfaces", "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Missing interfaces/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
console.log(\`Agent: \${manifest.agent}\`);
console.log(\`Primary interface: \${manifest.primary_interface}\`);
console.log(\`Telegram mode: \${manifest.telegram_mode}\`);
console.log("Adapters:");
for (const adapter of manifest.adapters || []) {
  const secrets = Array.isArray(adapter.required_secrets) && adapter.required_secrets.length > 0
    ? adapter.required_secrets.join(", ")
    : "none";
  console.log(\`- \${adapter.name}: enabled=\${adapter.enabled}; secrets=\${secrets}\`);
}
`,
  });

  files.push({
    path: "scripts/memory-status.mjs",
    content: `#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "memory", "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Missing memory/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
console.log(\`Agent: \${manifest.agent}\`);
console.log(\`Memory profile: \${manifest.profile}\`);
console.log(\`Source of truth: \${manifest.source_of_truth}\`);
console.log("Directories:");
for (const dir of manifest.directories || []) console.log(\`- \${dir}\`);
`,
  });

  files.push({
    path: "scripts/tools-status.mjs",
    content: `#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "tools", "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Missing tools/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
console.log(\`Agent: \${manifest.agent}\`);
console.log("Tool profiles:");
for (const profile of manifest.profiles || []) {
  console.log(\`- \${profile.name}: \${profile.boundary}\`);
}
`,
  });

  files.push({
    path: "scripts/skills-status.mjs",
    content: SKILLS_STATUS_SCRIPT,
  });

  files.push({
    path: "scripts/redaction.mjs",
    content: SHARED_REDACTION_SCRIPT,
  });

  files.push({
    path: "scripts/control-center-runtime.mjs",
    content: CONTROL_CENTER_RUNTIME_SCRIPT,
  });

  files.push({
    path: "scripts/operations-status.mjs",
    content: `#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "operations", "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Missing operations/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
function commandSummary(command) {
  if (!command) return "not defined";
  if (typeof command === "string") return \`\${command} (legacy/planning only)\`;
  if (Array.isArray(command.argv)) {
    return \`\${command.argv.join(" ")}; managed=\${command.control_center_managed === true}\`;
  }
  return JSON.stringify(command);
}

console.log(\`Agent: \${manifest.agent}\`);
console.log(\`Deployment target: \${manifest.deployment_target || "unknown"}\`);
console.log(\`Deployment profile: \${manifest.deployment_profile || "unknown"}\`);
console.log(\`Service mode: \${manifest.service_mode}\`);
console.log(\`Autostart: \${manifest.autostart}\`);
console.log(\`Autostart policy: \${manifest.autostart_policy}\`);
console.log(\`Control Center managed: \${manifest.control_center_managed === true}\`);
console.log(\`Control Center runtime: \${manifest.control_center_runtime?.manager || "none"}\`);
console.log(\`Start: \${commandSummary(manifest.start_command)}\`);
console.log(\`Stop: \${commandSummary(manifest.stop_command)}\`);
console.log(\`Healthcheck argv: \${Array.isArray(manifest.healthcheck_argv) ? manifest.healthcheck_argv.join(" ") : "not configured"}\`);
console.log(\`Legacy healthcheck command: \${manifest.healthcheck_command || "not documented"}\`);
console.log(\`Logs: \${manifest.log_path}\`);
if (manifest.proactivity) {
  console.log(\`Proactive mode: \${manifest.proactivity.mode}\`);
  console.log(\`Trigger sources: \${manifest.proactivity.trigger_sources}\`);
  console.log(\`Schedule: \${manifest.proactivity.schedule}\`);
  console.log(\`Heartbeat interval: \${manifest.proactivity.heartbeat_interval}\`);
}
if (manifest.launchd_template) console.log(\`launchd template: \${manifest.launchd_template}\`);

if (manifest.autostart !== "disabled" && manifest.autostart !== "optional" && manifest.autostart !== "external" && manifest.autostart !== "launchd-on-approval") {
  console.error("Invalid autostart mode in operations manifest.");
  process.exit(1);
}
`,
  });

  files.push({
    path: "scripts/deploy-service.mjs",
    content: `#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, "operations", "manifest.json");
const command = process.argv[2] || "plan";
const confirmed = process.argv.includes("--yes");
const allowedCommands = new Set(["plan", "status", "install", "uninstall"]);

if (!allowedCommands.has(command)) {
  console.error("Usage: node scripts/deploy-service.mjs plan|status|install|uninstall [--yes]");
  process.exit(1);
}

if (!existsSync(manifestPath)) {
  console.error("Missing operations/manifest.json");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const uid = process.getuid ? process.getuid() : "";
const serviceLabel = manifest.service_label || ${jsServiceLabel};
if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(serviceLabel) || serviceLabel.includes("..")) {
  console.error("Invalid service_label in operations/manifest.json");
  process.exit(1);
}
const launchAgentDir = path.join(os.homedir(), "Library", "LaunchAgents");
const launchAgentPath = path.join(launchAgentDir, \`\${serviceLabel}.plist\`);
const launchctlTarget = uid === "" ? serviceLabel : \`gui/\${uid}/\${serviceLabel}\`;

function run(commandName, args, options = {}) {
  try {
    const output = execFileSync(commandName, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout || 30000,
    }).trim();
    return { ok: true, output };
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\\n").trim();
    if (options.allowFail) return { ok: false, output };
    console.error(output || error.message);
    process.exit(1);
  }
}

function commandSummary(command) {
  if (!command) return "not defined";
  if (typeof command === "string") return \`\${command} (legacy/planning only)\`;
  if (Array.isArray(command.argv)) {
    return \`\${command.argv.join(" ")}; managed=\${command.control_center_managed === true}\`;
  }
  return JSON.stringify(command);
}

function healthcheckArgv() {
  if (!Array.isArray(manifest.healthcheck_argv)) return [];
  return manifest.healthcheck_argv.map((part) => String(part || "")).filter(Boolean);
}

function healthcheckSummary() {
  const argv = healthcheckArgv();
  if (argv.length > 0) return argv.join(" ");
  return \`\${manifest.healthcheck_command || "not configured"} (legacy/planning only)\`;
}

function escapeXmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderTemplate() {
  if (!manifest.launchd_template) {
    console.error("No launchd template selected in operations/manifest.json");
    process.exit(1);
  }
  const allowedTemplateRoot = path.join(ROOT, "operations", "launchd");
  const templatePath = path.resolve(ROOT, manifest.launchd_template);
  if (!templatePath.startsWith(allowedTemplateRoot + path.sep)) {
    console.error("launchd template must remain inside operations/launchd");
    process.exit(1);
  }
  if (!existsSync(templatePath)) {
    console.error(\`Missing launchd template: \${manifest.launchd_template}\`);
    process.exit(1);
  }
  const templateStat = lstatSync(templatePath);
  if (!templateStat.isFile() || templateStat.isSymbolicLink() || !realpathSync(templatePath).startsWith(realpathSync(allowedTemplateRoot) + path.sep)) {
    console.error("launchd template must be a regular in-project file");
    process.exit(1);
  }
  return readFileSync(templatePath, "utf8").replaceAll("__PROJECT_ROOT__", escapeXmlText(ROOT));
}

function requireInstallAllowed() {
  if (!confirmed) {
    console.error("Refusing to mutate launchd state without --yes.");
    process.exit(1);
  }
  if (manifest.service_mode !== "launchd") {
    console.error(\`Install requires service_mode=launchd, got \${manifest.service_mode || "missing"}.\`);
    process.exit(1);
  }
  if (manifest.autostart !== "launchd-on-approval") {
    console.error(\`Install requires autostart=launchd-on-approval, got \${manifest.autostart || "missing"}.\`);
    process.exit(1);
  }
}

function printPlan() {
  console.log(\`Agent: \${manifest.agent}\`);
  console.log(\`Deployment target: \${manifest.deployment_target || "unknown"}\`);
  console.log(\`Deployment profile: \${manifest.deployment_profile || "unknown"}\`);
  console.log(\`Service mode: \${manifest.service_mode}\`);
  console.log(\`Autostart: \${manifest.autostart}\`);
  console.log(\`Proactive mode: \${manifest.proactivity?.mode || "unknown"}\`);
  console.log(\`Service label: \${serviceLabel}\`);
  console.log(\`LaunchAgent path: \${launchAgentPath}\`);
  console.log(\`Healthcheck: \${healthcheckSummary()}\`);
  console.log(\`Start: \${commandSummary(manifest.start_command)}\`);
  console.log(\`Stop: \${commandSummary(manifest.stop_command)}\`);
  if (manifest.service_mode !== "launchd") {
    console.log("Plan:");
    console.log("- No launchd install is configured for this agent.");
    console.log("- Use this script for visibility until the contract selects service_mode=launchd.");
    console.log("- To make it a service, update the contract, scaffold/profile, and rerun operations checks.");
    return;
  }
  console.log("Plan:");
  console.log("- Render launchd template with the current project path.");
  console.log("- Run healthcheck before install.");
  console.log("- Copy plist to ~/Library/LaunchAgents.");
  console.log("- Run plutil -lint.");
  console.log("- bootstrap, enable and kickstart the LaunchAgent.");
  console.log("- Use uninstall --yes to bootout and remove the plist.");
  console.log("Mutation requires: node scripts/deploy-service.mjs install --yes");
}

function printStatus() {
  console.log(\`Service label: \${serviceLabel}\`);
  console.log(\`LaunchAgent plist exists: \${existsSync(launchAgentPath) ? "yes" : "no"}\`);
  const result = run("launchctl", ["print", launchctlTarget], { allowFail: true });
  console.log(\`launchctl status: \${result.ok ? "loaded" : "not-loaded"}\`);
  if (result.output) console.log(result.output.slice(0, 1200));
}

function runHealthcheck() {
  const argv = healthcheckArgv();
  if (argv.length === 0) {
    console.error("No healthcheck_argv (array) in operations/manifest.json. Legacy healthcheck_command is display-only.");
    process.exit(1);
  }
  console.log(\`Running healthcheck: \${argv.join(" ")}\`);
  const result = run(argv[0], argv.slice(1), { timeout: 60000 });
  if (result.output) console.log(result.output);
}

if (command === "plan") {
  printPlan();
  process.exit(0);
}

if (command === "status") {
  printStatus();
  process.exit(0);
}

if (command === "install") {
  requireInstallAllowed();
  runHealthcheck();
  mkdirSync(launchAgentDir, { recursive: true });
  writeFileSync(launchAgentPath, renderTemplate());
  run("plutil", ["-lint", launchAgentPath]);
  run("launchctl", ["bootout", \`gui/\${uid}\`, launchAgentPath], { allowFail: true });
  run("launchctl", ["bootstrap", \`gui/\${uid}\`, launchAgentPath]);
  run("launchctl", ["enable", launchctlTarget], { allowFail: true });
  run("launchctl", ["kickstart", "-k", launchctlTarget], { allowFail: true });
  console.log(\`Installed LaunchAgent: \${launchAgentPath}\`);
  printStatus();
  process.exit(0);
}

if (command === "uninstall") {
  if (!confirmed) {
    console.error("Refusing to mutate launchd state without --yes.");
    process.exit(1);
  }
  run("launchctl", ["bootout", \`gui/\${uid}\`, launchAgentPath], { allowFail: true });
  if (existsSync(launchAgentPath)) rmSync(launchAgentPath);
  console.log(\`Removed LaunchAgent: \${launchAgentPath}\`);
  printStatus();
  process.exit(0);
}
`,
  });

  files.push({
    path: "scripts/healthcheck.mjs",
    content: `#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const requiredPaths = [
  "AGENTS.md",
  "README.md",
  ".gitignore",
  ".env.example",
  "package.json",
  "operations/manifest.json",
  "interfaces/manifest.json",
  "memory/manifest.json",
  "tools/manifest.json",
  "skills/manifest.json",
  "scripts/skills-status.mjs",
  "scripts/redaction.mjs",
  "scripts/control-center-agent-service.mjs",
  "scripts/control-center-runtime.mjs",
  "scripts/smoke-test.mjs"
];
${repositoryModuleSelected ? 'requiredPaths.push("sources/repository-modules.json"); requiredPaths.push("sources/README.md");' : ""}

const forbiddenPaths = [
  ".memory",
  ".memory-private",
  ".private",
  ".queue",
  ".logs"
];

const issues = [];
for (const relPath of requiredPaths) {
  if (!existsSync(path.join(ROOT, relPath))) issues.push(\`missing \${relPath}\`);
}
for (const relPath of forbiddenPaths) {
  if (existsSync(path.join(ROOT, relPath))) issues.push(\`forbidden path present: \${relPath}\`);
}
const gitignore = existsSync(path.join(ROOT, ".gitignore")) ? readFileSync(path.join(ROOT, ".gitignore"), "utf8") : "";
for (const entry of [".env*", "!.env.example", ".state/", ".memory-private/", ".private/", "logs/*", "data/telegram-queue/**/*.json", "data/telegram-state.json"]) {
  if (!gitignore.split(/\\r?\\n/).includes(entry)) issues.push(\`missing privacy ignore rule: \${entry}\`);
}
${repositoryProvenanceCheck}

const manifestPath = path.join(ROOT, "operations", "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const runtime = manifest.control_center_runtime || {};
  const healthcheckArgv = Array.isArray(manifest.healthcheck_argv) ? manifest.healthcheck_argv : [];
  if (manifest.control_center_managed !== true) issues.push("operations manifest must be control_center_managed");
  if (!manifest.control_center_contract) issues.push("operations manifest missing control_center_contract");
  if (!Array.isArray(manifest.start_command?.argv) || !manifest.start_command.argv.length) issues.push("start_command argv missing");
  if (!Array.isArray(manifest.stop_command?.argv) || !manifest.stop_command.argv.length) issues.push("stop_command argv missing");
  if (manifest.start_command?.control_center_managed !== true) issues.push("start_command must be control_center_managed");
  if (manifest.stop_command?.control_center_managed !== true) issues.push("stop_command must be control_center_managed");
  if (!runtime.manager || runtime.manager === "none") issues.push("control_center_runtime manager missing");
  if (!Array.isArray(runtime.start_argv) || !runtime.start_argv.length) issues.push("control_center_runtime start_argv missing");
  if (!manifest.local_upstream_url) issues.push("local_upstream_url missing");
  if (!manifest.health_url && !runtime.health_url) issues.push("health_url missing");
  if (healthcheckArgv.join(" ") !== "node scripts/healthcheck.mjs") issues.push("healthcheck_argv must point to scripts/healthcheck.mjs");
  if (manifest.healthcheck_command_executable !== true) issues.push("healthcheck_command_executable must be true");
  if (!["disabled", "optional", "external", "launchd-on-approval"].includes(manifest.autostart)) {
    issues.push("autostart mode is invalid");
  }
}

if (issues.length > 0) {
  console.error("Healthcheck failed:");
  for (const issue of issues) console.error(\`- \${issue}\`);
  process.exit(1);
}

console.log("Healthcheck passed.");
`,
  });

  files.push({
    path: "scripts/smoke-test.mjs",
    content: `#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const required = [
  "AGENTS.md",
  "README.md",
  ".gitignore",
  ".env.example",
  "package.json",
  "interfaces/manifest.json",
  "interfaces/README.md",
  "memory/manifest.json",
  "memory/README.md",
  "tools/manifest.json",
  "tools/README.md",
  "skills/manifest.json",
  "skills/candidates.json",
  "skills/lock.json",
  "skills/README.md",
  "operations/manifest.json",
  "operations/README.md",
  "07_workflows/agent-operating-workflow.md",
  "delivery/README.md",
  "delivery/outcome-lineage.json",
  "docs/user-training-guide.md",
  "scripts/agent-cli.mjs",
  "scripts/interface-status.mjs",
  "scripts/healthcheck.mjs",
  "scripts/control-center-agent-service.mjs",
  "scripts/memory-status.mjs",
  "scripts/tools-status.mjs",
  "scripts/skills-status.mjs",
  "scripts/redaction.mjs",
  "scripts/operations-status.mjs",
  "scripts/deploy-service.mjs"
];

${telegramEnabled ? 'required.push("scripts/telegram-bot.mjs");' : ""}
${telegramEnabled ? 'required.push("data/telegram-queue/inbox/.gitkeep"); required.push("scripts/process-telegram-queue.mjs");' : ""}
${repositoryModuleSelected ? 'required.push("sources/repository-modules.json"); required.push("sources/README.md");' : ""}

const issues = [];
for (const relPath of required) {
  if (!existsSync(path.join(ROOT, relPath))) issues.push(\`missing \${relPath}\`);
}
const gitignore = existsSync(path.join(ROOT, ".gitignore")) ? readFileSync(path.join(ROOT, ".gitignore"), "utf8") : "";
for (const entry of [".env*", "!.env.example", ".state/", ".memory-private/", ".private/", "logs/*", "data/telegram-queue/**/*.json", "data/telegram-state.json"]) {
  if (!gitignore.split(/\\r?\\n/).includes(entry)) issues.push(\`missing privacy ignore rule: \${entry}\`);
}
${repositoryProvenanceCheck}

const envExample = existsSync(path.join(ROOT, ".env.example"))
  ? readFileSync(path.join(ROOT, ".env.example"), "utf8")
  : "";

${telegramEnabled ? `if (!envExample.includes("TELEGRAM_BOT_TOKEN=")) issues.push("missing TELEGRAM_BOT_TOKEN in .env.example");
if (!envExample.includes("TELEGRAM_ALLOWED_USER_IDS=")) issues.push("missing TELEGRAM_ALLOWED_USER_IDS in .env.example");` : ""}

if (issues.length > 0) {
  console.error("Smoke test failed:");
  for (const issue of issues) console.error(\`- \${issue}\`);
  process.exit(1);
}

console.log("Smoke test passed.");
`,
  });

  if (telegramEnabled) {
    files.push({
      path: "scripts/telegram-bot.mjs",
      content: `#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const QUEUE_INBOX = path.join(ROOT, "data", "telegram-queue", "inbox");
const STATE_PATH = path.join(ROOT, "data", "telegram-state.json");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  if ((statSync(envPath).mode & 0o077) !== 0) {
    console.error("Refusing to read .env with group/world permissions; run chmod 600 .env");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split(/\\r?\\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

loadEnv();

const command = process.argv[2] || "help";
const dryRun = process.argv.includes("--dry-run");
const token = process.env.TELEGRAM_BOT_TOKEN || "";
const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function ensureQueue() {
  mkdirSync(QUEUE_INBOX, { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(QUEUE_INBOX), 0o700);
  chmodSync(QUEUE_INBOX, 0o700);
  if (!existsSync(STATE_PATH)) writeFileSync(STATE_PATH, JSON.stringify({ last_update_id: 0 }, null, 2), { mode: 0o600 });
  chmodSync(STATE_PATH, 0o600);
}

function readState() {
  ensureQueue();
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function writeState(state) {
  ensureQueue();
  const temporaryPath = \`\${STATE_PATH}.\${process.pid}.tmp\`;
  writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(temporaryPath, STATE_PATH);
  chmodSync(STATE_PATH, 0o600);
}

function queueUpdate(update) {
  ensureQueue();
  const updateId = Number(update?.update_id);
  const id = Number.isSafeInteger(updateId) && updateId >= 0 ? String(updateId) : \`\${Date.now()}-\${randomUUID()}\`;
  const filePath = path.join(QUEUE_INBOX, \`\${id}.json\`);
  writeFileSync(filePath, JSON.stringify(update, null, 2), { mode: 0o600, flag: "wx" });
  chmodSync(filePath, 0o600);
  return filePath;
}

function userIdFromUpdate(update) {
  return update.message?.from?.id || update.edited_message?.from?.id || update.callback_query?.from?.id || "";
}

function isAllowed(update) {
  const userId = String(userIdFromUpdate(update));
  return allowedUsers.includes(userId);
}

if (command === "help") {
  console.log(\`Usage:
  node scripts/telegram-bot.mjs help
  node scripts/telegram-bot.mjs healthcheck
  node scripts/telegram-bot.mjs queue-status
  node scripts/telegram-bot.mjs poll-once [--dry-run]\`);
  process.exit(0);
}

if (command === "queue-status") {
  ensureQueue();
  const inbox = readdirSync(QUEUE_INBOX).filter((entry) => entry.endsWith(".json")).length;
  console.log(\`Telegram queue: pending=\${inbox}\`);
  process.exit(0);
}

if (command === "healthcheck") {
  if (!token) {
    console.error("Missing TELEGRAM_BOT_TOKEN in .env");
    process.exit(1);
  }
  if (allowedUsers.length === 0) {
    console.error("Missing TELEGRAM_ALLOWED_USER_IDS in .env");
    process.exit(1);
  }
  const response = await fetch(\`https://api.telegram.org/bot\${token}/getMe\`);
  const data = await response.json();
  if (!data.ok) {
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  console.log("Telegram bot authentication: ok");
  console.log(\`Allowed user entries configured: \${allowedUsers.length}\`);
  process.exit(0);
}

if (command === "poll-once") {
  ensureQueue();
  if (dryRun) {
    const sample = {
      update_id: Date.now(),
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: allowedUsers[0] || 0, type: "private" },
        from: { id: Number(allowedUsers[0] || 0), is_bot: false, first_name: "DryRun" },
        text: "Dry-run Telegram update"
      }
    };
    const filePath = queueUpdate(sample);
    console.log(\`Queued dry-run update: \${path.relative(ROOT, filePath)}\`);
    process.exit(0);
  }
  if (!token) {
    console.error("Missing TELEGRAM_BOT_TOKEN in .env");
    process.exit(1);
  }
  if (allowedUsers.length === 0) {
    console.error("Missing TELEGRAM_ALLOWED_USER_IDS in .env");
    process.exit(1);
  }
  const state = readState();
  const offset = Number(state.last_update_id || 0) + 1;
  const url = \`https://api.telegram.org/bot\${token}/getUpdates?timeout=0&offset=\${offset}\`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data.ok) {
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  let queued = 0;
  for (const update of data.result || []) {
    state.last_update_id = Math.max(Number(state.last_update_id || 0), Number(update.update_id || 0));
    if (!isAllowed(update)) continue;
    queueUpdate(update);
    queued += 1;
  }
  writeState(state);
  console.log(\`Telegram poll complete: queued=\${queued}\`);
  process.exit(0);
}

console.error(\`Unknown command: \${command}\`);
process.exit(1);
`,
    });

    files.push({
      path: "scripts/process-telegram-queue.mjs",
      content: `#!/usr/bin/env node

import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "data", "telegram-queue", "inbox");
const LOG_PATH = path.join(ROOT, "logs", "telegram-queue.log");

mkdirSync(INBOX, { recursive: true, mode: 0o700 });
mkdirSync(path.dirname(LOG_PATH), { recursive: true, mode: 0o700 });
chmodSync(path.dirname(INBOX), 0o700);
chmodSync(INBOX, 0o700);
chmodSync(path.dirname(LOG_PATH), 0o700);

const files = readdirSync(INBOX).filter((entry) => entry.endsWith(".json")).sort();
if (files.length === 0) {
  console.log("Telegram queue is empty.");
  process.exit(0);
}

for (const file of files) {
  if (!/^\d+(?:-[a-f0-9-]{36})?\.json$/i.test(file)) {
    console.error("Refusing unsafe Telegram queue filename.");
    process.exit(1);
  }
  const inputPath = path.join(INBOX, file);
  const fileStat = lstatSync(inputPath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > 2_000_000) {
    console.error("Refusing unsafe or oversized Telegram queue item.");
    process.exit(1);
  }
  const update = JSON.parse(readFileSync(inputPath, "utf8"));
  const text = update.message?.text || update.message?.caption || "";
  const event = {
    processed_at: new Date().toISOString(),
    event: "telegram-update-processed",
    content_kind: text ? "text" : "non-text",
    content_length: text.length
  };
  writeFileSync(LOG_PATH, JSON.stringify(event) + "\\n", { flag: "a", mode: 0o600 });
  chmodSync(LOG_PATH, 0o600);
  rmSync(inputPath);
  console.log("Processed one Telegram update; raw queue item purged.");
}
`,
    });

    files.push({ path: "data/telegram-queue/inbox/.gitkeep", content: "" });
  }

  if (String(data.repositoryAdoptionMode || "none").toLowerCase() === "selected-module") {
    files.push({
      path: "sources/repository-modules.json",
      content: repositoryManifestContent,
    });
    files.push({
      path: "sources/README.md",
      content: `# External Repository Modules

The contract selected one reviewed external module. This scaffold records its provenance and approval in \`repository-modules.json\` but does not clone, install, execute or vendor repository code.

Any later installation is a separate explicit implementation step. It must use the immutable pin, preserve the recorded license/security/permission/eval boundaries, and rerun the child-agent smoke tests.
`,
    });
  }

  files.push({
    path: ".gitignore",
    content: `.env*
!.env.example
.state/
.memory-private/
.private/
.queue/
.logs/
.snapshots/
logs/*
!logs/.gitkeep
data/telegram-queue/**/*.json
!data/telegram-queue/**/.gitkeep
data/telegram-state.json
`,
  });
  files.push({ path: "logs/.gitkeep", content: "" });
  return files;
}

export function runSmoke(projectRoot) {
  try {
    const outputText = execFileSync("node", ["scripts/smoke-test.mjs"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return { ok: true, output: outputText };
  } catch (error) {
    return {
      ok: false,
      output: [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim(),
    };
  }
}

export function runHealthcheck(projectRoot) {
  try {
    const outputText = execFileSync("node", ["scripts/healthcheck.mjs"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return { ok: true, output: outputText };
  } catch (error) {
    return {
      ok: false,
      output: [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim(),
    };
  }
}

export function initializeDeliveryGit(projectRoot, data) {
  if ((data.buildGitMode || "disposable-worktree") !== "disposable-worktree") {
    return { ok: true, status: "not-selected", revision: null };
  }
  try {
    if (existsSync(path.join(projectRoot, ".git"))) throw new Error("Generated scaffold unexpectedly already contains .git");
    execFileSync("git", ["init"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("git", ["add", "-A"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    execFileSync(
      "git",
      ["-c", "user.name=Pritha", "-c", "user.email=pritha@local.invalid", "commit", "-m", "Pritha scaffold baseline"],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (status) throw new Error("Scaffold Git baseline is not clean after commit");
    return { ok: true, status: "initialized", revision };
  } catch (error) {
    return { ok: false, status: "failed", revision: null, error: redactSensitiveText(String(error?.message || error)).slice(0, 1_000) };
  }
}

function externalVerificationStatus(research) {
  return research?.gate?.fields?.externalResearch || "pending";
}

function researchGateStatusLabel(research) {
  return research?.gate?.status || "pending";
}

function researchGateResultLabel(research) {
  if (research?.status !== "found") return "missing";
  if (research.gate?.ok) return "pass";
  return research.gate?.status || "pending";
}

function researchGateReasons(research) {
  const reasons = research?.gate?.reasons || [];
  return reasons.length ? reasons.join(", ") : "none";
}

function scaffoldReportMarkdown(data, projectRoot, createdFiles, smokeResult, options = {}) {
  const date = today();
  const agentSlug = slug(data.agentName);
  const telegramApplicable = data.telegramMode && data.telegramMode !== "none";
  const operationProfile = operationProfileFor(data);
  const controlCenterServiceMode = operationProfile.serviceMode === "none" ? "manual" : operationProfile.serviceMode;
  const controlCenterPort = stableLocalPort(agentSlug);
  const controlCenterLocalUrl = `http://127.0.0.1:${controlCenterPort}`;
  const controlCenterHealthUrl = `${controlCenterLocalUrl}/api/health`;
  const research = options.research || researchReportStatus(data);
  const healthResult = options.healthResult || smokeResult;
  const deliveryGit = options.deliveryGit || { ok: true, status: "not-requested", revision: null };
  const scaffoldOk = smokeResult.ok && healthResult.ok && deliveryGit.ok;
  const externalVerification = externalVerificationStatus(research);
  const gateFields = research.gate?.fields || {};
  const researchFrontmatter = research.gate?.frontmatter || {};
  const repositoryScopes = asList(researchFrontmatter.repository_research_scopes);
  const evidenceTopics = asList(researchFrontmatter.external_evidence_topics);
  const repositoryLicenseEvidence = Array.isArray(research.gate?.externalIntegrity?.repositoryEvidence)
    ? research.gate.externalIntegrity.repositoryEvidence.find((item) => String(item?.repository_url || "").toLowerCase() === String(data.selectedGitHubRepositories || "").replace(/\/$/, "").toLowerCase())
    : null;
  const repositoryResearchCandidate = Array.isArray(research.repositoryPayload?.candidates)
    ? research.repositoryPayload.candidates.find((item) => String(item?.repository || "").toLowerCase() === String(data.selectedGitHubRepositories || "").replace(/\/$/, "").toLowerCase())
    : null;
  const experimentalOverrides = options.experimentalOverrides || [];
  const experimental = experimentalOverrides.length > 0;
  const effectiveGateStatus = research.gate?.status || "pending";
  const enumValue = (value, allowed, fallback) => allowed.includes(String(value || "")) ? String(value) : fallback;
  const repositoryPolicy = enumValue(researchFrontmatter.repository_research_policy || data.repositoryResearchPolicy, ["auto", "required", "registry-only", "not-applicable"], "auto");
  const repositoryMode = enumValue(researchFrontmatter.repository_research_mode, ["auto", "online", "registry-only", "skip"], "pending");
  const repositoryStatus = enumValue(researchFrontmatter.repository_research_status, ["complete", "pending", "not-applicable", "failed"], "pending");
  const repositoryOnlineStatus = enumValue(researchFrontmatter.repository_research_online_status, ["complete", "fixture", "registry-only", "not-applicable", "skipped", "failed"], "pending");
  const productionReady = scaffoldOk && research.gate?.ok === true && !experimental;
  const repositoryAdoptionStatus = data.repositoryAdoptionMode === "selected-module"
    ? (productionReady ? "selected-module" : "pending-review")
    : enumValue(researchFrontmatter.repository_adoption_status || data.repositoryAdoptionMode, ["none", "reference-only"], "none");
  const reportStatus = scaffoldOk ? (productionReady ? "complete" : "draft") : "failed";
  const targetFolder = path.relative(ROOT, projectRoot) || ".";
  const outcome = options.outcome || null;
  return `---
id: ${yamlScalar(options.artifactId || `${date}-${agentSlug}-scaffold-report`)}
type: scaffold-report
status: ${reportStatus}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - scaffold
  - ${agentSlug}
tools:
  - Codex
  - AGENTS.md
  - ${telegramApplicable ? "Telegram" : "CLI"}
  - ${controlCenterServiceMode === "launchd" ? "launchd" : "operations"}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - ${yamlScalar(data.runtimeFamily || "codex-native")}
config_surfaces:
  - AGENTS.md
  - .env.example
  - scripts
portability: codex-native
sources:
  - ${yamlScalar(data.relPath)}
${research.path ? `  - ${yamlScalar(research.path)}\n` : ""}  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts:
    - ${yamlScalar(data.relPath)}
  workflows:
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: ${date}
source_updated: ${date}
source_version: scaffold v1
retrieved: ${date}
verified: ${productionReady ? date : "pending"}
valid_for: ${productionReady ? "initial production-ready scaffold" : "experimental or failed scaffold only"}
temporal_status: ${productionReady ? "current" : "pending"}
contract_fingerprint: ${data.fingerprint}
research_gate_status: ${effectiveGateStatus}
research_gate_source_status: ${gateFields.researchGate || "pending"}
memory_research_status: ${gateFields.memoryResearch || "pending"}
external_research_status: ${gateFields.externalResearch || "pending"}
synthesis_status: ${gateFields.synthesis || "pending"}
pattern_pack: ${yamlScalar(researchFrontmatter.pattern_pack || "pending")}
pattern_pack_lock: ${yamlScalar(researchFrontmatter.pattern_pack_lock || "pending")}
pattern_pack_contract_fingerprint: ${yamlScalar(researchFrontmatter.pattern_pack_contract_fingerprint || "pending")}
repository_research_required: ${String(researchFrontmatter.repository_research_required || "false").toLowerCase() === "true" ? "true" : "false"}
repository_research_policy: ${repositoryPolicy}
repository_research_mode: ${repositoryMode}
repository_research_status: ${repositoryStatus}
repository_research_completed_at: ${yamlScalar(researchFrontmatter.repository_research_completed_at || "pending")}
repository_research_online_status: ${repositoryOnlineStatus}
repository_research_lock: ${yamlScalar(researchFrontmatter.repository_research_lock || (researchFrontmatter.repository_research_status === "not-applicable" ? "not-applicable" : "pending"))}
repository_candidate_count: ${Number(researchFrontmatter.repository_candidate_count || 0) || 0}
repository_adoption_status: ${repositoryAdoptionStatus}
repository_research_scopes:
${repositoryScopes.length ? repositoryScopes.map((scope) => `  - ${yamlScalar(scope)}`).join("\n") : "  - not-applicable"}
external_evidence_count: ${researchFrontmatter.external_evidence_count || 0}
external_evidence_topics: ${JSON.stringify(evidenceTopics)}
external_research_lock: ${yamlScalar(researchFrontmatter.external_research_lock || "pending")}
synthesis_lock: ${yamlScalar(researchFrontmatter.synthesis_lock || "pending")}
research_content_lock: ${yamlScalar(researchFrontmatter.research_content_lock || "pending")}
experimental_scaffold: ${experimental ? "true" : "false"}
experimental_overrides:${experimentalOverrides.length ? `\n${experimentalOverrides.map((item) => `  - ${yamlScalar(item)}`).join("\n")}` : " []"}
outcome_spec_status: ${outcome?.status || "missing"}
outcome_spec_id: ${yamlScalar(outcome?.id || "missing")}
outcome_semantic_lock: ${yamlScalar(outcome?.semanticLock || "pending")}
outcome_document_lock: ${yamlScalar(outcome?.documentLock || "pending")}
outcome_approval_evidence: ${outcome?.approvalValid ? "valid" : "pending"}
delivery_git_status: ${deliveryGit.status}
delivery_git_revision: ${deliveryGit.revision || "pending"}
control_center_card_status: pending-registry
card_refs:
  - operations/manifest.json
  - scripts/control-center-runtime.mjs
  - scripts/control-center-agent-service.mjs
  - scripts/healthcheck.mjs
card_blockers:
  - Registry must be rebuilt after scaffold before the card appears in Agents.
next_card_actions:
  - node scripts/pritha.mjs registry
  - node scripts/pritha.mjs card-readiness ${agentSlug}
---

# Agent Scaffold Report: ${markdownValue(data.agentName || agentSlug, "agent", 300)}

Date: ${date}
Status: ${reportStatus}

## Summary

- Agent name: ${markdownValue(data.agentName || "unknown", "unknown", 300)}
- Target folder: ${markdownValue(targetFolder, ".", 500)}
- Contract: ${markdownValue(data.relPath, "missing", 500)}
- Outcome Spec: ${markdownValue(outcome ? `${outcome.status} (${outcome.relPath})` : "missing; create a proposal before outcome delivery", "missing", 700)}
- Outcome approval evidence: ${outcome?.approvalValid ? "valid" : "pending"}
- Delivery Git baseline: ${deliveryGit.status}${deliveryGit.revision ? ` (${deliveryGit.revision})` : ""}
- Runtime family: ${markdownValue(data.runtimeFamily || "unknown", "unknown", 120)}
- Interfaces: ${markdownValue(data.primaryInterface || "unknown", "unknown", 500)}
- Telegram mode: ${markdownValue(data.telegramMode || "none", "none", 120)}
- Deployment target: ${markdownValue(operationProfile.deploymentTarget, "unknown", 500)}
- Deployment profile: ${markdownValue(operationProfile.deploymentProfile, "unknown", 300)}
- Memory profile: ${memoryProfileFor(data)}
- Tool profiles: ${toolProfilesFor(data).join(", ")}
- Skill policy: needs=${skillPolicyFor(data).skillNeeds}; sources=${skillPolicyFor(data).allowedSkillSources}; install=${skillPolicyFor(data).skillInstallMode}; mutation=${skillPolicyFor(data).skillMutationPolicy}
- Research report: ${markdownValue(`${research.status}${research.path ? ` (${research.path})` : ""}`, "missing", 700)}
- Research gate: ${researchGateStatusLabel(research)}
- External verification: ${externalVerification}
- Repository research: ${research.gate?.frontmatter?.repository_research_status || "not-applicable"}
- Repository adoption mode: ${data.repositoryAdoptionMode || "none"}
- Repository module installation: ${data.repositoryAdoptionMode === "selected-module" ? "provenance recorded; code not installed" : "not-applicable"}
- Service mode: ${controlCenterServiceMode}
- Autostart: ${operationProfile.autostart}
- Local upstream URL: ${controlCenterLocalUrl}
- Health URL: ${controlCenterHealthUrl}
- Proactive mode: ${operationProfile.proactiveMode}
- Result: ${productionReady
  ? "scaffold created; structural checks and production readiness gates passed"
  : scaffoldOk
    ? "scaffold created; structural checks passed, but production gates are pending or failed"
    : "scaffold created, but structural checks failed"}
- Experimental scaffold: ${experimental ? "yes" : "no"}
- Experimental overrides: ${markdownValue(experimentalOverrides.join(", ") || "none", "none", 500)}

${experimental ? "## Experimental Override Warning\n\nThis scaffold bypassed one or more production gates. It is not evidence of production readiness, dependency approval or repository adoption. Resolve every override and create a fresh verified scaffold report before production use.\n" : ""}

## Generated structure

${createdFiles.map((file) => `- ${markdownValue(file, "unknown", 500)}`).join("\n")}

## Environment setup

- Required secrets: ${markdownValue(data.secretsRequired || (telegramApplicable ? "Telegram bot token and allowed user ids" : "none known yet"), "none known yet", 600)}
- \`.env.example\` created: yes
- Dependencies installed: no external dependencies installed
- Services configured: ${controlCenterServiceMode}; project-local runtime contract generated, but no service was started or installed
- Autostart configured: ${operationProfile.autostart}; installation requires explicit approval

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Structure validation | ${smokeResult.ok ? "pass" : "fail"} | \`node scripts/smoke-test.mjs\` |
| Smoke test | ${smokeResult.ok ? "pass" : "fail"} | ${markdownValue(smokeResult.output, "no output", 1200)} |
| Healthcheck | ${healthResult.ok ? "pass" : "fail"} | ${markdownValue(healthResult.output, "no output", 1200)} |
| Telegram adapter test | ${telegramApplicable ? "pending" : "not-applicable"} | ${telegramApplicable ? "Fill .env and run npm run telegram:healthcheck" : "Telegram not selected"} |
| Operations status | pending | \`node scripts/operations-status.mjs\` |
| Skills status | pending | \`node scripts/skills-status.mjs\` |
| Pritha memory research | ${research.status} | ${research.path || "Run `node scripts/pritha.mjs research <contract>` before production scaffold decisions"} |
| Research gate | ${markdownValue(researchGateResultLabel(research), "pending", 80)} | ${markdownValue(researchGateReasons(research), "none", 1200)} |
| Memory research gate | ${gateFields.memoryResearch || "pending"} | Machine-readable research report status |
| External verification | ${externalVerification} | Machine-readable external research status |
| Synthesis gate | ${gateFields.synthesis || "pending"} | Memory vs external comparison status |
| Repository research | ${research.gate?.frontmatter?.repository_research_status || "not-applicable"} | Discovery is advisory; selected-module readiness is recomputed from contract and evidence |
| Repository discovery safety | pass | Scaffold did not clone, install, execute, vendor, link or activate repository code |
| Reference-only exact evidence | ${data.repositoryAdoptionMode === "reference-only" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"} | Every selected canonical repository requires current matching \`github-repository-review\` evidence |
| Selected repository exact pin | ${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"} | ${markdownValue(data.repositoryPin)} |
| Selected repository module tree | ${data.repositoryAdoptionMode === "selected-module" ? (repositoryResearchCandidate?.verified_module_type === "tree" ? "pass" : "pending") : "not-applicable"} | ${markdownValue(`${repositoryResearchCandidate?.verified_module_path || "not-applicable"}; tree ${repositoryResearchCandidate?.verified_module_sha || "not-applicable"}; ${repositoryResearchCandidate?.verification_source_url || "not-applicable"}`, "not-applicable", 1200)} |
| Selected repository license | ${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"} | ${markdownValue(data.repositoryLicenseDecision)} |
| Selected repository pin-bound license source | ${data.repositoryAdoptionMode === "selected-module" ? (repositoryLicenseEvidence?.license_source_url ? "pass" : "pending") : "not-applicable"} | ${markdownValue(repositoryLicenseEvidence?.license_source_url, "not-applicable", 900)} |
| Selected repository license content identity | ${data.repositoryAdoptionMode === "selected-module" ? (repositoryLicenseEvidence?.license_source_blob_sha && repositoryLicenseEvidence?.license_source_content_sha256 ? "pass" : "pending") : "not-applicable"} | blob ${markdownValue(repositoryLicenseEvidence?.license_source_blob_sha, "not-applicable", 160)}; sha256 ${markdownValue(repositoryLicenseEvidence?.license_source_content_sha256, "not-applicable", 200)}; SPDX ${markdownValue(repositoryLicenseEvidence?.license_source_spdx, "not-applicable", 120)}; scope ${markdownValue(repositoryLicenseEvidence?.license_scope, "not-applicable", 120)} |
| Selected repository security/permissions | ${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"} | ${markdownValue(`${data.repositorySecurityReview || ""}; ${data.repositoryPermissions || ""}`)} |
| Selected repository eval/user approval | ${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"} | ${markdownValue(`${data.repositoryEvalStatus || ""}; ${data.repositoryUserApproval || ""}`)} |
| Selected repository evidence/synthesis | ${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"} | github-repository-review=${evidenceTopics.includes("github-repository-review") ? "present" : "missing"}; synthesis=${gateFields.synthesis || "pending"} |
| Control Center runtime contract | ${healthResult.ok ? "pass" : "fail"} | Managed structured start/stop plus ${controlCenterHealthUrl} |
| Control Center card readiness | pending-registry | Run \`node scripts/pritha.mjs registry\`, then \`node scripts/pritha.mjs card-readiness ${agentSlug}\` |
| Documentation review | pass | README and training guide generated |
| Outcome Spec lineage | ${outcome ? "recorded" : "missing"} | Scaffold readiness is separate from outcome verification and acceptance |

## Research and repository gate

- Research report: ${markdownValue(research.path, "missing")}
- Contract fingerprint: ${markdownValue(data.fingerprint, "missing")}
- Memory research status: ${markdownValue(gateFields.memoryResearch, "pending")}
- External research status: ${markdownValue(gateFields.externalResearch, "pending")}
- External evidence count/topics: ${Number(researchFrontmatter.external_evidence_count || 0)} / ${markdownValue(evidenceTopics.join(", "), "none")}
- External research lock: ${markdownValue(researchFrontmatter.external_research_lock, "pending")}
- Synthesis status/lock: ${markdownValue(gateFields.synthesis, "pending")} / ${markdownValue(researchFrontmatter.synthesis_lock, "pending")}
- Repository research required: ${markdownValue(researchFrontmatter.repository_research_required, "false")}
- Repository policy/mode/scopes: ${markdownValue(`${researchFrontmatter.repository_research_policy || data.repositoryResearchPolicy || "auto"}; ${researchFrontmatter.repository_research_mode || "pending"}; ${repositoryScopes.join(", ") || "none"}`)}
- Repository research/online status: ${markdownValue(`${researchFrontmatter.repository_research_status || "pending"}; ${researchFrontmatter.repository_research_online_status || "pending"}`)}
- Repository research lock: ${markdownValue(researchFrontmatter.repository_research_lock, "pending")}
- Candidate count: ${Number(researchFrontmatter.repository_candidate_count || 0)}
- Repository adoption mode/status: ${markdownValue(`${data.repositoryAdoptionMode || "none"}; ${repositoryAdoptionStatus}`)}
- Selected repository/module: ${markdownValue(`${data.selectedGitHubRepositories || "none"}; ${data.selectedRepositoryModule || "not-applicable"}`)}
- Exact immutable pin: ${markdownValue(data.repositoryPin)}
- License decision: ${markdownValue(data.repositoryLicenseDecision)}
- Pin-bound license source: ${markdownValue(repositoryLicenseEvidence?.license_source_url, "not-applicable", 900)}
- License blob/content identity: ${markdownValue(repositoryLicenseEvidence?.license_source_blob_sha, "not-applicable", 160)} / ${markdownValue(repositoryLicenseEvidence?.license_source_content_sha256, "not-applicable", 200)}
- Verified SPDX/scope: ${markdownValue(repositoryLicenseEvidence?.license_source_spdx, "not-applicable", 120)} / ${markdownValue(repositoryLicenseEvidence?.license_scope, "not-applicable", 120)}
- Security and permissions decision: ${markdownValue(`${data.repositorySecurityReview || "not-applicable"}; ${data.repositoryPermissions || "not-applicable"}`)}
- Eval result: ${markdownValue(data.repositoryEvalStatus)}
- github-repository-review evidence: ${evidenceTopics.includes("github-repository-review") ? "present" : "not-applicable-or-missing"}
- Evidence-to-memory synthesis: ${markdownValue(gateFields.synthesis, "pending")}
- User approval: ${markdownValue(data.repositoryUserApproval)}
- Installation status: ${data.repositoryAdoptionMode === "selected-module" ? "not-installed" : "not-applicable"}

## Control Center Card Readiness

- Status: pending-registry.
- Card refs: \`operations/manifest.json\`, \`scripts/control-center-runtime.mjs\`, \`scripts/control-center-agent-service.mjs\`, \`scripts/healthcheck.mjs\`.
- Expected first card state: visible in Agents after registry rebuild; Start Plan should be available for the generated project-local runtime.
- Card blockers:
  - Registry must be rebuilt after scaffold.
- Next card actions:
  - From Pritha root, run \`node scripts/pritha.mjs registry\`.
  - From Pritha root, run \`node scripts/pritha.mjs card-readiness ${agentSlug}\`.

## Handoff

- How to run: \`node scripts/agent-cli.mjs status\`
- How to test: \`node scripts/smoke-test.mjs\`
- How to healthcheck: \`node scripts/healthcheck.mjs\`
- How to start local runtime: \`node scripts/control-center-runtime.mjs start\`
- How to stop local runtime: \`node scripts/control-center-runtime.mjs stop\`
- How to inspect operations: \`node scripts/operations-status.mjs\`
- How to inspect skills: \`node scripts/skills-status.mjs\`
- How to stop: no long-running process is started during scaffold; use the Control Center stop action or \`node scripts/control-center-runtime.mjs stop\` after starting it
- How to inspect logs: see \`logs/\`
- First user exercise: follow \`docs/user-training-guide.md\`

## Open issues

- Complete external verification checklist before adding dependencies or deployment.
- Review generated instructions before using this agent for production work.

## Next steps

- Review and explicitly approve the separate Outcome Spec if it is still a proposal.
- From Pritha, run \`node scripts/pritha.mjs deliver <outcome-spec> --project ${markdownValue(targetFolder, ".", 500)}\` to enter the build/fix/verify loop.
- Treat \`verified\`, \`awaiting_acceptance\`, \`accepted\`, merge and deployment as distinct states.
- If Telegram is selected, run \`chmod 600 .env\`, configure it, and run Telegram healthcheck.
`;
}

export function scaffoldContract(contractPath, options = {}) {
  ensureDirs();
  const data = contractData(contractPath);
  const outcomeCandidate = latestOutcomeSpecForContract(data.fullPath, { root: ROOT });
  const outcomeApproval = outcomeCandidate?.status === "approved"
    ? verifyOutcomeApproval(outcomeCandidate.path, { root: ROOT })
    : { ok: false };
  const outcome = outcomeCandidate ? { ...outcomeCandidate, approvalValid: outcomeApproval.ok } : null;
  const issues = validateContract(data.fullPath, { print: false });
  if (issues.length > 0) {
    throw new Error(`Contract is not ready for scaffold:\n- ${issues.join("\n- ")}`);
  }
  if (contractStatus(data) !== "accepted" && !options["allow-draft-scaffold"]) {
    throw new Error(`Contract status must be accepted before scaffold. Current status: ${contractStatus(data) || "unknown"}. Use --allow-draft-scaffold only for an explicit experimental scaffold.`);
  }
  const research = researchReportStatus(data);
  if (research.status !== "found" && !options["allow-missing-research"]) {
    throw new Error("Pritha memory research must be completed before scaffold. Run `node scripts/pritha.mjs research <contract>` or use --allow-missing-research only for an explicit experimental scaffold.");
  }
  const researchGate = research.gate || {
    ok: false,
    status: "pending",
    reasons: ["research_report_missing"],
  };
  if (!researchGate.ok && !options["allow-pending-external-verification"]) {
    throw new Error(`External research gate is ${researchGate.status}. Complete Pritha memory research, external evidence and synthesis before scaffold. Reasons: ${researchGate.reasons.join(", ") || "unknown"}. Use --allow-pending-external-verification only for an explicit experimental scaffold.`);
  }
  const experimentalOverrides = [
    ...(contractStatus(data) !== "accepted" && options["allow-draft-scaffold"] ? ["allow-draft-scaffold"] : []),
    ...(research.status !== "found" && options["allow-missing-research"] ? ["allow-missing-research"] : []),
    ...(!researchGate.ok && options["allow-pending-external-verification"] ? ["allow-pending-external-verification"] : []),
  ];
  if (data.runtimeFamily !== "codex-native") {
    throw new Error(`Layer 4 scaffold currently supports codex-native only, got: ${data.runtimeFamily}`);
  }

  const requestedTargetPath = resolveTargetPath(data, options);
  const targetPath = ensureWritableTarget(requestedTargetPath);
  const logicalSiblingTarget = !scalar(options.output || "", "")
    && (!scalar(data.targetFolder || "", "") || /^sibling of (?:pritha|techscope)$/i.test(scalar(data.targetFolder || "", "")));
  const voiceCopyTarget = logicalSiblingTarget
    ? `sibling:${slug(data.agentName)}`
    : (path.relative(ROOT, targetPath) || ".");

  const createdFiles = [];
  for (const file of generatedAgentFiles(data, {
    research,
    experimental: experimentalOverrides.length > 0,
    voiceCopyTarget,
    outcome,
  })) {
    createdFiles.push(writeProjectFile(targetPath, file.path, file.content));
  }

  const smokeResult = runSmoke(targetPath);
  const healthResult = runHealthcheck(targetPath);
  const deliveryGit = smokeResult.ok && healthResult.ok
    ? initializeDeliveryGit(targetPath, data)
    : { ok: false, status: "skipped-structural-failure", revision: null };
  const writtenReport = writeUniqueArtifact(
    path.join(REPORT_DIR, `${today()}-${slug(data.agentName)}-scaffold-report.md`),
    ({ artifactId }) => scaffoldReportMarkdown(data, targetPath, createdFiles, smokeResult, {
      research,
      healthResult,
      deliveryGit,
      experimentalOverrides,
      outcome,
      artifactId,
    }),
  );
  const reportPath = writtenReport.path;

  console.log(`Scaffold: ${targetPath}`);
  console.log(`Created files: ${createdFiles.length}`);
  console.log(`Smoke test: ${smokeResult.ok ? "pass" : "fail"}`);
  console.log(`Healthcheck: ${healthResult.ok ? "pass" : "fail"}`);
  console.log(`Delivery Git baseline: ${deliveryGit.status}`);
  console.log(`Scaffold report: ${path.relative(ROOT, reportPath)}`);
  console.log(`Outcome Spec: ${outcome ? `${outcome.status}${outcome.approvalValid ? " (approval valid)" : " (approval pending)"}` : "missing; run outcome init"}`);
  if (contractStatus(data) !== "accepted") {
    console.log(`Warning: scaffold created from ${contractStatus(data) || "unknown"} contract because --allow-draft-scaffold was set.`);
  }
  if (experimentalOverrides.length) {
    console.log(`Warning: experimental scaffold overrides: ${experimentalOverrides.join(", ")}. This is not production readiness evidence.`);
  }
  if (!smokeResult.ok || !healthResult.ok || !deliveryGit.ok) {
    console.log([smokeResult.ok ? "" : smokeResult.output, healthResult.ok ? "" : healthResult.output, deliveryGit.ok ? "" : deliveryGit.error].filter(Boolean).join("\n"));
    process.exitCode = 1;
  }
  return { targetPath, reportPath, createdFiles, smokeResult, healthResult, deliveryGit, outcome, experimentalOverrides };
}
