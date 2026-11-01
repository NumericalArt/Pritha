import { NextResponse } from "next/server";
import { VoiceEngineError } from "@/lib/realtime/voice-engine-server";
import { VoiceContextError, type VoiceContext } from '../../../../../../../scripts/lib/voice-session-contexts.mjs';
import { voiceContextOwner, setVoiceContextCookie, openVoiceSessionContext, closeVoiceSessionContext, closeRequestVoiceSessionContext, nativeVoiceContextOptions, voiceContextView } from '@/lib/voice/session-context';
import {
  buildRealtimeSessionConfig,
  createEphemeralRealtimeSession,
  RealtimeProviderError,
} from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeSessionRequest = {
  musicControlEnabled?: boolean;
};

export async function POST(request: Request) {
  let context: VoiceContext | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as RealtimeSessionRequest;
    const owner = voiceContextOwner(request, true);
    context = openVoiceSessionContext(owner.owner, 'openai');
    const options = { musicControlEnabled: body.musicControlEnabled === true, ...nativeVoiceContextOptions(context) };
    const live = context.voiceApi === 'live';
    const session = live ? null : await createEphemeralRealtimeSession(options);
    const config = buildRealtimeSessionConfig(options);
    const response = NextResponse.json({
      client_secret: session?.client_secret,
      voice_api: live ? "live" : "realtime",
      model: config.model,
      voice: config.audio.output.voice,
      tools: config.tools.map((tool) => tool.name),
      voiceContext: voiceContextView(context),
    });
    setVoiceContextCookie(response, request, owner.token);
    return response;
  } catch (error) {
    if (context) try { closeVoiceSessionContext(context); } catch { /* Expiry bounds an unconfirmed cleanup. */ }
    if (error instanceof VoiceContextError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
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

    return NextResponse.json({ error: "Could not create realtime session" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(closeRequestVoiceSessionContext(request, body.contextId));
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof VoiceContextError ? error.code : 'voice_context_unavailable' }, {status:409});
  }
}
