import { NextResponse } from "next/server";
import { getPrithaCodexTask } from "@/lib/realtime/pritha-runtime";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPrithaCodexTask(id);
  const taskChat = result.ok ? await getCodexChatGateway().taskChatLinkForTask(String(result.task_id || id)).catch(() => null) : null;
  return NextResponse.json(result.ok ? { ...result, task_chat: taskChat } : result, { status: result.ok ? 200 : 404 });
}
