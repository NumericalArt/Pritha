import {providerCredentialStatus,storeProviderCredential} from './provider-credential.mjs';
const credentials=new Set(['neuraldeep','claude','openrouter']);
const valid=new Set(['codex','neuraldeep','claude','openrouter','local']);
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const failure=(code,status=400)=>Object.assign(new Error('Review this provider in Settings and try again.'),{code,status});
export async function readProviderSettingsInput(request){
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || ''))throw failure('provider_content_type_invalid',415);
  if(Number(request.headers.get('content-length') || 0)>16384)throw failure('provider_input_too_large',413);
  const reader=request.body?.getReader();if(!reader)throw failure('provider_input_invalid');
  const chunks=[];let size=0,timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(failure('provider_input_timeout',408));},5000);});
  try{
    for(;;){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw failure('provider_input_too_large',413);}chunks.push(Buffer.from(value));}
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));}catch{throw failure('provider_input_invalid');}
    if(!value || typeof value!=='object' || Array.isArray(value))throw failure('provider_input_invalid');return value;
  }finally{clearTimeout(timer);reader.releaseLock();}
}
/** Shared route contract. Credential values go only to the instance Keychain;
 * raw bodies, service names and CLI/OAuth state never enter HTTP results. */
export async function providerSettingsRequest(request,connectorId,{stateRoot,snapshot,status=providerCredentialStatus,save=storeProviderCredential,env=process.env}){
  let stored=false;
  try{
    if(!valid.has(connectorId))throw failure('provider_profile_invalid');
    const options={stateRoot,env};
    if(request.method==='POST'){
      if(!credentials.has(connectorId))throw failure('provider_credentials_not_applicable');
      const body=await readProviderSettingsInput(request);
      if(Object.keys(body).some(key=>!['value','confirmation'].includes(key)))throw failure('provider_input_invalid');
      if(body.confirmation!=='save-'+connectorId+'-key' || typeof body.value!=='string')throw failure('provider_confirmation_required');
      await save(connectorId,body.value,options);
      stored=true;
    }else if(request.method!=='GET')throw failure('provider_method_invalid',405);
    const credential=credentials.has(connectorId)?status(connectorId,options):{configured:false,status:'not-applicable',source:null,maskedValue:''};
    return reply({ok:true,connectorId,stored,credentials:credential,provider:await snapshot(connectorId)});
  }catch(error){const known=/^provider_[a-z_]{1,80}$/.test(error?.code || '');return reply({ok:false,stored,error:known?error.code:'provider_settings_unavailable',message:stored?'The key was saved, but its status could not be checked. Refresh provider status before sending a task.':'Provider settings could not be updated or checked. Your saved task history is preserved.'},Number.isInteger(error?.status) && error.status>=400 && error.status<=599?error.status:known?400:503);}
}
