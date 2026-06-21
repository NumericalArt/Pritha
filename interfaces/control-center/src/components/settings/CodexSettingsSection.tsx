"use client";

import { useEffect, useState } from "react";
import { Bot, Code2, Save, Terminal, Zap } from "lucide-react";

type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
type CodexServiceTier = "standard" | "fast";

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
  updatedAt: string;
};

type TransportStatus = Record<string, { available?: boolean; detail?: string }>;

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  deepTaskPrimaryTransport: "codex-app",
  codexModel: "gpt-5.5",
  codexReasoningEffort: "medium",
  codexServiceTier: "standard",
  codexWorkdir: "",
  codexSandbox: "auto",
  codexNetworkAccess: true,
  codexApproval: "never",
  codexTimeoutMs: 300_000,
  updatedAt: "",
};

const MODEL_OPTIONS = [
  { id: "gpt-5.5", label: "GPT-5.5", fast: true },
  { id: "gpt-5.4", label: "GPT-5.4", fast: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", fast: false },
  { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", fast: false },
  { id: "", label: "Codex default", fast: false },
] as const;

const REASONING_OPTIONS: Array<{ id: CodexReasoningEffort; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Very High" },
];

function modelSupportsFastMode(model: string) {
  return model === "gpt-5.5" || model === "gpt-5.4";
}

export function CodexSettingsSection() {
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [runtimeSettingsLoaded, setRuntimeSettingsLoaded] = useState(false);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>({});
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadRuntimeSettings();
  }, []);

  async function loadRuntimeSettings() {
    setRuntimeSettingsLoaded(false);
    const response = await fetch("/api/realtime/runtime-settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      settings?: RuntimeSettings;
      transports?: TransportStatus;
    } | null;
    if (!payload) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
    setTransportStatus(payload.transports || {});
    setRuntimeSettingsLoaded(true);
    setRuntimeStatus("");
  }

  async function saveRuntimeSettings() {
    setSaving(true);
    setRuntimeStatus("");
    const response = await fetch("/api/realtime/runtime-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deepTaskPrimaryTransport: runtimeSettings.deepTaskPrimaryTransport,
        codexModel: runtimeSettings.codexModel,
        codexReasoningEffort: runtimeSettings.codexReasoningEffort,
        codexServiceTier: runtimeSettings.codexServiceTier,
        codexWorkdir: runtimeSettings.codexWorkdir,
        codexSandbox: runtimeSettings.codexSandbox,
        codexNetworkAccess: runtimeSettings.codexNetworkAccess,
        codexTimeoutMs: runtimeSettings.codexTimeoutMs,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setRuntimeStatus("Failed to save Codex runtime settings");
      return;
    }
    const payload = (await response.json()) as { settings?: RuntimeSettings; transports?: TransportStatus };
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
    setTransportStatus(payload.transports || {});
    setRuntimeStatus("Codex runtime settings saved");
  }

  function updateRuntimeSetting<K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  }

  function selectModel(model: string) {
    setRuntimeSettings((current) => ({
      ...current,
      codexModel: model,
      codexServiceTier: modelSupportsFastMode(model) ? current.codexServiceTier : "standard",
    }));
  }

  const appAvailable = transportStatus.codex_app?.available;
  const cliAvailable = transportStatus.codex_cli?.available;
  const fastSupported = modelSupportsFastMode(runtimeSettings.codexModel);
  const fastStatus = fastSupported ? "Fast mode uses included Codex limits faster when ChatGPT auth supports it." : "Fast mode is unavailable for this model.";

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
          <div className="settings-rowline">
            <div>
              <strong>Model</strong>
              <span>Default model for new Codex deep tasks.</span>
            </div>
            <select value={runtimeSettings.codexModel} aria-label="Codex model" onChange={(event) => selectModel(event.currentTarget.value)}>
              {MODEL_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Reasoning Level</strong>
              <span>Higher levels can improve complex work but use more time and quota.</span>
            </div>
            <div className="settings-segmented-control" role="radiogroup" aria-label="Codex reasoning level">
              {REASONING_OPTIONS.map((option) => (
                <button
                  className={runtimeSettings.codexReasoningEffort === option.id ? "active" : ""}
                  type="button"
                  role="radio"
                  aria-checked={runtimeSettings.codexReasoningEffort === option.id}
                  onClick={() => updateRuntimeSetting("codexReasoningEffort", option.id)}
                  key={option.id}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Speed</strong>
              <span>{fastStatus}</span>
            </div>
            <div className="settings-segmented-control compact" role="radiogroup" aria-label="Codex speed">
              <button
                className={runtimeSettings.codexServiceTier === "standard" ? "active" : ""}
                type="button"
                role="radio"
                aria-checked={runtimeSettings.codexServiceTier === "standard"}
                onClick={() => updateRuntimeSetting("codexServiceTier", "standard")}
              >
                Standard
              </button>
              <button
                className={runtimeSettings.codexServiceTier === "fast" ? "active" : ""}
                type="button"
                role="radio"
                aria-checked={runtimeSettings.codexServiceTier === "fast"}
                disabled={!fastSupported}
                onClick={() => fastSupported && updateRuntimeSetting("codexServiceTier", "fast")}
              >
                <Zap size={14} />
                Fast
              </button>
            </div>
          </div>
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
