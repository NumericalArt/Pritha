import { NextResponse } from "next/server";
import { handlePrithaRealtimeTool } from "@/lib/realtime/pritha-runtime";
import { requestVoiceSessionContext, voiceTaskSelection } from '@/lib/voice/session-context';
import { VoiceContextError } from '../../../../../../../scripts/lib/voice-session-contexts.mjs';
import { VoiceEngineError } from '@/lib/realtime/voice-engine-server';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolPayload = {
  name?: string;
  arguments?: Record<string, unknown>;
  contextId?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ToolPayload;
  const name = String(payload.name || "");
  if (!name) return NextResponse.json({ ok: false, error: "missing_tool_name" }, { status: 400 });

  try {
    const context = payload.contextId !== undefined ? requestVoiceSessionContext(request, payload.contextId) : null;
    const output = await handlePrithaRealtimeTool(name, payload.arguments || {}, context ? {taskSelection:voiceTaskSelection(context)} : {});
    return NextResponse.json(output);
  } catch (error) {
    if (error instanceof VoiceContextError || error instanceof VoiceEngineError) return NextResponse.json({ok:false,error:error.code}, {status:error.status});
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    return NextResponse.json(
      {
        ok: false,
        error: /^[a-z][a-z0-9_]{0,79}$/.test(code) ? code : "tool_failed",
      },
      { status: 500 },
    );
  }
}
