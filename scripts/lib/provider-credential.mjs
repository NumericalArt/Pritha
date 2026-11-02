import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';

const NAMES={neuraldeep:['PRITHA_NEURALDEEP_API_KEY','NEURALDEEP_API_KEY'],claude:['PRITHA_ANTHROPIC_API_KEY','ANTHROPIC_API_KEY'],openrouter:['PRITHA_OPENROUTER_API_KEY','OPENROUTER_API_KEY']};
const credentialMessages=Object.freeze({
  provider_credential_access_denied:'macOS Keychain denied access to this provider key. Review Keychain access before trying again.',
  provider_credential_write_timeout:'Saving the provider key timed out. Refresh its status before trying again.',
  provider_credential_write_failed:'Saving the provider key could not be confirmed. Review Keychain access and refresh its status before trying again.',
  provider_credential_read_timeout:'Reading the saved provider key timed out. Check macOS Keychain and retry.',
  provider_credential_read_failed:'The saved provider key could not be read. Review this provider in Settings and retry.',
  provider_credential_invalid:'The configured provider key is invalid. Review this provider in Settings.',
  provider_credential_service_invalid:'Provider credential storage is not configured correctly. Review this provider in Settings.',
  provider_credential_state_required:'Provider credential storage is not configured correctly. Review this provider in Settings.',
});
const failure=code=>Object.assign(new Error(credentialMessages[code] || 'Provider credentials are unavailable. Review this provider in Settings.'),{code});
/** Only allowlisted codes and authored messages may leave the credential boundary. */
export function providerCredentialError(error){
  const code=Object.hasOwn(credentialMessages,error?.code)?error.code:'provider_credential_read_failed';
  return {code,message:credentialMessages[code]};
}
function securityResult(run){
  let result;try{result=run();}catch(error){throw failure(error?.code==='ETIMEDOUT'?'provider_credential_read_timeout':'provider_credential_read_failed');}
  if(result?.error?.code==='ETIMEDOUT')throw failure('provider_credential_read_timeout');
  if(result?.error || result?.signal)throw failure('provider_credential_read_failed');
  if(result?.status===0)return result;
  // security exits with the low byte of OSStatus: item-not-found, auth-failed,
  // or interaction-not-allowed. Other failures do not prove a missing item.
  if(result?.status===44)return null;
  if(result?.status===51 || result?.status===36)throw failure('provider_credential_access_denied');
  throw failure('provider_credential_read_failed');
}
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
  const result=securityResult(()=>(options.runSync || spawnSync)('/usr/bin/security',['find-generic-password','-s',service,'-w'],securityOptions()));
  if(!result)return '';
  return keyValue(String(result.stdout || ''));
}

/** Metadata-only Keychain probe: does not retrieve, print or transmit the stored password. */
export function providerCredentialStatus(provider,options={}){
  const explicit=explicitKey(provider,options.env || process.env);
  if(explicit)return {configured:true,status:'configured',source:'environment',maskedValue:'••••••••'};
  if((options.platform || process.platform)!=='darwin')return {configured:false,status:'missing',source:'environment',maskedValue:''};
  const service=providerCredentialService(provider,options);
  let result;try{result=securityResult(()=>(options.runSync || spawnSync)('/usr/bin/security',['find-generic-password','-s',service],{...securityOptions(),stdio:'ignore'}));}
  catch(error){return {configured:false,status:'unavailable',source:'macos_keychain',maskedValue:'',error:providerCredentialError(error)};}
  const configured=Boolean(result);
  return {configured,status:configured?'configured':'missing',source:'macos_keychain',maskedValue:configured?'••••••••':''};
}

/** Native security prompts read the key from stdin; neither argv nor a shell receives it. */
export async function storeProviderCredential(provider,value,options={}){
  const key=keyValue(value),service=providerCredentialService(provider,options);
  if((options.platform || process.platform)!=='darwin')throw failure('provider_credential_storage_unavailable');
  let child,timer,timedOut=false;
  try{
    child=(options.spawnImpl || spawn)('/usr/bin/security',['add-generic-password','-U','-a','pritha','-s',service,'-w'],{stdio:['pipe','ignore','ignore'],shell:false});
    const closed=new Promise((resolve,reject)=>{child.once('error',()=>reject(failure('provider_credential_write_failed')));child.once('close',(code,signal)=>resolve({code,signal}));});
    timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},10000);
    child.stdin.on('error',()=>{});child.stdin.end(`${key}\n${key}\n`);
    const result=await closed;
    if(timedOut)throw failure('provider_credential_write_timeout');
    if(result.signal || result.code!==0)throw failure(!result.signal && [36,51].includes(result.code)?'provider_credential_access_denied':'provider_credential_write_failed');
    return {stored:true,...providerCredentialStatus(provider,options)};
  }catch(error){
    const code=['provider_credential_access_denied','provider_credential_write_timeout','provider_credential_write_failed'].includes(error?.code)?error.code:'provider_credential_write_failed';
    throw failure(code);
  }finally{clearTimeout(timer);}
}
