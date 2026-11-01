import {getCodexChatGateway} from '../codex-chat/gateway';
import {resolvePrithaStateRoot} from '../pritha-paths';
import {providerSettingsRequest} from '../../../../../scripts/lib/provider-settings-api.mjs';
export function providerCredentialsRequest(request:Request,connectorId:string){
  return providerSettingsRequest(request,connectorId,{stateRoot:resolvePrithaStateRoot(),snapshot:id=>getCodexChatGateway().providerSettingsSnapshot(id)});
}
