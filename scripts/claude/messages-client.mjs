import { ProviderHttpError, providerJson } from '../lib/provider-http.mjs';
import { CLAUDE_MODEL_ID, claudeUsage } from './stream-state.mjs';

export const ANTHROPIC_API_VERSION='2026-10-21';
const API='https://api.anthropic.com/v1';
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const token=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const continuations=new WeakMap(),opaqueBlocks=new WeakMap();
const invalid=()=>{throw new ProviderHttpError(400,'provider_input_invalid');};
function headers(key){
  if(typeof key!=='string' || !key || key.length>8192 || /[^\x21-\x7e]/.test(key))throw new ProviderHttpError(401,'provider_pending_auth');
  return {authorization:'Bearer '+key,'anthropic-version':ANTHROPIC_API_VERSION,'content-type':'application/json',accept:'application/json'};
}
function content(value,role){
  if(role==='assistant' && object(value) && opaqueBlocks.has(value))return opaqueBlocks.get(value);
  if(typeof value==='string')return value;
  if(!Array.isArray(value) || !value.length || value.length>1000)invalid();
  return value.map(block=>{
    if(!object(block))invalid();
    if(block.type==='text' && typeof block.text==='string')return {type:'text',text:block.text};
    if(block.type==='tool_use' && role==='assistant' && token(block.id) && token(block.name) && object(block.input))return {type:'tool_use',id:block.id,name:block.name,input:block.input};
    if(block.type==='tool_result' && role==='user' && token(block.tool_use_id) && typeof block.content==='string')return {type:'tool_result',tool_use_id:block.tool_use_id,content:block.content,is_error:block.is_error===true};
    invalid();
  });
}
export function buildClaudeMessageRequest(input){
  if(!object(input) || Object.keys(input).some(key=>!['model','messages','system','maxTokens','tools','effort'].includes(key)) || !CLAUDE_MODEL_ID.test(input.model || '')
      || !Array.isArray(input.messages) || !input.messages.length || input.messages.length>200 || !Number.isSafeInteger(input.maxTokens) || input.maxTokens<1 || input.maxTokens>128000)invalid();
  const body={model:input.model,max_tokens:input.maxTokens,stream:false,messages:input.messages.map(message=>{
    if(!object(message) || !['user','assistant'].includes(message.role))invalid();return {role:message.role,content:content(message.content,message.role)};
  })};
  if(input.system!==undefined){if(typeof input.system!=='string')invalid();body.system=input.system;}
  if(input.effort!==undefined){if(!['low','medium','high','xhigh','max'].includes(input.effort))invalid();body.output_config={effort:input.effort};}
  if(input.tools!==undefined){
    if(!Array.isArray(input.tools) || input.tools.length>64)invalid();const names=new Set();
    body.tools=input.tools.map(tool=>{
      if(!object(tool) || Object.keys(tool).some(key=>!['name','description','input_schema'].includes(key)) || !token(tool.name) || names.has(tool.name)
          || typeof tool.description!=='string' || tool.description.length>8000 || !object(tool.input_schema) || tool.input_schema.type!=='object')invalid();
      names.add(tool.name);return {name:tool.name,description:tool.description,input_schema:tool.input_schema};
    });
  }
  if(Buffer.byteLength(JSON.stringify(body))>2*1024*1024)invalid();return body;
}

/** Child-runtime API client. It returns tool requests; it never executes them,
 * calls a server tool, follows redirects, or retries a possibly accepted request. */
export async function createClaudeMessage(input,{apiKey,fetchImpl=globalThis.fetch,timeoutMs=120000,signal,onDispatch}={}){
  const body=buildClaudeMessageRequest(input),requestHeaders=headers(apiKey);
  if(!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>3600000)invalid();
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(abort,timeoutMs);
  try{
    if(controller.signal.aborted)throw new ProviderHttpError(499,'operator_cancel');
    await onDispatch?.();
    const response=await fetchImpl(API+'/messages',{method:'POST',headers:requestHeaders,body:JSON.stringify(body),redirect:'error',signal:controller.signal});
    if(!response.ok){await response.body?.cancel();throw new ProviderHttpError(response.status,response.status===401 || response.status===403?'provider_pending_auth':response.status===402?'provider_billing_required':response.status===429?'provider_rate_limited':'provider_unavailable');}
    if(!response.body)throw new ProviderHttpError(502,'provider_response_invalid');
    const chunks=[];let bytes=0;
    for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>16*1024*1024){controller.abort();throw new ProviderHttpError(502,'provider_output_limit');}chunks.push(Buffer.from(chunk));}
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{throw new ProviderHttpError(502,'provider_response_invalid');}
    if(!object(value) || value.model!==input.model || !token(value.id) || !Array.isArray(value.content) || value.content.length>1000)throw new ProviderHttpError(502,'runtime_identity_mismatch');
    const allowed=new Set((body.tools || []).map(tool=>tool.name)),toolIds=new Set(),visible=[];
    for(const block of value.content){
      if(block.type==='text' && typeof block.text==='string')visible.push({type:'text',text:block.text});
      else if(block.type==='tool_use'){
        if(!token(block.id) || toolIds.has(block.id) || !allowed.has(block.name) || !object(block.input))throw new ProviderHttpError(502,'provider_tool_policy_violation');
        toolIds.add(block.id);visible.push({type:'tool_use',id:block.id,name:block.name,input:block.input});
      }else if(!['thinking','redacted_thinking'].includes(block.type))throw new ProviderHttpError(502,'provider_response_invalid');
    }
    const stopReason=['end_turn','max_tokens','stop_sequence','tool_use','pause_turn','refusal'].includes(value.stop_reason)?value.stop_reason:'unknown';
    const result={id:value.id,model:value.model,content:visible,stopReason,usage:claudeUsage(value.usage),complete:stopReason==='end_turn',truncated:stopReason==='max_tokens'};
    // Signed thinking must survive a tool continuation on current models, but
    // must not appear in public output or accidental JSON/log serialization.
    continuations.set(result,structuredClone(value.content));return result;
  }catch(error){if(error instanceof ProviderHttpError)throw error;throw new ProviderHttpError(503,signal?.aborted?'operator_cancel':controller.signal.aborted?'provider_timeout':'provider_unavailable');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

/** Same-process child conversation continuation. A serialized public reply is
 * deliberately insufficient; durable conversations use the private CLI store. */
export function claudeAssistantTurn(reply){
  if(!continuations.has(reply))throw new ProviderHttpError(409,'provider_continuation_unavailable');
  const opaque=Object.freeze({type:'private-claude-continuation'});opaqueBlocks.set(opaque,continuations.get(reply));
  return {role:'assistant',content:opaque};
}

/** A key catalog is evidence of model visibility, not a paid inference probe. */
export async function listClaudeModels({apiKey,fetchImpl=globalThis.fetch}={}){
  const requestHeaders=headers(apiKey),rows=[],seen=new Set(),deadline=Date.now()+5000;let after;
  for(let page=0;page<10;page++){
    const remaining=deadline-Date.now();if(remaining<=0)throw new ProviderHttpError(503,'provider_timeout');
    const value=await providerJson(API+'/models?limit=100'+(after?'&after_id='+encodeURIComponent(after):''),{headers:requestHeaders,fetchImpl,timeoutMs:remaining});
    if(!Array.isArray(value.data) || value.data.length>100 || typeof value.has_more!=='boolean')throw new ProviderHttpError(502,'provider_metadata_invalid');
    for(const row of value.data){
      if(!CLAUDE_MODEL_ID.test(row?.id || '') || seen.has(row.id))throw new ProviderHttpError(502,'provider_metadata_invalid');seen.add(row.id);
      const capability=row.capabilities || {},efforts=['low','medium','high','xhigh','max'].filter(level=>capability.effort?.[level]?.supported===true);
      rows.push({id:row.id,label:typeof row.display_name==='string'?row.display_name.slice(0,200):row.id,line:['sonnet','opus','haiku','fable'].includes(row.line)?row.line:null,
        lifecycle:['active','deprecated','retired'].includes(row.lifecycle)?row.lifecycle:'unknown',createdAt:typeof row.created_at==='string'?row.created_at:null,efforts,
        imageInput:capability.image_input?.supported===true,maxOutputTokens:Number.isSafeInteger(row.max_tokens)&&row.max_tokens>0?row.max_tokens:null});
    }
    if(!value.has_more)return rows;
    if(!value.data.length || value.last_id!==value.data.at(-1).id || after===value.last_id)throw new ProviderHttpError(502,'provider_metadata_invalid');after=value.last_id;
  }
  throw new ProviderHttpError(502,'provider_catalog_incomplete');
}

/** Alias selection happens once before a new binding; existing sessions use the exact ID. */
export function resolveClaudeModel(requested,models){
  const exact=models.find(row=>row.id===requested && row.lifecycle==='active');if(exact)return exact;
  if(['sonnet','opus','haiku'].includes(requested)){
    const candidates=models.filter(row=>row.line===requested && row.lifecycle==='active' && Number.isFinite(Date.parse(row.createdAt))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
    if(candidates[0] && (!candidates[1] || candidates[0].createdAt!==candidates[1].createdAt))return candidates[0];
  }
  throw new ProviderHttpError(409,'provider_model_unavailable');
}
