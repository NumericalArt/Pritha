"use client";

import { useEffect, useState } from "react";
import { Bot, Code2, Save, Terminal, Zap } from "lucide-react";
import {
  FALLBACK_CODEX_MODELS,
  codexModelSupportsFast,
  codexReasoningEffortLabel,
  fallbackCodexModelCatalog,
  reconcileCodexSelectionForModel,
  type CodexModelCatalog,
  type CodexReasoningEffort,
  type CodexServiceTier,
} from "@/lib/settings/codex-model-catalog";

type CodexPlanningMode = "off" | "inline_required" | "planner";
type CodexExecutionMode = "inline_only" | "orchestrator_enabled" | "orchestrator_preferred";
type CodexVoiceProgressVerbosity = "brief" | "normal" | "detailed";
type CodexAppThreadRoutingMode = "per_task" | "control" | "subject_scoped" | "subject_scoped_rotate";

type RuntimeSettings = {
  deepTaskPrimaryTransport: "codex-app" | "codex-cli";
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  codexServiceTier: CodexServiceTier;
  codexWorkdir: string;
  codexSandbox: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess: boolean;
  codexApproval: "never";
  codexTimeoutMs: number;
  codexPromptTokenBudget: number;
  codexPlanningMode: CodexPlanningMode;
  codexExecutionMode: CodexExecutionMode;
  codexMaxPlanSteps: number;
  codexAskBeforeOrchestration: boolean;
  codexVoiceProgressVerbosity: CodexVoiceProgressVerbosity;
  codexAppThreadRoutingMode: CodexAppThreadRoutingMode;
  codexAppThreadMaxTurns: number;
  codexAppThreadMaxAgeHours: number;
  updatedAt: string;
};

type TransportStatus = Record<string, { available?: boolean; detail?: string }>;

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  deepTaskPrimaryTransport: "codex-app",
  codexModel: "gpt-5.6-sol",
  codexReasoningEffort: "medium",
  codexServiceTier: "standard",
  codexWorkdir: "",
  codexSandbox: "auto",
  codexNetworkAccess: true,
  codexApproval: "never",
  codexTimeoutMs: 300_000,
  codexPromptTokenBudget: 24_000,
  codexPlanningMode: "planner",
  codexExecutionMode: "inline_only",
  codexMaxPlanSteps: 7,
  codexAskBeforeOrchestration: true,
  codexVoiceProgressVerbosity: "normal",
  codexAppThreadRoutingMode: "subject_scoped",
  codexAppThreadMaxTurns: 24,
  codexAppThreadMaxAgeHours: 168,
  updatedAt: "",
};

function clampPlanSteps(value: unknown, fallback = DEFAULT_RUNTIME_SETTINGS.codexMaxPlanSteps) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

export function CodexSettingsSection() {
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [modelCatalog, setModelCatalog] = useState<CodexModelCatalog>(() => fallbackCodexModelCatalog(new Date(0)));
  const [runtimeSettingsLoaded, setRuntimeSettingsLoaded] = useState(false);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>({});
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [maxPlanStepsDraft, setMaxPlanStepsDraft] = useState(String(DEFAULT_RUNTIME_SETTINGS.codexMaxPlanSteps));
  const [selectionNotice, setSelectionNotice] = useState("");

  useEffect(() => {
    void loadRuntimeSettings();
  }, []);

  async function loadRuntimeSettings() {
    setRuntimeSettingsLoaded(false);
    const [runtimeResponse, catalogResponse] = await Promise.all([
      fetch("/api/realtime/runtime-settings", { cache: "no-store" }).catch(() => null),
      fetch("/api/settings/codex-models", { cache: "no-store" }).catch(() => null),
    ]);
    const catalogPayload = catalogResponse?.ok ? ((await catalogResponse.json().catch(() => null)) as CodexModelCatalog | null) : null;
    if (catalogPayload && Array.isArray(catalogPayload.models) && catalogPayload.models.length) {
      setModelCatalog(catalogPayload);
    } else {
      setModelCatalog({
        ...fallbackCodexModelCatalog(),
        warning: "Catalog endpoint unavailable; built-in fallback is active.",
      });
    }
    if (!runtimeResponse?.ok) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const payload = (await runtimeResponse.json().catch(() => null)) as {
      settings?: RuntimeSettings;
      transports?: TransportStatus;
    } | null;
    if (!payload) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const loadedSettings = { ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings };
    const forcedInline = loadedSettings.codexReasoningEffort === "ultra" && loadedSettings.codexExecutionMode !== "inline_only";
    const nextSettings = forcedInline ? { ...loadedSettings, codexExecutionMode: "inline_only" as const } : loadedSettings;
    setRuntimeSettings(nextSettings);
    setMaxPlanStepsDraft(String(clampPlanSteps(nextSettings.codexMaxPlanSteps)));
    setTransportStatus(payload.transports || {});
    setRuntimeSettingsLoaded(true);
    setRuntimeStatus("");
    setSelectionNotice(forcedInline ? "Ultra includes automatic task delegation; Execution Mode was set to Inline only to avoid nested orchestration." : "");
  }

  async function saveRuntimeSettings() {
    setSaving(true);
    setRuntimeStatus("");
    const settingsToSave = {
      ...runtimeSettings,
      codexMaxPlanSteps: clampPlanSteps(runtimeSettings.codexMaxPlanSteps),
    };
    setRuntimeSettings(settingsToSave);
    setMaxPlanStepsDraft(String(settingsToSave.codexMaxPlanSteps));
    const response = await fetch("/api/realtime/runtime-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deepTaskPrimaryTransport: settingsToSave.deepTaskPrimaryTransport,
        codexModel: settingsToSave.codexModel,
        codexReasoningEffort: settingsToSave.codexReasoningEffort,
        codexServiceTier: settingsToSave.codexServiceTier,
        codexWorkdir: settingsToSave.codexWorkdir,
        codexSandbox: settingsToSave.codexSandbox,
        codexNetworkAccess: settingsToSave.codexNetworkAccess,
        codexTimeoutMs: settingsToSave.codexTimeoutMs,
        codexPromptTokenBudget: settingsToSave.codexPromptTokenBudget,
        codexPlanningMode: settingsToSave.codexPlanningMode,
        codexExecutionMode: settingsToSave.codexExecutionMode,
        codexMaxPlanSteps: settingsToSave.codexMaxPlanSteps,
        codexAskBeforeOrchestration: settingsToSave.codexAskBeforeOrchestration,
        codexVoiceProgressVerbosity: settingsToSave.codexVoiceProgressVerbosity,
        codexAppThreadRoutingMode: settingsToSave.codexAppThreadRoutingMode,
        codexAppThreadMaxTurns: settingsToSave.codexAppThreadMaxTurns,
        codexAppThreadMaxAgeHours: settingsToSave.codexAppThreadMaxAgeHours,
      }),
    }).catch(() => null);
    setSaving(false);
    const payload = (await response?.json().catch(() => null)) as { settings?: RuntimeSettings; transports?: TransportStatus; error?: string } | null;
    if (!response?.ok || !payload) {
      setRuntimeStatus(payload?.error ? `Failed to save: ${payload.error}` : "Failed to save Codex runtime settings");
      return;
    }
    const nextSettings = { ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings };
    setRuntimeSettings(nextSettings);
    setMaxPlanStepsDraft(String(clampPlanSteps(nextSettings.codexMaxPlanSteps)));
    setTransportStatus(payload.transports || {});
    setRuntimeStatus("Codex runtime settings saved");
    setSelectionNotice("");
  }

  function updateRuntimeSetting<K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  }

  function selectModel(model: string) {
    const catalogModel = modelCatalog.models.find((item) => item.id === model);
    if (!catalogModel) {
      setRuntimeSettings((current) => ({ ...current, codexModel: model }));
      return;
    }
    const next = reconcileCodexSelectionForModel(catalogModel, {
      model: runtimeSettings.codexModel,
      effort: runtimeSettings.codexReasoningEffort,
      serviceTier: runtimeSettings.codexServiceTier,
    });
    const notices: string[] = [];
    if (next.effortChanged) {
      notices.push(`${codexReasoningEffortLabel(runtimeSettings.codexReasoningEffort)} is unavailable for ${catalogModel.label}; using ${codexReasoningEffortLabel(next.effort)}.`);
    }
    if (next.serviceTierChanged) notices.push(`Fast is unavailable for ${catalogModel.label}; using Standard.`);
    setSelectionNotice(notices.join(" "));
    setRuntimeSettings({
      ...runtimeSettings,
      codexModel: next.model,
      codexReasoningEffort: next.effort,
      codexServiceTier: next.serviceTier,
    });
  }

  function selectReasoningEffort(effort: CodexReasoningEffort) {
    const forceInline = effort === "ultra" && runtimeSettings.codexExecutionMode !== "inline_only";
    setSelectionNotice(forceInline ? "Ultra includes automatic task delegation; Execution Mode was set to Inline only to avoid nested orchestration." : "");
    setRuntimeSettings({
      ...runtimeSettings,
      codexReasoningEffort: effort,
      codexExecutionMode: forceInline ? "inline_only" : runtimeSettings.codexExecutionMode,
    });
  }

  function updateMaxPlanStepsDraft(value: string) {
    setMaxPlanStepsDraft(value);
    if (value.trim() === "") return;
    const nextValue = clampPlanSteps(value, runtimeSettings.codexMaxPlanSteps);
    setMaxPlanStepsDraft(String(nextValue));
    updateRuntimeSetting("codexMaxPlanSteps", nextValue);
  }

  function commitMaxPlanStepsDraft() {
    const nextValue = maxPlanStepsDraft.trim() === "" ? runtimeSettings.codexMaxPlanSteps : clampPlanSteps(maxPlanStepsDraft, runtimeSettings.codexMaxPlanSteps);
    updateRuntimeSetting("codexMaxPlanSteps", nextValue);
    setMaxPlanStepsDraft(String(nextValue));
  }

  const appAvailable = transportStatus.codex_app?.available;
  const cliAvailable = transportStatus.codex_cli?.available;
  const selectedModel = modelCatalog.models.find((model) => model.id === runtimeSettings.codexModel);
  const modelOptions = selectedModel
    ? modelCatalog.models
    : [
        {
          ...FALLBACK_CODEX_MODELS[0],
          id: runtimeSettings.codexModel,
          label: `${runtimeSettings.codexModel || "Codex default"} — Unavailable/custom`,
          isDefault: false,
          defaultReasoningEffort: runtimeSettings.codexReasoningEffort,
          supportedReasoningEfforts: [],
          serviceTiers: [],
        },
        ...modelCatalog.models,
      ];
  const advertisedEfforts = selectedModel?.supportedReasoningEfforts || [];
  const selectedEffort = advertisedEfforts.find((effort) => effort.id === runtimeSettings.codexReasoningEffort);
  const reasoningOptions = selectedEffort
    ? advertisedEfforts
    : [
        {
          id: runtimeSettings.codexReasoningEffort,
          label: `${codexReasoningEffortLabel(runtimeSettings.codexReasoningEffort)} — Unavailable/custom`,
          description: "This saved effort is not advertised by the current local Codex catalog.",
        },
        ...advertisedEfforts,
      ];
  const fastSupported = Boolean(selectedModel && codexModelSupportsFast(selectedModel));
  const fastStatus = fastSupported
    ? "Fast is about 1.5x quicker and increases Codex usage."
    : !selectedModel && runtimeSettings.codexServiceTier === "fast"
      ? "The saved Fast setting is preserved, but this custom model is unavailable in the current catalog."
      : "Fast is unavailable for this model.";
  const effortStatus = runtimeSettings.codexReasoningEffort === "ultra"
    ? "Ultra includes automatic task delegation; keep Execution Mode inline to avoid nested orchestration."
    : selectedEffort?.description || "This saved effort is unavailable in the current local catalog.";
  const catalogTime = modelCatalog.refreshedAt && modelCatalog.refreshedAt !== new Date(0).toISOString()
    ? new Date(modelCatalog.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "pending";

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <Code2 size={22} />
          </span>
          <div>
            <h2>Codex</h2>
            <p>Deep task runtime</p>
          </div>
        </div>
      </div>
      {!runtimeSettingsLoaded ? (
        <div className="settings-rowline">
          <div>
            <strong>Codex Runtime</strong>
            <span>{runtimeStatus || "Loading saved Codex runtime settings..."}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="settings-rowline codex-transport-row">
            <div>
              <strong>Deep Task Transport</strong>
              <span>Primary route for realtime Codex work. Codex App is default; Codex CLI is fallback.</span>
            </div>
            <select
              value={runtimeSettings.deepTaskPrimaryTransport}
              aria-label="Deep task primary transport"
              onChange={(event) => updateRuntimeSetting("deepTaskPrimaryTransport", event.currentTarget.value as RuntimeSettings["deepTaskPrimaryTransport"])}
            >
              <option value="codex-app">Codex App</option>
              <option value="codex-cli">Codex CLI</option>
            </select>
          </div>
          <div className="codex-transport-status" aria-label="Codex transport status">
            <span className={appAvailable ? "good" : ""}>
              <Bot size={16} />
              Codex App {appAvailable ? "ready" : "unavailable"}
            </span>
            <span className={cliAvailable ? "good" : ""}>
              <Terminal size={16} />
              Codex CLI {cliAvailable ? "ready" : "unavailable"}
            </span>
            <span>Session Contract reserved</span>
          </div>
          <div className="codex-catalog-meta" aria-label="Codex model catalog status">
            <span className={modelCatalog.source === "app-server" ? "good" : "warn"}>
              Model catalog: {modelCatalog.source === "app-server" ? "local Codex App" : "built-in fallback"}
            </span>
            <span>Refreshed {catalogTime}</span>
            {modelCatalog.warning ? <span className="warn">{modelCatalog.warning}</span> : null}
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Thread Routing</strong>
              <span>Subject scoped keeps one Codex App thread per agent or Pritha subsystem. Per task is the isolation fallback.</span>
            </div>
            <select
              value={runtimeSettings.codexAppThreadRoutingMode}
              aria-label="Codex App thread routing mode"
              onChange={(event) => updateRuntimeSetting("codexAppThreadRoutingMode", event.currentTarget.value as RuntimeSettings["codexAppThreadRoutingMode"])}
            >
              <option value="subject_scoped">Subject scoped</option>
              <option value="per_task">Per task</option>
              <option value="control">Control thread</option>
              <option value="subject_scoped_rotate">Subject scoped + rotation</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Thread Rotation</strong>
              <span>Used by subject scoped + rotation to start a new generation before a thread gets too long.</span>
            </div>
            <div className="settings-inline-fields">
              <input
                className="settings-number-input"
                type="number"
                min={4}
                max={100}
                step={1}
                value={runtimeSettings.codexAppThreadMaxTurns}
                aria-label="Codex App thread max turns"
                onChange={(event) => updateRuntimeSetting("codexAppThreadMaxTurns", Math.max(4, Math.min(100, Number(event.currentTarget.value) || 24)))}
              />
              <input
                className="settings-number-input"
                type="number"
                min={1}
                max={720}
                step={1}
                value={runtimeSettings.codexAppThreadMaxAgeHours}
                aria-label="Codex App thread max age hours"
                onChange={(event) => updateRuntimeSetting("codexAppThreadMaxAgeHours", Math.max(1, Math.min(720, Number(event.currentTarget.value) || 168)))}
              />
            </div>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Model</strong>
              <span>Available models come from the installed local Codex App.</span>
            </div>
            <select value={runtimeSettings.codexModel} aria-label="Codex model" onChange={(event) => selectModel(event.currentTarget.value)}>
              {modelOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}{option.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Reasoning Level</strong>
              <span>{effortStatus}</span>
            </div>
            <select
              value={runtimeSettings.codexReasoningEffort}
              aria-label="Codex reasoning level"
              onChange={(event) => selectReasoningEffort(event.currentTarget.value)}
            >
              {reasoningOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Speed</strong>
              <span>{fastStatus}</span>
            </div>
            <div className={`settings-segmented-control compact${fastSupported ? "" : " single"}`} role="radiogroup" aria-label="Codex speed">
              <button
                className={runtimeSettings.codexServiceTier === "standard" ? "active" : ""}
                type="button"
                role="radio"
                aria-checked={runtimeSettings.codexServiceTier === "standard"}
                disabled={!selectedModel}
                onClick={() => updateRuntimeSetting("codexServiceTier", "standard")}
              >
                Standard
              </button>
              {fastSupported ? (
                <button
                  className={runtimeSettings.codexServiceTier === "fast" ? "active" : ""}
                  type="button"
                  role="radio"
                  aria-checked={runtimeSettings.codexServiceTier === "fast"}
                  onClick={() => updateRuntimeSetting("codexServiceTier", "fast")}
                >
                  <Zap size={14} />
                  Fast
                </button>
              ) : null}
            </div>
          </div>
          {selectionNotice ? <div className="codex-selection-notice" role="status">{selectionNotice}</div> : null}
          <div className="settings-rowline">
            <div>
              <strong>Codex Sandbox</strong>
              <span>Auto follows task type and write mode. Risky actions still require UI approval.</span>
            </div>
            <select
              value={runtimeSettings.codexSandbox}
              aria-label="Codex sandbox policy"
              onChange={(event) => updateRuntimeSetting("codexSandbox", event.currentTarget.value as RuntimeSettings["codexSandbox"])}
            >
              <option value="auto">Auto</option>
              <option value="read-only">Read-only</option>
              <option value="workspace-write">Workspace-write</option>
              <option value="danger-full-access">Danger full access</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Network Access</strong>
              <span>Allow Codex deep tasks to verify current sources when the task needs it.</span>
            </div>
            <label className="settings-switch" aria-label="Codex network access">
              <input type="checkbox" checked={runtimeSettings.codexNetworkAccess} onChange={(event) => updateRuntimeSetting("codexNetworkAccess", event.currentTarget.checked)} />
              <span />
            </label>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Task Timeout</strong>
              <span>Maximum runtime for Codex App or CLI deep task execution.</span>
            </div>
            <input
              className="settings-number-input"
              type="number"
              min={10}
              max={3600}
              step={10}
              value={Math.round(runtimeSettings.codexTimeoutMs / 1000)}
              aria-label="Codex task timeout seconds"
              onChange={(event) => updateRuntimeSetting("codexTimeoutMs", Math.max(10, Number(event.currentTarget.value) || 300) * 1000)}
            />
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Prompt Budget</strong>
              <span>Estimated outbound prompt tokens before compacting older context.</span>
            </div>
            <input
              className="settings-number-input"
              type="number"
              min={4000}
              max={120000}
              step={1000}
              value={runtimeSettings.codexPromptTokenBudget}
              aria-label="Codex prompt token budget"
              onChange={(event) => updateRuntimeSetting("codexPromptTokenBudget", Math.max(4000, Math.min(120000, Number(event.currentTarget.value) || 24000)))}
            />
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Planning Mode</strong>
              <span>Controls whether new Codex App tasks create a plan before execution.</span>
            </div>
            <select
              value={runtimeSettings.codexPlanningMode}
              aria-label="Codex planning mode"
              onChange={(event) => updateRuntimeSetting("codexPlanningMode", event.currentTarget.value as RuntimeSettings["codexPlanningMode"])}
            >
              <option value="planner">Planner pass</option>
              <option value="inline_required">Inline required</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Execution Mode</strong>
              <span>
                {runtimeSettings.codexReasoningEffort === "ultra"
                  ? "Ultra delegates automatically, so outer orchestration stays Inline only."
                  : "Inline keeps one Codex turn. Orchestrator can run the plan step by step for testing."}
              </span>
            </div>
            <select
              value={runtimeSettings.codexExecutionMode}
              aria-label="Codex execution mode"
              disabled={runtimeSettings.codexReasoningEffort === "ultra"}
              onChange={(event) => updateRuntimeSetting("codexExecutionMode", event.currentTarget.value as RuntimeSettings["codexExecutionMode"])}
            >
              <option value="inline_only">Inline only</option>
              <option value="orchestrator_enabled">Orchestrator when recommended</option>
              <option value="orchestrator_preferred">Orchestrator preferred</option>
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Plan Steps</strong>
              <span>Maximum number of planner steps stored and executed.</span>
            </div>
            <input
              className="settings-number-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              step={1}
              value={maxPlanStepsDraft}
              aria-label="Codex maximum plan steps"
              onBlur={commitMaxPlanStepsDraft}
              onChange={(event) => updateMaxPlanStepsDraft(event.currentTarget.value)}
            />
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Ask Before Orchestration</strong>
              <span>Pause when the planner says operator input is required.</span>
            </div>
            <label className="settings-switch" aria-label="Codex ask before orchestration">
              <input
                type="checkbox"
                checked={runtimeSettings.codexAskBeforeOrchestration}
                onChange={(event) => updateRuntimeSetting("codexAskBeforeOrchestration", event.currentTarget.checked)}
              />
              <span />
            </label>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Voice Progress</strong>
              <span>Controls how much semantic Codex progress Voice Control should prefer.</span>
            </div>
            <select
              value={runtimeSettings.codexVoiceProgressVerbosity}
              aria-label="Codex voice progress verbosity"
              onChange={(event) => updateRuntimeSetting("codexVoiceProgressVerbosity", event.currentTarget.value as RuntimeSettings["codexVoiceProgressVerbosity"])}
            >
              <option value="brief">Brief</option>
              <option value="normal">Normal</option>
              <option value="detailed">Detailed</option>
            </select>
          </div>
          <div className="settings-action-row">
            <button className="outline-button" type="button" onClick={saveRuntimeSettings} disabled={saving}>
              <Save size={16} />
              {saving ? "Saving" : "Save Codex Runtime"}
            </button>
            <span>{runtimeStatus || `Approval: ${runtimeSettings.codexApproval}`}</span>
          </div>
        </>
      )}
    </section>
  );
}
