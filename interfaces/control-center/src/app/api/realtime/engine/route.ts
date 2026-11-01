import { getVoiceEngineStatus } from "@/lib/realtime/voice-engine-server";
import { providerSettingsErrorResponse, providerSettingsStore } from "@/lib/settings/provider-settings-server";
import { ProviderConfigurationError, VOICE_ENGINES, type VoiceEngine } from "@/lib/settings/provider-profile";
import { normalizeChainedVoiceSettings, validChainedVoicePatch } from "@/lib/voice/settings";
import { readProviderSettingsInput } from "../../../../../../../scripts/lib/provider-settings-api.mjs";
import { providerSettingsSnapshot } from "../../../../../../../scripts/lib/runtime-settings-store.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ ok: true, voice: getVoiceEngineStatus() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return providerSettingsErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    let patch: Record<string,unknown>;
    try { patch = await readProviderSettingsInput(request) as Record<string,unknown>; }
    catch { throw new ProviderConfigurationError("voice_engine_invalid", "Send a bounded JSON voice engine update."); }
    if (!patch || Object.keys(patch).some(key => !["voiceEngine", "expectedRevision", "chained"].includes(key)) || !VOICE_ENGINES.includes(patch.voiceEngine as VoiceEngine)
      || !Number.isSafeInteger(patch.expectedRevision) || Number(patch.expectedRevision)<0 || (patch.chained !== undefined && !validChainedVoicePatch(patch.chained)))
      throw new ProviderConfigurationError("voice_engine_invalid", "Choose an available voice engine in Settings.");
    providerSettingsStore().mutate(current=>{
      providerSettingsSnapshot(current);
      return {...current,voiceEngine:patch.voiceEngine,...(patch.chained !== undefined ? {neuraldeepVoice:{...normalizeChainedVoiceSettings(current.neuraldeepVoice),...patch.chained as object}} : {})};
    },{expectedRevision:Number(patch.expectedRevision)});
    return Response.json({ ok: true, voice: getVoiceEngineStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerSettingsErrorResponse(error); }
}
