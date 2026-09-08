import { CodexChatGatewayError, getCodexChatGateway } from "@/lib/codex-chat/gateway";
import { apiError, apiSuccess, readJsonBody, requireIdempotencyKey } from "@/lib/codex-chat/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{chatId:string}>}) {
  try {return apiSuccess(await getCodexChatGateway().queuedMessages((await context.params).chatId));}catch(error){return apiError(error);}
}
export async function POST(request:Request,context:{params:Promise<{chatId:string}>}) {
  try {
    const key=requireIdempotencyKey(request), {chatId}=await context.params;
    const body=await readJsonBody<{action?:"cancel";id:string;revision:number;clientMessageId:string;input:[{type:"text";text:string}];attachments?:string[];settings?:{modelId?:string;effortId?:string;serviceTierId?:string}}>(request);
    if(body.action === "cancel") return apiSuccess(await getCodexChatGateway().cancelQueued(chatId,body.id,body.revision));
    if(key!==body.clientMessageId)throw new CodexChatGatewayError("idempotency_conflict","The request identifier must match its idempotency key.",409);
    return apiSuccess(await getCodexChatGateway().enqueueMessage(chatId,body));
  } catch(error){return apiError(error);}
}
