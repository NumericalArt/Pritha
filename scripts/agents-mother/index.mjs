#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData, yamlList } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaStatePath, resolveTechscopeRoot } from "../lib/paths.mjs";
import { slug as makeSlug } from "../lib/slug.mjs";
import { today } from "../lib/date.mjs";
import { printIssues } from "./contract.mjs";
import {
  checkResult,
  detectProject,
  fileExists,
  readJsonIfExists,
  recommendationForProject,
  runProjectCommand,
  testProject,
} from "./test.mjs";
import { scaffoldContract } from "./scaffold/index.mjs";
import { handoffProject } from "./handoff.mjs";
import { deployProject, operationsProject } from "./operations.mjs";
import { evolveProject, listContracts, rebuildRegistry } from "./registry.mjs";
import { checkCardReadiness, printCardReadiness } from "./card-readiness.mjs";
import { applyExternalResearchEvidence } from "./external-research.mjs";
import { runLast30DaysBackend } from "./external-research-last30days.mjs";
import { deriveExternalResearchTopics } from "./external-research-topics.mjs";
import { contractAllowsExternalResearchNotApplicable, researchGateDecisionForReport } from "./research-gate.mjs";
import {
  buildAgentDevelopmentQuery,
  patternPackMarkdown,
  runSemanticPatternSearch,
} from "./pattern-research.mjs";
import { auditProjectSkills, printSkillSelection, printSkillsStatus, selectSkillsForContract, skillRowForManifest } from "./skills.mjs";

const ROOT = resolveTechscopeRoot();
const AGENT_MEMORY_ROOT = resolvePrithaAgentMemoryRoot({ root: ROOT });
const CONTRACT_DIR = path.join(AGENT_MEMORY_ROOT, "contracts");
const REPORT_DIR = path.join(AGENT_MEMORY_ROOT, "reports");
const RESEARCH_DIR = path.join(AGENT_MEMORY_ROOT, "research");
const REGISTRY_PATH = path.join(AGENT_MEMORY_ROOT, "registry.md");
const DB_PATH = resolvePrithaStatePath("memory", "techscope.sqlite");

const RUNTIME_FAMILIES = new Set(["codex-native", "cli", "api", "local-model", "hybrid", "environment-specific"]);
const TELEGRAM_MODES = new Set(["none", "primary-chat", "intake-channel", "notifications-only", "operator-control"]);
const SERVICE_MODES = new Set(["none", "manual", "launchd", "external"]);
const AUTOSTART_MODES = new Set(["disabled", "optional", "launchd-on-approval", "external"]);
const PROACTIVE_MODES = new Set(["none", "manual", "scheduled", "heartbeat", "event-driven", "queue-watcher", "hybrid"]);
const RUNTIME_PLACEMENT_PROFILES = new Set(["deterministic-first", "frontier-first", "local-first", "hybrid", "unknown"]);
const SKILL_NEEDS = new Set(["auto", "none", "selected"]);
const SKILL_SOURCES = new Set(["local-only", "trusted-only", "external-with-approval"]);
const SKILL_INSTALL_MODES = new Set(["recommend", "vendor", "link", "runtime-install"]);
const SKILL_MUTATION_POLICIES = new Set(["read-only", "patch-with-approval", "agent-managed"]);
const STATUS_VALUES = new Set(["draft", "accepted", "superseded"]);
const INVOKED_SCRIPT = path.basename(process.argv[1] || "pritha.mjs");
const CLI_COMMAND = INVOKED_SCRIPT.includes("pritha") ? "node scripts/pritha.mjs" : "node scripts/agents-mother.mjs";
const CLI_PRODUCT = INVOKED_SCRIPT.includes("pritha") ? "Pritha" : "Pritha (Agents Mother compatibility alias)";

function usage() {
  console.log(`Usage:
  ${CLI_COMMAND} help
  ${CLI_COMMAND} questions
  ${CLI_COMMAND} interview [--name <name>] [--mission <text>] [--runtime codex-native] [--runtime-placement frontier-first] [--interface "Codex project"] [--telegram none] [--service none] [--autostart disabled]
  ${CLI_COMMAND} init --name <name> --mission <text> [--runtime codex-native] [--runtime-placement frontier-first] [--interface "Codex project"] [--telegram none] [--service none] [--autostart disabled]
  ${CLI_COMMAND} research <contract-path> [--limit 12]
  ${CLI_COMMAND} pattern-research <contract-path> [--limit 12] [--semantic-mode auto|skip]
  ${CLI_COMMAND} external-research <contract-path> [--backend status|manual|codex-web|last30days] [--input evidence.json]
  ${CLI_COMMAND} scaffold <contract-path> [--output <folder>] [--allow-draft-scaffold] [--allow-missing-research] [--allow-pending-external-verification]
  ${CLI_COMMAND} test <project-path>
  ${CLI_COMMAND} handoff <project-path>
  ${CLI_COMMAND} operations <project-path>
  ${CLI_COMMAND} deploy <project-path> [plan|status|install|uninstall] [--yes]
  ${CLI_COMMAND} card-readiness <agent-slug> [--base-url <url>] [--no-control-center]
  ${CLI_COMMAND} improve <project-path> --task <text>
  ${CLI_COMMAND} evolve <project-path> [--notes <text>]
  ${CLI_COMMAND} skills status|select|audit [target] [--json]
  ${CLI_COMMAND} voice-kit [plan|list|copy --target <child-agent>]
  ${CLI_COMMAND} registry
  ${CLI_COMMAND} validate <contract-path>
  ${CLI_COMMAND} list

Pritha aliases:
  ${CLI_COMMAND} create --name <name> --mission <text>       # alias for init
  ${CLI_COMMAND} create <contract-path> --output <folder>    # alias for scaffold
  ${CLI_COMMAND} publish <project-path>                      # trial: test --no-report
  ${CLI_COMMAND} lineage                                     # alias for registry

Layer 2 status:
  interview asks questions; init creates a non-interactive draft agent-contract in 11_agents/contracts/
  validate checks whether the contract is ready for research/scaffold planning

Layer 3 status:
  research creates a local memory research report in 11_agents/research/
  pattern-research creates a reusable pattern-pack artifact from FTS/domain/semantic memory
  external-research updates a research report with curated current-source evidence

Layer 4 status:
  scaffold creates a Codex-native sibling project and scaffold report

Layer 7 status:
  test inspects existing folders, detects agent harnesses and creates agent-test-report

Layer 8 status:
  handoff creates a user-facing handoff/training report

Layer 9 status:
  operations inspects service readiness and autostart policy without starting services
  deploy automates plan/status/install/uninstall with explicit confirmation for mutations

Layer 10 status:
  evolve captures lessons learned; registry rebuilds the ${CLI_PRODUCT} lineage registry`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

const slug = (value, fallback = "agent") => makeSlug(value, { fallback });
const readFrontmatter = (text) => parseFrontmatterData(text) || {};

function ensureDirs() {
  mkdirSync(CONTRACT_DIR, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(RESEARCH_DIR, { recursive: true });
}

function uniquePath(filePath) {
  if (!existsSync(filePath)) return filePath;
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}${ext}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not create unique path for ${filePath}`);
}

function listFromText(value, fallback = []) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bulletList(items) {
  const list = Array.isArray(items) && items.length > 0 ? items : ["TBD"];
  return list.map((item) => `- ${item}`).join("\n");
}

function scalar(value, fallback = "TBD") {
  const text = String(value || "").trim();
  return text || fallback;
}

function yamlScalar(value) {
  return String(value || "")
    .replaceAll("\n", " ")
    .replaceAll(":", " -");
}

function normalizeInterfaceName(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "none") return "";
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
  return [...names].sort();
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
  if (/(mcp|api|oauth|service|openai agents sdk)/.test(text)) profiles.add("mcp-api");
  if (/(browser|web|visual|rendered|manual)/.test(text)) profiles.add("browser-manual");
  if (data.telegramMode && data.telegramMode !== "none") profiles.add("telegram-adapter");
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
  return {
    serviceMode,
    autostart,
    deploymentTarget: scalar(data.deploymentTarget || data.expectedHosting, "local Mac"),
    deploymentProfile: scalar(data.deploymentProfile, "local-development"),
    startCommand: scalar(data.startCommand, "node scripts/agent-cli.mjs status"),
    stopCommand: scalar(data.stopCommand, serviceMode === "none" ? "not-applicable" : "manual stop; define before production"),
    healthcheckCommand: scalar(data.healthcheckCommand, "node scripts/smoke-test.mjs"),
    logPath: scalar(data.logPath, "logs/"),
    restartPolicy: serviceMode === "launchd" ? "launchd template only; install after explicit user approval" : "manual unless contract is updated",
    serviceLabel: `com.local.${slug(data.agentName, "agent")}`,
    proactiveMode,
    triggerSources: scalar(data.triggerSources, proactiveMode === "none" ? "manual user request" : "TBD"),
    schedule: scalar(data.schedule, proactiveMode === "scheduled" ? "TBD cron/launchd calendar interval" : "not-applicable"),
    heartbeatInterval: scalar(data.heartbeatInterval, proactiveMode === "heartbeat" ? "TBD" : "not-applicable"),
    idleBehavior: scalar(data.idleBehavior, "sleep until trigger"),
  };
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runSqlJson(sql) {
  if (!existsSync(DB_PATH)) {
    throw new Error("Missing .memory/techscope.sqlite. Run: node scripts/rebuild-memory.mjs");
  }
  const outputText = execFileSync("sqlite3", ["-json", DB_PATH, sql], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  return outputText ? JSON.parse(outputText) : [];
}

function ftsQuery(text) {
  const terms = String(text)
    .toLowerCase()
    .replace(/[^\p{L}0-9\s-]+/giu, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2)
    .slice(0, 16);
  const unique = [...new Set(terms)];
  return unique.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}

function contractMarkdown(data) {
  const date = data.date || today();
  const agentSlug = slug(data.agentName);
  const runtimeFamily = scalar(data.runtimeFamily, "codex-native");
  const telegramMode = scalar(data.telegramMode, "none");
  const primaryInterface = scalar(data.primaryInterface, "Codex project");
  const targetFolder = scalar(data.targetFolder, `../${agentSlug}`);
  const serviceMode = normalizeServiceMode(data.serviceMode || data.service || "none");
  const autostart = normalizeAutostartMode(data.autostart || "disabled", serviceMode);
  const proactiveMode = normalizeProactiveMode(data.proactiveMode || "none");
  const skillNeeds = scalar(data.skillNeeds, "auto");
  const allowedSkillSources = scalar(data.allowedSkillSources, "local-only");
  const skillInstallMode = scalar(data.skillInstallMode, "recommend");
  const skillMutationPolicy = scalar(data.skillMutationPolicy, "read-only");
  const runtimePlacementProfile = normalizeRuntimePlacementProfile(data.runtimePlacementProfile, runtimeFamily);
  const multiModelRoutingRequested = scalar(data.multiModelRoutingRequested, "only-if-needed");
  const localInferenceRequired = scalar(data.localInferenceRequired, runtimeFamily === "local-model" ? "required" : runtimeFamily === "hybrid" ? "optional" : "later");
  const tools = ["Codex", "AGENTS.md"];
  if (telegramMode !== "none" || primaryInterface.toLowerCase().includes("telegram")) tools.push("Telegram");
  if (runtimeFamily === "cli") tools.push("CLI");
  if (runtimeFamily === "api") tools.push("OpenAI Agents SDK");
  if (serviceMode === "launchd") tools.push("launchd");

  return `---
id: ${date}-${agentSlug}-agent-contract
type: agent-contract
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - ${agentSlug}
tools:${yamlList(tools)}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - ${runtimeFamily}
config_surfaces:
  - AGENTS.md
  - workflows
  - scripts
portability: codex-native
sources:
  - user-interview
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-runtime-placement.md
related:
  intakes: []
  briefs: []
  reviews: []
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-runtime-placement.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: ${date}
source_updated: ${date}
source_version: contract draft v1
retrieved: ${date}
verified: pending
valid_for: initial agent design
temporal_status: current
---

# Agent Project Contract: ${scalar(data.agentName, "agent-name")}

Date: ${date}
Status: draft

## Purpose

- Agent name: ${scalar(data.agentName)}
- Primary mission: ${scalar(data.primaryMission)}
- Target user: ${scalar(data.targetUser)}
- Success criteria: ${scalar(data.successCriteria)}
- Out of scope: ${scalar(data.outOfScope)}

## Functional scope

### V1 core functions

${bulletList(data.coreFunctions)}

### Deferred functions

${bulletList(data.deferredFunctions)}

### Critical user workflows

${bulletList(data.criticalWorkflows)}

## Runtime and interface

- Runtime family: ${runtimeFamily}
- Primary interface: ${primaryInterface}
- Secondary interfaces: ${scalar(data.secondaryInterfaces, "none")}
- Telegram mode: ${telegramMode}
- Expected hosting: ${scalar(data.expectedHosting, "local Mac")}

## Runtime placement

- Runtime placement profile: ${runtimePlacementProfile}
- Multi-model routing requested: ${multiModelRoutingRequested}
- Local inference required: ${localInferenceRequired}
- Local inference adapter: ${scalar(data.localInferenceAdapter, localInferenceRequired === "required" ? "TBD" : "none")}
- Provider fallbacks: ${scalar(data.providerFallbacks, "frontier hosted model or manual review")}
- Privacy routing rules: ${scalar(data.privacyRoutingRules, "do not send sensitive data to external providers unless explicitly allowed")}
- Model budget policy: ${scalar(data.modelBudgetPolicy, "TBD before production usage")}
- Route healthcheck: ${scalar(data.routeHealthcheck, "node scripts/smoke-test.mjs")}
- Route change log: ${scalar(data.routeChangeLog, "document changes in reports")}

| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Planning | ${scalar(data.planningRuntime, "frontier-hosted")} | ${scalar(data.planningCandidate, "TBD current model")} | ${date} | yes | human/manual | ${scalar(data.planningEval, "TBD")} | architecture and workflow discovery |
| Coding | ${scalar(data.codingRuntime, "Codex/frontier-hosted")} | ${scalar(data.codingCandidate, "TBD current model")} | ${date} | yes | human/manual | ${scalar(data.codingEval, "TBD")} | code changes and tests |
| Extraction | ${scalar(data.extractionRuntime, "frontier-hosted")} | ${scalar(data.extractionCandidate, "TBD current model")} | ${date} | yes | small-hosted/local | ${scalar(data.extractionEval, "TBD")} | move only after schemas stabilize |
| Summarization | ${scalar(data.summarizationRuntime, "frontier-hosted")} | ${scalar(data.summarizationCandidate, "TBD current model")} | ${date} | yes | small-hosted/local | ${scalar(data.summarizationEval, "TBD")} | check compression loss |
| Classification | ${scalar(data.classificationRuntime, "small-hosted/local")} | ${scalar(data.classificationCandidate, "TBD after eval")} | ${date} | yes | frontier-hosted | ${scalar(data.classificationEval, "TBD")} | good offload candidate |
| Transcription | ${scalar(data.transcriptionRuntime, "local/hosted-audio")} | ${scalar(data.transcriptionCandidate, "TBD current model")} | ${date} | yes | hosted-audio/local | ${scalar(data.transcriptionEval, "TBD")} | accuracy and language dependent |
| Embeddings | ${scalar(data.embeddingsRuntime, "local/small-hosted")} | ${scalar(data.embeddingsCandidate, "TBD current model")} | ${date} | yes | hosted | ${scalar(data.embeddingsEval, "TBD")} | good local candidate |
| Memory query | ${scalar(data.memoryQueryRuntime, "local/small-hosted")} | ${scalar(data.memoryQueryCandidate, "TBD after eval")} | ${date} | yes | frontier-hosted | ${scalar(data.memoryQueryEval, "TBD")} | privacy-sensitive |
| Security scan | ${scalar(data.securityScanRuntime, "frontier-hosted/specialized")} | ${scalar(data.securityScanCandidate, "TBD current model")} | ${date} | yes | manual | ${scalar(data.securityScanEval, "TBD")} | do not underpower high-risk checks |

## Operations and service

- Deployment target: ${scalar(data.deploymentTarget || data.expectedHosting, "local Mac")}
- Deployment profile: ${scalar(data.deploymentProfile, "local-development")}
- Service mode: ${serviceMode}
- Autostart: ${autostart}
- Start command: ${scalar(data.startCommand, "node scripts/agent-cli.mjs status")}
- Stop command: ${scalar(data.stopCommand, serviceMode === "none" ? "not-applicable" : "manual stop; define before production")}
- Healthcheck command: ${scalar(data.healthcheckCommand, "node scripts/smoke-test.mjs")}
- Log path: ${scalar(data.logPath, "logs/")}
- Restart policy: ${serviceMode === "launchd" ? "launchd template may be generated, but installation requires explicit user approval" : "manual unless contract is updated"}

## Proactivity

- Proactive mode: ${proactiveMode}
- Trigger sources: ${scalar(data.triggerSources, proactiveMode === "none" ? "manual user request" : "TBD")}
- Schedule: ${scalar(data.schedule, proactiveMode === "scheduled" ? "TBD cron/launchd calendar interval" : "not-applicable")}
- Heartbeat interval: ${scalar(data.heartbeatInterval, proactiveMode === "heartbeat" ? "TBD" : "not-applicable")}
- Idle behavior: ${scalar(data.idleBehavior, "sleep until trigger")}
- User interruption policy: ${scalar(data.userInterruptionPolicy, "do not interrupt unless configured by user")}

## Skills and procedural memory

- Skill needs: ${skillNeeds}
- Allowed skill sources: ${allowedSkillSources}
- Skill install mode: ${skillInstallMode}
- Skill mutation policy: ${skillMutationPolicy}
- Installed skills: ${scalar(data.installedSkills, "none yet; research step may recommend local reviewed skills")}
- Candidate skills: ${scalar(data.candidateSkills, "to be filled by research")}
- External skill approval: ${scalar(data.externalSkillApproval, "explicit approval required before any external skill is vendored, linked or runtime-installed")}
- Skill update policy: ${scalar(data.skillUpdatePolicy, "read-only for scaffold v1; update through Pritha audit")}
- Skill audit command: ${scalar(data.skillAuditCommand, "node scripts/skills-status.mjs")}

## Harness inventory

- Information boundaries: ${scalar(data.informationBoundaries)}
- Runtime placement: ${runtimePlacementProfile}; local inference ${localInferenceRequired}; fallbacks ${scalar(data.providerFallbacks, "frontier hosted model or manual review")}
- Tool system: ${scalar(data.toolSystem)}
- Execution orchestration: ${scalar(data.executionOrchestration)}
- Memory and state: ${scalar(data.memoryAndState)}
- Evaluation and observability: ${scalar(data.evaluationAndObservability)}
- Constraints, validation and recovery: ${scalar(data.constraintsValidationRecovery)}
- Human approval gates: ${scalar(data.humanApprovalGates)}
- Completion criteria: ${scalar(data.completionCriteria)}

## Data, memory and sources

- Input data types: ${scalar(data.inputDataTypes)}
- Stored data: ${scalar(data.storedData)}
- Sensitive data: ${scalar(data.sensitiveData)}
- Memory model: ${scalar(data.memoryModel, "Markdown-first")}
- Indexing/search needs: ${scalar(data.indexingSearchNeeds, "none for v1 unless contract is updated")}
- External verification needs: ${scalar(data.externalVerificationNeeds, "Pritha memory plus current official docs before scaffold")}
- Source freshness requirements: ${scalar(data.sourceFreshnessRequirements, "verify volatile platform/API choices before scaffold")}

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Project files and local checks | CLI/script | Default for Codex-native scaffold |
| Agent operating procedure | skill/workflow | Encode repeatable Pritha rules |
| External services | MCP/API | Only when contract requires auth/service boundary |
| Rendered or visual checks | browser/manual | Use when UI or dynamic pages matter |

## Security and permissions

- Secrets required: ${scalar(data.secretsRequired, telegramMode === "none" ? "none known yet" : "Telegram bot token and allowed user id through .env")}
- \`.env.example\` variables: ${scalar(data.envExampleVariables, telegramMode === "none" ? "TBD" : "TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_IDS")}
- Allowed network access: ${scalar(data.allowedNetworkAccess)}
- Allowed filesystem access: ${scalar(data.allowedFilesystemAccess, "agent project folder only by default")}
- User authorization model: ${scalar(data.userAuthorizationModel, telegramMode === "none" ? "local operator" : "one-user allowlist by Telegram user id")}
- Risk notes: ${scalar(data.riskNotes)}

## Scaffold requirements

- Target folder: ${targetFolder}
- Files to generate: ${scalar(data.filesToGenerate, "AGENTS.md, README.md, .env.example, workflow notes, scripts, smoke test, user training guide")}
- Dependencies: ${scalar(data.dependencies, "minimal until scaffold profile is selected")}
- Setup commands: ${scalar(data.setupCommands)}
- Run commands: ${scalar(data.runCommands)}
- Tests/healthchecks: ${scalar(data.testsHealthchecks, "structure validation and smoke test")}
- User training guide: ${scalar(data.userTrainingGuide, "first exercise proving the main v1 function")}

## Research basis

- Related Pritha artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-runtime-placement.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md
- Pritha memory searches performed: pending
- Pattern pack: pending
- Semantic/embedding memory status: pending
- Semantic failure log: none
- Current primary sources checked: pending
- Trusted secondary sources checked: pending
- Pattern-derived external research seeds: pending
- Alternatives considered: ${scalar(data.alternativesConsidered, "pending research step")}
- Decision rationale: ${scalar(data.decisionRationale, "pending research step")}

## Acceptance checklist

- [ ] Contract reviewed with user.
- [x] Runtime family selected.
- [x] Runtime placement selected.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [ ] Harness inventory complete.
- [ ] Security model documented.
- [ ] Tests/healthchecks defined.
- [ ] Handoff/training plan defined.
`;
}

async function ask(rl, question, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function interview(options) {
  ensureDirs();
  const interactive = Boolean(process.stdin.isTTY && !options["no-input"]);
  const data = {};

  if (interactive) {
    const rl = createInterface({ input, output });
    try {
      data.agentName = await ask(rl, "Agent name", options.name || "new-agent");
      data.primaryMission = await ask(rl, "Primary mission", options.mission || "");
      data.targetUser = await ask(rl, "Target user", options.user || "single operator");
      data.successCriteria = await ask(rl, "Success criteria", options.success || "");
      data.outOfScope = await ask(rl, "Out of scope", options["out-of-scope"] || "");
      data.coreFunctions = listFromText(await ask(rl, "V1 core functions (; separated)", options.core || ""));
      data.deferredFunctions = listFromText(await ask(rl, "Deferred functions (; separated)", options.deferred || ""));
      data.criticalWorkflows = listFromText(await ask(rl, "Critical workflows (; separated)", options.workflows || ""));
      data.runtimeFamily = await ask(rl, "Runtime family (codex-native|cli|api|local-model|hybrid|environment-specific)", options.runtime || "codex-native");
      data.primaryInterface = await ask(rl, "Primary interface (Codex project|Telegram|CLI|web|API|mixed)", options.interface || "Codex project");
      data.secondaryInterfaces = await ask(rl, "Secondary interfaces", options.secondary || "none");
      const telegramDefault = String(data.primaryInterface).toLowerCase().includes("telegram") ? "primary-chat" : "none";
      data.telegramMode = await ask(rl, "Telegram mode (none|primary-chat|intake-channel|notifications-only|operator-control)", options.telegram || telegramDefault);
      data.expectedHosting = await ask(rl, "Expected hosting", options.hosting || "local Mac");
      data.runtimePlacementProfile = await ask(rl, "Runtime placement profile (deterministic-first|frontier-first|local-first|hybrid|unknown)", options["runtime-placement"] || options.placement || "");
      data.multiModelRoutingRequested = await ask(rl, "Multi-model routing requested (no|yes|only-if-needed)", options["multi-model"] || "only-if-needed");
      data.localInferenceRequired = await ask(rl, "Local inference required (no|optional|required|later)", options["local-inference"] || "later");
      data.localInferenceAdapter = await ask(rl, "Local inference adapter (none|LM Studio|Ollama|vLLM|custom|unknown)", options["local-adapter"] || "none");
      data.providerFallbacks = await ask(rl, "Provider fallbacks", options.fallbacks || "frontier hosted model or manual review");
      data.privacyRoutingRules = await ask(rl, "Privacy routing rules", options.privacy || "do not send sensitive data to external providers unless explicitly allowed");
      data.modelBudgetPolicy = await ask(rl, "Model budget policy", options.budget || "TBD before production usage");
      data.deploymentTarget = await ask(rl, "Deployment target (local Mac|Mac mini|VPS|cloud|embedded|user device|none)", options.deployTarget || options["deployment-target"] || data.expectedHosting);
      data.deploymentProfile = await ask(rl, "Deployment profile (local-development|mac-mini-service|cloud-service|embedded|external)", options.deployProfile || options["deployment-profile"] || "local-development");
      data.serviceMode = await ask(rl, "Service mode (none|manual|launchd|external)", options.service || "none");
      data.autostart = await ask(rl, "Autostart (disabled|optional|launchd-on-approval|external)", options.autostart || "disabled");
      data.healthcheckCommand = await ask(rl, "Healthcheck command", options.healthcheck || "node scripts/smoke-test.mjs");
      data.startCommand = await ask(rl, "Start command", options.start || "node scripts/agent-cli.mjs status");
      data.stopCommand = await ask(rl, "Stop command", options.stop || "not-applicable");
      data.proactiveMode = await ask(rl, "Proactive mode (none|manual|scheduled|heartbeat|event-driven|queue-watcher|hybrid)", options.proactive || "none");
      data.triggerSources = await ask(rl, "Trigger sources", options.triggers || "manual user request");
      data.schedule = await ask(rl, "Schedule", options.schedule || "not-applicable");
      data.heartbeatInterval = await ask(rl, "Heartbeat interval", options.heartbeat || "not-applicable");
      data.idleBehavior = await ask(rl, "Idle behavior", options.idle || "sleep until trigger");
      data.skillNeeds = await ask(rl, "Skill needs (auto|none|selected)", options["skill-needs"] || "auto");
      data.allowedSkillSources = await ask(rl, "Allowed skill sources (local-only|trusted-only|external-with-approval)", options["skill-sources"] || "local-only");
      data.skillInstallMode = await ask(rl, "Skill install mode (recommend|vendor|link|runtime-install)", options["skill-install"] || "recommend");
      data.skillMutationPolicy = await ask(rl, "Skill mutation policy (read-only|patch-with-approval|agent-managed)", options["skill-mutation"] || "read-only");
      data.inputDataTypes = await ask(rl, "Input data types", options.inputs || "text");
      data.storedData = await ask(rl, "Stored data", options.stored || "Markdown artifacts");
      data.sensitiveData = await ask(rl, "Sensitive data", options.sensitive || "unknown");
      data.memoryModel = await ask(rl, "Memory model", options.memory || "Markdown-first");
      data.toolSystem = await ask(rl, "Tool system", options.tools || "minimal CLI/script tools");
      data.executionOrchestration = await ask(rl, "Execution orchestration", options.orchestration || "step-by-step workflow with explicit checkpoints");
      data.testsHealthchecks = await ask(rl, "Tests/healthchecks", options.tests || "structure validation and smoke test");
      data.userTrainingGuide = await ask(rl, "User training guide", options.training || "first exercise proving the main v1 function");
    } finally {
      rl.close();
    }
  } else {
    data.agentName = options.name || "new-agent";
    data.primaryMission = options.mission || "TBD";
    data.targetUser = options.user || "single operator";
    data.successCriteria = options.success || "TBD";
    data.outOfScope = options["out-of-scope"] || "TBD";
    data.coreFunctions = listFromText(options.core, ["TBD"]);
    data.deferredFunctions = listFromText(options.deferred, ["TBD"]);
    data.criticalWorkflows = listFromText(options.workflows, ["TBD"]);
    data.runtimeFamily = options.runtime || "codex-native";
    data.primaryInterface = options.interface || "Codex project";
    data.secondaryInterfaces = options.secondary || "none";
    data.telegramMode = options.telegram || (String(data.primaryInterface).toLowerCase().includes("telegram") ? "primary-chat" : "none");
    data.expectedHosting = options.hosting || "local Mac";
    data.runtimePlacementProfile = options["runtime-placement"] || options.placement || "";
    data.multiModelRoutingRequested = options["multi-model"] || "only-if-needed";
    data.localInferenceRequired = options["local-inference"] || "later";
    data.localInferenceAdapter = options["local-adapter"] || "none";
    data.providerFallbacks = options.fallbacks || "frontier hosted model or manual review";
    data.privacyRoutingRules = options.privacy || "do not send sensitive data to external providers unless explicitly allowed";
    data.modelBudgetPolicy = options.budget || "TBD before production usage";
    data.deploymentTarget = options.deployTarget || options["deployment-target"] || data.expectedHosting;
    data.deploymentProfile = options.deployProfile || options["deployment-profile"] || "local-development";
    data.serviceMode = options.service || "none";
    data.autostart = options.autostart || "disabled";
    data.healthcheckCommand = options.healthcheck || "node scripts/smoke-test.mjs";
    data.startCommand = options.start || "node scripts/agent-cli.mjs status";
    data.stopCommand = options.stop || "not-applicable";
    data.proactiveMode = options.proactive || "none";
    data.triggerSources = options.triggers || "manual user request";
    data.schedule = options.schedule || "not-applicable";
    data.heartbeatInterval = options.heartbeat || "not-applicable";
    data.idleBehavior = options.idle || "sleep until trigger";
    data.skillNeeds = options["skill-needs"] || "auto";
    data.allowedSkillSources = options["skill-sources"] || "local-only";
    data.skillInstallMode = options["skill-install"] || "recommend";
    data.skillMutationPolicy = options["skill-mutation"] || "read-only";
    data.inputDataTypes = options.inputs || "text";
    data.storedData = options.stored || "Markdown artifacts";
    data.sensitiveData = options.sensitive || "unknown";
    data.memoryModel = options.memory || "Markdown-first";
    data.toolSystem = options.tools || "minimal CLI/script tools";
    data.executionOrchestration = options.orchestration || "step-by-step workflow with explicit checkpoints";
    data.testsHealthchecks = options.tests || "structure validation and smoke test";
    data.userTrainingGuide = options.training || "first exercise proving the main v1 function";
  }

  const date = today();
  const outPath = uniquePath(path.join(CONTRACT_DIR, `${date}-${slug(data.agentName)}-agent-contract.md`));
  writeFileSync(outPath, contractMarkdown({ ...data, date }));
  console.log(`Created: ${path.relative(ROOT, outPath)}`);

  const issues = validateContract(outPath, { print: false });
  if (issues.length > 0) {
    console.log("\nContract still needs attention before scaffold:");
    for (const issue of issues) console.log(`- ${issue}`);
  } else {
    console.log("Contract validation passed.");
  }
}

function bodyValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, "mi"));
  return match ? match[1].trim() : "";
}

function sectionItems(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^### ${escaped}\\s+([\\s\\S]*?)(?:\\n### |\\n## |$)`, "mi"));
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function isMissing(value) {
  return !value || value === "TBD" || value === "unknown" || value === "pending";
}

function validateContract(contractPath, options = { print: true }) {
  const fullPath = path.resolve(ROOT, contractPath);
  const issues = [];
  if (!existsSync(fullPath)) {
    issues.push(`file not found: ${contractPath}`);
    if (options.print) printIssues(issues);
    return issues;
  }

  const text = readFileSync(fullPath, "utf8");
  const fm = readFrontmatter(text);
  if (fm.type !== "agent-contract") issues.push('frontmatter "type" must be agent-contract');
  if (!STATUS_VALUES.has(fm.status)) issues.push(`status must be one of: ${Array.from(STATUS_VALUES).join(", ")}`);

  const runtime = bodyValue(text, "Runtime family");
  const runtimePlacement = bodyValue(text, "Runtime placement profile");
  const multiModelRouting = bodyValue(text, "Multi-model routing requested");
  const telegram = bodyValue(text, "Telegram mode");
  const serviceMode = bodyValue(text, "Service mode");
  const autostart = bodyValue(text, "Autostart");
  const proactiveMode = bodyValue(text, "Proactive mode");
  const skillNeeds = bodyValue(text, "Skill needs");
  const allowedSkillSources = bodyValue(text, "Allowed skill sources");
  const skillInstallMode = bodyValue(text, "Skill install mode");
  const skillMutationPolicy = bodyValue(text, "Skill mutation policy");
  const requiredLabels = [
    "Agent name",
    "Primary mission",
    "Target user",
    "Success criteria",
    "Runtime family",
    "Runtime placement profile",
    "Multi-model routing requested",
    "Local inference required",
    "Primary interface",
    "Telegram mode",
    "Target folder",
    "Tests/healthchecks",
    "User training guide",
  ];

  for (const label of requiredLabels) {
    if (isMissing(bodyValue(text, label))) issues.push(`missing or placeholder value: ${label}`);
  }

  if (runtime && !RUNTIME_FAMILIES.has(runtime)) {
    issues.push(`invalid Runtime family "${runtime}". Expected: ${Array.from(RUNTIME_FAMILIES).join(", ")}`);
  }
  if (runtimePlacement && !RUNTIME_PLACEMENT_PROFILES.has(runtimePlacement)) {
    issues.push(`invalid Runtime placement profile "${runtimePlacement}". Expected: ${Array.from(RUNTIME_PLACEMENT_PROFILES).join(", ")}`);
  }
  if (multiModelRouting && !["no", "yes", "only-if-needed"].includes(multiModelRouting)) {
    issues.push('invalid Multi-model routing requested. Expected: no, yes or only-if-needed');
  }
  if (telegram && !TELEGRAM_MODES.has(telegram)) {
    issues.push(`invalid Telegram mode "${telegram}". Expected: ${Array.from(TELEGRAM_MODES).join(", ")}`);
  }
  if (serviceMode && !SERVICE_MODES.has(serviceMode)) {
    issues.push(`invalid Service mode "${serviceMode}". Expected: ${Array.from(SERVICE_MODES).join(", ")}`);
  }
  if (autostart && !AUTOSTART_MODES.has(autostart)) {
    issues.push(`invalid Autostart "${autostart}". Expected: ${Array.from(AUTOSTART_MODES).join(", ")}`);
  }
  if (proactiveMode && !PROACTIVE_MODES.has(proactiveMode)) {
    issues.push(`invalid Proactive mode "${proactiveMode}". Expected: ${Array.from(PROACTIVE_MODES).join(", ")}`);
  }
  if (skillNeeds && !SKILL_NEEDS.has(skillNeeds)) {
    issues.push(`invalid Skill needs "${skillNeeds}". Expected: ${Array.from(SKILL_NEEDS).join(", ")}`);
  }
  if (allowedSkillSources && !SKILL_SOURCES.has(allowedSkillSources)) {
    issues.push(`invalid Allowed skill sources "${allowedSkillSources}". Expected: ${Array.from(SKILL_SOURCES).join(", ")}`);
  }
  if (skillInstallMode && !SKILL_INSTALL_MODES.has(skillInstallMode)) {
    issues.push(`invalid Skill install mode "${skillInstallMode}". Expected: ${Array.from(SKILL_INSTALL_MODES).join(", ")}`);
  }
  if (skillMutationPolicy && !SKILL_MUTATION_POLICIES.has(skillMutationPolicy)) {
    issues.push(`invalid Skill mutation policy "${skillMutationPolicy}". Expected: ${Array.from(SKILL_MUTATION_POLICIES).join(", ")}`);
  }
  if (telegram && telegram !== "none") {
    const secrets = bodyValue(text, "Secrets required");
    const auth = bodyValue(text, "User authorization model");
    if (!/telegram/i.test(secrets)) issues.push("Telegram mode selected but Secrets required does not mention Telegram token");
    if (!/(allowlist|user id|allowed user|telegram)/i.test(auth)) issues.push("Telegram mode selected but User authorization model does not define Telegram allowlist/user id");
  }

  if (!text.includes("## Harness inventory")) issues.push("missing Harness inventory section");
  if (!text.includes("## Security and permissions")) issues.push("missing Security and permissions section");
  if (!text.includes("## Acceptance checklist")) issues.push("missing Acceptance checklist section");

  if (options.print) {
    if (issues.length === 0) {
      console.log(`Contract validation passed: ${path.relative(ROOT, fullPath)}`);
    } else {
      console.error(`Contract validation failed: ${path.relative(ROOT, fullPath)}`);
      printIssues(issues);
    }
  }
  return issues;
}

function contractData(contractPath) {
  const fullPath = path.resolve(ROOT, contractPath);
  if (!existsSync(fullPath)) throw new Error(`Contract not found: ${contractPath}`);
  const text = readFileSync(fullPath, "utf8");
  const fm = readFrontmatter(text);
  return {
    fullPath,
    relPath: path.relative(ROOT, fullPath),
    text,
    fm,
    agentName: bodyValue(text, "Agent name"),
    primaryMission: bodyValue(text, "Primary mission"),
    targetUser: bodyValue(text, "Target user"),
    successCriteria: bodyValue(text, "Success criteria"),
    runtimeFamily: bodyValue(text, "Runtime family"),
    primaryInterface: bodyValue(text, "Primary interface"),
    secondaryInterfaces: bodyValue(text, "Secondary interfaces"),
    telegramMode: bodyValue(text, "Telegram mode"),
    expectedHosting: bodyValue(text, "Expected hosting"),
    deploymentTarget: bodyValue(text, "Deployment target"),
    deploymentProfile: bodyValue(text, "Deployment profile"),
    serviceMode: bodyValue(text, "Service mode") || "none",
    autostart: bodyValue(text, "Autostart") || "disabled",
    startCommand: bodyValue(text, "Start command"),
    stopCommand: bodyValue(text, "Stop command"),
    healthcheckCommand: bodyValue(text, "Healthcheck command"),
    logPath: bodyValue(text, "Log path"),
    restartPolicy: bodyValue(text, "Restart policy"),
    proactiveMode: bodyValue(text, "Proactive mode") || "none",
    skillNeeds: bodyValue(text, "Skill needs") || "auto",
    allowedSkillSources: bodyValue(text, "Allowed skill sources") || "local-only",
    skillInstallMode: bodyValue(text, "Skill install mode") || "recommend",
    skillMutationPolicy: bodyValue(text, "Skill mutation policy") || "read-only",
    triggerSources: bodyValue(text, "Trigger sources"),
    schedule: bodyValue(text, "Schedule"),
    heartbeatInterval: bodyValue(text, "Heartbeat interval"),
    idleBehavior: bodyValue(text, "Idle behavior"),
    userInterruptionPolicy: bodyValue(text, "User interruption policy"),
    memoryModel: bodyValue(text, "Memory model"),
    indexingSearchNeeds: bodyValue(text, "Indexing/search needs"),
    toolSystem: bodyValue(text, "Tool system"),
    inputDataTypes: bodyValue(text, "Input data types"),
    sensitiveData: bodyValue(text, "Sensitive data"),
    targetFolder: bodyValue(text, "Target folder"),
    filesToGenerate: bodyValue(text, "Files to generate"),
    dependencies: bodyValue(text, "Dependencies"),
    setupCommands: bodyValue(text, "Setup commands"),
    runCommands: bodyValue(text, "Run commands"),
    testsHealthchecks: bodyValue(text, "Tests/healthchecks"),
    userTrainingGuide: bodyValue(text, "User training guide"),
    envExampleVariables: bodyValue(text, "`.env.example` variables"),
    secretsRequired: bodyValue(text, "Secrets required"),
    allowedNetworkAccess: bodyValue(text, "Allowed network access"),
    userAuthorizationModel: bodyValue(text, "User authorization model"),
    coreFunctions: sectionItems(text, "V1 core functions"),
    criticalWorkflows: sectionItems(text, "Critical user workflows"),
  };
}

function searchMemory(query, limit) {
  const match = ftsQuery(query);
  if (!match) return [];
  return runSqlJson(`
SELECT d.type, d.status, d.path, d.title, c.heading, substr(replace(c.text, char(10), ' '), 1, 420) AS snippet
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.chunk_id
JOIN documents d ON d.id = chunks_fts.document_id
WHERE chunks_fts MATCH ${sqlString(match)}
  AND d.type != 'template'
ORDER BY rank
LIMIT ${Number(limit) || 12};
`);
}

function searchMemoryByDomain(query, domain, limit) {
  const match = ftsQuery(query);
  if (!match || !domain) return [];
  return runSqlJson(`
SELECT d.type, d.status, d.path, d.title, c.heading, substr(replace(c.text, char(10), ' '), 1, 420) AS snippet
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.chunk_id
JOIN documents d ON d.id = chunks_fts.document_id
JOIN relations r ON r.source_id = d.id
JOIN entities e ON e.id = r.target_id
WHERE chunks_fts MATCH ${sqlString(match)}
  AND r.source_type = 'document'
  AND r.relation_type = 'IN_DOMAIN'
  AND r.target_type = 'memory-domain'
  AND lower(e.name) = lower(${sqlString(domain)})
  AND d.type != 'template'
ORDER BY rank
LIMIT ${Number(limit) || 8};
`);
}

function collectAgentMemoryResearch(data, options = {}) {
  const limit = Number(options.limit || 12);
  const query = buildAgentDevelopmentQuery(data);
  const memoryResults = searchMemory(query, limit);
  const domainLimit = Math.max(4, Math.floor(limit / 2));
  const domainResults = {
    agentBuildingKnowledge: searchMemoryByDomain(query, "agent-building-knowledge", domainLimit),
    prithaSelf: searchMemoryByDomain(query, "pritha-self", domainLimit),
    childAgents: searchMemoryByDomain(query, "child-agents", domainLimit),
  };
  return {
    query,
    limit,
    memoryResults,
    domainResults,
  };
}

function writePatternPack(data, researchContext, options = {}) {
  ensureDirs();
  const semantic = runSemanticPatternSearch(ROOT, researchContext.query, {
    ...options,
    contract: data.relPath,
    project: data.projectPath,
  });
  const pack = patternPackMarkdown(data, { ...researchContext, semantic }, options);
  const outPath = uniquePath(path.join(RESEARCH_DIR, `${today()}-${slug(data.agentName)}-agent-pattern-pack.md`));
  writeFileSync(outPath, pack.text);
  return {
    ...pack,
    fullPath: outPath,
    relPath: path.relative(ROOT, outPath),
  };
}

function readKnownDocs(paths) {
  return paths
    .filter((relPath) => existsSync(path.join(ROOT, relPath)))
    .map((relPath) => {
      const text = readFileSync(path.join(ROOT, relPath), "utf8");
      return {
        path: relPath,
        title: text.match(/^#\s+(.+)$/m)?.[1] || path.basename(relPath, ".md"),
        summary: text.match(/## Rule\s+([\s\S]*?)(?:\n## |$)/)?.[1]?.trim()
          || text.match(/## Goal\s+([\s\S]*?)(?:\n## |$)/)?.[1]?.trim()
          || "",
      };
    });
}

function externalChecksFor(data) {
  const checks = [
    "Verify current Codex/AGENTS.md behavior and any target runtime docs before scaffold.",
    "Verify package/dependency versions before installing anything.",
    "Verify security and auth requirements for any external service selected by the contract.",
  ];
  if (data.telegramMode && data.telegramMode !== "none") {
    checks.push("Verify current Telegram Bot API behavior for updates, long polling/webhooks, file downloads and message size limits.");
    checks.push("Verify token handling and one-user allowlist pattern before creating the Telegram adapter.");
  }
  if (data.runtimeFamily === "api") {
    checks.push("Verify current OpenAI Agents SDK docs for agents, tools, handoffs, guardrails, tracing and state before API scaffold.");
  }
  if (data.runtimeFamily === "local-model") {
    checks.push("Verify selected local inference runtime, model license, hardware requirements and quantization/runtime compatibility.");
  }
  if (data.runtimeFamily === "hybrid" || data.runtimeFamily === "environment-specific") {
    checks.push("Verify every platform-specific config surface and classify each borrowed pattern as portable, adapter-needed or environment-specific.");
  }
  return checks;
}

function recommendationFor(data) {
  const notes = [];
  notes.push(`Runtime family: keep \`${data.runtimeFamily || "codex-native"}\` unless research finds a hard blocker.`);
  if (data.telegramMode && data.telegramMode !== "none") {
    notes.push(`Telegram: include it as \`${data.telegramMode}\` adapter with queue, allowlist, concise replies and logs.`);
  } else {
    notes.push("Telegram: keep out of scaffold v1 unless the user explicitly selects it later.");
  }
  notes.push(`Memory: start from \`${data.memoryModel || "Markdown-first"}\`; add SQLite/embeddings only if v1 workflows need retrieval.`);
  notes.push("Scaffold should remain minimal, testable and free of copied Pritha secrets.");
  return notes;
}

function formatMemoryRows(rows) {
  if (rows.length === 0) return "- No domain-specific matches found.";
  return rows.map((row, index) => `### ${index + 1}. ${row.title || row.path}

- Path: ${row.path}
- Type/status: ${row.type}/${row.status}
- Heading: ${row.heading || "n/a"}
- Relevance note: ${row.snippet || ""}
`).join("\n");
}

function externalResearchGateState(data, topics) {
  const notApplicable = topics.length === 0 && contractAllowsExternalResearchNotApplicable(data);
  return {
    researchGateStatus: notApplicable ? "complete" : "pending",
    memoryResearchStatus: "complete",
    externalResearchStatus: notApplicable ? "not-applicable" : "pending",
    externalResearchBackend: notApplicable ? "none" : "pending",
    externalResearchCompletedAt: notApplicable ? today() : "pending",
    synthesisStatus: notApplicable ? "not-applicable" : "pending",
    freshnessWindowDays: 30,
  };
}

function externalResearchTopicList(topics) {
  if (!topics.length) return "  - not-applicable";
  return topics.map((topic) => `  - ${yamlScalar(topic.id)}`).join("\n");
}

function formatExternalResearchTopics(topics) {
  if (!topics.length) return "- No volatile external research topics were derived from this contract.";
  return topics.map((topic, index) => `### ${index + 1}. ${topic.topic}

- ID: \`${topic.id}\`
- Query: ${topic.query}
- Reason: ${topic.reason}
- Required: ${topic.required ? "yes" : "no"}
- Preferred sources: ${topic.preferredSources.join(", ")}
- Freshness window: ${topic.freshnessWindowDays} days
`).join("\n");
}

function researchMarkdown(data, memoryResults, domainResults, knownDocs, skillSelection, options = {}) {
  const date = today();
  const agentSlug = slug(data.agentName);
  const title = `${data.agentName || agentSlug} agent architecture research`;
  const externalResearchTopics = options.externalResearchTopics || deriveExternalResearchTopics(data);
  const patternPack = options.patternPack || null;
  const gate = externalResearchGateState(data, externalResearchTopics);
  const resultSources = [
    data.relPath,
    "07_workflows/agents-mother.md",
    "07_workflows/agents-mother-roadmap.md",
    "04_standards/agent-creation-harness.md",
    "04_standards/agent-environment-compatibility.md",
    "04_standards/agent-tool-integration-selection.md",
  ];
  const skillSources = [
    ...skillSelection.installed,
    ...skillSelection.candidates,
    ...skillSelection.blocked,
  ].flatMap((row) => [row.skill.relPath, ...row.skill.sourcePaths]);
  const domainSources = Object.values(domainResults).flat().map((row) => row.path);
  const patternSources = patternPack?.relPath ? [patternPack.relPath] : [];
  const allSources = [...new Set([...resultSources, ...patternSources, ...memoryResults.map((row) => row.path), ...domainSources, ...skillSources])].slice(0, 50);
  const sourceYaml = allSources.map((source) => `  - ${source}`).join("\n");
  const relatedStandards = [
    "04_standards/agent-creation-harness.md",
    "04_standards/agent-environment-compatibility.md",
    "04_standards/agent-tool-integration-selection.md",
    "04_standards/memory-domains.md",
    "04_standards/pritha-self-model.md",
  ];

  return `---
id: ${date}-${agentSlug}-agent-research
type: review
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - architecture-validation
  - ${agentSlug}
tools:
  - Codex
  - AGENTS.md
  - ${data.telegramMode && data.telegramMode !== "none" ? "Telegram" : "CLI"}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - ${data.runtimeFamily || "codex-native"}
config_surfaces:
  - AGENTS.md
  - workflows
  - scripts
portability: codex-native
sources:
${sourceYaml}
related:
  agent_contracts:
    - ${data.relPath}
  standards:
${relatedStandards.map((item) => `    - ${item}`).join("\n")}
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: uncertain
source_published: ${date}
source_updated: ${date}
source_version: research draft v1
retrieved: ${date}
verified: pending
valid_for: pre-scaffold architecture validation
temporal_status: unknown
research_gate_status: ${gate.researchGateStatus}
memory_research_status: ${gate.memoryResearchStatus}
external_research_status: ${gate.externalResearchStatus}
external_research_backend: ${gate.externalResearchBackend}
external_research_completed_at: ${gate.externalResearchCompletedAt}
external_research_freshness_window_days: ${gate.freshnessWindowDays}
external_research_topics:
${externalResearchTopicList(externalResearchTopics)}
synthesis_status: ${gate.synthesisStatus}
pattern_pack: ${patternPack?.relPath || "pending"}
pattern_research_status: ${patternPack?.status || "pending"}
semantic_memory_status: ${patternPack?.semantic?.status || "pending"}
semantic_failure_log: ${patternPack?.semantic?.failureLog || "none"}
---

# Review: ${title}

Date: ${date}
Status: draft

## Question

Is the current agent contract ready to move toward scaffold, and what architecture checks must be completed first?

## Contract summary

- Contract: ${data.relPath}
- Agent name: ${data.agentName || "unknown"}
- Mission: ${data.primaryMission || "unknown"}
- Target user: ${data.targetUser || "unknown"}
- Runtime family: ${data.runtimeFamily || "unknown"}
- Primary interface: ${data.primaryInterface || "unknown"}
- Telegram mode: ${data.telegramMode || "unknown"}
- Expected hosting: ${data.expectedHosting || "unknown"}
- Memory model: ${data.memoryModel || "unknown"}

## Local memory findings

${memoryResults.length === 0 ? "- No local memory matches found. Rebuild memory and broaden query before scaffold." : memoryResults.map((row, index) => `### ${index + 1}. ${row.title || row.path}

- Path: ${row.path}
- Type/status: ${row.type}/${row.status}
- Heading: ${row.heading || "n/a"}
- Relevance note: ${row.snippet || ""}
`).join("\n")}

## Domain-aware memory findings

### Agent-building knowledge

Use these as standards, workflows and reusable patterns for the new contract.

${formatMemoryRows(domainResults.agentBuildingKnowledge || [])}

### Pritha self

Use these to understand current Pritha capabilities and constraints.

${formatMemoryRows(domainResults.prithaSelf || [])}

### Child-agent lifecycle evidence

Use these only as evidence of successful or failed patterns. Do not clone a
past child agent by default.

${formatMemoryRows(domainResults.childAgents || [])}

## Pattern Pack

- Path: ${patternPack?.relPath || "pending"}
- Status: ${patternPack?.status || "pending"}
- Selected patterns: ${patternPack?.selectedPatterns?.length || 0}
- Semantic/embedding search: ${patternPack?.semantic?.status || "pending"}
- Semantic failure log: ${patternPack?.semantic?.failureLog || "none"}
- External research seeds: ${patternPack?.externalResearchSeeds?.join(", ") || "none"}

Codex must read this pattern pack before scaffold or agent improvement work. If semantic/embedding search failed, continue only with the warning recorded above and use external research to compensate for missing semantic retrieval.

## Standards and workflow basis

${knownDocs.map((doc) => `### ${doc.title}

- Path: ${doc.path}
- Basis: ${doc.summary.replace(/\s+/g, " ").slice(0, 500) || "See document for details."}
`).join("\n")}

## Research Gate Status

| Gate | Status | Notes |
| --- | --- | --- |
| Research gate | ${gate.researchGateStatus} | Complete only after memory, external evidence and synthesis are complete or explicitly not applicable. |
| Memory research | ${gate.memoryResearchStatus} | Local Pritha memory search completed for this report. |
| External research | ${gate.externalResearchStatus} | ${gate.externalResearchStatus === "not-applicable" ? "Contract marks current external verification as not applicable." : "Fresh external evidence still needs to be gathered."} |
| Synthesis | ${gate.synthesisStatus} | ${gate.synthesisStatus === "not-applicable" ? "No external synthesis required for this fixture-like contract." : "Memory vs external comparison is pending."} |

## External Research Topics

${formatExternalResearchTopics(externalResearchTopics)}

## External Research Evidence

${gate.externalResearchStatus === "not-applicable"
  ? "- Not applicable for this contract. No volatile external choices were derived and the contract includes an explicit no-with-reason or fixture-style waiver."
  : "- Pending. Run current-source verification for every required external research topic before production scaffold."}

## Memory vs External Comparison

${gate.synthesisStatus === "not-applicable"
  ? "- Not applicable because no external research topics are required for this contract."
  : "- Pending until external evidence is collected and compared with the local memory findings above."}

## Scaffold Gate Decision

- Status: ${gate.researchGateStatus}
- Decision: ${gate.researchGateStatus === "complete" ? "scaffold may proceed if all other contract checks pass" : "do not scaffold without explicit experimental override"}
- Required next action: ${gate.researchGateStatus === "complete" ? "none for research gate" : "complete external research evidence and synthesis"}

## External verification checklist

${externalChecksFor(data).map((item) => `- [ ] ${item}`).join("\n")}

## Skill candidates

Policy: needs=\`${skillSelection.policy.skillNeeds}\`; sources=\`${skillSelection.policy.allowedSkillSources}\`; install=\`${skillSelection.policy.skillInstallMode}\`; mutation=\`${skillSelection.policy.skillMutationPolicy}\`.

| Skill | Source | Fit | Trust | Risk | Recommendation |
| --- | --- | ---: | --- | --- | --- |
${[
  ...skillSelection.installed,
  ...skillSelection.candidates,
  ...skillSelection.blocked,
].length === 0 ? "| none | n/a | 0 | n/a | n/a | none |" : [
  ...skillSelection.installed,
  ...skillSelection.candidates,
  ...skillSelection.blocked,
].map((row) => {
  const item = skillRowForManifest(row, row.recommendation === "blocked" ? "blocked" : "not-installed");
  return `| ${item.name} | ${item.source} | ${item.fit_score} | ${item.trust_level} | ${item.risk_level} | ${item.recommendation} |`;
}).join("\n")}

## Skill decisions required

${skillSelection.policy.skillInstallMode === "vendor"
  ? "- [ ] Review recommended local skills before scaffold vendors them."
  : "- [ ] Keep recommended skills candidate-only unless the contract selects `Skill install mode: vendor`."}
- [ ] Do not install external skills until explicit approval and audit workflow exists.
- [ ] Keep generated wiki pages as references only, never as direct skill provenance.

## Architecture recommendation

${recommendationFor(data).map((item) => `- ${item}`).join("\n")}

## Risks and open questions

- Contract validation issues: ${options.validationIssues?.length ? options.validationIssues.join("; ") : "none blocking from structural validator"}
- Source freshness is pending until external verification is completed.
- Scaffold should not start if runtime docs, Telegram behavior or dependency versions are uncertain.

## Next step

Run external verification for the checklist above, update this review or the contract, then proceed to scaffold planning.
`;
}

function researchContract(contractPath, options = {}) {
  ensureDirs();
  const data = contractData(contractPath);
  const validationIssues = validateContract(data.fullPath, { print: false });
  const researchContext = collectAgentMemoryResearch(data, options);
  const patternPack = writePatternPack(data, researchContext, options);
  const skillSelection = selectSkillsForContract(data);
  const knownDocs = readKnownDocs([
    "04_standards/agent-creation-harness.md",
    "04_standards/agent-environment-compatibility.md",
    "04_standards/agent-tool-integration-selection.md",
    "04_standards/memory-domains.md",
    "04_standards/pritha-self-model.md",
    "07_workflows/agents-mother.md",
    "07_workflows/agents-mother-roadmap.md",
  ]);
  const externalResearchTopics = deriveExternalResearchTopics(data, { patternPack });
  const outPath = uniquePath(path.join(RESEARCH_DIR, `${today()}-${slug(data.agentName)}-agent-research.md`));
  writeFileSync(outPath, researchMarkdown(data, researchContext.memoryResults, researchContext.domainResults, knownDocs, skillSelection, { validationIssues, externalResearchTopics, patternPack }));
  console.log(`Research report: ${path.relative(ROOT, outPath)}`);
  console.log(`Pattern pack: ${patternPack.relPath}`);
  console.log(`Semantic/embedding search: ${patternPack.semantic.status}${patternPack.semantic.failureLog ? ` (logged: ${patternPack.semantic.failureLog})` : ""}`);
  console.log(`Local memory matches: ${researchContext.memoryResults.length}`);
  console.log(`Domain matches: agent-building=${researchContext.domainResults.agentBuildingKnowledge.length}; pritha-self=${researchContext.domainResults.prithaSelf.length}; child-agents=${researchContext.domainResults.childAgents.length}`);
  console.log(`External research topics: ${externalResearchTopics.length}`);
  console.log(`Skill candidates: ${skillSelection.installed.length + skillSelection.candidates.length}; blocked: ${skillSelection.blocked.length}`);
  if (validationIssues.length > 0) {
    console.log("Contract still has validation issues:");
    for (const issue of validationIssues) console.log(`- ${issue}`);
  }
  console.log("Next: complete external verification checklist before scaffold.");
}

function patternResearchContract(contractPath, options = {}) {
  ensureDirs();
  const data = contractData(contractPath);
  const researchContext = collectAgentMemoryResearch(data, options);
  const patternPack = writePatternPack(data, researchContext, options);
  const externalResearchTopics = deriveExternalResearchTopics(data, { patternPack });
  console.log(`Pattern pack: ${patternPack.relPath}`);
  console.log(`Status: ${patternPack.status}`);
  console.log(`Selected patterns: ${patternPack.selectedPatterns.length}`);
  console.log(`Semantic/embedding search: ${patternPack.semantic.status}${patternPack.semantic.failureLog ? ` (logged: ${patternPack.semantic.failureLog})` : ""}`);
  console.log(`External research seeds: ${patternPack.externalResearchSeeds.length}`);
  console.log(`External research topics from contract+patterns: ${externalResearchTopics.length}`);
}

function findResearchReportFor(data) {
  const agentSlug = slug(data.agentName);
  if (!existsSync(RESEARCH_DIR)) return null;
  const files = readdirSync(RESEARCH_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(RESEARCH_DIR, entry))
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    if ((data.relPath && text.includes(data.relPath)) || path.basename(filePath).includes(agentSlug)) {
      return {
        fullPath: filePath,
        relPath: path.relative(ROOT, filePath),
        text,
      };
    }
  }
  return null;
}

function findPatternPackFor(data) {
  const agentSlug = slug(data.agentName);
  if (!existsSync(RESEARCH_DIR)) return null;
  const files = readdirSync(RESEARCH_DIR)
    .filter((entry) => entry.endsWith("-agent-pattern-pack.md") || entry.includes("pattern-pack"))
    .map((entry) => path.join(RESEARCH_DIR, entry))
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    if ((data.relPath && text.includes(data.relPath)) || path.basename(filePath).includes(agentSlug)) {
      return {
        fullPath: filePath,
        relPath: path.relative(ROOT, filePath),
        text,
      };
    }
  }
  return null;
}

function readEvidenceInput(inputPath) {
  const fullPath = path.resolve(ROOT, inputPath);
  if (!existsSync(fullPath)) throw new Error(`Evidence input not found: ${inputPath}`);
  const stat = statSync(fullPath);
  if (!stat.isFile()) throw new Error(`Evidence input is not a file: ${inputPath}`);
  if (stat.size > 1_000_000) throw new Error(`Evidence input is too large: ${inputPath}`);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function externalResearchContract(contractPath, options = {}) {
  ensureDirs();
  const data = contractData(contractPath);
  const patternPack = findPatternPackFor(data);
  const topics = deriveExternalResearchTopics(data, { patternPack: patternPack?.text });
  const report = findResearchReportFor(data);
  const backend = String(options.backend || (options.input ? "manual" : "status")).trim() || "status";
  const hasInput = Boolean(options.input);

  if (backend === "status" || (!hasInput && backend !== "last30days")) {
    console.log(`Contract: ${data.relPath}`);
    console.log(`Research report: ${report ? report.relPath : "missing"}`);
    console.log(`Pattern pack: ${patternPack ? patternPack.relPath : "missing"}`);
    console.log(`External research topics: ${topics.length}`);
    for (const topic of topics) {
      console.log(`- ${topic.id}: ${topic.topic}`);
    }
    if (report) {
      const gate = researchGateDecisionForReport(data, report.text);
      console.log(`Research gate: ${gate.status}${gate.ok ? "" : ` (${gate.reasons.join(", ") || "pending"})`}`);
    } else {
      console.log("Research gate: missing");
    }
    return;
  }

  if (!report) {
    throw new Error("No research report found for this contract. Run `node scripts/pritha.mjs research <contract>` first.");
  }

  if (backend === "last30days" && !hasInput) {
    if (topics.length === 0) {
      console.log(`Contract: ${data.relPath}`);
      console.log(`Research report: ${report.relPath}`);
      console.log("External research topics: 0");
      console.log("last30days: skipped because this contract has no required external research topics.");
      return;
    }
    const last30days = runLast30DaysBackend(data, topics, { root: ROOT });
    if (!last30days.ok) {
      const status = last30days.status || {};
      const issues = Array.isArray(status.issues) && status.issues.length ? status.issues.join("; ") : last30days.error;
      throw new Error([
        `last30days backend unavailable: ${status.status || last30days.error}.`,
        `Issues: ${issues}.`,
        "Install Python 3.12+ and then run `node scripts/external-research-tools.mjs install last30days --yes`,",
        "or provide curated evidence with `node scripts/pritha.mjs external-research <contract> --backend manual --input evidence.json`.",
      ].join(" "));
    }
    const result = applyExternalResearchEvidence(report.text, data, last30days.evidence, { backend: "last30days", topics });
    writeFileSync(report.fullPath, result.text);
    console.log(`External research report updated: ${report.relPath}`);
    console.log(`Backend: ${result.evidence.backend}`);
    console.log(`Research gate: ${result.status}`);
    console.log(`External evidence items: ${result.evidence.items.length}`);
    if (result.coverage.missingTopicIds.length) {
      console.log(`Missing required topics: ${result.coverage.missingTopicIds.join(", ")}`);
    }
    return;
  }

  const input = readEvidenceInput(options.input);
  const result = applyExternalResearchEvidence(report.text, data, input, { backend, topics });
  writeFileSync(report.fullPath, result.text);
  console.log(`External research report updated: ${report.relPath}`);
  console.log(`Backend: ${result.evidence.backend}`);
  console.log(`Research gate: ${result.status}`);
  console.log(`External evidence items: ${result.evidence.items.length}`);
  if (result.coverage.missingTopicIds.length) {
    console.log(`Missing required topics: ${result.coverage.missingTopicIds.join(", ")}`);
  }
}

function readProjectText(projectRoot, relPath, maxChars = 1400) {
  const fullPath = path.join(projectRoot, relPath);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return "";
  return readFileSync(fullPath, "utf8").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function projectAgentData(projectRoot, taskDescription) {
  const projectName = path.basename(projectRoot);
  const relPath = path.relative(ROOT, projectRoot);
  const readme = readProjectText(projectRoot, "README.md");
  const agents = readProjectText(projectRoot, "AGENTS.md");
  const packageJson = readJsonIfExists(path.join(projectRoot, "package.json")) || {};
  const interfaces = readJsonIfExists(path.join(projectRoot, "interfaces", "manifest.json")) || {};
  const memory = readJsonIfExists(path.join(projectRoot, "memory", "manifest.json")) || {};
  const tools = readJsonIfExists(path.join(projectRoot, "tools", "manifest.json")) || {};
  const operations = readJsonIfExists(path.join(projectRoot, "operations", "manifest.json")) || {};
  const adapters = Array.isArray(interfaces.adapters)
    ? interfaces.adapters.map((item) => item?.name || item?.id || item).filter(Boolean).join(", ")
    : "";
  return {
    agentName: projectName,
    relPath,
    projectPath: relPath,
    text: `${readme}\n${agents}\n${taskDescription}`,
    primaryMission: readme.match(/#\s+([^#]+)/)?.[1]?.trim() || taskDescription,
    targetUser: "existing agent operator",
    runtimeFamily: "codex-native",
    runtimePlacementProfile: "hybrid",
    primaryInterface: adapters || interfaces.primary || "Codex project",
    secondaryInterfaces: adapters,
    telegramMode: adapters.toLowerCase().includes("telegram") ? "operator-control" : "none",
    expectedHosting: operations.deployment_target || "existing local project",
    deploymentTarget: operations.deployment_target || "existing local project",
    deploymentProfile: operations.deployment_profile || "existing",
    serviceMode: operations.service_mode || "none",
    autostart: operations.autostart || "disabled",
    proactiveMode: operations.proactivity?.mode || operations.proactive_mode || "none",
    memoryModel: memory.profile || memory.description || "existing project memory",
    indexingSearchNeeds: memory.indexing || memory.search || "",
    toolSystem: tools.description || "existing project tools",
    inputDataTypes: "existing project inputs plus operator task",
    dependencies: packageJson.dependencies ? Object.keys(packageJson.dependencies).slice(0, 12).join(", ") : "none",
    coreFunctions: [taskDescription],
    criticalWorkflows: [taskDescription],
    taskDescription,
    developmentTaskType: "improve",
  };
}

function agentDevelopmentTaskMarkdown(projectRoot, data, detection, researchContext, patternPack, externalResearchTopics, options = {}) {
  const date = today();
  const agentSlug = slug(data.agentName);
  const reportSources = [
    data.relPath,
    patternPack.relPath,
    "07_workflows/agents-mother.md",
    "04_standards/agent-creation-harness.md",
    "04_standards/memory-domains.md",
  ].filter(Boolean);
  const externalStatus = externalResearchTopics.length ? "pending" : "not-applicable";
  return `---
id: ${date}-${agentSlug}-agent-development-task
type: review
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - agent-improvement
  - ${agentSlug}
tools:
  - Codex
  - AGENTS.md
sources:
${reportSources.map((source) => `  - ${yamlScalar(source)}`).join("\n")}
related:
  agent_contracts: []
  pattern_packs:
    - ${patternPack.relPath}
supersedes: []
superseded_by: []
development_task_type: improve
target_project: ${yamlScalar(data.relPath)}
pattern_pack: ${patternPack.relPath}
pattern_research_status: ${patternPack.status}
semantic_memory_status: ${patternPack.semantic.status}
semantic_failure_log: ${patternPack.semantic.failureLog || "none"}
memory_research_status: complete
external_research_status: ${externalStatus}
synthesis_status: ${externalStatus === "not-applicable" ? "not-applicable" : "pending"}
verified: pending
---

# Agent Development Task: ${data.agentName}

Date: ${date}
Status: draft

## Operator Task

${scalar(options.task || options.notes, "No task text provided.")}

## Current Project State

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Pattern pack: ${patternPack.relPath}
- Semantic/embedding search: ${patternPack.semantic.status}${patternPack.semantic.failureLog ? `; logged in ${patternPack.semantic.failureLog}` : ""}
- FTS memory matches: ${researchContext.memoryResults.length}
- Domain matches: agent-building=${researchContext.domainResults.agentBuildingKnowledge.length}; pritha-self=${researchContext.domainResults.prithaSelf.length}; child-agents=${researchContext.domainResults.childAgents.length}

## Relevant Memory Patterns

${patternPack.selectedPatterns.length ? patternPack.selectedPatterns.map((pattern) => `- ${pattern.id}: ${pattern.path} - ${pattern.applicability}`).join("\n") : "- No reusable local pattern found. Use external discovery before implementation."}

## External Research Topics

${formatExternalResearchTopics(externalResearchTopics)}

## Required Codex Pipeline

1. Inspect the target agent project, including \`AGENTS.md\`, \`README.md\`, manifests, scripts and current lifecycle reports.
2. Read the pattern pack before editing.
3. Run or collect current-source external research for the topics above when they are not marked not-applicable.
4. Compare memory patterns with external evidence and record confirmed, updated, contradicted or newly discovered patterns.
5. Implement the smallest change that satisfies the task.
6. Run the relevant smoke tests or healthchecks and report changed files.

## Next Step

Hand this development task to Codex App/CLI as an implementation task only after the operator confirms the brief is complete.
`;
}

function improveProjectTask(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }
  const taskText = String(options.task || options.notes || options._?.slice(1).join(" ") || "").trim();
  if (!taskText) {
    throw new Error("Missing improvement task. Use: node scripts/pritha.mjs improve <project-path> --task <text>");
  }
  const detection = detectProject(projectRoot);
  const data = projectAgentData(projectRoot, taskText);
  const researchContext = collectAgentMemoryResearch(data, options);
  const patternPack = writePatternPack(data, researchContext, options);
  const externalResearchTopics = deriveExternalResearchTopics(data, { patternPack });
  const reportPath = uniquePath(path.join(RESEARCH_DIR, `${today()}-${slug(data.agentName)}-agent-development-task.md`));
  writeFileSync(reportPath, agentDevelopmentTaskMarkdown(projectRoot, data, detection, researchContext, patternPack, externalResearchTopics, options));
  console.log(`Agent development task: ${path.relative(ROOT, reportPath)}`);
  console.log(`Pattern pack: ${patternPack.relPath}`);
  console.log(`Semantic/embedding search: ${patternPack.semantic.status}${patternPack.semantic.failureLog ? ` (logged: ${patternPack.semantic.failureLog})` : ""}`);
  console.log(`External research topics: ${externalResearchTopics.length}`);
  console.log("Next: hand this task to Codex for implementation after current-source enrichment when required.");
}

function questions() {
  console.log(`# Pritha interview outline

1. Purpose: agent name, mission, target user, success criteria, out of scope.
2. Scope: v1 core functions, deferred functions, critical workflows.
3. Runtime: codex-native, CLI, API, local model, hybrid or environment-specific.
4. Interface: Codex project, Telegram, CLI, web, API or mixed.
5. Telegram: none, primary-chat, intake-channel, notifications-only or operator-control.
6. Harness: tools, orchestration, memory/state, evals, recovery, human approvals.
7. Data/security: inputs, stored data, sensitive data, secrets, network/filesystem access.
8. Deployment: target environment, deployment profile, service mode and autostart policy.
9. Proactivity: manual, scheduled, heartbeat, event-driven, queue-watcher or hybrid; triggers and interruption policy.
10. Skills: needs, allowed sources, install mode and mutation policy.
11. Scaffold: target folder, generated files, dependencies, setup/run commands, tests and training guide.`);
}

async function main() {
  const command = process.argv[2] || "help";
  const options = parseArgs(process.argv.slice(3));

  if (command === "help") {
    usage();
    return;
  }
  if (command === "questions") {
    questions();
    return;
  }
  if (command === "voice-kit") {
    execFileSync("node", ["scripts/voice-control-kit.mjs", ...process.argv.slice(3)], {
      cwd: ROOT,
      stdio: "inherit",
    });
    return;
  }
  if (command === "skills") {
    const subcommand = options._[0] || "status";
    if (subcommand === "status") {
      printSkillsStatus({ json: Boolean(options.json) });
      return;
    }
    if (subcommand === "select") {
      const target = options._[1];
      if (!target) throw new Error("Missing contract path.");
      printSkillSelection(contractData(target), { json: Boolean(options.json) });
      return;
    }
    if (subcommand === "audit") {
      const target = options._[1];
      if (!target) throw new Error("Missing project path.");
      const result = auditProjectSkills(target, { json: Boolean(options.json) });
      if (!result.ok) process.exitCode = 1;
      return;
    }
    throw new Error(`Unknown skills command: ${subcommand}`);
  }
  if (command === "interview") {
    await interview(options);
    return;
  }
  if (command === "init") {
    await interview({ ...options, "no-input": true });
    return;
  }
  if (command === "create") {
    const target = options._[0];
    if (target && target.endsWith(".md")) {
      scaffoldContract(target, options);
    } else {
      await interview({ ...options, "no-input": true });
    }
    return;
  }
  if (command === "research") {
    const target = options._[0];
    if (!target) throw new Error("Missing contract path.");
    researchContract(target, options);
    return;
  }
  if (command === "pattern-research") {
    const target = options._[0];
    if (!target) throw new Error("Missing contract path.");
    patternResearchContract(target, options);
    return;
  }
  if (command === "external-research") {
    const target = options._[0];
    if (!target) throw new Error("Missing contract path.");
    externalResearchContract(target, options);
    return;
  }
  if (command === "scaffold") {
    const target = options._[0];
    if (!target) throw new Error("Missing contract path.");
    scaffoldContract(target, options);
    return;
  }
  if (command === "test") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    testProject(target, options);
    return;
  }
  if (command === "handoff") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    handoffProject(target, options);
    return;
  }
  if (command === "operations") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    operationsProject(target, options);
    return;
  }
  if (command === "deploy") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    deployProject(target, options);
    return;
  }
  if (command === "card-readiness") {
    const target = options._[0];
    if (!target) throw new Error("Missing agent slug or name.");
    const result = await checkCardReadiness(target, {
      baseUrl: options["no-control-center"] ? false : options["base-url"],
    });
    printCardReadiness(result);
    if (result.status === "missing") process.exitCode = 1;
    return;
  }
  if (command === "publish") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    testProject(target, { ...options, "no-report": true });
    return;
  }
  if (command === "improve") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    improveProjectTask(target, options);
    return;
  }
  if (command === "evolve") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    evolveProject(target, options);
    return;
  }
  if (command === "registry" || command === "lineage") {
    rebuildRegistry();
    return;
  }
  if (command === "validate") {
    const target = options._[0];
    if (!target) throw new Error("Missing contract path.");
    const issues = validateContract(target);
    if (issues.length > 0) process.exit(1);
    return;
  }
  if (command === "list") {
    listContracts();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
});
