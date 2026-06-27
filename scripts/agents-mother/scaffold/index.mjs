import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "../../lib/paths.mjs";
import { slug as makeSlug } from "../../lib/slug.mjs";
import { today } from "../../lib/date.mjs";
import { AUTOSTART_MODES, PROACTIVE_MODES, RUNTIME_PLACEMENT_PROFILES, SERVICE_MODES, bodyValue, contractData, sectionItems, validateContract } from "../contract.mjs";
import { researchGateDecisionForReport } from "../research-gate.mjs";
import { selectSkillsForContract, skillPolicyFor, skillRowForManifest } from "../skills.mjs";

const ROOT = resolveTechscopeRoot();
const REPORT_DIR = path.join(ROOT, "11_agents", "reports");
const RESEARCH_DIR = path.join(ROOT, "11_agents", "research");
const slug = (value, fallback = "agent") => makeSlug(value, { fallback });

function ensureDirs() {
  mkdirSync(REPORT_DIR, { recursive: true });
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
function bulletList(items) {
  const list = Array.isArray(items) && items.length > 0 ? items : ["TBD"];
  return list.map((item) => `- ${item}`).join("\n");
}

function scalar(value, fallback = "TBD") {
  const text = String(value || "").trim();
  return text || fallback;
}

const SHELL_COMMAND_META_PATTERN = /[;&|<>`$\\'"()\n\r]/;

function commandArgvFromText(value) {
  const text = scalar(value, "");
  if (!text || SHELL_COMMAND_META_PATTERN.test(text)) return [];
  return text.split(/\s+/).filter(Boolean);
}

function yamlScalar(value) {
  return String(value || "")
    .replaceAll("\n", " ")
    .replaceAll(":", " -");
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
  const healthcheckCommand = scalar(data.healthcheckCommand, "node scripts/smoke-test.mjs");
  return {
    serviceMode,
    autostart,
    deploymentTarget: scalar(data.deploymentTarget || data.expectedHosting, "local Mac"),
    deploymentProfile: scalar(data.deploymentProfile, "local-development"),
    startCommand: scalar(data.startCommand, "node scripts/agent-cli.mjs status"),
    stopCommand: scalar(data.stopCommand, serviceMode === "none" ? "not-applicable" : "manual stop; define before production"),
    healthcheckCommand,
    healthcheckArgv: commandArgvFromText(healthcheckCommand),
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

function extractBodyComment(fn) {
  const source = fn.toString();
  const start = source.indexOf("/*");
  const end = source.lastIndexOf("*/");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Missing embedded script body.");
  }
  return `${source.slice(start + 2, end).trimStart()}\n`;
}

const CONTROL_CENTER_RUNTIME_SCRIPT = extractBodyComment(function controlCenterRuntimeScriptSource() {/*
#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  if (manager === "screen") console.log(`Screen session: ${runtime.screen_session || "missing"}; exists=${screenSessionExists(runtime.screen_session)}`);
  if (manager === "launchd") {
    const target = launchdTarget();
    const status = run("launchctl", ["print", target.target], { allowFail: true });
    console.log(`Launchd target: ${target.target}; loaded=${status.ok}`);
  }
  const health = await probeHealth();
  console.log(`Health: ${health.status}; ${health.detail}`);
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

function contractStatus(data) {
  return String(data.fm?.status || "").trim().toLowerCase();
}

function researchReportStatus(data) {
  const agentSlug = slug(data.agentName);
  if (!existsSync(RESEARCH_DIR)) return { status: "missing", path: "" };
  const files = readdirSync(RESEARCH_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(RESEARCH_DIR, entry))
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    if ((data.relPath && text.includes(data.relPath)) || path.basename(filePath).includes(agentSlug)) {
      return {
        status: "found",
        path: path.relative(ROOT, filePath),
        gate: researchGateDecisionForReport(data, text),
      };
    }
  }
  return { status: "missing", path: "" };
}

export function generatedAgentFiles(data) {
  const agentName = scalar(data.agentName, "New Agent");
  const agentSlug = slug(agentName);
  const telegramEnabled = data.telegramMode && data.telegramMode !== "none";
  const interfaces = selectedInterfaces(data);
  const memoryProfile = memoryProfileFor(data);
  const memoryDetails = memoryProfileDetails(memoryProfile);
  const toolProfiles = toolProfilesFor(data);
  const operationProfile = operationProfileFor(data);
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
    primary_interface: scalar(data.primaryInterface, "Codex project"),
    telegram_mode: scalar(data.telegramMode, "none"),
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
    indexing_search_needs: scalar(data.indexingSearchNeeds, "none for v1 unless contract is updated"),
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
      external_skills: skillPolicy.allowedSkillSources === "local-only" ? "disabled" : "approval-required",
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
    service_mode: operationProfile.serviceMode,
    autostart: operationProfile.autostart,
    control_center_managed: false,
    autostart_policy: "configurable; never install or enable autostart from scaffold without explicit user approval",
    control_center_contract: {
      version: 1,
      command_shape: "structured-argv",
      executor: "scripts/control-center-runtime.mjs",
      default_execution: "disabled-until-managed-runtime-is-explicitly-approved",
      legacy_strings_executable: false,
      planned_start_command: operationProfile.startCommand,
      planned_stop_command: operationProfile.stopCommand,
    },
    control_center_runtime: {
      manager: "none",
      service_boundary: "not-managed-by-control-center",
      prestart_argv: [],
      start_argv: [],
      health_url: null,
      readiness_timeout_ms: 10000,
      stop_timeout_ms: 10000,
    },
    start_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "start"],
      cwd: ".",
      control_center_managed: false,
      timeout_ms: 30000,
      success_exit_codes: [0],
      description: "Structured Control Center entrypoint. Disabled until control_center_managed is explicitly approved.",
    },
    stop_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "stop"],
      cwd: ".",
      control_center_managed: false,
      timeout_ms: 30000,
      success_exit_codes: [0],
      description: "Structured Control Center entrypoint. Disabled until control_center_managed is explicitly approved.",
    },
    healthcheck_command: operationProfile.healthcheckCommand,
    healthcheck_argv: operationProfile.healthcheckArgv,
    healthcheck_command_executable: false,
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
- Do not copy secrets from Pritha or any other project.
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
- Before using an installed skill, read its \`SKILL.md\`, check \`When to Use\`, follow \`Pitfalls\` and complete \`Verification\`.
- Do not use entries from \`skills/candidates.json\` as active instructions.
- Do not modify skills unless the contract allows skill mutation.
- External skills require explicit approval before vendoring, linking or runtime installation.
`,
  });

  files.push({
    path: "README.md",
    content: `# ${agentName}

Generated by Pritha.

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
node scripts/skills-status.mjs
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
- \`skills/manifest.json\`: reviewed installed skills, candidate skills, hashes and mutation policy.
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
- Skill policy: needs=${skillPolicy.skillNeeds}; sources=${skillPolicy.allowedSkillSources}; install=${skillPolicy.skillInstallMode}; mutation=${skillPolicy.skillMutationPolicy}
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
    ? `Telegram adapter selected by contract as ${data.telegramMode}.`
    : "Adapter placeholder selected by contract. Implement runtime behavior only after a dedicated design step."}

## Notes

- Contract primary interface: ${scalar(data.primaryInterface, "Codex project")}
- Telegram mode: ${scalar(data.telegramMode, "none")}
- Runtime family: ${scalar(data.runtimeFamily, "codex-native")}
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
        copy_command_from_pritha_root: `node scripts/voice-control-kit.mjs copy --target ../${agentSlug}`,
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
node scripts/voice-control-kit.mjs copy --target ../${agentSlug}
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

- Read an installed skill's \`SKILL.md\` before using it.
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
      content: readFileSync(row.skill.path, "utf8"),
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
- Planned start command: \`${operationProfile.startCommand}\`
- Planned stop command: \`${operationProfile.stopCommand}\`
- Healthcheck argv: \`${operationProfile.healthcheckArgv.length > 0 ? operationProfile.healthcheckArgv.join(" ") : "not configured"}\`
- Legacy healthcheck command: \`${operationProfile.healthcheckCommand}\`
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
    path: "scripts/skills-status.mjs",
    content: `#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, "skills", "manifest.json");
const candidatesPath = path.join(ROOT, "skills", "candidates.json");
const lockPath = path.join(ROOT, "skills", "lock.json");

function sha256(text) {
  return \`sha256:\${createHash("sha256").update(text).digest("hex")}\`;
}

const issues = [];
for (const relPath of ["skills/manifest.json", "skills/candidates.json", "skills/lock.json", "skills/README.md"]) {
  if (!existsSync(path.join(ROOT, relPath))) issues.push(\`missing \${relPath}\`);
}

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { installed: [], candidates: [] };
const candidates = existsSync(candidatesPath) ? JSON.parse(readFileSync(candidatesPath, "utf8")) : { candidates: [] };
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : { installed: [] };

for (const entry of manifest.installed || []) {
  const skillPath = path.join(ROOT, "skills", entry.name, "SKILL.md");
  if (!existsSync(skillPath)) {
    issues.push(\`missing installed skill: skills/\${entry.name}/SKILL.md\`);
    continue;
  }
  const actual = sha256(readFileSync(skillPath, "utf8"));
  if (entry.hash && entry.hash !== actual) issues.push(\`hash drift for \${entry.name}\`);
}

const locked = new Map((lock.installed || []).map((entry) => [entry.name, entry.hash]));
for (const entry of manifest.installed || []) {
  if (locked.get(entry.name) !== entry.hash) issues.push(\`lock mismatch for \${entry.name}\`);
}

if (issues.length > 0) {
  console.error("Skill status failed:");
  for (const issue of issues) console.error(\`- \${issue}\`);
  process.exit(1);
}

console.log(\`Agent: \${manifest.agent || "unknown"}\`);
console.log(\`Skill policy: needs=\${manifest.policy?.skill_needs || "unknown"}; install=\${manifest.policy?.install_mode || "unknown"}; mutation=\${manifest.policy?.agent_mutation || "unknown"}\`);
console.log(\`Installed skills: \${(manifest.installed || []).length}\`);
for (const entry of manifest.installed || []) console.log(\`- \${entry.name}: \${entry.version}; \${entry.trust_level}; \${entry.risk_level}\`);
console.log(\`Candidate skills: \${(candidates.candidates || []).length}\`);
`,
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
  "skills/manifest.json",
  "skills/candidates.json",
  "skills/lock.json",
  "skills/README.md",
  "operations/manifest.json",
  "operations/README.md",
  "07_workflows/agent-operating-workflow.md",
  "docs/user-training-guide.md",
  "scripts/agent-cli.mjs",
  "scripts/interface-status.mjs",
  "scripts/memory-status.mjs",
  "scripts/tools-status.mjs",
  "scripts/skills-status.mjs",
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
  const research = options.research || researchReportStatus(data);
  const externalVerification = externalVerificationStatus(research);
  const gateFields = research.gate?.fields || {};
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
control_center_card_status: pending-registry
card_refs:
  - operations/manifest.json
  - scripts/control-center-runtime.mjs
card_blockers:
  - Registry must be rebuilt after scaffold before the card appears in Agents.
  - Runtime Start and Stop remain disabled until control_center_managed is explicitly approved.
next_card_actions:
  - node scripts/pritha.mjs registry
  - node scripts/pritha.mjs card-readiness ${agentSlug}
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
- Skill policy: needs=${skillPolicyFor(data).skillNeeds}; sources=${skillPolicyFor(data).allowedSkillSources}; install=${skillPolicyFor(data).skillInstallMode}; mutation=${skillPolicyFor(data).skillMutationPolicy}
- Research report: ${research.status}${research.path ? ` (${research.path})` : ""}
- Research gate: ${researchGateStatusLabel(research)}
- External verification: ${externalVerification}
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
| Skills status | pending | \`node scripts/skills-status.mjs\` |
| Pritha memory research | ${research.status} | ${research.path || "Run `node scripts/pritha.mjs research <contract>` before production scaffold decisions"} |
| Research gate | ${researchGateResultLabel(research)} | ${researchGateReasons(research)} |
| Memory research gate | ${gateFields.memoryResearch || "pending"} | Machine-readable research report status |
| External verification | ${externalVerification} | Machine-readable external research status |
| Synthesis gate | ${gateFields.synthesis || "pending"} | Memory vs external comparison status |
| Control Center card readiness | pending-registry | Run \`node scripts/pritha.mjs registry\`, then \`node scripts/pritha.mjs card-readiness ${agentSlug}\` |
| Documentation review | pass | README and training guide generated |

## Control Center Card Readiness

- Status: pending-registry.
- Card refs: \`operations/manifest.json\`, \`scripts/control-center-runtime.mjs\`.
- Expected first card state: visible in Agents after registry rebuild; Start/Stop may remain blocked with explicit runtime blockers.
- Card blockers:
  - Registry must be rebuilt after scaffold.
  - Runtime Start/Stop remain disabled until \`control_center_managed: true\` and managed structured runtime are explicitly approved.
- Next card actions:
  - From Pritha root, run \`node scripts/pritha.mjs registry\`.
  - From Pritha root, run \`node scripts/pritha.mjs card-readiness ${agentSlug}\`.

## Handoff

- How to run: \`node scripts/agent-cli.mjs status\`
- How to test: \`node scripts/smoke-test.mjs\`
- How to inspect operations: \`node scripts/operations-status.mjs\`
- How to inspect skills: \`node scripts/skills-status.mjs\`
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

export function scaffoldContract(contractPath, options = {}) {
  ensureDirs();
  const data = contractData(contractPath);
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
  writeFileSync(reportPath, scaffoldReportMarkdown(data, targetPath, createdFiles, smokeResult, { research }));

  console.log(`Scaffold: ${targetPath}`);
  console.log(`Created files: ${createdFiles.length}`);
  console.log(`Smoke test: ${smokeResult.ok ? "pass" : "fail"}`);
  console.log(`Scaffold report: ${path.relative(ROOT, reportPath)}`);
  if (contractStatus(data) !== "accepted") {
    console.log(`Warning: scaffold created from ${contractStatus(data) || "unknown"} contract because --allow-draft-scaffold was set.`);
  }
  if (!smokeResult.ok) {
    console.log(smokeResult.output);
    process.exitCode = 1;
  }
}
