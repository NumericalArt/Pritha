import { NextResponse } from "next/server";
import { getPrithaCodexTask } from "@/lib/realtime/pritha-runtime";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPrithaCodexTask(id);
  const providerHref = result.ok && 'task_chat_href' in result && typeof result.task_chat_href === 'string' ? result.task_chat_href : null;
  const providerChat = providerHref
    && 'status_detail' in result && result.status_detail && 'chat_id' in result.status_detail ? result.status_detail.chat_id : null;
  const taskChat = providerChat ? { chatId: String(providerChat), href: providerHref!, historyAvailable: true,
    continuationState: 'complete' in result && result.complete ? 'continuation_enabled' : 'blocked_active_turn' }
    : result.ok && (!('connector_id' in result) || result.connector_id === 'codex') ? await getCodexChatGateway().taskChatLinkForTask(String(result.task_id || id)).catch(() => null) : null;
  return NextResponse.json(result.ok ? { ...result, task_chat: taskChat } : result, { status: result.ok ? 200 : 404 });
}
