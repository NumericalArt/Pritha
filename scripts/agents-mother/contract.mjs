import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "../lib/paths.mjs";

export const RUNTIME_FAMILIES = new Set(["codex-native", "cli", "api", "local-model", "hybrid", "environment-specific"]);
export const TELEGRAM_MODES = new Set(["none", "primary-chat", "intake-channel", "notifications-only", "operator-control"]);
export const SERVICE_MODES = new Set(["none", "manual", "launchd", "external"]);
export const AUTOSTART_MODES = new Set(["disabled", "optional", "launchd-on-approval", "external"]);
export const PROACTIVE_MODES = new Set(["none", "manual", "scheduled", "heartbeat", "event-driven", "queue-watcher", "hybrid"]);
export const RUNTIME_PLACEMENT_PROFILES = new Set(["deterministic-first", "frontier-first", "local-first", "hybrid", "unknown"]);
export const STATUS_VALUES = new Set(["draft", "accepted", "superseded"]);

export function bodyValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, "mi"));
  return match ? match[1].trim() : "";
}

export function sectionItems(text, heading) {
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

export function isMissing(value) {
  return !value || value === "TBD" || value === "unknown" || value === "pending";
}

export function printIssues(issues) {
  for (const issue of issues) console.error(`- ${issue}`);
}

export function validateContract(contractPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const print = options.print !== false;
  const fullPath = path.resolve(root, contractPath);
  const issues = [];

  if (!existsSync(fullPath)) {
    issues.push(`file not found: ${contractPath}`);
    if (print) printIssues(issues);
    return issues;
  }

  const text = readFileSync(fullPath, "utf8");
  const fm = parseFrontmatterData(text) || {};
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
    issues.push("invalid Multi-model routing requested. Expected: no, yes or only-if-needed");
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

  if (print) {
    if (issues.length === 0) {
      console.log(`Contract validation passed: ${path.relative(root, fullPath)}`);
    } else {
      console.error(`Contract validation failed: ${path.relative(root, fullPath)}`);
      printIssues(issues);
    }
  }
  return issues;
}

export function contractData(contractPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const fullPath = path.resolve(root, contractPath);
  if (!existsSync(fullPath)) throw new Error(`Contract not found: ${contractPath}`);
  const text = readFileSync(fullPath, "utf8");
  const fm = parseFrontmatterData(text) || {};
  return {
    fullPath,
    relPath: path.relative(root, fullPath),
    text,
    fm,
    agentName: bodyValue(text, "Agent name"),
    primaryMission: bodyValue(text, "Primary mission"),
    targetUser: bodyValue(text, "Target user"),
    successCriteria: bodyValue(text, "Success criteria"),
    runtimeFamily: bodyValue(text, "Runtime family"),
    runtimePlacementProfile: bodyValue(text, "Runtime placement profile"),
    primaryInterface: bodyValue(text, "Primary interface"),
    telegramMode: bodyValue(text, "Telegram mode"),
    serviceMode: bodyValue(text, "Service mode") || "none",
    autostart: bodyValue(text, "Autostart") || "disabled",
    proactiveMode: bodyValue(text, "Proactive mode") || "none",
    targetFolder: bodyValue(text, "Target folder"),
    testsHealthchecks: bodyValue(text, "Tests/healthchecks"),
    userTrainingGuide: bodyValue(text, "User training guide"),
    coreFunctions: sectionItems(text, "V1 core functions"),
    criticalWorkflows: sectionItems(text, "Critical user workflows"),
  };
}
