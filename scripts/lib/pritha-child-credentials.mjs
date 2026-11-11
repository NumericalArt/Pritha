import path from 'node:path';
import {loadEnvFile} from './env.mjs';
import {providerCredentialStatus,readProviderCredential} from './provider-credential.mjs';

const names={openai:['OPENAI_API_KEY'],claude:['PRITHA_ANTHROPIC_API_KEY','ANTHROPIC_API_KEY'],neuraldeep:['PRITHA_NEURALDEEP_API_KEY','NEURALDEEP_API_KEY'],openrouter:['PRITHA_OPENROUTER_API_KEY','OPENROUTER_API_KEY']};
function environment({root,stateRoot,env=process.env}){
  const allowed=new Set(Object.values(names).flat());
  for(const name of ['ANTHROPIC','NEURALDEEP','OPENROUTER'])allowed.add('PRITHA_'+name+'_KEYCHAIN_SERVICE');
  const target=Object.fromEntries(Object.entries(env).filter(([name])=>allowed.has(name)));
  const files=[...(env.PRITHA_CONTROL_CENTER_ENV_FILE?[path.resolve(root,env.PRITHA_CONTROL_CENTER_ENV_FILE)]:[]),path.join(stateRoot,'config/runtime.env'),path.join(root,'.env.local'),path.join(root,'.env')];
  for(const file of [...new Set(files)])loadEnvFile(file,target,allowed);
  return target;
}
export function prithaChildConnections(options){
  const env=environment(options);
  return Object.keys(names).map(provider=>{
    try{
      const status=provider==='openai'?{configured:Boolean(env.OPENAI_API_KEY),status:env.OPENAI_API_KEY?'configured':'missing'}:providerCredentialStatus(provider,{...options,env});
      return {provider,configured:status.configured,status:status.status};
    }catch{return {provider,configured:false,status:'unavailable'};}
  });
}
/** Server-only resolution. Never return this value to a model, UI or child. */
export function readPrithaChildCredential(provider,options){
  if(!Object.hasOwn(names,provider))throw Object.assign(Error('Unsupported child connection.'),{code:'child_provider_configuration_invalid'});
  const env=environment(options);
  return provider==='openai'?env.OPENAI_API_KEY || '':readProviderCredential(provider,{...options,env});
}
