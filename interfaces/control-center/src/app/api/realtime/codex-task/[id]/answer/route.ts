import { NextResponse } from "next/server";
import { answerPrithaCodexTask } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { answer?: string; operator_confirmation?: string };
  const result = await answerPrithaCodexTask({
    task_id: id,
    answer: body.answer,
    operator_confirmation: body.operator_confirmation,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
