import { NextResponse } from "next/server";
import { getPrithaRealtimeStatus } from "@/lib/realtime/pritha-runtime";
import { getVoiceEngineStatus } from "@/lib/realtime/voice-engine-server";
import { providerSettingsErrorResponse } from "@/lib/settings/provider-settings-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getPrithaRealtimeStatus(), voice = getVoiceEngineStatus(), chained = voice.chained;
    return NextResponse.json({ ...status, ...(voice.engine === "neuraldeep" ? {model:chained.model,voice:chained.voice,transcription_model:chained.sttModel} : {}), voice_engine: voice }, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return providerSettingsErrorResponse(error); }
}
