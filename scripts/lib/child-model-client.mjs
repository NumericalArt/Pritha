import {openSync,closeSync,fstatSync,readSync,constants,lstatSync} from 'node:fs';
import path from 'node:path';
import {createClaudeMessage} from '../claude/messages-client.mjs';

import {childProviderConfiguration,childModelIdentityMatches} from './child-provider-configuration.mjs';
import {randomUUID} from 'node:crypto';
export {childProviderConfiguration} from './child-provider-configuration.mjs';
const fail=code=>Object.assign(new Error('The selected child model request could not complete.'),{code});
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const count=value=>Number.isSafeInteger(value) && value>=0;


function checkedConfiguration(value){
  const expected=childProviderConfiguration({childModelProvider:value?.connectorId,childModelId:value?.modelId,childModelConnection:value?.connection,childMaxOutputTokens:value?.maxOutputTokens});
  if(!expected || Object.keys(expected).some(key=>value[key]!==expected[key]) || Object.keys(value).some(key=>!Object.hasOwn(expected,key)))throw fail('child_provider_configuration_invalid');
  return expected;
}
function regular(file,maxBytes){
  let fd;try{fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=fstatSync(fd);
    if(!stat.isFile() || stat.nlink!==1 || stat.size>maxBytes)throw Error();
    const buffer=Buffer.alloc(maxBytes+1);let bytes=0,read;while(bytes<buffer.length && (read=readSync(fd,buffer,bytes,buffer.length-bytes,null))>0)bytes+=read;
    if(bytes>maxBytes)throw Error();return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytes));
  }catch(error){throw fail(error.code==='ENOENT'?'provider_pending_auth':'child_provider_store_unsafe');}finally{if(fd!==undefined)closeSync(fd);}
}
/** Never loads process.env, a parent dotenv, Keychain or another project's key. */
export function readChildProvider(root,{environment=process.env}={}){
  if(!path.isAbsolute(root))throw fail('child_provider_store_unsafe');
  for(const directory of [root,path.join(root,'runtime')]){const stat=lstatSync(directory);if(!stat.isDirectory() || stat.isSymbolicLink())throw fail('child_provider_store_unsafe');}
  let configuration;try{configuration=checkedConfiguration(JSON.parse(regular(path.join(root,'runtime/provider.json'),8000)));}catch(error){throw fail(error.code || 'child_provider_configuration_invalid');}
  if(configuration.connection==='pritha')return {configuration,connection:prithaConnection(environment)};
  const storedEnvironment=regular(path.join(root,configuration.credentialTarget),32000).split(/\r?\n/);
  const decode=value=>{value=value.trim();if(value.startsWith('"'))try{return JSON.parse(value);}catch{throw fail('child_provider_configuration_invalid');}return value.startsWith("'") && value.endsWith("'")?value.slice(1,-1):value;};
  for(const [variable,expected] of [[configuration.keyName.replace('_API_KEY','_BASE_URL'),configuration.baseUrl],[configuration.keyName.replace('_API_KEY','_MODEL'),configuration.modelId]]){
    const found=storedEnvironment.filter(row=>new RegExp('^'+variable+'\\s*=').test(row));
    if(found.length>1 || found.length===1 && decode(found[0].slice(found[0].indexOf('=')+1))!==expected)throw fail('child_provider_configuration_invalid');
  }
  const rows=storedEnvironment.filter(row=>new RegExp('^'+configuration.keyName+'\\s*=').test(row));
  if(rows.length!==1)throw fail('provider_pending_auth');let apiKey=rows[0].slice(rows[0].indexOf('=')+1).trim();
  if(apiKey.startsWith('"'))try{apiKey=JSON.parse(apiKey);}catch{throw fail('provider_pending_auth');}
  else if(apiKey.startsWith("'") && apiKey.endsWith("'"))apiKey=apiKey.slice(1,-1);
  if(typeof apiKey!=='string' || !/^[\x21-\x7e]{1,8192}$/.test(apiKey))throw fail('provider_pending_auth');
  return {configuration,apiKey};
}

/** Bounded text API for a child-owned product. Tool execution remains a separate
 * approved application policy; this entry point never executes returned code. */
export async function requestChildModel(configuration,input,{apiKey,connection,fetchImpl=globalThis.fetch,signal,onDispatch,environment=process.env,direct=false}={}){
  const config=checkedConfiguration(configuration);
  if(!object(input) || Object.keys(input).some(key=>!['messages','system','maxTokens'].includes(key)) || !Array.isArray(input.messages) || !input.messages.length || input.messages.length>100
    || input.messages.some(item=>!object(item) || Object.keys(item).some(key=>!['role','content'].includes(key)) || !['user','assistant'].includes(item.role) || typeof item.content!=='string')
    || input.system!==undefined && typeof input.system!=='string' || input.maxTokens!==undefined && (!Number.isSafeInteger(input.maxTokens) || input.maxTokens<1 || input.maxTokens>config.maxOutputTokens)
    || Buffer.byteLength(JSON.stringify(input))>(config.maxInputBytes || 256*1024))throw fail('provider_input_invalid');
  if(config.connection==='pritha' && !direct)return requestPrithaModel(config,input,{connection:connection || prithaConnection(environment),fetchImpl,signal});
  if(typeof apiKey!=='string' || !/^[\x21-\x7e]{1,8192}$/.test(apiKey))throw fail('provider_pending_auth');
  if(config.connectorId==='claude'){
    const result=await createClaudeMessage({...input,model:config.modelId,maxTokens:input.maxTokens || config.maxOutputTokens},{apiKey,fetchImpl,timeoutMs:config.timeoutMs,signal,onDispatch});
    if(!result.complete)throw fail(result.truncated?'provider_output_limit':'provider_response_incomplete');
    return {...result,usageKnown:result.usage!==null};
  }
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(abort,config.timeoutMs);
  try{
    if(controller.signal.aborted)throw fail('operator_cancel');
    const messages=[...(input.system?[{role:'system',content:input.system}]:[]),...input.messages];
    const body={model:config.modelId,messages,max_tokens:input.maxTokens || config.maxOutputTokens,stream:false};
    if(config.connectorId==='openai'){body.max_completion_tokens=body.max_tokens;delete body.max_tokens;body.store=false;}
    // No model fallbacks, route overrides, plugins, remote media or hosted tools.
    if(config.connectorId==='openrouter')body.provider={allow_fallbacks:false};
    const headers={authorization:'Bearer '+apiKey,'content-type':'application/json',accept:'application/json',...(config.connectorId==='openrouter'?{'HTTP-Referer':'https://github.com/NumericalArt/Pritha','X-Title':'Pritha child agent'}:{})};
    await onDispatch?.();if(controller.signal.aborted)throw fail('operator_cancel');
    const response=await fetchImpl(config.baseUrl+'/chat/completions',{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:controller.signal});
    if(!response.ok){await response.body?.cancel();throw fail(response.status===401 || response.status===403?'provider_pending_auth':response.status===429?'provider_rate_limited':'provider_unavailable');}
    if(!response.body)throw fail('provider_response_invalid');const chunks=[];let bytes=0;
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2*1024*1024){controller.abort();throw fail('provider_output_limit');}chunks.push(Buffer.from(chunk));}
    let result;try{result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw fail('provider_response_invalid');}
    const choice=result.choices?.[0];
    if(!childModelIdentityMatches(config.connectorId,config.modelId,result.model) || result.choices?.length!==1 || choice?.message?.role!=='assistant' || typeof choice.message.content!=='string' || choice.message.tool_calls?.length)throw fail('runtime_identity_mismatch');
    if(choice.finish_reason!=='stop')throw fail(choice.finish_reason==='length'?'provider_output_limit':'provider_response_invalid');
    const usage=result.usage,known=count(usage?.prompt_tokens) && count(usage?.completion_tokens) && count(usage?.total_tokens) && usage.total_tokens===usage.prompt_tokens+usage.completion_tokens;
    return {model:config.modelId,content:[{type:'text',text:choice.message.content}],usage:known?{inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,totalTokens:usage.total_tokens}:null,usageKnown:known};
  }catch(error){throw fail(controller.signal.aborted?(signal?.aborted?'operator_cancel':'provider_timeout'):/^(provider_|runtime_identity_)/.test(error.code || '')?error.code:'provider_transport_failed');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

function prithaConnection(environment){
  const endpoint=environment.PRITHA_CHILD_MODEL_URL,token=environment.PRITHA_CHILD_MODEL_TOKEN;
  if(typeof endpoint!=='string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/api\/child-model$/.test(endpoint) || typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token || ''))throw fail('pritha_connection_unavailable');
  return {endpoint,token};
}
async function requestPrithaModel(config,input,{connection,fetchImpl,signal}){
  const {endpoint,token}=prithaConnection({PRITHA_CHILD_MODEL_URL:connection.endpoint,PRITHA_CHILD_MODEL_TOKEN:connection.token});
  try{
    const response=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({requestId:randomUUID(),input}),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(config.timeoutMs)]):AbortSignal.timeout(config.timeoutMs)});
    if(!response.body)throw fail('provider_response_invalid');
    const parts=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw fail('provider_output_limit');parts.push(chunk);}
    const result=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!response.ok)throw fail(/^(provider_|pritha_|runtime_identity_)[a-z_]+$/.test(result?.error || '')?result.error:'pritha_connection_unavailable');
    if(result.model!==config.modelId || !Array.isArray(result.content) || result.content.some(c=>c.type!=='text' || typeof c.text!=='string'))throw fail('provider_response_invalid');
    return result;
  }catch(error){throw fail(/^(provider_|pritha_|runtime_identity_)[a-z_]+$/.test(error.code || '')?error.code:signal?.aborted?'operator_cancel':'pritha_connection_unavailable');}
}
