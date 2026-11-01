import { NextResponse } from "next/server";
import { buildRealtimeSessionConfig, buildLiveSessionConfig } from "@/lib/realtime/pritha-runtime";
import { requestVoiceSessionContext, nativeVoiceContextOptions } from '@/lib/voice/session-context';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeSessionConfigRequest = {
  musicControlEnabled?: boolean;
  contextId?: string;
};

export async function POST(request: Request) {
  try {
  const body = (await request.json().catch(() => ({}))) as RealtimeSessionConfigRequest;
  const context = body.contextId !== undefined ? requestVoiceSessionContext(request, body.contextId, 'openai') : null;
  const options = {
    musicControlEnabled: body.musicControlEnabled === true,
    ...(context ? nativeVoiceContextOptions(context) : {}),
  };
  const config = buildRealtimeSessionConfig(options);
  return NextResponse.json({
    ok: true,
    live_responses: buildLiveSessionConfig(options).delegation.responses,
    type: config.type,
    instructions: config.instructions,
    tools: config.tools,
    tool_choice: config.tool_choice,
  });
  } catch { return NextResponse.json({ok:false,error:'voice_context_unavailable'}, {status:409}); }
}
