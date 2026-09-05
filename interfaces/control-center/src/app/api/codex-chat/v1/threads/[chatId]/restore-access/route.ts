import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    return apiSuccess(await getCodexChatGateway().restoreAccess(chatId));
  } catch (error) { return apiError(error); }
}
