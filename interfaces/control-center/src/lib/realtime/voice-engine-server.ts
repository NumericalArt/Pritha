import { providerCredentialStatus } from "../../../../../scripts/lib/provider-credential.mjs";
import { getProviderSettingsDocument } from "../settings/provider-settings-server";
import { findEnvSecret } from "../settings/env-store";
import { resolveVoiceEngine, type ProviderConnectorId } from "../settings/provider-profile";
import { resolvePrithaStateRoot } from "../pritha-paths";
import { normalizeChainedVoiceSettings } from "../voice/settings";

/** Readiness here means a credential is configured, not a successful paid call.
 * Selection is evaluated before microphone upload or provider session creation. */
export function getVoiceEngineStatus(connectorId?: ProviderConnectorId) {
  const {settings,document} = getProviderSettingsDocument();
  const connector = connectorId ?? settings.activeConnectorId;
  const offline = process.env.PRITHA_VOICE_OFFLINE === "1" || connector === 'local';
  const configured = offline ? {openai:false,neuraldeep:false} : {
    openai: Boolean(findEnvSecret("OPENAI_API_KEY").value),
    neuraldeep: providerCredentialStatus("neuraldeep", { stateRoot: resolvePrithaStateRoot() }).configured,
  };
  const selection = resolveVoiceEngine({ connectorId: connector, engine: offline ? "auto" : settings.voiceEngine, configured, offline });
  return { preference: settings.voiceEngine, connectorId: connector, ...selection, configured, offline, revision: settings.revision, chained:normalizeChainedVoiceSettings(document.neuraldeepVoice) };
}

export class VoiceEngineError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

export function requireVoiceEngine(engine: "openai" | "neuraldeep", connectorId?: ProviderConnectorId) {
  const selected = getVoiceEngineStatus(connectorId);
  if (selected.reason === "offline") throw new VoiceEngineError("voice_offline", "Cloud voice is disabled by the Local connector or this instance’s offline policy.");
  if (selected.reason === "pending-auth") throw new VoiceEngineError("voice_pending_auth", "Configure the selected voice provider in Settings before starting voice.", 503);
  if (selected.engine !== engine) throw new VoiceEngineError("voice_engine_changed", "Voice engine changed. Reconnect using the selected engine.");
  return selected;
}
