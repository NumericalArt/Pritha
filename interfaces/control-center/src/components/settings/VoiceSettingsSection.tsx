"use client";

import { useEffect, useState } from "react";
import { Bot, MemoryStick, Save, Terminal } from "lucide-react";
import { readStickyContextSetting, writeStickyContextSetting } from "@/components/voice/voicePreferences";

type RuntimeSettings = {
  deepTaskPrimaryTransport: "codex-app" | "codex-cli";
  codexModel: string;
  codexWorkdir: string;
  codexSandbox: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess: boolean;
  codexApproval: "never";
  codexTimeoutMs: number;
  updatedAt: string;
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  deepTaskPrimaryTransport: "codex-app",
  codexModel: "",
  codexWorkdir: "",
  codexSandbox: "auto",
  codexNetworkAccess: true,
  codexApproval: "never",
  codexTimeoutMs: 300_000,
  updatedAt: "",
};

export function VoiceSettingsSection() {
  const [stickyContextEnabled, setStickyContextEnabled] = useState(true);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [transportStatus, setTransportStatus] = useState<Record<string, { available?: boolean; detail?: string }>>({});
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStickyContextEnabled(readStickyContextSetting(true));
    void loadRuntimeSettings();
  }, []);

  function updateStickyContext(enabled: boolean) {
    setStickyContextEnabled(enabled);
    writeStickyContextSetting(enabled);
  }

  async function loadRuntimeSettings() {
    const response = await fetch("/api/realtime/runtime-settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const payload = (await response.json()) as { settings?: RuntimeSettings; transports?: Record<string, { available?: boolean; detail?: string }> };
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
    setTransportStatus(payload.transports || {});
  }

  async function saveRuntimeSettings() {
    setSaving(true);
    setRuntimeStatus("");
    const response = await fetch("/api/realtime/runtime-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(runtimeSettings),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setRuntimeStatus("Failed to save runtime settings");
      return;
    }
    const payload = (await response.json()) as { settings?: RuntimeSettings; transports?: Record<string, { available?: boolean; detail?: string }> };
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
    setTransportStatus(payload.transports || {});
    setRuntimeStatus("Runtime settings saved");
  }

  function updateRuntimeSetting<K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  }

  const appAvailable = transportStatus.codex_app?.available;
  const cliAvailable = transportStatus.codex_cli?.available;

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <MemoryStick size={22} />
          </span>
          <div>
            <h2>Voice</h2>
            <p>Live session behavior</p>
          </div>
        </div>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Sticky Context</strong>
          <span>Default on. Pins current-session recap and Codex task state into the live Realtime dialogue.</span>
        </div>
        <label className="settings-switch" aria-label="Sticky Context">
          <input type="checkbox" checked={stickyContextEnabled} onChange={(event) => updateStickyContext(event.currentTarget.checked)} />
          <span />
        </label>
      </div>
      <div className="settings-rowline codex-transport-row">
        <div>
          <strong>Deep Task Transport</strong>
          <span>Primary route for realtime Codex work. Codex App is default; Codex CLI is v1 fallback.</span>
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
          <strong>Codex Sandbox</strong>
          <span>Auto follows task type and write mode. Voice-confirmed system changes may use workspace-write.</span>
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
          {saving ? "Saving" : "Save Voice Runtime"}
        </button>
        <span>{runtimeStatus || `Approval: ${runtimeSettings.codexApproval}`}</span>
      </div>
    </section>
  );
}
