const runtimeFamilies = new Set(["codex-native", "cli", "api", "local-model", "hybrid", "environment-specific"]);
function interfaceName(value) {
  const name = String(value || "").trim().toLowerCase();
  if (!name || ["none", "not-applicable"].includes(name)) return null;
  if (/^(?:mcp(?:\s+stdio)?|stdio|tool-server|tool server)$/.test(name)) return "mcp-stdio";
  if (/\bcli\b|headless|command[- ]line/.test(name)) return "cli";
  if (/codex/.test(name)) return "codex-project";
  if (/telegram/.test(name)) return "telegram";
  if (/realtime|voice|голос/.test(name)) return "realtime-voice";
  if (/\bweb\b|browser/.test(name)) return "web";
  if (/\bapi\b/.test(name)) return "api";
  return "custom";
}

function interfaceNames(value) {
  return String(value || "").split(/[,;+\/]|\s+(?:and|и)\s+/i).map(interfaceName).filter(Boolean);
}

// This describes generated scaffolding, never a verified user outcome.
export function scaffoldCapability(data = {}) {
  const runtime = data.runtimeFamily || "codex-native";
  const primaryInterfaces = interfaceNames(data.primaryInterface || "Codex project");
  const primary = primaryInterfaces[0] || null;
  const interfaces = [...new Set([...primaryInterfaces, ...interfaceNames(data.secondaryInterfaces),
    ...(data.telegramMode && data.telegramMode !== "none" ? ["telegram"] : [])].filter(Boolean))];
  const noManagedOperations = (!data.serviceMode || data.serviceMode === "none")
    && (!data.autostart || ["disabled", "optional"].includes(data.autostart))
    && (!data.proactiveMode || ["none", "manual"].includes(data.proactiveMode));
  const base = { schema: "pritha-scaffold-capability-v1", runtime: runtimeFamilies.has(runtime) ? runtime : "unknown",
    primaryInterface: primary, interfaces, operationsSelected: !noManagedOperations, readinessScope: "scaffold-only" };
  const unsupported = (reason, nextAction) => ({ ...base, supported: false, adapter: null, reason, nextAction });
  if (!runtimeFamilies.has(runtime)) return unsupported("runtime-unknown", "Choose a supported runtime in a reviewed contract revision.");
  if (runtime === "hybrid" && data.serviceMode === "process") {
    const kind = typeof data.agentKind === "string" ? data.agentKind : data.agentKind?.kind;
    if (kind !== "service" || primary !== "web"
      || !interfaces.includes("telegram") || interfaces.some(name => !["web", "telegram"].includes(name))
      || data.telegramMode !== "operator-control" || data.runtimePlacementProfile !== "deterministic-first"
      || !["none", "manual"].includes(data.proactiveMode)
      || !["disabled", "optional"].includes(data.autostart)
      || data.repositoryAdoptionMode !== "none" || data.skillNeeds !== "none" || data.mcpNeeds !== "none"
      || !/^(?:structured-json|bounded atomic json state)(?:$|[;,])/i.test(String(data.memoryModel || ""))
      || !/^high\b/i.test(String(data.untrustedInputPolicy || ""))) {
      return unsupported("hybrid-process-combination-adapter-missing", "The editor-only hybrid adapter requires an explicit service, web plus Telegram operator-control, deterministic-first placement, bounded atomic JSON state, high untrusted-input policy, no skills/MCP/repository adoption, manual/no proactivity and disabled/optional autostart.");
    }
    return { ...base, supported: true, adapter: "hybrid-editor-process-v1", reason: "editor-only-process-service-scaffold", nextAction: "Implement the approved deterministic service and tool-free editor; independently verify input, approval and fallback boundaries. Scaffold starts no process or integration." };
  }
  if (primary === "mcp-stdio") {
    const kind = typeof data.agentKind === "string" ? data.agentKind : data.agentKind?.kind;
    const web = interfaces.includes("web");
    if (kind !== "tool-server" || runtime !== "cli"
      || interfaces.some(name => !["mcp-stdio", "web", "cli"].includes(name))
      || (web ? data.serviceMode !== "process" : ![undefined, "none"].includes(data.serviceMode))
      || (data.autostart && !["disabled", "optional"].includes(data.autostart))
      || (data.proactiveMode && data.proactiveMode !== "none")
      || (data.repositoryAdoptionMode && data.repositoryAdoptionMode !== "none")) {
      return unsupported("tool-server-combination-adapter-missing", "The stdio tool-server adapter requires cli runtime, explicit tool-server kind, optional web/CLI, process operations only for the web surface, no proactivity or repository adoption, and disabled/optional autostart.");
    }
    return { ...base, supported: true, adapter: "tool-server-stdio-v1", reason: "stdio-provider-with-optional-owner-ui", nextAction: "Implement the approved MCP tools and optional owner UI; independent Outcome Trials must verify each surface. Scaffold starts no process." };
  }
  if (runtime === "api" && data.serviceMode === "process") {
    if (!interfaces.length || interfaces.some(name => !["web", "api"].includes(name))
      || (data.autostart && !["disabled", "optional"].includes(data.autostart))
      || (data.proactiveMode && data.proactiveMode !== "none")
      || (data.repositoryAdoptionMode && data.repositoryAdoptionMode !== "none")) {
      return unsupported("api-process-combination-adapter-missing", "The API process adapter supports only web/API, no proactivity or repository adoption, and disabled/optional autostart.");
    }
    return { ...base, supported: true, adapter: "api-process-v1", reason: "api-process-service-scaffold", nextAction: "Implement the approved HTTP service and managed lifecycle, then run independent Outcome Trials; no service starts during scaffold." };
  }
  if (!["codex-native", "cli"].includes(runtime)) return unsupported("runtime-adapter-missing", `Implement and review a ${runtime} scaffold adapter; the accepted contract is preserved.`);
  if (primary === "cli" && interfaces.length === 1 && noManagedOperations) {
    if (data.repositoryAdoptionMode === "selected-module") return unsupported("cli-module-adapter-missing", "Prepare a reviewed CLI module-install adapter for the selected repository before scaffold.");
    return { ...base, supported: true, adapter: "headless-cli-v1", reason: "headless-command-workspace", nextAction: "Create the CLI harness, implement the approved Outcome, then run its independent Trials." };
  }
  if (runtime === "cli") return unsupported("cli-combination-adapter-missing", "The minimal CLI adapter requires a CLI-only interface and no managed service or schedule. Add the requested adapter or review an explicit contract revision.");
  if (interfaces.includes("custom")) return unsupported("interface-adapter-missing", "Define and review the custom interface adapter before creating its scaffold.");
  return { ...base, supported: true, adapter: "codex-workspace-v1", reason: "existing-codex-workspace-adapter", nextAction: "Create the selected harness modules; interface placeholders still require Outcome implementation and Trials." };
}

export function assertScaffoldCapability(data) {
  const capability = scaffoldCapability(data);
  if (!capability.supported) {
    const error = new Error(`Scaffold capability: ${capability.reason}. ${capability.nextAction}`);
    error.code = "scaffold_adapter_unavailable";
    error.capability = capability;
    throw error;
  }
  return capability;
}
