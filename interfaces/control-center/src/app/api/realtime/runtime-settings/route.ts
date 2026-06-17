import { NextResponse } from "next/server";
import { getPrithaRealtimeStatus, getPrithaRuntimeSettings, updatePrithaRuntimeSettings } from "@/lib/realtime/pritha-runtime";
import {
  isPrithaVoiceId,
  isVoiceBehaviorProfile,
  PRITHA_FEMININE_VOICE_OPTIONS,
  VOICE_BEHAVIOR_PROFILE_OPTIONS,
} from "@/lib/realtime/voice-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuntimeSettingsPayload = {
  deepTaskPrimaryTransport?: "codex-app" | "codex-cli";
  codexModel?: string;
  codexWorkdir?: string;
  codexSandbox?: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess?: boolean;
  codexTimeoutMs?: number;
  voiceBehaviorProfile?: string;
  prithaVoice?: string;
};

function transportStatus() {
  return getPrithaRealtimeStatus().codex.transports;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    settings: getPrithaRuntimeSettings(),
    transports: transportStatus(),
    behaviorProfiles: VOICE_BEHAVIOR_PROFILE_OPTIONS,
    voiceOptions: PRITHA_FEMININE_VOICE_OPTIONS,
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as RuntimeSettingsPayload;
  const patch: Parameters<typeof updatePrithaRuntimeSettings>[0] = {};

  if (payload.deepTaskPrimaryTransport === "codex-app" || payload.deepTaskPrimaryTransport === "codex-cli") {
    patch.deepTaskPrimaryTransport = payload.deepTaskPrimaryTransport;
  }
  if (typeof payload.codexModel === "string") patch.codexModel = payload.codexModel;
  if (typeof payload.codexWorkdir === "string") patch.codexWorkdir = payload.codexWorkdir;
  if (["auto", "read-only", "workspace-write", "danger-full-access"].includes(String(payload.codexSandbox))) {
    patch.codexSandbox = payload.codexSandbox;
  }
  if (typeof payload.codexNetworkAccess === "boolean") patch.codexNetworkAccess = payload.codexNetworkAccess;
  if (Number.isFinite(Number(payload.codexTimeoutMs))) patch.codexTimeoutMs = Number(payload.codexTimeoutMs);
  if ("voiceBehaviorProfile" in payload) {
    if (!isVoiceBehaviorProfile(payload.voiceBehaviorProfile)) {
      return NextResponse.json({ ok: false, error: "invalid_voice_behavior_profile" }, { status: 400 });
    }
    patch.voiceBehaviorProfile = payload.voiceBehaviorProfile;
  }
  if ("prithaVoice" in payload) {
    if (!isPrithaVoiceId(payload.prithaVoice)) {
      return NextResponse.json({ ok: false, error: "invalid_pritha_voice" }, { status: 400 });
    }
    patch.prithaVoice = payload.prithaVoice;
  }

  const settings = await updatePrithaRuntimeSettings(patch);
  return NextResponse.json({
    ok: true,
    settings,
    transports: transportStatus(),
    behaviorProfiles: VOICE_BEHAVIOR_PROFILE_OPTIONS,
    voiceOptions: PRITHA_FEMININE_VOICE_OPTIONS,
  });
}
