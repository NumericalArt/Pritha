import { NextResponse } from "next/server";
import { decidePrithaCodexTask } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const result = await decidePrithaCodexTask(id, body.action);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
