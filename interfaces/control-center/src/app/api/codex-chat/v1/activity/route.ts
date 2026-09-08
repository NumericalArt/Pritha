import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
import { apiError, apiSuccess, integerQuery } from "@/lib/codex-chat/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const after = integerQuery(new URL(request.url).searchParams.get("after"),0,0,Number.MAX_SAFE_INTEGER);
    return apiSuccess(await getCodexChatGateway().activity(after));
  } catch(error) { return apiError(error); }
}
