import {readProviderSettingsInput} from '../lib/provider-settings-api.mjs';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function searchSettingsRequest(request,{service}){
  try{
    if(!['GET','POST'].includes(request.method))return reply({ok:false,error:'method_invalid'},405);
    if(request.method==='POST'){
      const input=await readProviderSettingsInput(request);
      if(Object.keys(input).some(key=>!['mode','expectedRevision'].includes(key)) || !['auto','requested','off'].includes(input.mode) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<1)return reply({ok:false,error:'invalid_request'},400);
      service.configure({mode:input.mode},input.expectedRevision);
    }
    const status=service.getStatus({surface:'diagnostic',owner:'settings',turn:'settings'}),s=status.settings;
    return reply({ok:true,settings:{mode:s.mode,revision:s.revision},health:status.health,provider:s.provider,budgets:{taskSearch:s.taskSearch,taskRead:s.taskRead,voiceSearch:s.voiceSearch,voiceRead:s.voiceRead}});
  }catch(error){return reply({ok:false,error:error?.code==='revision_conflict'?'revision_conflict':'search_settings_unavailable'},error?.code==='revision_conflict'?409:503);}
}
