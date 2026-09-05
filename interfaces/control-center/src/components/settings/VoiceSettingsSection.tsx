"use client";

import { useEffect, useState } from "react";
import { MemoryStick, Save } from "lucide-react";
import {
  PRITHA_FEMININE_VOICE_OPTIONS,
  VOICE_BEHAVIOR_PROFILE_OPTIONS,
  type PrithaVoiceId,
  type VoiceBehaviorProfile,
} from "@/lib/realtime/voice-settings";
import { readStickyContextSetting, writeStickyContextSetting } from "@/components/voice/voicePreferences";

type RuntimeSettings = {
  voiceBehaviorProfile: VoiceBehaviorProfile;
  prithaVoice: PrithaVoiceId;
  updatedAt: string;
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  voiceBehaviorProfile: "advanced",
  prithaVoice: "marin",
  updatedAt: "",
};

export function VoiceSettingsSection() {
  const [stickyContextEnabled, setStickyContextEnabled] = useState(true);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [runtimeSettingsLoaded, setRuntimeSettingsLoaded] = useState(false);
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
    setRuntimeSettingsLoaded(false);
    const response = await fetch("/api/realtime/runtime-settings", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      settings?: RuntimeSettings;
    } | null;
    if (!payload) {
      setRuntimeStatus("Runtime settings unavailable");
      return;
    }
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
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
        voiceBehaviorProfile: runtimeSettings.voiceBehaviorProfile,
        prithaVoice: runtimeSettings.prithaVoice,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setRuntimeStatus("Failed to save runtime settings");
      return;
    }
    const payload = (await response.json().catch(() => null)) as { settings?: RuntimeSettings; ok?: boolean } | null;
    if (!payload?.settings || payload.ok === false) { setRuntimeStatus("Failed to save runtime settings"); return; }
    setRuntimeSettings({ ...DEFAULT_RUNTIME_SETTINGS, ...payload.settings });
    setRuntimeStatus("Runtime settings saved");
  }

  function updateRuntimeSetting<K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  }

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
      {!runtimeSettingsLoaded ? (
        <div className="settings-rowline">
          <div>
            <strong>Voice Runtime</strong>
            <span>{runtimeStatus || "Loading saved voice runtime settings..."}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="settings-rowline">
            <div>
              <strong>Behavior Detail</strong>
              <span>Default depth for spoken Pritha answers. The operator can still ask for simpler or deeper answers in a session.</span>
            </div>
            <select
              value={runtimeSettings.voiceBehaviorProfile}
              aria-label="Voice behavior detail level"
              onChange={(event) => updateRuntimeSetting("voiceBehaviorProfile", event.currentTarget.value as RuntimeSettings["voiceBehaviorProfile"])}
            >
              {VOICE_BEHAVIOR_PROFILE_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-rowline">
            <div>
              <strong>Pritha Voice</strong>
              <span>Approved feminine voices only. Changes apply on the next voice session or reconnect.</span>
            </div>
            <select
              value={runtimeSettings.prithaVoice}
              aria-label="Pritha voice"
              onChange={(event) => updateRuntimeSetting("prithaVoice", event.currentTarget.value as RuntimeSettings["prithaVoice"])}
            >
              {PRITHA_FEMININE_VOICE_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-action-row">
            <button className="outline-button" type="button" onClick={saveRuntimeSettings} disabled={saving}>
              <Save size={16} />
              {saving ? "Saving" : "Save Voice Runtime"}
            </button>
            <span role="status">{runtimeStatus || "Changes apply on the next voice session or reconnect."}</span>
          </div>
        </>
      )}
    </section>
  );
}
