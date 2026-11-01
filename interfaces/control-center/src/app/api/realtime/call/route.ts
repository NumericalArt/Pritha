import { NextResponse } from "next/server";
import { requireVoiceEngine, VoiceEngineError } from "@/lib/realtime/voice-engine-server";
import { createRealtimeCall, createLiveCall, usesLiveVoice, RealtimeProviderError } from "@/lib/realtime/pritha-runtime";
import { VoiceContextError } from '../../../../../../../scripts/lib/voice-session-contexts.mjs';
import { requestVoiceSessionContext, nativeVoiceContextOptions } from '@/lib/voice/session-context';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeCallPayload = {
  offerSdp?: string;
  ephemeralKey?: string;
  musicControlEnabled?: boolean;
  voiceApi?: string;
  contextId?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as RealtimeCallPayload;

  try {
    const context = payload.contextId !== undefined ? requestVoiceSessionContext(request, payload.contextId, 'openai') : null;
    if (!context) requireVoiceEngine("openai");
    const live = context ? context.voiceApi === 'live' : usesLiveVoice();
    if (payload.voiceApi && payload.voiceApi !== (live ? "live" : "realtime")) {
      return NextResponse.json({ error: "Voice model changed during startup. Please reconnect." }, { status: 409 });
    }
    if (live) {
      return NextResponse.json(await createLiveCall(String(payload.offerSdp || ""), { musicControlEnabled: payload.musicControlEnabled === true, ...(context ? nativeVoiceContextOptions(context) : {}) }));
    }
    const answerSdp = await createRealtimeCall(String(payload.offerSdp || ""), String(payload.ephemeralKey || ""));
    return NextResponse.json({ answerSdp });
  } catch (error) {
    if (error instanceof VoiceContextError) return NextResponse.json({ error:error.message, code:error.code }, {status:error.status});
    if (error instanceof VoiceEngineError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof RealtimeProviderError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.providerCode ?? "provider_error",
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      );
    }

    return NextResponse.json({ error: "Could not create realtime call" }, { status: 502 });
  }
}
