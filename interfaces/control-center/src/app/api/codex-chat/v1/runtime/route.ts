import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type {RuntimePreviewSelection} from '@/lib/codex-chat/gateway';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params=new URL(request.url).searchParams;
    const selection=Object.fromEntries(['connectorId','modelId','effortId','serviceTierId'].filter(key=>params.has(key)).map(key=>[key,params.get(key)!])) as RuntimePreviewSelection;
    return apiSuccess(await getCodexChatGateway().runtimeStatus(params.get("chatId") || undefined,Object.keys(selection).length?selection:undefined));
  } catch (error) {
    return apiError(error);
  }
}
