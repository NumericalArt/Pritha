import { apiError, apiSuccess, integerQuery } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const p = await context.params, url = new URL(request.url), gateway = getCodexChatGateway();
    return apiSuccess(await gateway.historyPage(p.chatId, url.searchParams.get("cursor") || undefined, integerQuery(url.searchParams.get("limit"), 20, 1, 20)));
  } catch (error) { return apiError(error); }
}
