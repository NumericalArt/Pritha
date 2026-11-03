import { createHash } from 'node:crypto';

const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const count=value=>Number.isSafeInteger(value) && value>=0;
const id=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
export const CLAUDE_SESSION_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const CLAUDE_MODEL_ID=/^claude-[a-z0-9]+(?:-[a-z0-9]+)+$/;
const fail=code=>{throw Object.assign(new Error('Claude returned an incomplete or incompatible execution record.'),{code});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['inputTokens','cacheWriteTokens','cacheReadTokens','outputTokens'];
const sourceFields=['input_tokens','cache_creation_input_tokens','cache_read_input_tokens','output_tokens'];
// Stock CLI stream-json / SDKAssistantMessageError (CLI 2.1.296, SDK 0.3.306).
const cliApiErrors=new Set(['authentication_failed','oauth_org_not_allowed','account_on_hold','verification_required','billing_error','rate_limit','overloaded','invalid_request','model_not_found','server_error','unknown','max_output_tokens','cloud_credential_error']);

/** Cache writes and cache hits are additional input tokens, never fresh input. */
export function claudeUsage(value){
  if(!object(value) || !count(value.input_tokens) || !count(value.output_tokens))return null;
  const row={};
  for(let i=0;i<fields.length;i++){
    const number=value[sourceFields[i]] ?? (i===1 || i===2?0:null);
    if(!count(number))return null;row[fields[i]]=number;
  }
  const total=fields.reduce((sum,key)=>sum+row[key],0);
  return Number.isSafeInteger(total)?{...row,totalTokens:total}:null;
}

/** Only explicit public text and observed tool activity cross the UI boundary.
 * Partial token events and private thinking/signatures are intentionally not copied. */
export class ClaudeStreamState {
  constructor({model,sessionId,authMode='api-key',onEvent=()=>{}}){
    if(!CLAUDE_MODEL_ID.test(model || '') || !CLAUDE_SESSION_ID.test(sessionId || ''))fail('runtime_identity_mismatch');
    this.model=model;this.expectedSession=sessionId;this.onEvent=onEvent;this.authMode=authMode;
    this.sessionId=null;this.messages=new Map();this.tools=new Map();this.results=new Map();
    this.result=null;this.errorCode=null;this.records=0;this.finished=false;
  }
  async event(type,item){await this.onEvent({type,...(item?{item}:{})});}
  checkSession(event){if(event.session_id!==undefined && event.session_id!==this.expectedSession)fail('runtime_identity_mismatch');}
  async accept(event){
    if(!object(event) || typeof event.type!=='string' || ++this.records>100000)fail('provider_stream_malformed');
    this.checkSession(event);
    if(event.type==='system' && event.subtype==='init'){
      if(event.session_id!==this.expectedSession || event.model!==this.model)fail('runtime_identity_mismatch');
      if(!this.sessionId){this.sessionId=event.session_id;await this.onEvent({type:'thread.started',thread_id:event.session_id});}
      return;
    }
    if(event.type==='stream_event')return; // Never expose raw thinking deltas.
    if(!['assistant','user','result'].includes(event.type)){
      if(event.type==='error')this.errorCode='provider_runtime_failed';
      if(event.type==='system' && event.subtype==='permission_denied')this.errorCode='provider_permission_denied';
      return;
    }
    if(!this.sessionId)fail('provider_stream_missing_init');
    if(event.parent_tool_use_id)fail('provider_subagent_unexpected');
    if(event.type==='result'){
      const fingerprint=hash(event),key=event.uuid || 'final';
      if(this.results.has(key)){if(this.results.get(key)!==fingerprint)fail('provider_result_conflict');return;}
      if(this.result)fail('provider_result_conflict');
      this.results.set(key,fingerprint);
      if(event.modelUsage && Object.keys(event.modelUsage).some(model=>model!==this.model))fail('runtime_identity_mismatch');
      this.result={usage:claudeUsage(event.usage),costUsd:typeof event.total_cost_usd==='number' && Number.isFinite(event.total_cost_usd) && event.total_cost_usd>=0?event.total_cost_usd:null,
        success:event.subtype==='success' && event.is_error!==true,subtype:event.subtype};
      if(!this.result.success && !['provider_native_login_required','provider_native_auth_unsupported'].includes(this.errorCode))this.errorCode=event.subtype==='error_max_turns'?'provider_max_turns':event.subtype==='error_max_budget_usd'?'provider_budget_exhausted':'provider_runtime_failed';
      if(Array.isArray(event.permission_denials) && event.permission_denials.length)this.errorCode='provider_permission_denied';
      return;
    }
    if(this.result)fail('provider_result_conflict');
    const message=event.message;
    if(!object(message) || !Array.isArray(message.content))fail('provider_stream_malformed');
    if(message.content.length>10000)fail('provider_output_limit');
    if(event.type==='assistant'){
      // The stock CLI represents an API failure as a local synthetic assistant
      // record. It is neither model output nor a chargeable assistant message.
      // Keep it failed and private; the host's budget receipt supplies the more
      // precise cause when a request was refused before upstream dispatch.
      if(cliApiErrors.has(event.error) && message.model==='<synthetic>' && id(message.id)
          && message.content.length>0 && message.content.every(block=>block?.type==='text' && typeof block.text==='string')){
        this.errorCode=this.authMode==='local-cli-session' && event.error==='authentication_failed'?'provider_native_login_required':this.authMode==='local-cli-session' && event.error==='oauth_org_not_allowed'?'provider_native_auth_unsupported':'provider_runtime_failed';return;
      }
      if(message.model!==this.model || !id(message.id))fail('runtime_identity_mismatch');
      const usage=claudeUsage(message.usage),prior=this.messages.get(message.id) || {usage:null,text:null};
      if(usage){const merged={};for(const key of fields)merged[key]=Math.max(prior.usage?.[key] || 0,usage[key]);merged.totalTokens=fields.reduce((sum,key)=>sum+merged[key],0);prior.usage=merged;}
      const texts=message.content.filter(block=>block?.type==='text').map(block=>{if(typeof block.text!=='string')fail('provider_stream_malformed');return block.text;});
      if(texts.length){const text=texts.join('\n');if(text!==prior.text){prior.text=text;await this.event('item.completed',{id:'claude_message_'+message.id,type:'agent_message',text});}}
      this.messages.set(message.id,prior);
      for(const block of message.content){
        if(block?.type!=='tool_use')continue;
        if(!id(block.id) || !id(block.name) || !object(block.input))fail('provider_tool_record_invalid');
        const fingerprint=hash([block.name,block.input]),known=this.tools.get(block.id);
        if(known){if(known.fingerprint!==fingerprint)fail('provider_tool_record_conflict');continue;}
        const item={id:'claude_tool_'+block.id,type:'mcp_tool_call',server:'claude',tool:block.name,arguments:block.input,status:'in_progress'};
        this.tools.set(block.id,{fingerprint,item,complete:false,resultHash:null});await this.event('item.started',item);
      }
    }else for(const block of message.content){
      if(block?.type!=='tool_result')continue;
      const tool=this.tools.get(block.tool_use_id);if(!tool)fail('provider_tool_receipt_orphan');
      const fingerprint=hash([block.content,block.is_error===true]);
      if(tool.complete){if(tool.resultHash!==fingerprint)fail('provider_tool_record_conflict');continue;}
      // Image/binary/thinking parts are not rendered as public tool output.
      const content=typeof block.content==='string'?block.content:Array.isArray(block.content)?block.content.filter(part=>part?.type==='text' && typeof part.text==='string').map(part=>part.text).join('\n'):'';
      tool.complete=true;tool.resultHash=fingerprint;tool.item={...tool.item,status:block.is_error?'failed':'completed',result:{content:[{type:'text',text:content}]}};
      await this.event('item.completed',tool.item);
    }
  }
  usage(){
    const known=[...this.messages.values()].filter(row=>row.usage),missing=this.messages.size-known.length;
    const observed=Object.fromEntries(fields.map(key=>[key,known.reduce((sum,row)=>sum+row.usage[key],0)]));
    observed.totalTokens=fields.reduce((sum,key)=>sum+observed[key],0);
    const result=this.result?.usage;
    const inconsistent=Boolean(result && fields.some(key=>result[key]<observed[key]));
    const usage=result && !inconsistent?result:known.length?observed:null;
    return {usage,usageKnown:Boolean(usage && !inconsistent && (result || !missing)),costUsd:this.result?.costUsd ?? null,
      usageSource:result && !inconsistent?'cli-result':'assistant-message-observation',usageInconsistent:inconsistent};
  }
  async finish(reason=null){
    if(this.finished)return this.final;this.finished=true;
    const unresolved=[...this.tools.values()].filter(tool=>!tool.complete);
    for(const tool of unresolved)await this.event('item.completed',{...tool.item,status:'failed',error:{code:'cancelled_or_ambiguous_tool_receipt',message:'Tool completion was not confirmed.'}});
    const usage=this.usage();
    const errorCode=reason || this.errorCode || (unresolved.length?'cancelled_or_ambiguous_tool_receipt':null) || (!this.result || !this.sessionId?'provider_stream_incomplete':null);
    this.final={ok:!errorCode,errorCode,sessionId:this.sessionId,model:this.model,...usage,unresolvedTools:unresolved.length};return this.final;
  }
}
