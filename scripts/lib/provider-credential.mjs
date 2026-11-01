import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';

const NAMES={neuraldeep:['PRITHA_NEURALDEEP_API_KEY','NEURALDEEP_API_KEY'],claude:['PRITHA_ANTHROPIC_API_KEY','ANTHROPIC_API_KEY'],openrouter:['PRITHA_OPENROUTER_API_KEY','OPENROUTER_API_KEY']};
const failure=code=>Object.assign(new Error('Provider credentials are unavailable. Review this provider in Settings.'),{code});
function providerNames(provider){if(!Object.hasOwn(NAMES,provider))throw failure('provider_credentials_not_applicable');return NAMES[provider];}
function keyValue(value){
  if(typeof value!=='string' || !value.trim() || value.trim().length>8192 || /[^\x21-\x7e]/.test(value.trim()))throw failure('provider_credential_invalid');
  return value.trim();
}
function explicitKey(provider,env){for(const name of providerNames(provider))if(env[name]!==undefined && env[name]!=='')return keyValue(env[name]);return '';}

/** Service names are instance-scoped; the legacy global service requires an explicit override. */
export function providerCredentialService(provider,{stateRoot,env=process.env}={}){
  providerNames(provider);if(!stateRoot)throw failure('provider_credential_state_required');
  const override=env[`PRITHA_${provider==='claude'?'ANTHROPIC':provider.toUpperCase()}_KEYCHAIN_SERVICE`];
  if(override!==undefined){if(!/^[A-Za-z0-9._:-]{1,128}$/.test(override))throw failure('provider_credential_service_invalid');return override;}
  let root=path.resolve(stateRoot);try{root=realpathSync(root);}catch{/* A fresh instance has no directory yet. */}
  return `pritha-${provider}-${createHash('sha256').update(root).digest('hex').slice(0,24)}`;
}
function securityOptions(){return {encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000,maxBuffer:16384,killSignal:'SIGKILL',shell:false};}

/** Call only inside a server-side provider transport. Never return this value from an HTTP route. */
export function readProviderCredential(provider,options={}){
  const env=options.env || process.env,explicit=explicitKey(provider,env);
  if(explicit)return explicit;
  if((options.platform || process.platform)!=='darwin')return '';
  const service=providerCredentialService(provider,options);
  const result=(options.runSync || spawnSync)('/usr/bin/security',['find-generic-password','-s',service,'-w'],securityOptions());
  if(result.status!==0)return '';
  return keyValue(String(result.stdout || ''));
}

/** Metadata-only Keychain probe: does not retrieve, print or transmit the stored password. */
export function providerCredentialStatus(provider,options={}){
  const explicit=explicitKey(provider,options.env || process.env);
  if(explicit)return {configured:true,status:'configured',source:'environment',maskedValue:'••••••••'};
  if((options.platform || process.platform)!=='darwin')return {configured:false,status:'missing',source:'environment',maskedValue:''};
  const service=providerCredentialService(provider,options);
  const result=(options.runSync || spawnSync)('/usr/bin/security',['find-generic-password','-s',service],{...securityOptions(),stdio:'ignore'});
  const configured=result.status===0;
  return {configured,status:configured?'configured':'missing',source:'macos_keychain',maskedValue:configured?'••••••••':''};
}

/** Native security prompts read the key from stdin; neither argv nor a shell receives it. */
export async function storeProviderCredential(provider,value,options={}){
  const key=keyValue(value),service=providerCredentialService(provider,options);
  if((options.platform || process.platform)!=='darwin')throw failure('provider_credential_storage_unavailable');
  const child=(options.spawnImpl || spawn)('/usr/bin/security',['add-generic-password','-U','-a','pritha','-s',service,'-w'],{stdio:['pipe','ignore','ignore'],shell:false});
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},10000);
  try{
    const closed=new Promise((resolve,reject)=>{child.once('error',()=>reject(failure('provider_credential_write_failed')));child.once('close',code=>resolve(code));});
    child.stdin.on('error',()=>{});child.stdin.end(`${key}\n${key}\n`);
    if(await closed!==0 || timedOut)throw failure('provider_credential_write_failed');
    return {stored:true,...providerCredentialStatus(provider,options)};
  }finally{clearTimeout(timer);}
}
