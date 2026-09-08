import { renderScaffoldTemplate } from "./template.mjs";
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
import { newestArtifactPathsFirst } from "../artifact-selection.mjs";
import { writeLifecycleReport } from "../lifecycle-report.mjs";
import { latestOutcomeSpecForContract, verifyOutcomeApproval } from "../outcome-spec.mjs";
import { assertScaffoldCapability, scaffoldCapability } from "./capabilities.mjs";
import { withChildTests } from "./tests.mjs";
import { selectedScaffoldModules } from "./modules.mjs";
import { headlessCliFiles } from "./headless-cli.mjs";
import { apiProcessFiles, apiProcessManifest } from "./api-process.mjs";

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
  if (data.runtimeFamily === "api" && data.serviceMode === "process" && memoryText.trim() === "ephemeral") return "ephemeral";
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
    ephemeral: {
      directories: [],
      description: "Bounded process-memory state only; no persistent memory, database, indexes or embeddings.",
      generated_files: ["memory/README.md", "memory/manifest.json"],
    },
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
  if (/^(none|нет|без инструментов)$/i.test(String(data.toolSystem || "").trim())) return [];
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



const SHARED_REDACTION_SCRIPT = readFileSync(new URL("../../lib/redaction.mjs", import.meta.url), "utf8");

const SKILLS_STATUS_SCRIPT = renderScaffoldTemplate(new URL("./templates/skills-status-script.tmpl", import.meta.url));

const CONTROL_CENTER_RUNTIME_SCRIPT = renderScaffoldTemplate(new URL("./templates/control-center-runtime-script.tmpl", import.meta.url));

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
  const repositoryProvenanceCheck = repositoryModuleSelected ? renderScaffoldTemplate(new URL("./templates/repository-provenance-check.tmpl", import.meta.url), {
    JSON_stringify: `${JSON.stringify(repositoryManifestSha256)}`,
    JSON_stringify_2: `${JSON.stringify(repositoryManifest?.repository_research_lock || "")}`
  }) : "";
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
  const selected = selectedScaffoldModules(data, { toolProfiles, skills: skillSelection, telegram: telegramEnabled });
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
    source_of_truth: memoryProfile === "ephemeral" ? "ephemeral process memory" : "Markdown",
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
    content: renderScaffoldTemplate(new URL("./templates/delivery-readme.md.tmpl", import.meta.url)),
  });

  files.push({
    path: "AGENTS.md",
    content: renderScaffoldTemplate(new URL("./templates/agent-instructions.md.tmpl", import.meta.url), {
    agentName_New: `${markdownValue(agentName, "New Agent", 300)}`,
    data_primaryMission: `${markdownValue(data.primaryMission, "TBD")}`,
    data_targetUser: `${markdownValue(data.targetUser, "TBD")}`,
    data_successCriteria: `${markdownValue(data.successCriteria, "TBD")}`,
    bodyValue_data: `${markdownValue(bodyValue(data.text, "Out of scope"), "TBD")}`,
    data_runtimeFamily: `${markdownValue(data.runtimeFamily, "codex-native")}`,
    data_primaryInterface: `${markdownValue(data.primaryInterface, "Codex project")}`,
    interfaces_join: `${interfaces.join(", ")}`,
    data_telegramMode: `${markdownValue(data.telegramMode, "none")}`,
    data_expectedHosting: `${markdownValue(data.expectedHosting, "local Mac")}`,
    operationProfile_deploymentTarget: `${markdownValue(operationProfile.deploymentTarget, "local Mac")}`,
    operationProfile_deploymentProfile: `${markdownValue(operationProfile.deploymentProfile, "local-development")}`,
    controlCenterServiceMode: `${controlCenterServiceMode}`,
    operationProfile_autostart: `${operationProfile.autostart}`,
    operationProfile_proactiveMode: `${operationProfile.proactiveMode}`,
    data_memoryModel: `${markdownValue(data.memoryModel, "Markdown-first")}`,
    selected_memory: `${selected.memory ? memoryProfile : "no persistent module"}`,
    toolProfiles_join: `${toolProfiles.join(", ")}`,
    telegramEnabled_Telegram: `${telegramEnabled ? "Telegram is enabled by contract. Use the adapter only with TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_IDS set in .env." : "Telegram is not part of v1 unless the contract is updated."}`,
    selected_memory_2: `${selected.memory ? `- Memory profile is documented in \`memory/manifest.json\`.` : ""}`,
    selected_tools: `${selected.tools ? `- Tool boundaries are documented in \`tools/manifest.json\`.` : ""}`,
    selected_skills: `${selected.skills ? renderScaffoldTemplate(new URL("./templates/agent-skills-instructions.md.tmpl", import.meta.url)) : ""}`
  }),
  });

  files.push({
    path: "README.md",
    content: renderScaffoldTemplate(new URL("./templates/readme.md.tmpl", import.meta.url), {
    agentName_New: `${markdownValue(agentName, "New Agent", 300)}`,
    data_primaryMission: `${markdownValue(data.primaryMission, "TBD")}`,
    selected_memory: `${selected.memory ? `node scripts/memory-status.mjs` : ""}`,
    selected_tools: `${selected.tools ? `node scripts/tools-status.mjs` : ""}`,
    selected_skills: `${selected.skills ? `node scripts/skills-status.mjs` : ""}`,
    telegramEnabled_Telegram: `${telegramEnabled ? renderScaffoldTemplate(new URL("./templates/readme-telegram.md.tmpl", import.meta.url)) : ""}`,
    selected_memory_2: `${selected.memory ? `- \`memory/manifest.json\`: memory profile and boundaries.` : ""}`,
    selected_tools_2: `${selected.tools ? `- \`tools/manifest.json\`: tool profiles and boundaries.` : ""}`,
    selected_skills_2: `${selected.skills ? `- \`skills/manifest.json\`: reviewed installed skills, candidate skills, hashes and mutation policy.` : ""}`,
    data_runtimeFamily: `${markdownValue(data.runtimeFamily, "codex-native")}`,
    data_primaryInterface: `${markdownValue(data.primaryInterface, "Codex project")}`,
    interfaces_join: `${interfaces.join(", ")}`,
    data_telegramMode: `${markdownValue(data.telegramMode, "none")}`,
    data_memoryModel: `${markdownValue(data.memoryModel, "Markdown-first")}`,
    selected_memory_3: `${selected.memory ? memoryProfile : "none"}`,
    toolProfiles_join: `${toolProfiles.join(", ")}`,
    skillPolicy_skillNeeds: `${skillPolicy.skillNeeds}`,
    skillPolicy_allowedSkillSources: `${skillPolicy.allowedSkillSources}`,
    skillPolicy_skillInstallMode: `${skillPolicy.skillInstallMode}`,
    skillPolicy_skillMutationPolicy: `${skillPolicy.skillMutationPolicy}`,
    operationProfile_deploymentTarget: `${markdownValue(operationProfile.deploymentTarget, "local Mac")}`,
    operationProfile_deploymentProfile: `${markdownValue(operationProfile.deploymentProfile, "local-development")}`,
    controlCenterServiceMode: `${controlCenterServiceMode}`,
    operationProfile_autostart: `${operationProfile.autostart}`,
    operationProfile_proactiveMode: `${operationProfile.proactiveMode}`
  }),
  });

  files.push({
    path: ".env.example",
    content: `${telegramEnabled ? "TELEGRAM_BOT_TOKEN=\nTELEGRAM_ALLOWED_USER_IDS=\n" : ""}AGENT_NAME=${agentSlug}
LOG_LEVEL=info
`,
  });

  files.push({
    path: "package.json",
    content: renderScaffoldTemplate(new URL("./templates/package.json.tmpl", import.meta.url), {
    agentSlug: `${agentSlug}`,
    selected_memory: `${selected.memory ? '    "memory": "node scripts/memory-status.mjs",' : ""}`,
    selected_tools: `${selected.tools ? '    "tools": "node scripts/tools-status.mjs",' : ""}`,
    selected_skills: `${selected.skills ? '    "skills": "node scripts/skills-status.mjs",' : ""}`,
    telegramEnabled_n: `${telegramEnabled ? ',\n    "telegram:healthcheck": "node scripts/telegram-bot.mjs healthcheck",\n    "telegram:queue": "node scripts/telegram-bot.mjs queue-status",\n    "telegram:poll:dry": "node scripts/telegram-bot.mjs poll-once --dry-run"' : ""}`
  }),
  });

  files.push({
    path: "interfaces/manifest.json",
    content: `${JSON.stringify(interfaceManifest, null, 2)}
`,
  });

  files.push({
    path: "interfaces/README.md",
    content: renderScaffoldTemplate(new URL("./templates/interfaces-readme.md.tmpl", import.meta.url), {
    interfaces_map: `${interfaces.map((name) => `- \`${name}\``).join("\n")}`,
    telegramEnabled_node: `${telegramEnabled ? "node scripts/telegram-bot.mjs queue-status\nnode scripts/telegram-bot.mjs poll-once --dry-run" : ""}`
  }),
  });

  for (const name of interfaces) {
    files.push({
      path: `interfaces/${name}/README.md`,
      content: renderScaffoldTemplate(new URL("./templates/interface-adapter-readme.md.tmpl", import.meta.url), {
    name: `${name}`,
    name_telegram: `${name === "telegram" ? "generated" : name === "cli" ? "generated" : "documented-placeholder"}`,
    name_cli: `${name === "cli"
  ? "Local maintenance and smoke-test interface."
  : name === "telegram"
    ? `Telegram adapter selected by contract as ${markdownValue(data.telegramMode, "none")}.`
    : "Adapter placeholder selected by contract. Implement runtime behavior only after a dedicated design step."}`,
    data_primaryInterface: `${markdownValue(data.primaryInterface, "Codex project")}`,
    data_telegramMode: `${markdownValue(data.telegramMode, "none")}`,
    data_runtimeFamily: `${markdownValue(data.runtimeFamily, "codex-native")}`
  }),
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
      content: renderScaffoldTemplate(new URL("./templates/interfaces-realtime-voice-fespa26-reference.md.tmpl", import.meta.url), {
    voiceCopyCommand: `${voiceCopyCommand}`
  }),
    });
  }

  if (selected.memory) {
  files.push({
    path: "memory/manifest.json",
    content: `${JSON.stringify(memoryManifest, null, 2)}
`,
  });

  files.push({
    path: "memory/README.md",
    content: renderScaffoldTemplate(new URL("./templates/memory-readme.md.tmpl", import.meta.url), {
    memoryProfile: `${memoryProfile}`,
    memoryDetails_description: `${memoryDetails.description}`,
    memoryDetails_directories: `${memoryDetails.directories.map((dir) => `- \`${dir}\``).join("\n")}`,
    selected_memory: `${selected.memory ? `node scripts/memory-status.mjs` : ""}`
  }),
  });

  for (const dir of memoryDetails.directories) {
    if (dir.endsWith("/index")) {
      files.push({
        path: `${dir}/README.md`,
        content: renderScaffoldTemplate(new URL("./templates/memory-index-readme.md.tmpl", import.meta.url)),
      });
    } else if (dir.endsWith("/embeddings")) {
      files.push({
        path: `${dir}/README.md`,
        content: renderScaffoldTemplate(new URL("./templates/memory-embeddings-readme.md.tmpl", import.meta.url)),
      });
    } else if (dir.endsWith("/external")) {
      files.push({
        path: `${dir}/README.md`,
        content: renderScaffoldTemplate(new URL("./templates/memory-external-readme.md.tmpl", import.meta.url)),
      });
    } else {
      files.push({ path: `${dir}/.gitkeep`, content: "" });
    }
  }

  }

  if (selected.tools) {
  files.push({
    path: "tools/manifest.json",
    content: `${JSON.stringify(toolsManifest, null, 2)}
`,
  });

  files.push({
    path: "tools/README.md",
    content: renderScaffoldTemplate(new URL("./templates/tools-readme.md.tmpl", import.meta.url), {
    toolProfiles_map: `${toolProfiles.map((name) => {
  const detail = toolProfileDetails(name);
  return renderScaffoldTemplate(new URL("./templates/tool-profile-summary.md.tmpl", import.meta.url), {
    name: `${name}`,
    detail_boundary: `${detail.boundary}`,
    detail_purpose: `${detail.purpose}`,
    detail_risk: `${detail.risk}`
  });
}).join("\n\n")}`
  }),
  });

  for (const profile of toolProfiles) {
    const detail = toolProfileDetails(profile);
    files.push({
      path: `tools/${profile}/README.md`,
      content: renderScaffoldTemplate(new URL("./templates/tool-profile-readme.md.tmpl", import.meta.url), {
    profile: `${profile}`,
    detail_boundary: `${detail.boundary}`,
    detail_purpose: `${detail.purpose}`,
    detail_risk: `${detail.risk}`
  }),
    });
  }

  }

  if (selected.skills) {
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
    content: renderScaffoldTemplate(new URL("./templates/skills-readme.md.tmpl", import.meta.url), {
    skillPolicy_skillNeeds: `${skillPolicy.skillNeeds}`,
    skillPolicy_allowedSkillSources: `${skillPolicy.allowedSkillSources}`,
    skillPolicy_skillInstallMode: `${skillPolicy.skillInstallMode}`,
    skillPolicy_skillMutationPolicy: `${skillPolicy.skillMutationPolicy}`,
    selected_skills: `${selected.skills ? `node scripts/skills-status.mjs` : ""}`
  }),
  });

  for (const row of skillSelection.installed) {
    files.push({
      path: `skills/${row.skill.name}/SKILL.md`,
      content: row.skill.text,
    });
  }

  }

  files.push({
    path: "operations/manifest.json",
    content: `${JSON.stringify(operationsManifest, null, 2)}
`,
  });

  files.push({
    path: "operations/README.md",
    content: renderScaffoldTemplate(new URL("./templates/operations-readme.md.tmpl", import.meta.url), {
    operationProfile_deploymentTarget: `${markdownValue(operationProfile.deploymentTarget, "local Mac")}`,
    operationProfile_deploymentProfile: `${markdownValue(operationProfile.deploymentProfile, "local-development")}`,
    operationProfile_serviceMode: `${operationProfile.serviceMode}`,
    operationProfile_autostart: `${operationProfile.autostart}`,
    operationProfile_proactiveMode: `${operationProfile.proactiveMode}`,
    operationProfile_healthcheckArgv: `${operationProfile.healthcheckArgv.length > 0 ? operationProfile.healthcheckArgv.join(" ") : "# Define operations/manifest.json healthcheck_argv before deployment install"}`,
    operationProfile_startCommand: `${markdownValue(operationProfile.startCommand, "not configured")}`,
    operationProfile_stopCommand: `${markdownValue(operationProfile.stopCommand, "not configured")}`,
    operationProfile_healthcheckArgv_2: `${operationProfile.healthcheckArgv.length > 0 ? operationProfile.healthcheckArgv.join(" ") : "not configured"}`,
    operationProfile_healthcheckCommand: `${operationProfile.healthcheckCommand}`,
    operationProfile_logPath: `${markdownValue(operationProfile.logPath, "logs/")}`,
    operationProfile_restartPolicy: `${operationProfile.restartPolicy}`,
    operationProfile_serviceLabel: `${operationProfile.serviceLabel}`,
    operationProfile_proactiveMode_2: `${operationProfile.proactiveMode}`,
    operationProfile_triggerSources: `${markdownValue(operationProfile.triggerSources, "manual user request")}`,
    operationProfile_schedule: `${markdownValue(operationProfile.schedule, "not-applicable")}`,
    operationProfile_heartbeatInterval: `${markdownValue(operationProfile.heartbeatInterval, "not-applicable")}`,
    operationProfile_idleBehavior: `${markdownValue(operationProfile.idleBehavior, "sleep until trigger")}`,
    data_userInterruptionPolicy: `${markdownValue(data.userInterruptionPolicy, "do not interrupt unless configured by user")}`,
    operationsManifest_launchd_template: `${operationsManifest.launchd_template ? renderScaffoldTemplate(new URL("./templates/operations-launchd.md.tmpl", import.meta.url), {
    operationsManifest_launchd_template: `${operationsManifest.launchd_template}`
  }) : "## launchd\n\nNo launchd template is generated for the current service mode.\n"}`
  }),
  });

  if (operationsManifest.launchd_template) {
    files.push({
      path: operationsManifest.launchd_template,
      content: renderScaffoldTemplate(new URL("./templates/launchd.plist.tmpl", import.meta.url), {
    operationProfile_serviceLabel: `${xmlText(operationProfile.serviceLabel)}`,
    operationProfile_autostart: `${operationProfile.autostart === "launchd-on-approval" ? "true" : "false"}`,
    operationProfile_logPath: `${xmlText(operationProfile.logPath.replace(/\/$/, ""), "logs")}`,
    operationProfile_logPath_2: `${xmlText(operationProfile.logPath.replace(/\/$/, ""), "logs")}`
  }),
    });
  }

  files.push({
    path: "07_workflows/agent-operating-workflow.md",
    content: renderScaffoldTemplate(new URL("./templates/07-workflows-agent-operating-workflow.md.tmpl", import.meta.url), {
    agentName_New: `${markdownValue(agentName, "New Agent", 300)}`
  }),
  });

  files.push({
    path: "docs/user-training-guide.md",
    content: renderScaffoldTemplate(new URL("./templates/docs-user-training-guide.md.tmpl", import.meta.url), {
    data_coreFunctions: `${bulletList(data.coreFunctions)}`,
    sectionItems_data: `${bulletList(sectionItems(data.text, "Deferred functions"))}`
  }),
  });

  files.push({
    path: "scripts/control-center-agent-service.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-control-center-agent-service.mjs.tmpl", import.meta.url), {
    jsControlCenterLocalUrl: `${jsControlCenterLocalUrl}`,
    controlCenterPort: `${controlCenterPort}`,
    jsAgentName: `${jsAgentName}`,
    jsAgentName_2: `${jsAgentName}`
  }),
  });

  files.push({
    path: "scripts/agent-cli.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-agent-cli.mjs.tmpl", import.meta.url), {
    jsAgentName: `${jsAgentName}`,
    jsRuntimeFamily: `${jsRuntimeFamily}`,
    jsPrimaryInterface: `${jsPrimaryInterface}`,
    jsTelegramMode: `${jsTelegramMode}`
  }),
  });

  files.push({
    path: "scripts/interface-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-interface-status.mjs.tmpl", import.meta.url)),
  });

  if (selected.memory) {
  files.push({
    path: "scripts/memory-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-memory-status.mjs.tmpl", import.meta.url)),
  });
  }

  if (selected.tools) {
  files.push({
    path: "scripts/tools-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-tools-status.mjs.tmpl", import.meta.url)),
  });
  }

  if (selected.skills) {
  files.push({
    path: "scripts/skills-status.mjs",
    content: SKILLS_STATUS_SCRIPT,
  });
  }

  if (selected.redaction) {
  files.push({
    path: "scripts/redaction.mjs",
    content: SHARED_REDACTION_SCRIPT,
  });
  }

  files.push({
    path: "scripts/control-center-runtime.mjs",
    content: CONTROL_CENTER_RUNTIME_SCRIPT,
  });

  files.push({
    path: "scripts/operations-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-operations-status.mjs.tmpl", import.meta.url)),
  });

  files.push({
    path: "scripts/deploy-service.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-deploy-service.mjs.tmpl", import.meta.url), {
    jsServiceLabel: `${jsServiceLabel}`
  }),
  });

  files.push({
    path: "scripts/healthcheck.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-healthcheck.mjs.tmpl", import.meta.url), {
    selected_memory: `${selected.memory ? '  "memory/manifest.json",' : ""}`,
    selected_tools: `${selected.tools ? '  "tools/manifest.json",' : ""}`,
    selected_skills: `${selected.skills ? '  "skills/manifest.json",' : ""}`,
    selected_skills_2: `${selected.skills ? '  "scripts/skills-status.mjs",' : ""}`,
    selected_redaction: `${selected.redaction ? '  "scripts/redaction.mjs",' : ""}`,
    repositoryModuleSelected_requiredPaths: `${repositoryModuleSelected ? 'requiredPaths.push("sources/repository-modules.json"); requiredPaths.push("sources/README.md");' : ""}`,
    repositoryProvenanceCheck: `${repositoryProvenanceCheck}`
  }),
  });

  files.push({
    path: "scripts/smoke-test.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-smoke-test.mjs.tmpl", import.meta.url), {
    selected_memory: `${selected.memory ? '  "memory/manifest.json",' : ""}`,
    selected_memory_2: `${selected.memory ? '  "memory/README.md",' : ""}`,
    selected_tools: `${selected.tools ? '  "tools/manifest.json",' : ""}`,
    selected_tools_2: `${selected.tools ? '  "tools/README.md",' : ""}`,
    selected_skills: `${selected.skills ? '  "skills/manifest.json",' : ""}`,
    selected_skills_2: `${selected.skills ? '  "skills/candidates.json",' : ""}`,
    selected_skills_3: `${selected.skills ? '  "skills/lock.json",' : ""}`,
    selected_skills_4: `${selected.skills ? '  "skills/README.md",' : ""}`,
    selected_memory_3: `${selected.memory ? '  "scripts/memory-status.mjs",' : ""}`,
    selected_tools_3: `${selected.tools ? '  "scripts/tools-status.mjs",' : ""}`,
    selected_skills_5: `${selected.skills ? '  "scripts/skills-status.mjs",' : ""}`,
    selected_redaction: `${selected.redaction ? '  "scripts/redaction.mjs",' : ""}`,
    telegramEnabled_required: `${telegramEnabled ? 'required.push("scripts/telegram-bot.mjs");' : ""}`,
    telegramEnabled_required_2: `${telegramEnabled ? 'required.push("data/telegram-queue/inbox/.gitkeep"); required.push("scripts/process-telegram-queue.mjs");' : ""}`,
    repositoryModuleSelected_required: `${repositoryModuleSelected ? 'required.push("sources/repository-modules.json"); required.push("sources/README.md");' : ""}`,
    repositoryProvenanceCheck: `${repositoryProvenanceCheck}`,
    telegramEnabled_if: `${telegramEnabled ? renderScaffoldTemplate(new URL("./templates/smoke-telegram-env.mjs.tmpl", import.meta.url)) : ""}`
  }),
  });

  if (telegramEnabled) {
    files.push({
      path: "scripts/telegram-bot.mjs",
      content: renderScaffoldTemplate(new URL("./templates/scripts-telegram-bot.mjs.tmpl", import.meta.url)),
    });

    files.push({
      path: "scripts/process-telegram-queue.mjs",
      content: renderScaffoldTemplate(new URL("./templates/scripts-process-telegram-queue.mjs.tmpl", import.meta.url)),
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
      content: renderScaffoldTemplate(new URL("./templates/sources-readme.md.tmpl", import.meta.url)),
    });
  }

  files.push({
    path: ".gitignore",
    content: renderScaffoldTemplate(new URL("./templates/.gitignore.tmpl", import.meta.url)),
  });
  files.push({ path: "logs/.gitkeep", content: "" });
  const capability = scaffoldCapability(data);
  if (capability.adapter === "headless-cli-v1") return withChildTests(headlessCliFiles(files, data, capability, selected), capability);
  if (capability.adapter === "api-process-v1") return withChildTests(apiProcessFiles(files, data, capability, selected), capability);
  return withChildTests(files, capability);
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
  const capability = options.capability || scaffoldCapability(data);
  const headless = capability.adapter === "headless-cli-v1";
  const apiProcess = capability.adapter === "api-process-v1";
  const apiManifest = apiProcess ? apiProcessManifest(data) : null;
  const controlCenterServiceMode = headless ? "none" : operationProfile.serviceMode === "none" ? "manual" : operationProfile.serviceMode;
  const controlCenterPort = stableLocalPort(agentSlug);
  const controlCenterLocalUrl = headless ? "not-applicable" : apiProcess ? apiManifest.local_upstream_url : `http://127.0.0.1:${controlCenterPort}`;
  const controlCenterHealthUrl = headless ? "not-applicable" : apiProcess ? apiManifest.health_url : `${controlCenterLocalUrl}/api/health`;
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
  return renderScaffoldTemplate(new URL("./templates/scaffold-report.md.tmpl", import.meta.url), {
    options_artifactId: `${yamlScalar(options.artifactId || `${date}-${agentSlug}-scaffold-report`)}`,
    data_agentId: `${yamlScalar(data.agentId || slug(data.agentName))}`,
    path_relative: `${yamlScalar(path.relative(ROOT, projectRoot))}`,
    capability_adapter: `${capability.adapter || "unknown"}`,
    reportStatus: `${reportStatus}`,
    date: `${date}`,
    date_2: `${date}`,
    agentSlug: `${agentSlug}`,
    telegramApplicable_Telegram: `${telegramApplicable ? "Telegram" : "CLI"}`,
    controlCenterServiceMode_launchd: `${controlCenterServiceMode === "launchd" ? "launchd" : "operations"}`,
    data_runtimeFamily: `${yamlScalar(data.runtimeFamily || "codex-native")}`,
    headless_adapter: `${headless ? "adapter-needed" : "codex-native"}`,
    data_relPath: `${yamlScalar(data.relPath)}`,
    research_path: `${research.path ? `  - ${yamlScalar(research.path)}\n` : ""}`,
    data_relPath_2: `${yamlScalar(data.relPath)}`,
    date_3: `${date}`,
    date_4: `${date}`,
    date_5: `${date}`,
    productionReady_date: `${productionReady ? date : "pending"}`,
    productionReady_initial: `${productionReady ? "initial production-ready scaffold" : "experimental or failed scaffold only"}`,
    productionReady_current: `${productionReady ? "current" : "pending"}`,
    data_fingerprint: `${data.fingerprint}`,
    effectiveGateStatus: `${effectiveGateStatus}`,
    gateFields_researchGate: `${gateFields.researchGate || "pending"}`,
    gateFields_memoryResearch: `${gateFields.memoryResearch || "pending"}`,
    gateFields_externalResearch: `${gateFields.externalResearch || "pending"}`,
    gateFields_synthesis: `${gateFields.synthesis || "pending"}`,
    researchFrontmatter_pattern_pack: `${yamlScalar(researchFrontmatter.pattern_pack || "pending")}`,
    researchFrontmatter_pattern_pack_lock: `${yamlScalar(researchFrontmatter.pattern_pack_lock || "pending")}`,
    researchFrontmatter_pattern_pack_contract_fingerprint: `${yamlScalar(researchFrontmatter.pattern_pack_contract_fingerprint || "pending")}`,
    String_researchFrontmatter: `${String(researchFrontmatter.repository_research_required || "false").toLowerCase() === "true" ? "true" : "false"}`,
    repositoryPolicy: `${repositoryPolicy}`,
    repositoryMode: `${repositoryMode}`,
    repositoryStatus: `${repositoryStatus}`,
    researchFrontmatter_repository_research_completed_at: `${yamlScalar(researchFrontmatter.repository_research_completed_at || "pending")}`,
    repositoryOnlineStatus: `${repositoryOnlineStatus}`,
    researchFrontmatter_repository_research_lock: `${yamlScalar(researchFrontmatter.repository_research_lock || (researchFrontmatter.repository_research_status === "not-applicable" ? "not-applicable" : "pending"))}`,
    Number_researchFrontmatter: `${Number(researchFrontmatter.repository_candidate_count || 0) || 0}`,
    repositoryAdoptionStatus: `${repositoryAdoptionStatus}`,
    repositoryScopes_length: `${repositoryScopes.length ? repositoryScopes.map((scope) => `  - ${yamlScalar(scope)}`).join("\n") : "  - not-applicable"}`,
    researchFrontmatter_external_evidence_count: `${researchFrontmatter.external_evidence_count || 0}`,
    JSON_stringify: `${JSON.stringify(evidenceTopics)}`,
    researchFrontmatter_external_research_lock: `${yamlScalar(researchFrontmatter.external_research_lock || "pending")}`,
    researchFrontmatter_synthesis_lock: `${yamlScalar(researchFrontmatter.synthesis_lock || "pending")}`,
    researchFrontmatter_research_content_lock: `${yamlScalar(researchFrontmatter.research_content_lock || "pending")}`,
    experimental_true: `${experimental ? "true" : "false"}`,
    experimentalOverrides_length: `${experimentalOverrides.length ? `\n${experimentalOverrides.map((item) => `  - ${yamlScalar(item)}`).join("\n")}` : " []"}`,
    outcome_status: `${outcome?.status || "missing"}`,
    outcome_id: `${yamlScalar(outcome?.id || "missing")}`,
    outcome_semanticLock: `${yamlScalar(outcome?.semanticLock || "pending")}`,
    outcome_documentLock: `${yamlScalar(outcome?.documentLock || "pending")}`,
    outcome_approvalValid: `${outcome?.approvalValid ? "valid" : "pending"}`,
    deliveryGit_status: `${deliveryGit.status}`,
    deliveryGit_revision: `${deliveryGit.revision || "pending"}`,
    headless_pending: `${headless ? "pending-live-check" : "pending-registry"}`,
    headless_interfaces: `${headless ? "  - interfaces/manifest.json\n  - scripts/agent-cli.mjs\n  - scripts/healthcheck.mjs" : apiProcess ? "  - operations/manifest.json\n  - scripts/service-control.mjs\n  - scripts/server.mjs\n  - scripts/healthcheck.mjs" : "  - operations/manifest.json\n  - scripts/control-center-runtime.mjs\n  - scripts/control-center-agent-service.mjs\n  - scripts/healthcheck.mjs"}`,
    headless_n: `${headless ? " []" : "\n  - Registry must be rebuilt after scaffold before the card appears in Agents."}`,
    headless_Inspect: `${headless ? "  - Inspect the own-instance identity catalog and current result readiness." : "  - node scripts/pritha.mjs registry"}`,
    agentSlug_2: `${agentSlug}`,
    data_agentName: `${markdownValue(data.agentName || agentSlug, "agent", 300)}`,
    date_6: `${date}`,
    reportStatus_2: `${reportStatus}`,
    data_agentName_2: `${markdownValue(data.agentName || "unknown", "unknown", 300)}`,
    targetFolder: `${markdownValue(targetFolder, ".", 500)}`,
    data_relPath_3: `${markdownValue(data.relPath, "missing", 500)}`,
    outcome_outcome: `${markdownValue(outcome ? `${outcome.status} (${outcome.relPath})` : "missing; create a proposal before outcome delivery", "missing", 700)}`,
    outcome_approvalValid_2: `${outcome?.approvalValid ? "valid" : "pending"}`,
    deliveryGit_status_2: `${deliveryGit.status}`,
    deliveryGit_revision_2: `${deliveryGit.revision ? ` (${deliveryGit.revision})` : ""}`,
    data_runtimeFamily_2: `${markdownValue(data.runtimeFamily || "unknown", "unknown", 120)}`,
    capability_adapter_2: `${capability.adapter || "unknown"}`,
    data_primaryInterface: `${markdownValue(data.primaryInterface || "unknown", "unknown", 500)}`,
    data_telegramMode: `${markdownValue(data.telegramMode || "none", "none", 120)}`,
    operationProfile_deploymentTarget: `${markdownValue(operationProfile.deploymentTarget, "unknown", 500)}`,
    operationProfile_deploymentProfile: `${markdownValue(operationProfile.deploymentProfile, "unknown", 300)}`,
    memoryProfileFor_data: `${memoryProfileFor(data)}`,
    toolProfilesFor_data: `${toolProfilesFor(data).join(", ")}`,
    skillPolicyFor_data: `${skillPolicyFor(data).skillNeeds}`,
    skillPolicyFor_data_2: `${skillPolicyFor(data).allowedSkillSources}`,
    skillPolicyFor_data_3: `${skillPolicyFor(data).skillInstallMode}`,
    skillPolicyFor_data_4: `${skillPolicyFor(data).skillMutationPolicy}`,
    research_status: `${markdownValue(`${research.status}${research.path ? ` (${research.path})` : ""}`, "missing", 700)}`,
    researchGateStatusLabel_research: `${researchGateStatusLabel(research)}`,
    externalVerification: `${externalVerification}`,
    research_gate: `${research.gate?.frontmatter?.repository_research_status || "not-applicable"}`,
    data_repositoryAdoptionMode: `${data.repositoryAdoptionMode || "none"}`,
    data_repositoryAdoptionMode_2: `${data.repositoryAdoptionMode === "selected-module" ? "provenance recorded; code not installed" : "not-applicable"}`,
    controlCenterServiceMode: `${controlCenterServiceMode}`,
    operationProfile_autostart: `${operationProfile.autostart}`,
    controlCenterLocalUrl: `${controlCenterLocalUrl}`,
    controlCenterHealthUrl: `${controlCenterHealthUrl}`,
    operationProfile_proactiveMode: `${operationProfile.proactiveMode}`,
    productionReady_scaffold: `${productionReady
  ? "scaffold created; structural and research gates passed; Outcome verification and user acceptance remain separate"
  : scaffoldOk
    ? "scaffold created; structural checks passed, but production gates are pending or failed"
    : "scaffold created, but structural checks failed"}`,
    experimental_yes: `${experimental ? "yes" : "no"}`,
    experimentalOverrides_join: `${markdownValue(experimentalOverrides.join(", ") || "none", "none", 500)}`,
    experimental_Experimental: `${experimental ? "## Experimental Override Warning\n\nThis scaffold bypassed one or more production gates. It is not evidence of production readiness, dependency approval or repository adoption. Resolve every override and create a fresh verified scaffold report before production use.\n" : ""}`,
    createdFiles_map: `${createdFiles.map((file) => `- ${markdownValue(file, "unknown", 500)}`).join("\n")}`,
    data_secretsRequired: `${markdownValue(data.secretsRequired || (telegramApplicable ? "Telegram bot token and allowed user ids" : "none known yet"), "none known yet", 600)}`,
    controlCenterServiceMode_2: `${controlCenterServiceMode}`,
    operationProfile_autostart_2: `${operationProfile.autostart}`,
    smokeResult_ok: `${smokeResult.ok ? "pass" : "fail"}`,
    smokeResult_ok_2: `${smokeResult.ok ? "pass" : "fail"}`,
    smokeResult_output: `${markdownValue(smokeResult.output, "no output", 1200)}`,
    healthResult_ok: `${healthResult.ok ? "pass" : "fail"}`,
    healthResult_output: `${markdownValue(healthResult.output, "no output", 1200)}`,
    telegramApplicable_pending: `${telegramApplicable ? "pending" : "not-applicable"}`,
    telegramApplicable_Fill: `${telegramApplicable ? "Fill .env and run npm run telegram:healthcheck" : "Telegram not selected"}`,
    apiProcess_node: `${apiProcess ? "node scripts/deploy-service.mjs status (scaffold-only)" : "node scripts/operations-status.mjs"}`,
    research_status_2: `${research.status}`,
    research_path_2: `${research.path || "Run `node scripts/pritha.mjs research <contract>` before production scaffold decisions"}`,
    researchGateResultLabel_research: `${markdownValue(researchGateResultLabel(research), "pending", 80)}`,
    researchGateReasons_research: `${markdownValue(researchGateReasons(research), "none", 1200)}`,
    gateFields_memoryResearch_2: `${gateFields.memoryResearch || "pending"}`,
    externalVerification_2: `${externalVerification}`,
    gateFields_synthesis_2: `${gateFields.synthesis || "pending"}`,
    research_gate_2: `${research.gate?.frontmatter?.repository_research_status || "not-applicable"}`,
    data_repositoryAdoptionMode_3: `${data.repositoryAdoptionMode === "reference-only" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"}`,
    data_repositoryAdoptionMode_4: `${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"}`,
    data_repositoryPin: `${markdownValue(data.repositoryPin)}`,
    data_repositoryAdoptionMode_5: `${data.repositoryAdoptionMode === "selected-module" ? (repositoryResearchCandidate?.verified_module_type === "tree" ? "pass" : "pending") : "not-applicable"}`,
    repositoryResearchCandidate_verified_module_path: `${markdownValue(`${repositoryResearchCandidate?.verified_module_path || "not-applicable"}; tree ${repositoryResearchCandidate?.verified_module_sha || "not-applicable"}; ${repositoryResearchCandidate?.verification_source_url || "not-applicable"}`, "not-applicable", 1200)}`,
    data_repositoryAdoptionMode_6: `${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"}`,
    data_repositoryLicenseDecision: `${markdownValue(data.repositoryLicenseDecision)}`,
    data_repositoryAdoptionMode_7: `${data.repositoryAdoptionMode === "selected-module" ? (repositoryLicenseEvidence?.license_source_url ? "pass" : "pending") : "not-applicable"}`,
    repositoryLicenseEvidence_license_source_url: `${markdownValue(repositoryLicenseEvidence?.license_source_url, "not-applicable", 900)}`,
    data_repositoryAdoptionMode_8: `${data.repositoryAdoptionMode === "selected-module" ? (repositoryLicenseEvidence?.license_source_blob_sha && repositoryLicenseEvidence?.license_source_content_sha256 ? "pass" : "pending") : "not-applicable"}`,
    repositoryLicenseEvidence_license_source_blob_sha: `${markdownValue(repositoryLicenseEvidence?.license_source_blob_sha, "not-applicable", 160)}`,
    repositoryLicenseEvidence_license_source_content_sha256: `${markdownValue(repositoryLicenseEvidence?.license_source_content_sha256, "not-applicable", 200)}`,
    repositoryLicenseEvidence_license_source_spdx: `${markdownValue(repositoryLicenseEvidence?.license_source_spdx, "not-applicable", 120)}`,
    repositoryLicenseEvidence_license_scope: `${markdownValue(repositoryLicenseEvidence?.license_scope, "not-applicable", 120)}`,
    data_repositoryAdoptionMode_9: `${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"}`,
    data_repositorySecurityReview: `${markdownValue(`${data.repositorySecurityReview || ""}; ${data.repositoryPermissions || ""}`)}`,
    data_repositoryAdoptionMode_10: `${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"}`,
    data_repositoryEvalStatus: `${markdownValue(`${data.repositoryEvalStatus || ""}; ${data.repositoryUserApproval || ""}`)}`,
    data_repositoryAdoptionMode_11: `${data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable"}`,
    evidenceTopics_includes: `${evidenceTopics.includes("github-repository-review") ? "present" : "missing"}`,
    gateFields_synthesis_3: `${gateFields.synthesis || "pending"}`,
    headless_not: `${headless ? "not-applicable" : apiProcess ? "implementation-required" : healthResult.ok ? "pass" : "fail"}`,
    headless_No: `${headless ? "No persistent service or Control Center server selected" : apiProcess ? "Process operations metadata only; lifecycle implementation and live verification remain" : `Managed structured start/stop plus ${controlCenterHealthUrl}`}`,
    headless_pending_2: `${headless ? "pending-live-check" : "pending-registry"}`,
    headless_Own: `${headless ? "Own-instance catalog discovers authored lineage; check configuration and Outcome separately" : "Rebuild registry and check live card"}`,
    agentSlug_3: `${agentSlug}`,
    outcome_recorded: `${outcome ? "recorded" : "missing"}`,
    research_path_3: `${markdownValue(research.path, "missing")}`,
    data_fingerprint_2: `${markdownValue(data.fingerprint, "missing")}`,
    gateFields_memoryResearch_3: `${markdownValue(gateFields.memoryResearch, "pending")}`,
    gateFields_externalResearch_2: `${markdownValue(gateFields.externalResearch, "pending")}`,
    Number_researchFrontmatter_2: `${Number(researchFrontmatter.external_evidence_count || 0)}`,
    evidenceTopics_join: `${markdownValue(evidenceTopics.join(", "), "none")}`,
    researchFrontmatter_external_research_lock_2: `${markdownValue(researchFrontmatter.external_research_lock, "pending")}`,
    gateFields_synthesis_4: `${markdownValue(gateFields.synthesis, "pending")}`,
    researchFrontmatter_synthesis_lock_2: `${markdownValue(researchFrontmatter.synthesis_lock, "pending")}`,
    researchFrontmatter_repository_research_required: `${markdownValue(researchFrontmatter.repository_research_required, "false")}`,
    researchFrontmatter_repository_research_policy: `${markdownValue(`${researchFrontmatter.repository_research_policy || data.repositoryResearchPolicy || "auto"}; ${researchFrontmatter.repository_research_mode || "pending"}; ${repositoryScopes.join(", ") || "none"}`)}`,
    researchFrontmatter_repository_research_status: `${markdownValue(`${researchFrontmatter.repository_research_status || "pending"}; ${researchFrontmatter.repository_research_online_status || "pending"}`)}`,
    researchFrontmatter_repository_research_lock_2: `${markdownValue(researchFrontmatter.repository_research_lock, "pending")}`,
    Number_researchFrontmatter_3: `${Number(researchFrontmatter.repository_candidate_count || 0)}`,
    data_repositoryAdoptionMode_12: `${markdownValue(`${data.repositoryAdoptionMode || "none"}; ${repositoryAdoptionStatus}`)}`,
    data_selectedGitHubRepositories: `${markdownValue(`${data.selectedGitHubRepositories || "none"}; ${data.selectedRepositoryModule || "not-applicable"}`)}`,
    data_repositoryPin_2: `${markdownValue(data.repositoryPin)}`,
    data_repositoryLicenseDecision_2: `${markdownValue(data.repositoryLicenseDecision)}`,
    repositoryLicenseEvidence_license_source_url_2: `${markdownValue(repositoryLicenseEvidence?.license_source_url, "not-applicable", 900)}`,
    repositoryLicenseEvidence_license_source_blob_sha_2: `${markdownValue(repositoryLicenseEvidence?.license_source_blob_sha, "not-applicable", 160)}`,
    repositoryLicenseEvidence_license_source_content_sha256_2: `${markdownValue(repositoryLicenseEvidence?.license_source_content_sha256, "not-applicable", 200)}`,
    repositoryLicenseEvidence_license_source_spdx_2: `${markdownValue(repositoryLicenseEvidence?.license_source_spdx, "not-applicable", 120)}`,
    repositoryLicenseEvidence_license_scope_2: `${markdownValue(repositoryLicenseEvidence?.license_scope, "not-applicable", 120)}`,
    data_repositorySecurityReview_2: `${markdownValue(`${data.repositorySecurityReview || "not-applicable"}; ${data.repositoryPermissions || "not-applicable"}`)}`,
    data_repositoryEvalStatus_2: `${markdownValue(data.repositoryEvalStatus)}`,
    evidenceTopics_includes_2: `${evidenceTopics.includes("github-repository-review") ? "present" : "not-applicable-or-missing"}`,
    gateFields_synthesis_5: `${markdownValue(gateFields.synthesis, "pending")}`,
    data_repositoryUserApproval: `${markdownValue(data.repositoryUserApproval)}`,
    data_repositoryAdoptionMode_13: `${data.repositoryAdoptionMode === "selected-module" ? "not-installed" : "not-applicable"}`,
    headless_pending_3: `${headless ? "pending-live-check" : "pending-registry"}`,
    headless_CLI: `${headless ? "CLI interface manifest and healthcheck; no service manifest is required" : "operations manifest, managed runtime scripts and healthcheck"}`,
    headless_discoverable: `${headless ? "discoverable from own authored lineage, runtime not-applicable, Outcome still unverified" : "visible in Agents after registry rebuild; Start Plan should be available for the generated project-local runtime"}`,
    headless_Check: `${headless ? "Check live card availability separately; scaffold alone does not establish Outcome readiness." : "Registry must be rebuilt after scaffold."}`,
    headless_Use: `${headless ? "Use the shared own-instance identity catalog." : "From Pritha root, rebuild the registry."}`,
    agentSlug_4: `${agentSlug}`,
    apiProcess_node_2: `${apiProcess ? "node scripts/server.mjs (exits 78 until implemented)" : "node scripts/agent-cli.mjs status"}`,
    headless_not_2: `${headless ? "not-applicable; use the on-demand CLI" : apiProcess ? "node scripts/service-control.mjs start (implementation-required)" : "node scripts/control-center-runtime.mjs start"}`,
    headless_not_3: `${headless ? "not-applicable; a command exits after its result" : apiProcess ? "node scripts/service-control.mjs stop (implementation-required)" : "node scripts/control-center-runtime.mjs stop"}`,
    headless_no: `${headless ? "no service or schedule selected" : apiProcess ? "read operations/manifest.json; plan/status via scripts/deploy-service.mjs" : "node scripts/operations-status.mjs"}`,
    headless_Ctrl: `${headless ? "Ctrl+C interrupts an explicitly running foreground command" : "no long-running process is started during scaffold; use the Control Center stop action after starting it"}`,
    headless_read: `${headless ? "read command stdout/stderr and the private host Trial receipts" : "see logs/"}`,
    apiProcess_workflows: `${apiProcess ? "workflows/user-training.md" : "docs/user-training-guide.md"}`,
    targetFolder_2: `${markdownValue(targetFolder, ".", 500)}`
  });
}

export function planScaffoldContract(contractPath) {
  const data = contractData(contractPath);
  const issues = validateContract(data.fullPath, { print: false });
  return { schema: "pritha-scaffold-preflight-v1", readinessScope: "scaffold-capability-only", contractFingerprint: data.fingerprint,
    contractStatus: contractStatus(data), issues, capability: scaffoldCapability(data) };
}

export function scaffoldContract(contractPath, options = {}) {
  const data = contractData(contractPath);
  const capability = assertScaffoldCapability(data);
  const outcomeCandidate = latestOutcomeSpecForContract(data.fullPath, { root: ROOT });
  const outcomeApproval = outcomeCandidate?.status === "approved"
    ? verifyOutcomeApproval(outcomeCandidate.path, { root: ROOT })
    : { ok: false };
  const outcome = outcomeCandidate ? { ...outcomeCandidate, approvalValid: outcomeApproval.ok } : null;
  const issues = validateContract(data.fullPath, { print: false });
  if (issues.length > 0) {
    throw new Error(renderScaffoldTemplate(new URL("./templates/scaffold-validation-error.tmpl", import.meta.url), {
    issues_join: `${issues.join("\n- ")}`
  }));
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
  const requestedTargetPath = resolveTargetPath(data, options);
  const targetPath = ensureWritableTarget(requestedTargetPath);
  ensureDirs();
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
  const writtenReport = writeLifecycleReport(
    path.join(REPORT_DIR, `${today()}-${slug(data.agentName)}-scaffold-report.md`),
    ({ artifactId }) => scaffoldReportMarkdown(data, targetPath, createdFiles, smokeResult, {
      research,
      healthResult,
      deliveryGit,
      experimentalOverrides,
      outcome,
      artifactId,
      capability,
    }),
    { projectRoot: targetPath, stateRoot: process.env.PRITHA_STATE_ROOT, root: ROOT },
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
  return { targetPath, reportPath, createdFiles, smokeResult, healthResult, deliveryGit, outcome, experimentalOverrides, capability };
}
