import { NextResponse } from "next/server";
import { requestGeneratedMusic } from "@/lib/music/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GeneratePayload = {
  style?: string;
  durationSec?: number;
  forceFresh?: boolean;
  seed?: number;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as GeneratePayload;
  const result = await requestGeneratedMusic({
    style: String(payload.style || ""),
    durationSec: payload.durationSec,
    forceFresh: payload.forceFresh === true,
    seed: Number.isFinite(Number(payload.seed)) ? Number(payload.seed) : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
