import { NextResponse } from "next/server";
import { getPrithaRealtimeStatus, getPrithaRuntimeSettings, updatePrithaRuntimeSettings } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuntimeSettingsPayload = {
  deepTaskPrimaryTransport?: "codex-app" | "codex-cli";
  codexModel?: string;
  codexWorkdir?: string;
  codexSandbox?: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess?: boolean;
  codexTimeoutMs?: number;
};

function transportStatus() {
  return getPrithaRealtimeStatus().codex.transports;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    settings: getPrithaRuntimeSettings(),
    transports: transportStatus(),
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as RuntimeSettingsPayload;
  const patch: RuntimeSettingsPayload = {};

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

  const settings = await updatePrithaRuntimeSettings(patch);
  return NextResponse.json({
    ok: true,
    settings,
    transports: transportStatus(),
  });
}
