import {getCodexChatGateway} from '@/lib/codex-chat/gateway';
import {providerSettingsErrorResponse} from '@/lib/settings/provider-settings-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json({ok:true,providers:await getCodexChatGateway().providerHealth()},{headers:{'Cache-Control':'no-store'}});}catch(error){return providerSettingsErrorResponse(error);}}
