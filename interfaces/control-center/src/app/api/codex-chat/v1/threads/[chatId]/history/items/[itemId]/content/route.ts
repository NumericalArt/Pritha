import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ chatId: string; itemId: string }> }) {
  try {
    const p = await context.params, url = new URL(request.url), gateway = getCodexChatGateway();
    return apiSuccess(await gateway.historyContent(p.chatId, p.itemId, url.searchParams.get("cursor") || ""));
  } catch (error) { return apiError(error); }
}
