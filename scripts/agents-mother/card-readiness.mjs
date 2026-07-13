import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isPrithaCodeCheckout, resolvePrithaAgentMemoryRoot, resolvePrithaAgentParent, resolveTechscopeRoot } from "../lib/paths.mjs";

function controlCenterSlug(value) {
  return String(value || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function comparableKey(value) {
  return controlCenterSlug(value).replaceAll("-", "");
}

function parseTableLine(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseRegistry(root) {
  const registryPath = path.join(resolvePrithaAgentMemoryRoot({ root }), "registry.md");
  if (!existsSync(registryPath)) return { registryPath, records: [] };

  const lines = readFileSync(registryPath, "utf8").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Agents");
  if (start === -1) return { registryPath, records: [] };

  const tableLines = lines.slice(start + 1).filter((line) => line.trim().startsWith("|"));
  const records = tableLines
    .slice(2)
    .map(parseTableLine)
    .filter((cells) => cells.length >= 7)
    .map(([name, mission, runtime, iface, deployment, proactivity, evidence]) => ({
      name,
      mission,
      runtime,
      interface: iface,
      deployment,
      proactivity,
      evidence,
    }));

  return { registryPath, records };
}

function findRegistryRecord(records, target) {
  const key = comparableKey(target);
  return records.find((record) => comparableKey(record.name) === key || controlCenterSlug(record.name) === target) || null;
}

function listMarkdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(directory, entry));
}

function evidenceMatches(filePath, keys) {
  const filename = comparableKey(path.basename(filePath, ".md"));
  if (keys.some((key) => filename.includes(key))) return true;
  try {
    const text = readFileSync(filePath, "utf8");
    return keys.some((key) => comparableKey(text).includes(key));
  } catch {
    return false;
  }
}

function evidencePaths(root, target, record) {
  const keys = [...new Set([target, record?.name].filter(Boolean).map(comparableKey))];
  return {
    contracts: listMarkdownFiles(path.join(resolvePrithaAgentMemoryRoot({ root }), "contracts"))
      .filter((filePath) => evidenceMatches(filePath, keys))
      .map((filePath) => path.relative(root, filePath)),
    reports: listMarkdownFiles(path.join(resolvePrithaAgentMemoryRoot({ root }), "reports"))
      .filter((filePath) => evidenceMatches(filePath, keys))
      .map((filePath) => path.relative(root, filePath)),
  };
}

function findSiblingFolder(root, target, record) {
  const parent = resolvePrithaAgentParent({ root });
  const keys = [...new Set([target, record?.name].filter(Boolean).map(comparableKey))];
  try {
    return readdirSync(parent)
      .map((entry) => {
        const absolutePath = path.join(parent, entry);
        return { name: entry, absolutePath };
      })
      .filter((entry) => {
        try {
          return statSync(entry.absolutePath).isDirectory()
            && path.resolve(entry.absolutePath) !== path.resolve(root)
            && !isPrithaCodeCheckout(entry.absolutePath);
        } catch {
          return false;
        }
      })
      .find((entry) => keys.includes(comparableKey(entry.name))) || null;
  } catch {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function structuredCommand(command) {
  return Boolean(command && typeof command === "object" && Array.isArray(command.argv) && command.argv.length);
}

function controlCenterRuntimeSelected(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const serviceMode = String(manifest.service_mode || "").trim().toLowerCase();
  const manager = String(manifest.control_center_runtime?.manager || "").trim().toLowerCase();
  const defaultExecution = String(manifest.control_center_contract?.default_execution || "").trim().toLowerCase();
  return Boolean(
    manifest.control_center_managed === true ||
      defaultExecution.includes("control-center") ||
      (manager && manager !== "none") ||
      (serviceMode && serviceMode !== "none"),
  );
}

function hasHealthContract(manifest) {
  const healthcheckArgv = Array.isArray(manifest?.healthcheck_argv) ? manifest.healthcheck_argv.filter(Boolean) : [];
  return Boolean(manifest?.health_url || manifest?.local_upstream_url || healthcheckArgv.length > 0);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return { ok: false, status: response.status, value: null };
    return { ok: true, status: response.status, value: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), value: null };
  } finally {
    clearTimeout(timer);
  }
}

function planActionForAgent(agent) {
  const explicit = agent?.control?.planAction;
  if (explicit) return explicit;
  const primary = agent?.ui?.primaryAction;
  if (primary === "stop" || primary === "stop_plan") return "stop";
  if (primary === "start" || primary === "start_plan") return "start";
  if (primary === "restore" || primary === "restore_plan") return "restore";
  return "check";
}

function normalizedActionPlanStatus(plan) {
  if (!plan) return undefined;
  const blockers = Array.isArray(plan?.blockers) ? plan.blockers : [];
  const executionMode = plan?.control?.executionMode;
  if (blockers.length > 0) return plan?.status === "unavailable" || executionMode === "unavailable" ? "unavailable" : "blocked";
  if (executionMode === "executable") {
    if (plan?.status === "needs_confirmation" || plan?.requiresConfirmation === true || plan?.confirmation) return "needs_confirmation";
    if (plan?.actionEnabled !== false) return "ready";
    return "blocked";
  }
  if (executionMode === "plan_only" || plan?.status === "planned") return "plan_only";
  if (executionMode === "unavailable" || plan?.status === "unavailable") return "unavailable";
  if (executionMode === "manual_only" || plan?.status === "manual_only") return "manual_only";
  if (["ready", "needs_confirmation", "plan_only", "blocked", "unavailable"].includes(plan?.status)) {
    return plan.status;
  }
  return plan?.status;
}

async function liveControlCenterCard(params) {
  if (params.baseUrl === false) return { visible: "unknown", reason: "live Control Center check disabled" };
  const baseUrl = String(params.baseUrl || `http://127.0.0.1:${process.env.PRITHA_CONTROL_CENTER_PORT || 3420}`).replace(/\/$/, "");
  const agentsResponse = await fetchJson(`${baseUrl}/api/agents`, params.timeoutMs);
  if (!agentsResponse.ok) {
    return { visible: "unknown", reason: `Control Center unavailable at ${baseUrl}`, baseUrl };
  }

  const agents = Array.isArray(agentsResponse.value?.agents)
    ? agentsResponse.value.agents
    : Array.isArray(agentsResponse.value?.childAgents)
      ? agentsResponse.value.childAgents
      : [];
  const key = comparableKey(params.record?.name || params.target);
  const agent = agents.find((item) => comparableKey(item.name) === key || comparableKey(item.id) === key);
  if (!agent) return { visible: false, reason: "Agent is absent from /api/agents", baseUrl };

  const action = planActionForAgent(agent);
  const planResponse = await fetchJson(`${baseUrl}/api/agents/${encodeURIComponent(agent.id)}/actions/${action}/plan`, params.timeoutMs);
  return {
    visible: true,
    baseUrl,
    agentId: agent.id,
    agentName: agent.name,
    action,
    actionPlanAvailable: planResponse.ok,
    actionPlanStatus: normalizedActionPlanStatus(planResponse.value),
    rawActionPlanStatus: planResponse.value?.status,
    actionExecutionMode: planResponse.value?.control?.executionMode,
    actionEnabled: planResponse.value?.actionEnabled,
    actionPlanBlockers: Array.isArray(planResponse.value?.blockers) ? planResponse.value.blockers : [],
    actionPlanRequiredPhrase: planResponse.value?.confirmation?.requiredPhrase,
    reason: planResponse.ok ? undefined : `Action plan unavailable: HTTP ${planResponse.status || "unreachable"}`,
  };
}

export async function checkCardReadiness(target, options = {}) {
  const root = options.root || resolveTechscopeRoot();
  const normalizedTarget = controlCenterSlug(target);
  const registry = parseRegistry(root);
  const record = findRegistryRecord(registry.records, normalizedTarget);
  const folder = findSiblingFolder(root, normalizedTarget, record);
  const manifestPath = folder ? path.join(folder.absolutePath, "operations", "manifest.json") : "";
  const manifest = manifestPath && existsSync(manifestPath) ? readJson(manifestPath) : null;
  const evidence = evidencePaths(root, normalizedTarget, record);
  const blockers = [];
  const nextActions = [];

  if (!record) {
    blockers.push("Agent is missing from the current instance registry; rebuild the registry after scaffold.");
    nextActions.push("Run `node scripts/pritha.mjs registry` after contract/scaffold artifacts exist.");
  }
  if (!folder) {
    blockers.push("Sibling child-agent folder is missing.");
    nextActions.push("Create or repair the sibling child-agent scaffold.");
  }
  if (folder && !manifest) {
    blockers.push("operations/manifest.json is missing or invalid.");
    nextActions.push("Generate a card-ready operations/manifest.json for the child agent.");
  }
  const runtimeSelected = controlCenterRuntimeSelected(manifest);
  if (manifest) {
    if (runtimeSelected) {
      if (!manifest.control_center_contract) blockers.push("operations/manifest.json is missing control_center_contract.");
      if (manifest.control_center_managed !== true) blockers.push("selected Control Center runtime must set control_center_managed=true.");
      if (!manifest.control_center_runtime || String(manifest.control_center_runtime.manager || "none") === "none") {
        blockers.push("selected Control Center runtime requires control_center_runtime.manager.");
      }
      if (!structuredCommand(manifest.start_command)) blockers.push("selected Control Center runtime requires a structured start_command argv.");
      if (!structuredCommand(manifest.stop_command)) blockers.push("selected Control Center runtime requires a structured stop_command argv.");
      if (manifest.start_command?.control_center_managed !== true) blockers.push("managed start_command must be marked control_center_managed.");
      if (manifest.stop_command?.control_center_managed !== true) blockers.push("managed stop_command must be marked control_center_managed.");
      if (!hasHealthContract(manifest)) {
        blockers.push("selected Control Center runtime requires health_url, local_upstream_url, or healthcheck_argv.");
      }
    } else if (!manifest.health_url && !manifest.local_upstream_url) {
      nextActions.push("Add health_url or local_upstream_url only if the agent later selects a local service runtime.");
    }
  }

  const live = await liveControlCenterCard({
    target: normalizedTarget,
    record,
    baseUrl: options.baseUrl === undefined ? undefined : options.baseUrl,
    timeoutMs: Number(options.timeoutMs || 2000),
  });
  if (live.visible === false) {
    blockers.push(live.reason || "Control Center did not expose the agent card.");
    nextActions.push("Restart or refresh Control Center after rebuilding the registry.");
  }
  if (live.visible === "unknown") {
    nextActions.push("Start Control Center and rerun card-readiness to verify live /api/agents visibility.");
  }
  if (live.visible === true && !live.actionPlanAvailable) {
    blockers.push(live.reason || "Control Center action plan endpoint is unavailable.");
  }
  if (
    live.visible === true &&
    live.actionPlanAvailable &&
    runtimeSelected &&
    ["start", "stop"].includes(live.action || "") &&
    live.actionExecutionMode !== "executable"
  ) {
    blockers.push(`Control Center ${live.action} plan must be executable for the selected runtime.`);
  }
  if (live.visible === true && live.actionPlanAvailable && ["blocked", "unavailable"].includes(live.actionPlanStatus || "")) {
    blockers.push(`Control Center action plan status is ${live.actionPlanStatus}.`);
  }
  if (live.actionPlanBlockers?.length) {
    nextActions.push("Resolve runtime blockers when Start/Stop should become executable.");
  }

  const localCardReady = Boolean(record && folder && manifest && blockers.length === 0);
  const status = !record || live.visible === false ? "missing" : localCardReady ? "ready" : "blocked";

  return {
    ok: status !== "missing",
    status,
    target: normalizedTarget,
    agentId: live.agentId || (record ? controlCenterSlug(record.name) : normalizedTarget),
    registryPresent: Boolean(record),
    registryPath: path.relative(root, registry.registryPath),
    folderPresent: Boolean(folder),
    folderPath: folder ? path.relative(root, folder.absolutePath) : undefined,
    manifestPresent: Boolean(manifest),
    manifestPath: manifest ? path.relative(root, manifestPath) : undefined,
    controlCenterVisible: live.visible,
    actionPlanAvailable: live.actionPlanAvailable ?? false,
    actionEnabled: live.actionEnabled,
    actionPlanStatus: live.actionPlanStatus,
    rawActionPlanStatus: live.rawActionPlanStatus,
    actionExecutionMode: live.actionExecutionMode,
    runtimeBlockers: live.actionPlanBlockers || [],
    blockers,
    nextActions: [...new Set(nextActions)],
    evidence,
    warnings: live.visible === "unknown" ? [live.reason] : [],
  };
}

export function printCardReadiness(result) {
  console.log(JSON.stringify(result, null, 2));
}
