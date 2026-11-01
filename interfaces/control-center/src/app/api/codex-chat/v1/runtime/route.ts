import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return apiSuccess(await getCodexChatGateway().runtimeStatus(new URL(request.url).searchParams.get("chatId") || undefined));
  } catch (error) {
    return apiError(error);
  }
}
