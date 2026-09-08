import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{chatId:string}>}) {
 try {
  const body=await readJsonBody<{action:"answer"|"stop";taskId:string;questionId?:string;revision:number;answer?:string;clientMessageId:string}>(request);
  if(requireIdempotencyKey(request)!==body.clientMessageId)throw new CodexChatGatewayError("idempotency_conflict","The action identifier must match its idempotency key.",409);
  return apiSuccess(await getCodexChatGateway().voiceControl((await context.params).chatId,body));
 } catch(error){return apiError(error);}
}
