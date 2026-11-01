import {isProviderConnectorId,type ProviderConnectorId} from '../settings/provider-profile';
const KEY = "pritha.task-chat.drafts.v1";
const MAX_BYTES = 2 * 1024 * 1024;
export type DraftProviderSelection={connectorId:ProviderConnectorId;modelId?:string;effortId?:string;serviceTierId?:string};
function selectionValid(value:DraftProviderSelection){return value && typeof value==='object' && !Array.isArray(value) && isProviderConnectorId(value.connectorId) && Object.keys(value).every(key=>['connectorId','modelId','effortId','serviceTierId'].includes(key))
  && (value.modelId===undefined || /^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(value.modelId)) && (value.effortId===undefined || ['default','none','minimal','low','medium','high','xhigh','max','ultra'].includes(value.effortId)) && (value.serviceTierId===undefined || /^[a-z_]{1,32}$/.test(value.serviceTierId));}
export type DraftSession = {
  version:1;
  drafts:Record<string,string>;
  revisions:Record<string,number>;
  creationIds:Record<string,string>;
  newDraftId:string;
  workspaceModes?:Record<string,"isolated"|"configured"|"read-only">;
  providerSelections?:Record<string,DraftProviderSelection>;
  pending:Record<string,unknown>;
  pendingNew:Record<string,unknown>;
};

/** Tab-local: reload keeps unknown delivery IDs; another tab has independent drafts. */
export function readDraftSession():DraftSession|null {
  try {
    const text=sessionStorage.getItem(KEY);
    if(!text || text.length>MAX_BYTES)return null;
    const value=JSON.parse(text);
    if(value.version!==1 || !value.drafts || !value.pending || !value.pendingNew || !value.creationIds || !value.revisions || typeof value.newDraftId!=="string")return null;
    for(const map of [value.drafts,value.pending,value.pendingNew,value.creationIds,value.revisions]) if(typeof map!=="object" || Array.isArray(map) || Object.keys(map).length>100)return null;
    if(Object.values(value.drafts).some(text=>typeof text!=="string" || text.length>64_000))return null;
    for(const [key,delivery] of [...Object.entries(value.pending),...Object.entries(value.pendingNew)] as Array<[string,Record<string,unknown>]>) {
      if(!delivery || typeof delivery!=="object" || typeof delivery.clientMessageId!=="string" || typeof delivery.text!=="string" || delivery.text.length>64_000 || !["sending","delivery_unknown"].includes(String(delivery.status)))return null;
      if(delivery.chatId!==key && delivery.draftId!==key)return null;
      if(delivery.connectorId!==undefined && !isProviderConnectorId(delivery.connectorId))return null;
      delivery.status="delivery_unknown";
    }
    if(value.workspaceModes && (typeof value.workspaceModes!=="object" || Array.isArray(value.workspaceModes) || Object.keys(value.workspaceModes).length>100 || Object.values(value.workspaceModes).some(mode=>!["isolated","configured","read-only"].includes(String(mode)))))return null;
    if(value.providerSelections && (typeof value.providerSelections!=='object' || Array.isArray(value.providerSelections) || Object.keys(value.providerSelections).length>100 || Object.values(value.providerSelections).some(selection=>!selectionValid(selection as DraftProviderSelection))))return null;
    return value;
  } catch {return null;}
}

export function writeDraftSession(value:DraftSession) {
  try {
    const text=JSON.stringify(value);
    if(text.length>MAX_BYTES || Object.keys(value.drafts).length>100)return false;
    sessionStorage.setItem(KEY,text);
    return true;
  } catch {return false;}
}
