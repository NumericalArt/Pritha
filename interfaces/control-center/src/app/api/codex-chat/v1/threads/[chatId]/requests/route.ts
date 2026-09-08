import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{chatId:string}>}) {
  try {
    const body=await readJsonBody<{requestId:string;revision:number;clientMessageId:string;decision?:string;answers?:Record<string,string[]>}>(request);
    if(requireIdempotencyKey(request)!==body.clientMessageId)throw new CodexChatGatewayError("idempotency_conflict","The answer identifier must match its idempotency key.",409);
    return apiSuccess(await getCodexChatGateway().answerRequest((await context.params).chatId,body));
  }catch(error){return apiError(error);}
}
