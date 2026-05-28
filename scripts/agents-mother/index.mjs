#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData, yamlList } from "../lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "../lib/paths.mjs";
import { slug as makeSlug } from "../lib/slug.mjs";
import { today } from "../lib/date.mjs";
import {
  checkResult,
  detectProject,
  fileExists,
  readJsonIfExists,
  recommendationForProject,
  runProjectCommand,
  testProject,
} from "./test.mjs";

const ROOT = resolveTechscopeRoot();
const CONTRACT_DIR = path.join(ROOT, "11_agents", "contracts");
const REPORT_DIR = path.join(ROOT, "11_agents", "reports");
const RESEARCH_DIR = path.join(ROOT, "11_agents", "research");
const REGISTRY_PATH = path.join(ROOT, "11_agents", "registry.md");
const DB_PATH = path.join(ROOT, ".memory", "techscope.sqlite");

const RUNTIME_FAMILIES = new Set(["codex-native", "cli", "api", "local-model", "hybrid", "environment-specific"]);
const TELEGRAM_MODES = new Set(["none", "primary-chat", "intake-channel", "notifications-only", "operator-control"]);
const SERVICE_MODES = new Set(["none", "manual", "launchd", "external"]);
const AUTOSTART_MODES = new Set(["disabled", "optional", "launchd-on-approval", "external"]);
const PROACTIVE_MODES = new Set(["none", "manual", "scheduled", "heartbeat", "event-driven", "queue-watcher", "hybrid"]);
const RUNTIME_PLACEMENT_PROFILES = new Set(["deterministic-first", "frontier-first", "local-first", "hybrid", "unknown"]);
const STATUS_VALUES = new Set(["draft", "accepted", "superseded"]);

function usage() {
  console.log(`Usage:
  node scripts/agents-mother.mjs help
  node scripts/agents-mother.mjs questions
  node scripts/agents-mother.mjs interview [--name <name>] [--mission <text>] [--runtime codex-native] [--runtime-placement frontier-first] [--interface "Codex project"] [--telegram none] [--service none] [--autostart disabled]
  node scripts/agents-mother.mjs init --name <name> --mission <text> [--runtime codex-native] [--runtime-placement frontier-first] [--interface "Codex project"] [--telegram none] [--service none] [--autostart disabled]
  node scripts/agents-mother.mjs research <contract-path> [--limit 12]
  node scripts/agents-mother.mjs scaffold <contract-path> [--output <folder>]
  node scripts/agents-mother.mjs test <project-path>
  node scripts/agents-mother.mjs handoff <project-path>
  node scripts/agents-mother.mjs operations <project-path>
  node scripts/agents-mother.mjs deploy <project-path> [plan|status|install|uninstall] [--yes]
  node scripts/agents-mother.mjs evolve <project-path> [--notes <text>]
  node scripts/agents-mother.mjs registry
  node scripts/agents-mother.mjs validate <contract-path>
  node scripts/agents-mother.mjs list

Layer 2 status:
  interview asks questions; init creates a non-interactive draft agent-contract in 11_agents/contracts/
  validate checks whether the contract is ready for research/scaffold planning

Layer 3 status:
  research creates a local memory research report in 11_agents/research/

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
  evolve captures lessons learned; registry rebuilds the Agents Mother lifecycle index`);
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
  if (/(embedding|semantic|семантичес|vector)/.test(text)) return "markdown-embeddings";
  if (/(sqlite|index|fts|search|поиск)/.test(text)) return "markdown-sqlite";
  if (/(none|minimal|нет|без памяти)/.test(memoryText)) return "minimal-markdown";
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
  if (text.includes("heart") || text.includes("pulse") || text.includes("пульс")) return "heartbeat";
  if (text.includes("cron") || text.includes("chrono") || text.includes("хронос") || text.includes("schedule")) return "scheduled";
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
    .replace(/[^a-z0-9а-яё\s-]+/giu, " ")
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
- External verification needs: ${scalar(data.externalVerificationNeeds, "TechScope memory plus current official docs before scaffold")}
- Source freshness requirements: ${scalar(data.sourceFreshnessRequirements, "verify volatile platform/API choices before scaffold")}

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Project files and local checks | CLI/script | Default for Codex-native scaffold |
| Agent operating procedure | skill/workflow | Encode repeatable TechScope rules |
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

- Related TechScope artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-runtime-placement.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md
- Current primary sources checked: pending
- Trusted secondary sources checked: pending
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
  notes.push("Scaffold should remain minimal, testable and free of copied TechScope secrets.");
  return notes;
}

function researchMarkdown(data, memoryResults, knownDocs, options = {}) {
  const date = today();
  const agentSlug = slug(data.agentName);
  const title = `${data.agentName || agentSlug} agent architecture research`;
  const resultSources = [
    data.relPath,
    "07_workflows/agents-mother.md",
    "07_workflows/agents-mother-roadmap.md",
    "04_standards/agent-creation-harness.md",
    "04_standards/agent-environment-compatibility.md",
    "04_standards/agent-tool-integration-selection.md",
  ];
  const allSources = [...new Set([...resultSources, ...memoryResults.map((row) => row.path)])].slice(0, 40);
  const sourceYaml = allSources.map((source) => `  - ${source}`).join("\n");
  const relatedStandards = [
    "04_standards/agent-creation-harness.md",
    "04_standards/agent-environment-compatibility.md",
    "04_standards/agent-tool-integration-selection.md",
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

## Standards and workflow basis

${knownDocs.map((doc) => `### ${doc.title}

- Path: ${doc.path}
- Basis: ${doc.summary.replace(/\s+/g, " ").slice(0, 500) || "See document for details."}
`).join("\n")}

## External verification checklist

${externalChecksFor(data).map((item) => `- [ ] ${item}`).join("\n")}

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
  const limit = Number(options.limit || 12);
  const query = [
    data.agentName,
    data.primaryMission,
    data.runtimeFamily,
    data.primaryInterface,
    data.telegramMode,
    data.memoryModel,
    data.inputDataTypes,
    data.coreFunctions.join(" "),
    data.criticalWorkflows.join(" "),
    "agent harness scaffold tool memory security evaluation",
  ].filter(Boolean).join(" ");
  const memoryResults = searchMemory(query, limit);
  const knownDocs = readKnownDocs([
    "04_standards/agent-creation-harness.md",
    "04_standards/agent-environment-compatibility.md",
    "04_standards/agent-tool-integration-selection.md",
    "07_workflows/agents-mother.md",
    "07_workflows/agents-mother-roadmap.md",
  ]);
  const outPath = uniquePath(path.join(RESEARCH_DIR, `${today()}-${slug(data.agentName)}-agent-research.md`));
  writeFileSync(outPath, researchMarkdown(data, memoryResults, knownDocs, { validationIssues }));
  console.log(`Research report: ${path.relative(ROOT, outPath)}`);
  console.log(`Local memory matches: ${memoryResults.length}`);
  if (validationIssues.length > 0) {
    console.log("Contract still has validation issues:");
    for (const issue of validationIssues) console.log(`- ${issue}`);
  }
  console.log("Next: complete external verification checklist before scaffold.");
}

function resolveTargetPath(data, options = {}) {
  const requested = scalar(options.output || data.targetFolder || `../${slug(data.agentName)}`);
  return path.resolve(ROOT, requested);
}

function ensureWritableTarget(targetPath) {
  if (existsSync(targetPath)) {
    const entries = readdirSync(targetPath).filter((entry) => entry !== ".DS_Store");
    if (entries.length > 0) {
      throw new Error(`Target folder is not empty: ${targetPath}`);
    }
  }
  mkdirSync(targetPath, { recursive: true });
}

function writeProjectFile(projectRoot, relPath, content) {
  const fullPath = path.join(projectRoot, relPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  if (existsSync(fullPath)) throw new Error(`Refusing to overwrite existing file: ${fullPath}`);
  writeFileSync(fullPath, content);
  return relPath;
}

function generatedAgentFiles(data) {
  const agentName = scalar(data.agentName, "New Agent");
  const agentSlug = slug(agentName);
  const telegramEnabled = data.telegramMode && data.telegramMode !== "none";
  const interfaces = selectedInterfaces(data);
  const memoryProfile = memoryProfileFor(data);
  const memoryDetails = memoryProfileDetails(memoryProfile);
  const toolProfiles = toolProfilesFor(data);
  const operationProfile = operationProfileFor(data);
  const interfaceManifest = {
    version: 1,
    generated_by: "TechScope Agents Mother",
    agent: agentName,
    primary_interface: scalar(data.primaryInterface, "Codex project"),
    telegram_mode: scalar(data.telegramMode, "none"),
    adapters: interfaces.map((name) => ({
      name,
      enabled: true,
      required_secrets: name === "telegram" ? ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USER_IDS"] : [],
      status_command: name === "telegram" ? "node scripts/telegram-bot.mjs queue-status" : "node scripts/interface-status.mjs",
    })),
  };
  const memoryManifest = {
    version: 1,
    generated_by: "TechScope Agents Mother",
    agent: agentName,
    profile: memoryProfile,
    description: memoryDetails.description,
    source_of_truth: "Markdown",
    directories: memoryDetails.directories,
    indexing_search_needs: scalar(data.indexingSearchNeeds, "none for v1 unless contract is updated"),
    rules: [
      "Do not store secrets in memory files.",
      "Keep raw source material separate from curated notes.",
      "Add database, embeddings or graph storage only after the contract requires it.",
    ],
  };
  const toolsManifest = {
    version: 1,
    generated_by: "TechScope Agents Mother",
    agent: agentName,
    profiles: toolProfiles.map((name) => ({ name, ...toolProfileDetails(name) })),
    default_rule: "Choose the narrowest reliable tool boundary before adding capabilities.",
  };
  const operationsManifest = {
    version: 1,
    generated_by: "TechScope Agents Mother",
    agent: agentName,
    deployment_target: operationProfile.deploymentTarget,
    deployment_profile: operationProfile.deploymentProfile,
    service_mode: operationProfile.serviceMode,
    autostart: operationProfile.autostart,
    autostart_policy: "configurable; never install or enable autostart from scaffold without explicit user approval",
    start_command: operationProfile.startCommand,
    stop_command: operationProfile.stopCommand,
    healthcheck_command: operationProfile.healthcheckCommand,
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
      user_interruption_policy: scalar(data.userInterruptionPolicy, "do not interrupt unless configured by user"),
    },
  };
  const files = [];

  files.push({
    path: "AGENTS.md",
    content: `# ${agentName}: Codex Agent Instructions

## Mission

${scalar(data.primaryMission)}

## Operating Rules

- Work from the local project files first.
- Keep changes scoped to the current agent project.
- Do not copy secrets from TechScope or any other project.
- Use \`.env\` for local secrets and keep \`.env.example\` as the documented contract.
- Prefer small, verifiable steps and run the smoke test before handoff.
- If an external source, API, runtime or dependency may have changed, verify current documentation before relying on it.

## User and Scope

- Target user: ${scalar(data.targetUser)}
- Success criteria: ${scalar(data.successCriteria)}
- Out of scope: ${scalar(bodyValue(data.text, "Out of scope"))}

## Runtime and Interface

- Runtime family: ${scalar(data.runtimeFamily, "codex-native")}
- Primary interface: ${scalar(data.primaryInterface, "Codex project")}
- Interface adapters: ${interfaces.join(", ")}
- Telegram mode: ${scalar(data.telegramMode, "none")}
- Expected hosting: ${scalar(data.expectedHosting, "local Mac")}
- Deployment target: ${operationProfile.deploymentTarget}
- Deployment profile: ${operationProfile.deploymentProfile}
- Service mode: ${operationProfile.serviceMode}
- Autostart: ${operationProfile.autostart}
- Proactive mode: ${operationProfile.proactiveMode}

## Harness Inventory

- Information boundaries: keep project instructions concise; put detailed procedures in \`07_workflows/\`.
- Tool system: use local scripts first; add external APIs only when documented in the contract.
- Execution orchestration: follow \`07_workflows/agent-operating-workflow.md\`.
- Memory and state: ${scalar(data.memoryModel, "Markdown-first")} (\`${memoryProfile}\`)
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
`,
  });

  files.push({
    path: "README.md",
    content: `# ${agentName}

Generated by TechScope Agents Mother.

## Mission

${scalar(data.primaryMission)}

## Quick Start

\`\`\`sh
cp .env.example .env
node scripts/smoke-test.mjs
node scripts/agent-cli.mjs help
node scripts/interface-status.mjs
node scripts/memory-status.mjs
node scripts/tools-status.mjs
node scripts/operations-status.mjs
\`\`\`

${telegramEnabled ? `## Telegram

Fill \`TELEGRAM_BOT_TOKEN\` and \`TELEGRAM_ALLOWED_USER_IDS\` in \`.env\`, then run:

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
- \`operations/manifest.json\`: deployment target, service profile, proactivity, autostart policy, healthcheck and log path.
- \`docs/user-training-guide.md\`: first user exercise and handoff notes.
- \`scripts/smoke-test.mjs\`: structure and configuration smoke test.
- \`scripts/agent-cli.mjs\`: minimal local command interface.
- \`scripts/interface-status.mjs\`: adapter status overview.
- \`scripts/operations-status.mjs\`: service readiness and autostart policy overview.
- \`scripts/deploy-service.mjs\`: launchd deployment automation with explicit approval gates.

## Contract Summary

- Runtime family: ${scalar(data.runtimeFamily, "codex-native")}
- Primary interface: ${scalar(data.primaryInterface, "Codex project")}
- Interface adapters: ${interfaces.join(", ")}
- Telegram mode: ${scalar(data.telegramMode, "none")}
- Memory model: ${scalar(data.memoryModel, "Markdown-first")}
- Memory profile: ${memoryProfile}
- Tool profiles: ${toolProfiles.join(", ")}
- Deployment target: ${operationProfile.deploymentTarget}
- Deployment profile: ${operationProfile.deploymentProfile}
- Service mode: ${operationProfile.serviceMode}
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
    "help": "node scripts/agent-cli.mjs help",
    "status": "node scripts/agent-cli.mjs status",
    "interfaces": "node scripts/interface-status.mjs",
    "memory": "node scripts/memory-status.mjs",
    "tools": "node scripts/tools-status.mjs",
    "operations": "node scripts/operations-status.mjs",
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
    ? `Telegram adapter selected by contract as ${data.telegramMode}.`
    : "Adapter placeholder selected by contract. Implement runtime behavior only after a dedicated design step."}

## Notes

- Contract primary interface: ${scalar(data.primaryInterface, "Codex project")}
- Telegram mode: ${scalar(data.telegramMode, "none")}
- Runtime family: ${scalar(data.runtimeFamily, "codex-native")}
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
    path: "operations/manifest.json",
    content: `${JSON.stringify(operationsManifest, null, 2)}
`,
  });

  files.push({
    path: "operations/README.md",
    content: `# Operations Profile

Deployment target: \`${operationProfile.deploymentTarget}\`
Deployment profile: \`${operationProfile.deploymentProfile}\`
Service mode: \`${operationProfile.serviceMode}\`
Autostart: \`${operationProfile.autostart}\`
Proactive mode: \`${operationProfile.proactiveMode}\`

## Commands

\`\`\`sh
node scripts/operations-status.mjs
${operationProfile.healthcheckCommand}
\`\`\`

## Policy

- Scaffold never starts long-running processes.
- Scaffold never installs autostart.
- Autostart is configurable through the contract, but enabling it requires an explicit user-approved deployment step.
- Keep healthcheck, start, stop and log paths documented before treating this as a service.
- Deployment automation is available through \`node scripts/deploy-service.mjs plan|status|install|uninstall\`.
- \`install\` and \`uninstall\` require \`--yes\` and refuse incompatible service/autostart modes.

## Current Profile

- Start command: \`${operationProfile.startCommand}\`
- Stop command: \`${operationProfile.stopCommand}\`
- Healthcheck command: \`${operationProfile.healthcheckCommand}\`
- Log path: \`${operationProfile.logPath}\`
- Restart policy: ${operationProfile.restartPolicy}
- Service label: \`${operationProfile.serviceLabel}\`

## Proactivity

- Mode: \`${operationProfile.proactiveMode}\`
- Trigger sources: ${operationProfile.triggerSources}
- Schedule: ${operationProfile.schedule}
- Heartbeat interval: ${operationProfile.heartbeatInterval}
- Idle behavior: ${operationProfile.idleBehavior}
- User interruption policy: ${scalar(data.userInterruptionPolicy, "do not interrupt unless configured by user")}

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
  <string>com.local.${agentSlug}</string>
  <key>WorkingDirectory</key>
  <string>__PROJECT_ROOT__</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>sh</string>
    <string>-lc</string>
    <string>${operationProfile.startCommand.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</string>
  </array>
  <key>RunAtLoad</key>
  <${operationProfile.autostart === "launchd-on-approval" ? "true" : "false"}/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>__PROJECT_ROOT__/${operationProfile.logPath.replace(/\/$/, "")}/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>__PROJECT_ROOT__/${operationProfile.logPath.replace(/\/$/, "")}/launchd.err.log</string>
</dict>
</plist>
`,
    });
  }

  files.push({
    path: "07_workflows/agent-operating-workflow.md",
    content: `# Workflow: agent operating workflow

## Goal

Run ${agentName} in small, verifiable steps.

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
  const title = readme.match(/^#\\\\s+(.+)$/m)?.[1] || "${agentName}";
  console.log(\`Agent: \${title}\`);
  console.log("Runtime: ${scalar(data.runtimeFamily, "codex-native")}");
  console.log("Interface: ${scalar(data.primaryInterface, "Codex project")}");
  console.log("Telegram: ${scalar(data.telegramMode, "none")}");
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
console.log(\`Agent: \${manifest.agent}\`);
console.log(\`Deployment target: \${manifest.deployment_target || "unknown"}\`);
console.log(\`Deployment profile: \${manifest.deployment_profile || "unknown"}\`);
console.log(\`Service mode: \${manifest.service_mode}\`);
console.log(\`Autostart: \${manifest.autostart}\`);
console.log(\`Autostart policy: \${manifest.autostart_policy}\`);
console.log(\`Start: \${manifest.start_command}\`);
console.log(\`Stop: \${manifest.stop_command}\`);
console.log(\`Healthcheck: \${manifest.healthcheck_command}\`);
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
const serviceLabel = manifest.service_label || "${operationProfile.serviceLabel}";
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

function renderTemplate() {
  if (!manifest.launchd_template) {
    console.error("No launchd template selected in operations/manifest.json");
    process.exit(1);
  }
  const templatePath = path.join(ROOT, manifest.launchd_template);
  if (!existsSync(templatePath)) {
    console.error(\`Missing launchd template: \${manifest.launchd_template}\`);
    process.exit(1);
  }
  return readFileSync(templatePath, "utf8").replaceAll("__PROJECT_ROOT__", ROOT);
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
  console.log(\`Healthcheck: \${manifest.healthcheck_command}\`);
  console.log(\`Start: \${manifest.start_command}\`);
  console.log(\`Stop: \${manifest.stop_command}\`);
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
  if (!manifest.healthcheck_command) {
    console.error("No healthcheck_command in operations/manifest.json");
    process.exit(1);
  }
  console.log(\`Running healthcheck: \${manifest.healthcheck_command}\`);
  const result = run("/bin/sh", ["-lc", manifest.healthcheck_command], { timeout: 60000 });
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
    path: "scripts/smoke-test.mjs",
    content: `#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const required = [
  "AGENTS.md",
  "README.md",
  ".env.example",
  "package.json",
  "interfaces/manifest.json",
  "interfaces/README.md",
  "memory/manifest.json",
  "memory/README.md",
  "tools/manifest.json",
  "tools/README.md",
  "operations/manifest.json",
  "operations/README.md",
  "07_workflows/agent-operating-workflow.md",
  "docs/user-training-guide.md",
  "scripts/agent-cli.mjs",
  "scripts/interface-status.mjs",
  "scripts/memory-status.mjs",
  "scripts/tools-status.mjs",
  "scripts/operations-status.mjs",
  "scripts/deploy-service.mjs"
];

${telegramEnabled ? 'required.push("scripts/telegram-bot.mjs");' : ""}
${telegramEnabled ? 'required.push("data/telegram-queue/inbox/.gitkeep"); required.push("data/telegram-queue/processed/.gitkeep"); required.push("data/telegram-state.json"); required.push("scripts/process-telegram-queue.mjs");' : ""}

const issues = [];
for (const relPath of required) {
  if (!existsSync(path.join(ROOT, relPath))) issues.push(\`missing \${relPath}\`);
}

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

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const QUEUE_INBOX = path.join(ROOT, "data", "telegram-queue", "inbox");
const QUEUE_PROCESSED = path.join(ROOT, "data", "telegram-queue", "processed");
const STATE_PATH = path.join(ROOT, "data", "telegram-state.json");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
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
  mkdirSync(QUEUE_INBOX, { recursive: true });
  mkdirSync(QUEUE_PROCESSED, { recursive: true });
  if (!existsSync(STATE_PATH)) writeFileSync(STATE_PATH, JSON.stringify({ last_update_id: 0 }, null, 2));
}

function readState() {
  ensureQueue();
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function writeState(state) {
  ensureQueue();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function queueUpdate(update) {
  ensureQueue();
  const id = update.update_id || Date.now();
  const filePath = path.join(QUEUE_INBOX, \`\${id}.json\`);
  writeFileSync(filePath, JSON.stringify(update, null, 2));
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
  const processed = readdirSync(QUEUE_PROCESSED).filter((entry) => entry.endsWith(".json")).length;
  const state = readState();
  console.log(\`Telegram queue: inbox=\${inbox}; processed=\${processed}; last_update_id=\${state.last_update_id || 0}\`);
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
  console.log(\`Telegram bot ok: @\${data.result.username || data.result.id}\`);
  console.log(\`Allowed users: \${allowedUsers.join(", ")}\`);
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
  console.log(\`Telegram poll complete: queued=\${queued}; last_update_id=\${state.last_update_id || 0}\`);
  process.exit(0);
}

console.error(\`Unknown command: \${command}\`);
process.exit(1);
`,
    });

    files.push({
      path: "scripts/process-telegram-queue.mjs",
      content: `#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "data", "telegram-queue", "inbox");
const PROCESSED = path.join(ROOT, "data", "telegram-queue", "processed");
const LOG_PATH = path.join(ROOT, "logs", "telegram-queue.log");

mkdirSync(INBOX, { recursive: true });
mkdirSync(PROCESSED, { recursive: true });
mkdirSync(path.dirname(LOG_PATH), { recursive: true });

const files = readdirSync(INBOX).filter((entry) => entry.endsWith(".json")).sort();
if (files.length === 0) {
  console.log("Telegram queue is empty.");
  process.exit(0);
}

for (const file of files) {
  const inputPath = path.join(INBOX, file);
  const update = JSON.parse(readFileSync(inputPath, "utf8"));
  const text = update.message?.text || update.message?.caption || "";
  const summary = text ? text.slice(0, 180) : "non-text Telegram update";
  const event = {
    processed_at: new Date().toISOString(),
    update_id: update.update_id,
    message_id: update.message?.message_id,
    chat_id: update.message?.chat?.id,
    summary,
    recommended_reply: "Received. I queued this item for agent processing."
  };
  writeFileSync(LOG_PATH, JSON.stringify(event) + "\\n", { flag: "a" });
  renameSync(inputPath, path.join(PROCESSED, file));
  console.log(\`Processed Telegram update \${update.update_id}: \${summary}\`);
}
`,
    });

    files.push({ path: "data/telegram-queue/inbox/.gitkeep", content: "" });
    files.push({ path: "data/telegram-queue/processed/.gitkeep", content: "" });
    files.push({ path: "data/telegram-state.json", content: "{\n  \"last_update_id\": 0\n}\n" });
  }

  files.push({ path: "logs/.gitkeep", content: "" });
  return files;
}

function runSmoke(projectRoot) {
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

function scaffoldReportMarkdown(data, projectRoot, createdFiles, smokeResult) {
  const date = today();
  const agentSlug = slug(data.agentName);
  const telegramApplicable = data.telegramMode && data.telegramMode !== "none";
  const operationProfile = operationProfileFor(data);
  return `---
id: ${date}-${agentSlug}-scaffold-report
type: scaffold-report
status: ${smokeResult.ok ? "complete" : "failed"}
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
  - ${operationProfile.serviceMode === "launchd" ? "launchd" : "operations"}
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
  - ${data.relPath}
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts:
    - ${data.relPath}
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
verified: ${date}
valid_for: initial scaffold
temporal_status: current
---

# Agent Scaffold Report: ${data.agentName || agentSlug}

Date: ${date}
Status: ${smokeResult.ok ? "complete" : "failed"}

## Summary

- Agent name: ${data.agentName || "unknown"}
- Target folder: ${projectRoot}
- Contract: ${data.relPath}
- Runtime family: ${data.runtimeFamily || "unknown"}
- Interfaces: ${data.primaryInterface || "unknown"}
- Telegram mode: ${data.telegramMode || "none"}
- Deployment target: ${operationProfile.deploymentTarget}
- Deployment profile: ${operationProfile.deploymentProfile}
- Memory profile: ${memoryProfileFor(data)}
- Tool profiles: ${toolProfilesFor(data).join(", ")}
- Service mode: ${operationProfile.serviceMode}
- Autostart: ${operationProfile.autostart}
- Proactive mode: ${operationProfile.proactiveMode}
- Result: ${smokeResult.ok ? "scaffold created and smoke test passed" : "scaffold created but smoke test failed"}

## Generated structure

${createdFiles.map((file) => `- ${file}`).join("\n")}

## Environment setup

- Required secrets: ${data.secretsRequired || (telegramApplicable ? "Telegram bot token and allowed user ids" : "none known yet")}
- \`.env.example\` created: yes
- Dependencies installed: no external dependencies installed
- Services configured: ${operationProfile.serviceMode}; no service was started or installed
- Autostart configured: ${operationProfile.autostart}; installation requires explicit approval

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Structure validation | ${smokeResult.ok ? "pass" : "fail"} | \`node scripts/smoke-test.mjs\` |
| Smoke test | ${smokeResult.ok ? "pass" : "fail"} | ${smokeResult.output.replaceAll("\n", " ")} |
| Healthcheck | pending | Run command from README after configuration |
| Telegram adapter test | ${telegramApplicable ? "pending" : "not-applicable"} | ${telegramApplicable ? "Fill .env and run npm run telegram:healthcheck" : "Telegram not selected"} |
| Operations status | pending | \`node scripts/operations-status.mjs\` |
| Documentation review | pass | README and training guide generated |

## Handoff

- How to run: \`node scripts/agent-cli.mjs status\`
- How to test: \`node scripts/smoke-test.mjs\`
- How to inspect operations: \`node scripts/operations-status.mjs\`
- How to stop: no long-running process is started by scaffold
- How to inspect logs: see \`logs/\`
- First user exercise: follow \`docs/user-training-guide.md\`

## Open issues

- Complete external verification checklist before adding dependencies or deployment.
- Review generated instructions before using this agent for production work.

## Next steps

- Open the target folder in Codex.
- Run the smoke test.
- If Telegram is selected, configure \`.env\` and run Telegram healthcheck.
`;
}

function scaffoldContract(contractPath, options = {}) {
  ensureDirs();
  const data = contractData(contractPath);
  const issues = validateContract(data.fullPath, { print: false });
  if (issues.length > 0) {
    throw new Error(`Contract is not ready for scaffold:\n- ${issues.join("\n- ")}`);
  }
  if (data.runtimeFamily !== "codex-native") {
    throw new Error(`Layer 4 scaffold currently supports codex-native only, got: ${data.runtimeFamily}`);
  }

  const targetPath = resolveTargetPath(data, options);
  ensureWritableTarget(targetPath);

  const createdFiles = [];
  for (const file of generatedAgentFiles(data)) {
    createdFiles.push(writeProjectFile(targetPath, file.path, file.content));
  }

  const smokeResult = runSmoke(targetPath);
  const reportPath = uniquePath(path.join(REPORT_DIR, `${today()}-${slug(data.agentName)}-scaffold-report.md`));
  writeFileSync(reportPath, scaffoldReportMarkdown(data, targetPath, createdFiles, smokeResult));

  console.log(`Scaffold: ${targetPath}`);
  console.log(`Created files: ${createdFiles.length}`);
  console.log(`Smoke test: ${smokeResult.ok ? "pass" : "fail"}`);
  console.log(`Scaffold report: ${path.relative(ROOT, reportPath)}`);
  if (!smokeResult.ok) {
    console.log(smokeResult.output);
    process.exitCode = 1;
  }
}

function handoffProject(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }

  const detection = detectProject(projectRoot);
  const checks = [];
  const scripts = detection.scripts;

  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) {
    checks.push(checkResult("Smoke test", "available", "node scripts/smoke-test.mjs"));
  } else if (scripts.smoke) {
    checks.push(checkResult("Smoke test", "available", "npm run smoke"));
  } else {
    checks.push(checkResult("Smoke test", "missing", "No smoke test command detected."));
  }

  if (fileExists(projectRoot, "scripts/interface-status.mjs")) {
    checks.push(checkResult("Interface status", "available", "node scripts/interface-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/memory-status.mjs")) {
    checks.push(checkResult("Memory status", "available", "node scripts/memory-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/tools-status.mjs")) {
    checks.push(checkResult("Tools status", "available", "node scripts/tools-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/operations-status.mjs")) {
    checks.push(checkResult("Operations status", "available", "node scripts/operations-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) {
    checks.push(checkResult("Deployment plan", "available", "node scripts/deploy-service.mjs plan"));
  }
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) {
    checks.push(checkResult("Telegram queue", "available", "node scripts/telegram-bot.mjs queue-status"));
  }

  const projectName = path.basename(projectRoot);
  const status = detection.classification === "project-without-agent-harness" ? "partial" : "complete";
  const reportPath = uniquePath(path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-handoff-report.md`));
  writeFileSync(reportPath, agentHandoffReportMarkdown(projectRoot, projectName, detection, checks, status));

  console.log(`Project: ${projectRoot}`);
  console.log(`Classification: ${detection.classification}`);
  console.log(`Handoff: ${status}`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
}

function commandListForHandoff(projectRoot, detection) {
  const commands = [];
  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) commands.push("node scripts/smoke-test.mjs");
  if (fileExists(projectRoot, "scripts/agent-cli.mjs")) commands.push("node scripts/agent-cli.mjs status");
  if (fileExists(projectRoot, "scripts/interface-status.mjs")) commands.push("node scripts/interface-status.mjs");
  if (fileExists(projectRoot, "scripts/memory-status.mjs")) commands.push("node scripts/memory-status.mjs");
  if (fileExists(projectRoot, "scripts/tools-status.mjs")) commands.push("node scripts/tools-status.mjs");
  if (fileExists(projectRoot, "scripts/operations-status.mjs")) commands.push("node scripts/operations-status.mjs");
  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) commands.push("node scripts/deploy-service.mjs plan");
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) {
    commands.push("node scripts/telegram-bot.mjs queue-status");
    commands.push("node scripts/telegram-bot.mjs poll-once --dry-run");
  }
  if (commands.length === 0 && fileExists(projectRoot, "package.json")) commands.push("npm test");
  return commands;
}

function envNeedsForHandoff(projectRoot) {
  const needs = [];
  if (fileExists(projectRoot, ".env.example")) {
    const text = readFileSync(path.join(projectRoot, ".env.example"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (match) needs.push(match[1]);
    }
  }
  return [...new Set(needs)];
}

function firstExerciseForHandoff(projectRoot, detection) {
  if (fileExists(projectRoot, "docs/user-training-guide.md")) {
    return [
      "Open docs/user-training-guide.md.",
      "Run the Quick Start commands below.",
      "Ask the agent to explain its mission and v1 scope.",
      "Confirm the response against README.md and AGENTS.md.",
    ];
  }
  if (detection.classification === "project-without-agent-harness") {
    return [
      "Discuss what kind of agent should be added to this project.",
      "Create an agent-contract before modifying the project.",
      "Run agents-mother test again after adding a harness.",
    ];
  }
  return [
    "Read the project's agent instruction file.",
    "Run the available smoke/status command.",
    "Ask what the agent can safely do today and what is out of scope.",
  ];
}

function agentHandoffReportMarkdown(projectRoot, projectName, detection, checks, status) {
  const date = today();
  const commands = commandListForHandoff(projectRoot, detection);
  const envNeeds = envNeedsForHandoff(projectRoot);
  const exercise = firstExerciseForHandoff(projectRoot, detection);
  const tools = ["Codex", "AGENTS.md"];
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) tools.push("Telegram");
  if (fileExists(projectRoot, "operations/manifest.json")) tools.push("operations");
  return `---
id: ${date}-${slug(projectName)}-agent-handoff-report
type: agent-handoff-report
status: ${status}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - handoff
  - user-training
  - ${slug(projectName)}
tools:${yamlList(tools)}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - README.md
  - .env.example
  - scripts
  - operations/manifest.json
portability: codex-native
sources:
  - ${projectRoot}
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: handoff ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Handoff Report: ${projectName}

Date: ${date}
Status: ${status}

## Quick Start

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Open the folder in Codex.
- Run:

\`\`\`sh
${commands.length > 0 ? commands.join("\n") : "# No local run command detected yet."}
\`\`\`

## What Is Ready

${checks.length > 0 ? checks.map((item) => `- ${item.name}: ${item.result} (${item.notes})`).join("\n") : "- No ready commands detected yet."}

## What Needs Configuration

${envNeeds.length > 0 ? envNeeds.map((name) => `- ${name}: set in .env, never commit real value`).join("\n") : "- No .env.example variables detected."}

## First Exercise

${exercise.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Operating Notes

- Do not copy secrets into TechScope reports.
- Use test reports for diagnostics and this handoff report for user-facing operation.
- If the project lacks an agent harness, create an agent-contract before changing files.
- If Telegram is enabled, test dry-run queueing before using real updates.
- If operations/autostart is enabled in the contract, inspect \`operations/manifest.json\`; do not install launchd without explicit approval.

## Risks And Limits

${recommendationForProject(detection, [
  checkResult("Agent instructions", fileExists(projectRoot, "AGENTS.md") || fileExists(projectRoot, "CLAUDE.md") || fileExists(projectRoot, "GEMINI.md") ? "pass" : "missing", ""),
  checkResult("Interface manifest", fileExists(projectRoot, "interfaces/manifest.json") ? "pass" : "missing", ""),
  checkResult("Memory manifest", fileExists(projectRoot, "memory/manifest.json") ? "pass" : "missing", ""),
  checkResult("Tool manifest", fileExists(projectRoot, "tools/manifest.json") ? "pass" : "missing", ""),
  checkResult("Operations manifest", fileExists(projectRoot, "operations/manifest.json") ? "pass" : "missing", ""),
  checkResult("Smoke test", fileExists(projectRoot, "scripts/smoke-test.mjs") ? "pass" : "missing", ""),
]).map((item) => `- ${item}`).join("\n")}

## Next Steps

- Run \`node scripts/agents-mother.mjs test "${projectRoot}"\` from TechScope when the project changes.
- Discuss whether the next improvement should target interface, memory, tools, evals, operations or user training.
`;
}

function operationsProject(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }

  const detection = detectProject(projectRoot);
  const manifest = readJsonIfExists(projectRoot, "operations/manifest.json");
  const checks = [];

  checks.push(checkResult(
    "Operations manifest",
    manifest ? "pass" : "missing",
    manifest ? "operations/manifest.json found." : "No operations/manifest.json found.",
  ));

  if (manifest) {
    checks.push(checkResult(
      "Deployment target",
      manifest.deployment_target ? "pass" : "warning",
      manifest.deployment_target || "No deployment target documented.",
    ));
    checks.push(checkResult(
      "Deployment profile",
      manifest.deployment_profile ? "pass" : "warning",
      manifest.deployment_profile || "No deployment profile documented.",
    ));
    checks.push(checkResult(
      "Service mode",
      SERVICE_MODES.has(manifest.service_mode) ? "pass" : "fail",
      manifest.service_mode || "missing",
    ));
    checks.push(checkResult(
      "Autostart mode",
      AUTOSTART_MODES.has(manifest.autostart) ? "pass" : "fail",
      `${manifest.autostart || "missing"}; ${manifest.autostart_policy || "no policy text"}`,
    ));
    checks.push(checkResult(
      "Start command",
      manifest.start_command ? "pass" : "missing",
      manifest.start_command || "No start command documented.",
    ));
    checks.push(checkResult(
      "Stop command",
      manifest.stop_command ? "pass" : "warning",
      manifest.stop_command || "No stop command documented.",
    ));
    checks.push(checkResult(
      "Healthcheck command",
      manifest.healthcheck_command ? "pass" : "missing",
      manifest.healthcheck_command || "No healthcheck command documented.",
    ));
    checks.push(checkResult(
      "Log path",
      manifest.log_path ? "pass" : "warning",
      manifest.log_path || "No log path documented.",
    ));
    checks.push(checkResult(
      "Proactive mode",
      PROACTIVE_MODES.has(manifest.proactivity?.mode) ? "pass" : "warning",
      manifest.proactivity?.mode || "No proactive mode documented.",
    ));
    if (manifest.launchd_template) {
      checks.push(checkResult(
        "launchd template",
        fileExists(projectRoot, manifest.launchd_template) ? "pass" : "missing",
        manifest.launchd_template,
      ));
    } else {
      checks.push(checkResult("launchd template", "not-applicable", "No launchd template selected by service profile."));
    }
  }

  if (fileExists(projectRoot, "scripts/operations-status.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/operations-status.mjs"]);
    checks.push(checkResult("Operations status", result.result, result.output));
  } else {
    checks.push(checkResult("Operations status", "missing", "No scripts/operations-status.mjs command found."));
  }

  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/deploy-service.mjs", "plan"]);
    checks.push(checkResult("Deployment plan", result.result, result.output));
  } else {
    checks.push(checkResult("Deployment plan", "missing", "No scripts/deploy-service.mjs command found."));
  }

  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/smoke-test.mjs"]);
    checks.push(checkResult("Smoke healthcheck", result.result, result.output));
  } else {
    checks.push(checkResult("Smoke healthcheck", "warning", "No smoke test found; document a service-safe healthcheck before deployment."));
  }

  const failed = checks.filter((item) => item.result === "fail").length;
  const missing = checks.filter((item) => item.result === "missing").length;
  const warnings = checks.filter((item) => item.result === "warning").length;
  const status = failed > 0 ? "failed" : missing > 0 || warnings > 0 ? "partial" : "complete";
  const projectName = path.basename(projectRoot);
  const reportPath = uniquePath(path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-operations-report.md`));
  writeFileSync(reportPath, agentOperationsReportMarkdown(projectRoot, projectName, detection, manifest, checks, status));

  console.log(`Project: ${projectRoot}`);
  console.log(`Operations: ${status}`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
  if (failed > 0) process.exitCode = 1;
}

function agentOperationsReportMarkdown(projectRoot, projectName, detection, manifest, checks, status) {
  const date = today();
  const tools = ["Codex", "AGENTS.md", "operations"];
  if (manifest?.service_mode === "launchd" || manifest?.launchd_template) tools.push("launchd");
  return `---
id: ${date}-${slug(projectName)}-agent-operations-report
type: agent-operations-report
status: ${status}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - operations
  - service-readiness
  - ${slug(projectName)}
tools:${yamlList(tools)}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - operations/manifest.json
  - scripts
portability: codex-native
sources:
  - ${projectRoot}
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: operations inspection ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Operations Report: ${projectName}

Date: ${date}
Status: ${status}

## Summary

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Deployment target: ${manifest?.deployment_target || "unknown"}
- Deployment profile: ${manifest?.deployment_profile || "unknown"}
- Service mode: ${manifest?.service_mode || "unknown"}
- Autostart: ${manifest?.autostart || "unknown"}
- Proactive mode: ${manifest?.proactivity?.mode || "unknown"}
- Autostart policy: ${manifest?.autostart_policy || "missing"}
- Result: ${status}

## Checks

| Check | Result | Notes |
| --- | --- | --- |
${checks.map((item) => `| ${item.name} | ${item.result} | ${item.notes.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 260)} |`).join("\n")}

## Service Commands

- Start: \`${manifest?.start_command || "not documented"}\`
- Stop: \`${manifest?.stop_command || "not documented"}\`
- Healthcheck: \`${manifest?.healthcheck_command || "not documented"}\`
- Logs: \`${manifest?.log_path || "not documented"}\`

## Proactivity

- Mode: \`${manifest?.proactivity?.mode || "unknown"}\`
- Trigger sources: ${manifest?.proactivity?.trigger_sources || "unknown"}
- Schedule: ${manifest?.proactivity?.schedule || "unknown"}
- Heartbeat interval: ${manifest?.proactivity?.heartbeat_interval || "unknown"}
- Idle behavior: ${manifest?.proactivity?.idle_behavior || "unknown"}

## Autostart Decision

- Current mode: \`${manifest?.autostart || "unknown"}\`
- Autostart is configurable, but scaffold and operations inspection do not install it.
- If launchd is selected, review the plist template and get explicit user approval before copying it to \`~/Library/LaunchAgents/\` or calling \`launchctl\`.

## Next Steps

- Fix any failed or missing checks before treating this agent as a service.
- Run \`node scripts/agents-mother.mjs test "${projectRoot}"\` after operations changes.
- Create or update the agent contract if service mode or autostart policy changes.
`;
}

function deployProject(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }

  const action = options._[1] || "plan";
  const allowed = new Set(["plan", "status", "install", "uninstall"]);
  if (!allowed.has(action)) {
    throw new Error(`Unknown deploy action: ${action}. Expected: ${Array.from(allowed).join(", ")}`);
  }
  if ((action === "install" || action === "uninstall") && !options.yes) {
    throw new Error(`Deploy action "${action}" mutates system service state and requires --yes.`);
  }
  if (!fileExists(projectRoot, "scripts/deploy-service.mjs")) {
    throw new Error("Project does not have scripts/deploy-service.mjs. Re-scaffold or add Layer 9 deployment automation first.");
  }

  const args = ["scripts/deploy-service.mjs", action];
  if (options.yes) args.push("--yes");
  const result = runProjectCommand(projectRoot, "node", args);
  const manifest = readJsonIfExists(projectRoot, "operations/manifest.json");
  const status = result.result === "pass" ? "complete" : "failed";
  const projectName = path.basename(projectRoot);
  const reportPath = uniquePath(path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-deployment-report.md`));
  writeFileSync(reportPath, agentDeploymentReportMarkdown(projectRoot, projectName, manifest, action, result, status));

  console.log(`Project: ${projectRoot}`);
  console.log(`Deploy action: ${action}`);
  console.log(`Result: ${status}`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
  if (result.output) console.log(result.output);
  if (result.result !== "pass") process.exitCode = 1;
}

function agentDeploymentReportMarkdown(projectRoot, projectName, manifest, action, result, status) {
  const date = today();
  const tools = ["Codex", "AGENTS.md", "operations"];
  if (manifest?.service_mode === "launchd" || manifest?.launchd_template) tools.push("launchd");
  return `---
id: ${date}-${slug(projectName)}-agent-deployment-report
type: agent-deployment-report
status: ${status}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - deployment
  - service-automation
  - ${slug(projectName)}
tools:${yamlList(tools)}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - operations/manifest.json
  - scripts
portability: codex-native
sources:
  - ${projectRoot}
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  agent_operations_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: deployment ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Deployment Report: ${projectName}

Date: ${date}
Status: ${status}

## Summary

- Project path: ${projectRoot}
- Action: ${action}
- Deployment target: ${manifest?.deployment_target || "unknown"}
- Deployment profile: ${manifest?.deployment_profile || "unknown"}
- Service mode: ${manifest?.service_mode || "unknown"}
- Autostart: ${manifest?.autostart || "unknown"}
- Proactive mode: ${manifest?.proactivity?.mode || "unknown"}
- Service label: ${manifest?.service_label || "unknown"}
- Result: ${status}

## Command Output

\`\`\`text
${result.output || "no output"}
\`\`\`

## Safety Notes

- \`plan\` and \`status\` are read-only.
- \`install\` and \`uninstall\` require \`--yes\`.
- \`install\` is allowed only when the agent manifest explicitly selects \`service_mode: launchd\` and \`autostart: launchd-on-approval\`.
`;
}

function printIssues(issues) {
  for (const issue of issues) console.error(`- ${issue}`);
}

function listContracts() {
  ensureDirs();
  const files = readdirSync(CONTRACT_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(CONTRACT_DIR, entry))
    .filter((file) => statSync(file).isFile())
    .sort();
  if (files.length === 0) {
    console.log("No agent contracts yet.");
    return;
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const fm = readFrontmatter(text);
    const name = bodyValue(text, "Agent name") || path.basename(file, ".md");
    console.log(`${fm.status || "unknown"}\t${path.relative(ROOT, file)}\t${name}`);
  }
}

function listMarkdownFilesFlat(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(dir, entry))
    .filter((file) => statSync(file).isFile())
    .sort();
}

function fileBody(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? text : text.slice(end + 5);
}

function markdownTitle(text, fallback) {
  return fileBody(text).match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function contractSummaryFromFile(file) {
  const text = readFileSync(file, "utf8");
  const fm = readFrontmatter(text);
  const name = bodyValue(text, "Agent name") || markdownTitle(text, path.basename(file, ".md"));
  return {
    kind: "contract",
    path: path.relative(ROOT, file),
    id: fm.id || path.basename(file, ".md"),
    status: fm.status || "unknown",
    slug: slug(name),
    name,
    mission: bodyValue(text, "Primary mission") || "unknown",
    runtime: bodyValue(text, "Runtime family") || "unknown",
    interface: bodyValue(text, "Primary interface") || "unknown",
    telegram: bodyValue(text, "Telegram mode") || "unknown",
    deploymentTarget: bodyValue(text, "Deployment target") || bodyValue(text, "Expected hosting") || "unknown",
    proactiveMode: bodyValue(text, "Proactive mode") || "unknown",
    created: fm.created || "unknown",
  };
}

function reportSummaryFromFile(file) {
  const text = readFileSync(file, "utf8");
  const fm = readFrontmatter(text);
  const title = markdownTitle(text, path.basename(file, ".md"));
  const relPath = path.relative(ROOT, file);
  const projectPath = bodyValue(text, "Project path") || bodyValue(text, "Target folder") || "";
  const nameFromTitle = title.replace(/^Agent\s+(Scaffold|Test|Handoff|Operations|Deployment)\s+Report:\s*/i, "").trim();
  const name = nameFromTitle || path.basename(file, ".md");
  return {
    kind: "report",
    path: relPath,
    id: fm.id || path.basename(file, ".md"),
    type: fm.type || "unknown",
    status: fm.status || "unknown",
    slug: slug(name || projectPath || relPath),
    name,
    projectPath,
    created: fm.created || "unknown",
    result: bodyValue(text, "Result") || fm.status || "unknown",
  };
}

function collectAgentLifecycle() {
  const contracts = listMarkdownFilesFlat(CONTRACT_DIR).map(contractSummaryFromFile);
  const reports = listMarkdownFilesFlat(REPORT_DIR)
    .filter((file) => path.basename(file) !== ".gitkeep")
    .map(reportSummaryFromFile);
  const research = listMarkdownFilesFlat(RESEARCH_DIR).map((file) => {
    const text = readFileSync(file, "utf8");
    const fm = readFrontmatter(text);
    return {
      path: path.relative(ROOT, file),
      id: fm.id || path.basename(file, ".md"),
      status: fm.status || "unknown",
      title: markdownTitle(text, path.basename(file, ".md")),
      created: fm.created || "unknown",
    };
  });

  const bySlug = new Map();
  for (const contract of contracts) {
    bySlug.set(contract.slug, {
      slug: contract.slug,
      name: contract.name,
      mission: contract.mission,
      runtime: contract.runtime,
      interface: contract.interface,
      telegram: contract.telegram,
      deploymentTarget: contract.deploymentTarget,
      proactiveMode: contract.proactiveMode,
      contracts: [contract],
      reports: [],
    });
  }
  for (const report of reports) {
    const key = [...bySlug.keys()].find((item) => report.path.includes(item) || report.slug.includes(item)) || report.slug;
    if (!bySlug.has(key)) {
      bySlug.set(key, {
        slug: key,
        name: report.name,
        mission: "unknown",
        runtime: "unknown",
        interface: "unknown",
        telegram: "unknown",
        deploymentTarget: "unknown",
        proactiveMode: "unknown",
        contracts: [],
        reports: [],
      });
    }
    bySlug.get(key).reports.push(report);
  }

  return { agents: [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)), contracts, reports, research };
}

function reportTypeCount(reports, type) {
  return reports.filter((report) => report.type === type).length;
}

function registryMarkdown(lifecycle) {
  const date = today();
  const sources = [
    "11_agents/contracts/",
    "11_agents/research/",
    "11_agents/reports/",
    "07_workflows/agents-mother.md",
    "07_workflows/agents-mother-roadmap.md",
  ];
  return `---
id: agents-mother-registry
type: agent-registry
status: active
created: 2026-05-18
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - registry
tools:
  - Codex
  - AGENTS.md
  - Agents Mother
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - scripts
portability: codex-native
sources:
${sources.map((source) => `  - ${source}`).join("\n")}
related:
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  agent_operations_reports: []
  agent_deployment_reports: []
  agent_post_creation_reviews: []
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: ${date}
source_version: generated registry ${date}
retrieved: ${date}
verified: ${date}
valid_for: current TechScope Agents Mother lifecycle
temporal_status: current
---

# Agents Mother Registry

Date: ${date}
Status: active

## Summary

- Agents tracked: ${lifecycle.agents.length}
- Contracts: ${lifecycle.contracts.length}
- Reports: ${lifecycle.reports.length}
- Research reports: ${lifecycle.research.length}

## Agents

| Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${lifecycle.agents.map((agent) => {
  const evidence = [
    `contracts:${agent.contracts.length}`,
    `scaffold:${reportTypeCount(agent.reports, "scaffold-report")}`,
    `test:${reportTypeCount(agent.reports, "agent-test-report")}`,
    `handoff:${reportTypeCount(agent.reports, "agent-handoff-report")}`,
    `ops:${reportTypeCount(agent.reports, "agent-operations-report")}`,
    `deploy:${reportTypeCount(agent.reports, "agent-deployment-report")}`,
    `evolve:${reportTypeCount(agent.reports, "agent-post-creation-review")}`,
  ].join(" ");
  return `| ${agent.name.replace(/\|/g, "/")} | ${agent.mission.replace(/\|/g, "/").slice(0, 120)} | ${agent.runtime} | ${agent.interface} / Telegram ${agent.telegram} | ${agent.deploymentTarget} | ${agent.proactiveMode} | ${evidence} |`;
}).join("\n")}

## Recent Reports

${lifecycle.reports.slice(-30).reverse().map((report) => `- ${report.created} ${report.type}/${report.status}: ${report.path}`).join("\n") || "- No reports yet."}

## Evolution Rules

- Registry is generated from contracts and reports; do not use it as the sole source for standards.
- Promote a pattern to \`04_standards/\` only after a post-creation review shows repeated successful evidence.
- Failed or superseded patterns remain visible in reports and reviews.
`;
}

function rebuildRegistry() {
  ensureDirs();
  const lifecycle = collectAgentLifecycle();
  writeFileSync(REGISTRY_PATH, registryMarkdown(lifecycle));
  console.log(`Registry: ${path.relative(ROOT, REGISTRY_PATH)}`);
  console.log(`Agents tracked: ${lifecycle.agents.length}`);
  console.log(`Reports indexed: ${lifecycle.reports.length}`);
}

function relatedReportsForProject(projectRoot, projectName) {
  const projectSlug = slug(projectName);
  return listMarkdownFilesFlat(REPORT_DIR)
    .map(reportSummaryFromFile)
    .filter((report) => report.path.includes(projectSlug) || report.projectPath === projectRoot || report.projectPath.includes(projectName))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function inferLessonsFromProject(projectRoot, detection, reports) {
  const useful = [];
  const failed = [];
  const standards = [];
  const outdated = [];

  if (fileExists(projectRoot, "interfaces/manifest.json")) useful.push("Interface choices are explicit and inspectable through `interfaces/manifest.json`.");
  if (fileExists(projectRoot, "memory/manifest.json")) useful.push("Memory profile is separated from agent instructions and can evolve without rewriting `AGENTS.md`.");
  if (fileExists(projectRoot, "tools/manifest.json")) useful.push("Tool boundaries are documented before adding external capabilities.");
  if (fileExists(projectRoot, "operations/manifest.json")) useful.push("Deployment, proactivity and service behavior are represented as an operations manifest.");
  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) useful.push("Smoke test gives a cheap acceptance gate for scaffold changes.");
  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) useful.push("Deployment automation is separated from scaffold and mutation requires explicit confirmation.");

  if (detection.classification === "project-without-agent-harness") failed.push("Project still lacks an agent harness; create an agent-contract before applying Agents Mother patterns.");
  if (!fileExists(projectRoot, "scripts/smoke-test.mjs")) failed.push("No smoke test found, so readiness claims are weak.");
  if (!fileExists(projectRoot, "operations/manifest.json")) failed.push("No operations manifest found, so deployment and proactivity are not governed.");
  if (reports.length === 0) failed.push("No lifecycle reports found for this project yet.");

  if (useful.length >= 3 && reports.some((report) => report.type === "agent-test-report" && report.status === "complete")) {
    standards.push("Consider promoting generated manifest triad plus smoke test as a reusable minimum scaffold pattern after one more successful agent.");
  }
  if (reports.some((report) => report.type === "agent-deployment-report" && report.status === "complete")) {
    standards.push("Consider promoting explicit deploy plan/status/install/uninstall gates as a service-agent deployment standard after repeated use.");
  }

  if (reports.some((report) => report.status === "failed")) outdated.push("Some lifecycle reports failed; do not promote patterns until failures are reviewed.");
  if (outdated.length === 0) outdated.push("No outdated scaffold pattern identified from current evidence.");

  return { useful, failed, standards, outdated };
}

function evolveProject(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }
  const projectName = path.basename(projectRoot);
  const detection = detectProject(projectRoot);
  const reports = relatedReportsForProject(projectRoot, projectName);
  const lessons = inferLessonsFromProject(projectRoot, detection, reports);
  const reportPath = uniquePath(path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-post-creation-review.md`));
  writeFileSync(reportPath, agentPostCreationReviewMarkdown(projectRoot, projectName, detection, reports, lessons, options));
  rebuildRegistry();
  console.log(`Post-creation review: ${path.relative(ROOT, reportPath)}`);
}

function agentPostCreationReviewMarkdown(projectRoot, projectName, detection, reports, lessons, options = {}) {
  const date = today();
  const tools = ["Codex", "AGENTS.md", "Agents Mother"];
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) tools.push("Telegram");
  if (fileExists(projectRoot, "operations/manifest.json")) tools.push("operations");
  return `---
id: ${date}-${slug(projectName)}-agent-post-creation-review
type: agent-post-creation-review
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - lessons-learned
  - ${slug(projectName)}
tools:${yamlList(tools)}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - scripts
portability: codex-native
sources:
  - ${projectRoot}
${reports.map((report) => `  - ${report.path}`).join("\n")}
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  agent_operations_reports: []
  agent_deployment_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: post-creation review ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Post-Creation Review: ${projectName}

Date: ${date}
Status: draft

## Summary

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Related lifecycle reports: ${reports.length}
- User notes: ${scalar(options.notes, "none")}

## Evidence

${reports.length > 0 ? reports.map((report) => `- ${report.type}/${report.status}: ${report.path}`).join("\n") : "- No lifecycle reports found yet."}

## Useful Scaffold Patterns

${lessons.useful.map((item) => `- ${item}`).join("\n") || "- No reusable pattern identified yet."}

## Failed Assumptions

${lessons.failed.map((item) => `- ${item}`).join("\n") || "- No failed assumptions identified yet."}

## Reusable Standard Candidates

${lessons.standards.map((item) => `- ${item}`).join("\n") || "- No standard candidate yet. Keep gathering evidence."}

## Outdated Or Risky Patterns

${lessons.outdated.map((item) => `- ${item}`).join("\n")}

## Promotion Path

- Do not update \`04_standards/\` from a single successful run.
- Require at least two comparable agents or one production deployment with clean test, handoff, operations and deployment evidence.
- If a pattern is promoted, create or update a standard and link this review as evidence.

## Next Steps

- Discuss this review with the user before promoting any pattern.
- Run \`node scripts/agents-mother.mjs registry\` after future lifecycle reports.
`;
}

function questions() {
  console.log(`# Agents Mother interview outline

1. Purpose: agent name, mission, target user, success criteria, out of scope.
2. Scope: v1 core functions, deferred functions, critical workflows.
3. Runtime: codex-native, CLI, API, local model, hybrid or environment-specific.
4. Interface: Codex project, Telegram, CLI, web, API or mixed.
5. Telegram: none, primary-chat, intake-channel, notifications-only or operator-control.
6. Harness: tools, orchestration, memory/state, evals, recovery, human approvals.
7. Data/security: inputs, stored data, sensitive data, secrets, network/filesystem access.
8. Deployment: target environment, deployment profile, service mode and autostart policy.
9. Proactivity: manual, scheduled, heartbeat, event-driven, queue-watcher or hybrid; triggers and interruption policy.
10. Scaffold: target folder, generated files, dependencies, setup/run commands, tests and training guide.`);
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
  if (command === "interview") {
    await interview(options);
    return;
  }
  if (command === "init") {
    await interview({ ...options, "no-input": true });
    return;
  }
  if (command === "research") {
    const target = options._[0];
    if (!target) throw new Error("Missing contract path.");
    researchContract(target, options);
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
  if (command === "evolve") {
    const target = options._[0];
    if (!target) throw new Error("Missing project path.");
    evolveProject(target, options);
    return;
  }
  if (command === "registry") {
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
