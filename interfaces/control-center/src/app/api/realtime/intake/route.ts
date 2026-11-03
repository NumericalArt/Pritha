import { NextResponse } from "next/server";
import { createPrithaVoiceIntakeCodexTask, VOICE_INTAKE_MAX_FILES, VOICE_INTAKE_MAX_FILE_BYTES, VOICE_INTAKE_MAX_TOTAL_BYTES, type VoiceIntakeFileInput } from "@/lib/realtime/pritha-runtime";
import { requestVoiceSessionContext, voiceTaskSelection } from '@/lib/voice/session-context';
import { VoiceContextError } from '../../../../../../../scripts/lib/voice-session-contexts.mjs';
import { VoiceEngineError } from '@/lib/realtime/voice-engine-server';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value
  );
}

class IntakePayloadError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}

async function boundedFormData(request: Request, contentType: string) {
  const limit = VOICE_INTAKE_MAX_TOTAL_BYTES + 1024 * 1024;
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new IntakePayloadError('invalid_request');
  if (Number(declared) > limit) throw new IntakePayloadError('intake_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new IntakePayloadError('empty_intake');
  let bytes = 0, timedOut = false;
  const chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 30000);
  request.signal.addEventListener('abort', cancel, {once:true});
  try {
    while (true) {
      if (request.signal.aborted) throw new IntakePayloadError('intake_interrupted', 408);
      const next = await reader.read();
      if (timedOut || request.signal.aborted) throw new IntakePayloadError('intake_interrupted', 408);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) throw new IntakePayloadError('intake_too_large', 413);
      chunks.push(next.value);
    }
    if (declared !== null && bytes !== Number(declared)) throw new IntakePayloadError('intake_interrupted', 400);
    return await new Response(Buffer.concat(chunks), {headers:{'Content-Type':contentType}}).formData();
  } catch (error) {
    if (error instanceof IntakePayloadError) throw error;
    throw new IntakePayloadError('invalid_multipart');
  } finally {
    clearTimeout(timer);request.signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "multipart_form_required" }, { status: 415 });
  }

  try {
    const contextId = request.headers.get('x-pritha-voice-context');
    requestVoiceSessionContext(request, contextId);
    const form = await boundedFormData(request, contentType);
    if ([...form].length > 24) throw new IntakePayloadError('invalid_request');
    for (const [key,value] of form) {
      if (key !== 'files' && (typeof value !== 'string' || value.length > 8000)) throw new IntakePayloadError('invalid_request');
    }
    const text = String(form.get("text") || "");
    const sessionId = String(form.get("session_id") || "");
    const confirmation = {
      source_intake_id: String(form.get("confirmation_intake_id") || ""),
      session_id: String(form.get("confirmation_session_id") || sessionId),
      timestamp: String(form.get("confirmation_timestamp") || ""),
      instruction: String(form.get("confirmed_instruction") || ""),
      intent: String(form.get("confirmed_intent") || ""),
      original_text_role: String(form.get("original_text_role") || ""),
      target_agent: String(form.get("target_agent") || ""),
      persistence: String(form.get("persistence") || ""),
      notes: String(form.get("confirmation_notes") || ""),
    };
    const files: VoiceIntakeFileInput[] = [];

    const uploads = form.getAll("files");
    if (uploads.length > VOICE_INTAKE_MAX_FILES) throw new IntakePayloadError('too_many_files', 413);
    let totalBytes = 0;
    for (const entry of uploads) {
      if (!isUploadedFile(entry)) throw new IntakePayloadError('invalid_file');
      if (entry.size <= 0) throw new IntakePayloadError('empty_file');
      if (entry.size > VOICE_INTAKE_MAX_FILE_BYTES) throw new IntakePayloadError('file_too_large', 413);
      totalBytes += entry.size;
    }
    if (totalBytes > VOICE_INTAKE_MAX_TOTAL_BYTES) throw new IntakePayloadError('intake_too_large', 413);
    for (const entry of uploads as File[]) {
      const buffer = new Uint8Array(await entry.arrayBuffer());
      files.push({
        name: entry.name,
        type: entry.type,
        size: entry.size,
        bytes: buffer,
      });
    }

    const context = requestVoiceSessionContext(request, contextId);
    const result = await createPrithaVoiceIntakeCodexTask({ text, files, sessionId, confirmation }, {taskSelection:voiceTaskSelection(context,true),check:()=>{
      if(request.signal.aborted)throw new IntakePayloadError('intake_interrupted',408);
      requestVoiceSessionContext(request,contextId);
    }});
    const error = typeof result.error === "string" ? result.error : "";
    const status = result.ok ? 200 : error === "empty_intake" || error === "voice_confirmation_required" ? 400 : error.includes("large") || error === "too_many_files" ? 413 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof VoiceContextError || error instanceof VoiceEngineError || error instanceof IntakePayloadError) {
      return NextResponse.json({ok:false,error:error.code}, {status:error.status});
    }
    if(error && typeof error==='object' && 'code' in error && /^(?:voice_intake_|attachment_)[a-z_]+$/.test(String(error.code)))return NextResponse.json({ok:false,error:error.code},{status:409});
    return NextResponse.json({ok:false,error:'voice_intake_failed'}, {status:500});
  }
}
