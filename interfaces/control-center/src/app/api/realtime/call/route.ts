import { NextResponse } from "next/server";
import { createRealtimeCall, createLiveCall, usesLiveVoice, RealtimeProviderError } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeCallPayload = {
  offerSdp?: string;
  ephemeralKey?: string;
  musicControlEnabled?: boolean;
  voiceApi?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as RealtimeCallPayload;

  try {
    if (payload.voiceApi && payload.voiceApi !== (usesLiveVoice() ? "live" : "realtime")) {
      return NextResponse.json({ error: "Voice model changed during startup. Please reconnect." }, { status: 409 });
    }
    if (usesLiveVoice()) {
      return NextResponse.json(await createLiveCall(String(payload.offerSdp || ""), { musicControlEnabled: payload.musicControlEnabled === true }));
    }
    const answerSdp = await createRealtimeCall(String(payload.offerSdp || ""), String(payload.ephemeralKey || ""));
    return NextResponse.json({ answerSdp });
  } catch (error) {
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
