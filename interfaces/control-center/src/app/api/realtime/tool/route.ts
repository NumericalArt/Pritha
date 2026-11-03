import { NextResponse } from "next/server";
import { handlePrithaRealtimeTool } from "@/lib/realtime/pritha-runtime";
import { requestVoiceSessionContext, voiceTaskSelection } from '@/lib/voice/session-context';
import { VoiceContextError } from '../../../../../../../scripts/lib/voice-session-contexts.mjs';
import { VoiceEngineError } from '@/lib/realtime/voice-engine-server';
import {searchIntent} from '../../../../../../../scripts/search/intent.mjs';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolPayload = {
  name?: string;
  arguments?: Record<string, unknown>;
  contextId?: string;
  searchTurn?: {id?:string;text?:string};
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ToolPayload;
  const name = String(payload.name || "");
  if (!name) return NextResponse.json({ ok: false, error: "missing_tool_name" }, { status: 400 });

  try {
    const context = payload.contextId !== undefined ? requestVoiceSessionContext(request, payload.contextId) : null;
    const turn=payload.searchTurn;
    if(turn && (!/^[A-Za-z0-9_-]{1,100}$/.test(turn.id||'') || typeof turn.text!=='string' || turn.text.length>16000))return NextResponse.json({ok:false,error:'voice_search_turn_invalid'},{status:400});
    const intent=searchIntent(turn?.text || '');
    const output = await handlePrithaRealtimeTool(name, payload.arguments || {}, context ? {taskSelection:voiceTaskSelection(context,name === 'run_codex_task'),searchTurnId:turn?.id,explicitSearch:intent.explicit,searchDenied:intent.denied,signal:request.signal} : {});
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
