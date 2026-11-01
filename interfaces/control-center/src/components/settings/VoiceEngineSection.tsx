"use client";
import { useEffect, useState } from "react";
import type { VoiceEngine } from "@/lib/settings/provider-profile";
import {CHAINED_VOICES,DEFAULT_CHAINED_VOICE_SETTINGS,type ChainedVoiceSettings} from "@/lib/voice/settings";
type VoiceStatus = { preference: VoiceEngine; engine: "openai" | "neuraldeep" | null; connectorId: string; reason: string; revision: number; chained:ChainedVoiceSettings };
export function VoiceEngineSection({onEngineChange}:{onEngineChange?:(engine:"openai"|"neuraldeep")=>void}) {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [choice, setChoice] = useState<VoiceEngine>("auto");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [chained,setChained]=useState<ChainedVoiceSettings>(DEFAULT_CHAINED_VOICE_SETTINGS);
  const engine=choice==='auto' ? status?.engine || (status?.connectorId==='neuraldeep'?'neuraldeep':'openai') : choice;
  useEffect(()=>{onEngineChange?.(engine);},[engine,onEngineChange]);
  async function load() {
    const response = await fetch("/api/realtime/engine", { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    if (!payload?.voice) { setMessage("Voice engine settings unavailable. Reload to try again."); return; }
    setStatus(payload.voice); setChoice(payload.voice.preference);
    setChained(payload.voice.chained || DEFAULT_CHAINED_VOICE_SETTINGS);
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!status) return;
    setSaving(true); setMessage("");
    const response = await fetch("/api/realtime/engine", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceEngine: choice, expectedRevision: status.revision, chained }) }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setSaving(false);
    if (!response?.ok || !payload?.voice) {
      setMessage(payload?.message || "Could not save voice engine. Reload and try again.");
      if (response?.status === 409) await load();
      return;
    }
    setStatus(payload.voice); setChoice(payload.voice.preference); setMessage("Voice engine saved. Reconnect to apply.");
    setChained(payload.voice.chained);
  }
  const resolved = status?.reason === "offline" ? "Cloud voice is off." : status?.reason === "pending-auth"
    ? "The selected voice provider needs a key in Settings." : `Next session: ${status?.engine === "neuraldeep" ? "NeuralDeep Voice" : "OpenAI Realtime"}.`;
  return <>
    <div className="settings-rowline">
      <div><strong>Voice Engine</strong><span>Auto follows the task connector. Local keeps cloud voice off; an explicit cloud choice sends audio to that provider.</span></div>
      <select aria-label="Voice engine" value={choice} disabled={!status || saving} onChange={event => setChoice(event.currentTarget.value as VoiceEngine)}>
        <option value="auto">Auto (Follow provider)</option><option value="openai">OpenAI Realtime</option><option value="neuraldeep">NeuralDeep Voice</option>
      </select>
    </div>
    {engine==='neuraldeep' && <>
      <div className="settings-rowline"><div><strong>NeuralDeep Voice</strong><span>Speech recognition and spoken responses use NeuralDeep. Changes apply on reconnect.</span></div>
        <select aria-label="NeuralDeep voice" value={chained.voice} disabled={!status||saving} onChange={event=>{const voice=event.currentTarget.value as ChainedVoiceSettings['voice'];setChained(current=>({...current,voice}));}}>
          {CHAINED_VOICES.map(voice=><option value={voice} key={voice}>{voice}</option>)}
        </select>
      </div>
      <div className="settings-rowline"><div><strong>Speech Language</strong><span>Auto recognizes the language; Russian and English can be selected explicitly.</span></div>
        <select aria-label="NeuralDeep speech language" value={chained.language} disabled={!status||saving} onChange={event=>{const language=event.currentTarget.value as ChainedVoiceSettings['language'];setChained(current=>({...current,language}));}}>
          <option value="auto">Auto</option><option value="ru">Russian</option><option value="en">English</option>
        </select>
      </div>
    </>}
    <div className="settings-action-row">
      <button className="outline-button" type="button" disabled={!status || saving || (choice === status.preference && JSON.stringify(chained)===JSON.stringify(status.chained))} onClick={() => void save()}>{saving ? "Saving" : "Save Voice Engine"}</button>
      <span role="status">{message || (status ? resolved : "Loading voice engine...")}</span>
    </div>
  </>;
}
