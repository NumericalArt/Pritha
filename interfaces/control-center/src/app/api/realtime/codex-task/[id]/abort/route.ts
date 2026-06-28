import { NextResponse } from "next/server";
import { abortPrithaCodexTask } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const result = await abortPrithaCodexTask(id, body.reason || "operator_requested");
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
