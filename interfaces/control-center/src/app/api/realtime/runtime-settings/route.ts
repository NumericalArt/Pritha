import { NextResponse } from "next/server";
import {
  getPrithaRealtimeStatus,
  getPrithaRuntimeSettings,
  normalizeCodexExecutionMode,
  normalizeCodexPlanningMode,
  normalizeCodexReasoningEffort,
  normalizeCodexServiceTier,
  normalizeCodexVoiceProgressVerbosity,
  updatePrithaRuntimeSettings,
} from "@/lib/realtime/pritha-runtime";
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
  codexReasoningEffort?: string;
  codexServiceTier?: string;
  codexWorkdir?: string;
  codexSandbox?: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess?: boolean;
  codexTimeoutMs?: number;
  codexPromptTokenBudget?: number;
  codexPlanningMode?: string;
  codexExecutionMode?: string;
  codexMaxPlanSteps?: number;
  codexAskBeforeOrchestration?: boolean;
  codexVoiceProgressVerbosity?: string;
  voiceBehaviorProfile?: string;
  prithaVoice?: string;
};

function transportStatus() {
  return getPrithaRealtimeStatus().codex.transports;
}

function isCodexReasoningEffort(value: unknown) {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "very_high";
}

function isCodexPlanningMode(value: unknown) {
  return value === "off" || value === "inline_required" || value === "planner";
}

function isCodexExecutionMode(value: unknown) {
  return value === "inline_only" || value === "orchestrator_enabled" || value === "orchestrator_preferred";
}

function isCodexVoiceProgressVerbosity(value: unknown) {
  return value === "brief" || value === "normal" || value === "detailed";
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
  if ("codexReasoningEffort" in payload) {
    if (!isCodexReasoningEffort(payload.codexReasoningEffort)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_reasoning_effort" }, { status: 400 });
    }
    patch.codexReasoningEffort = normalizeCodexReasoningEffort(payload.codexReasoningEffort);
  }
  if ("codexServiceTier" in payload) {
    if (payload.codexServiceTier !== "standard" && payload.codexServiceTier !== "fast") {
      return NextResponse.json({ ok: false, error: "invalid_codex_service_tier" }, { status: 400 });
    }
    patch.codexServiceTier = normalizeCodexServiceTier(payload.codexServiceTier);
  }
  if (typeof payload.codexWorkdir === "string") patch.codexWorkdir = payload.codexWorkdir;
  if (["auto", "read-only", "workspace-write", "danger-full-access"].includes(String(payload.codexSandbox))) {
    patch.codexSandbox = payload.codexSandbox;
  }
  if (typeof payload.codexNetworkAccess === "boolean") patch.codexNetworkAccess = payload.codexNetworkAccess;
  if (Number.isFinite(Number(payload.codexTimeoutMs))) patch.codexTimeoutMs = Number(payload.codexTimeoutMs);
  if (Number.isFinite(Number(payload.codexPromptTokenBudget))) patch.codexPromptTokenBudget = Number(payload.codexPromptTokenBudget);
  if ("codexPlanningMode" in payload) {
    if (!isCodexPlanningMode(payload.codexPlanningMode)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_planning_mode" }, { status: 400 });
    }
    patch.codexPlanningMode = normalizeCodexPlanningMode(payload.codexPlanningMode);
  }
  if ("codexExecutionMode" in payload) {
    if (!isCodexExecutionMode(payload.codexExecutionMode)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_execution_mode" }, { status: 400 });
    }
    patch.codexExecutionMode = normalizeCodexExecutionMode(payload.codexExecutionMode);
  }
  if (Number.isFinite(Number(payload.codexMaxPlanSteps))) patch.codexMaxPlanSteps = Number(payload.codexMaxPlanSteps);
  if (typeof payload.codexAskBeforeOrchestration === "boolean") patch.codexAskBeforeOrchestration = payload.codexAskBeforeOrchestration;
  if ("codexVoiceProgressVerbosity" in payload) {
    if (!isCodexVoiceProgressVerbosity(payload.codexVoiceProgressVerbosity)) {
      return NextResponse.json({ ok: false, error: "invalid_codex_voice_progress_verbosity" }, { status: 400 });
    }
    patch.codexVoiceProgressVerbosity = normalizeCodexVoiceProgressVerbosity(payload.codexVoiceProgressVerbosity);
  }
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
