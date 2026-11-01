import {getCodexChatGateway} from '@/lib/codex-chat/gateway';
import {getProviderSettings} from '@/lib/settings/provider-settings-server';
import {providerAttachmentVerificationRequest} from '../../../../../../../../../scripts/lib/provider-attachment-verification-api.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{connectorId:string}>};
export async function POST(request:Request,context:Context){
  return providerAttachmentVerificationRequest(request,(await context.params).connectorId,{
    current:()=>{const settings=getProviderSettings();return {revision:settings.revision,modelId:settings.providerPresets.neuraldeep.modelId};},
    verify:(modelId,signal)=>getCodexChatGateway().verifyProviderAttachments('neuraldeep',modelId,signal),
  });
}
