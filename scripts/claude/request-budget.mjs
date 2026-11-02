import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { claudeUsage } from './stream-state.mjs';

const fail=code=>Object.assign(new Error('The host could not authorize another Claude request within the recorded budget.'),{code});
const count=value=>Number.isSafeInteger(value) && value>=0;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Count is provider-estimated, not a promise of an exact charge. Reserve a
 * margin plus maximum output; an overshoot or uncertain response stops the loop. */
export async function countClaudeRequestTokens(payload,{headers,fetchImpl=globalThis.fetch,signal,timeoutMs=5000}={}){
  const body=Object.fromEntries(['model','messages','system','tools','thinking','tool_choice','output_config','cache_control','speed'].filter(key=>payload[key]!==undefined).map(key=>[key,payload[key]]));
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,timeoutMs);
  try{
    const response=await fetchImpl('https://api.anthropic.com/v1/messages/count_tokens',{method:'POST',headers:{...headers,accept:'application/json'},body:JSON.stringify(body),redirect:'error',signal:controller.signal});
    if(!response.ok || !response.body){await response.body?.cancel();throw fail('provider_token_count_unavailable');}
    const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>16000){controller.abort();throw fail('provider_token_count_invalid');}chunks.push(Buffer.from(chunk));}
    let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('provider_token_count_invalid');}
    if(!count(value.input_tokens))throw fail('provider_token_count_invalid');return value.input_tokens;
  }catch(error){throw /^provider_token_count_/.test(error.code || '')?error:fail(signal?.aborted?'operator_cancel':'provider_token_count_unavailable');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

/** Retains only usage and identity. Thinking, tool payloads and text are never
 * copied into budget receipts. A terminal stream marker is mandatory. */
export class ClaudeResponseUsage {
  constructor(model,stream){this.model=model;this.stream=stream;this.decoder=new StringDecoder('utf8');this.pending='';this.id=null;this.usage=null;this.started=false;this.stopped=false;this.delta=false;}
  record(value){
    if(value.type==='message_start'){
      if(this.started || value.message?.model!==this.model || typeof value.message.id!=='string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value.message.id))throw fail('provider_usage_invalid');
      this.started=true;this.id=value.message.id;this.usage=claudeUsage(value.message.usage);if(!this.usage)throw fail('provider_usage_invalid');
    }else if(value.type==='message_delta'){
      if(!this.started || this.stopped || !count(value.usage?.output_tokens) || value.usage.output_tokens<this.usage.outputTokens)throw fail('provider_usage_invalid');
      for(const [input,field] of [['input_tokens','inputTokens'],['cache_creation_input_tokens','cacheWriteTokens'],['cache_read_input_tokens','cacheReadTokens']])if(value.usage[input]!==undefined){if(!count(value.usage[input]) || value.usage[input]<this.usage[field])throw fail('provider_usage_invalid');this.usage[field]=value.usage[input];}
      this.delta=true;this.usage.outputTokens=value.usage.output_tokens;this.usage.totalTokens=this.usage.inputTokens+this.usage.cacheWriteTokens+this.usage.cacheReadTokens+this.usage.outputTokens;
    }else if(value.type==='message_stop'){
      if(!this.started || !this.delta || this.stopped)throw fail('provider_usage_invalid');this.stopped=true;
    }else if(value.type==='error')throw fail('provider_usage_unconfirmed');
  }
  push(bytes){
    this.pending+=this.decoder.write(bytes);
    if(this.pending.length>16*1024*1024)throw fail('provider_usage_invalid');
    if(!this.stream)return;
    let boundary;while((boundary=this.pending.indexOf('\n'))>=0){const line=this.pending.slice(0,boundary).replace(/\r$/,'');this.pending=this.pending.slice(boundary+1);if(line.startsWith('data:')){let value;try{value=JSON.parse(line.slice(5).trim());}catch{throw fail('provider_usage_invalid');}this.record(value);}}
  }
  finish(){
    this.pending+=this.decoder.end();
    if(this.stream){if(this.pending.trim() || !this.stopped)throw fail('provider_usage_unconfirmed');return {messageId:this.id,usage:this.usage};}
    let value;try{value=JSON.parse(this.pending);}catch{throw fail('provider_usage_invalid');}
    const usage=claudeUsage(value.usage);if(!usage || value.model!==this.model || typeof value.id!=='string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value.id) || !value.stop_reason)throw fail('provider_usage_invalid');return {messageId:value.id,usage};
  }
}

export class ClaudeRequestBudget {
  constructor({tokenBudget,checkpoint,countTokens=countClaudeRequestTokens}){
    if(!Number.isSafeInteger(tokenBudget) || tokenBudget<1 || typeof checkpoint!=='function')throw fail('provider_budget_invalid');
    this.tokenBudget=tokenBudget;this.checkpoint=checkpoint;this.countTokens=countTokens;this.rows=[];this.errorCode=null;this.inflight=null;this.preparing=false;
  }
  snapshot(){const used=this.rows.reduce((sum,row)=>sum+(row.usage?.totalTokens || 0),0),known=count(used) && this.rows.every(row=>row.status==='measured');return {version:1,tokenBudget:this.tokenBudget,tokensUsed:known?used:null,observedTokens:count(used)?used:null,usageKnown:known,errorCode:this.errorCode,requests:structuredClone(this.rows)};}
  async begin(payload,context){
    if(this.preparing || this.inflight || this.errorCode)throw fail(this.errorCode || 'provider_request_unconfirmed');this.preparing=true;
    try{
      const snapshot=this.snapshot();if(!snapshot.usageKnown)throw fail('provider_usage_unconfirmed');if(this.rows.length>=384)throw fail('provider_request_limit');
      const estimate=await this.countTokens(payload,context),margin=Math.max(1024,Math.ceil(estimate*0.1)),available=this.tokenBudget-snapshot.tokensUsed-estimate-margin;
      const minimum=payload.thinking?.type==='enabled'?Math.max(256,Number(payload.thinking.budget_tokens)+1):256;
      if(!count(estimate) || !Number.isSafeInteger(available) || !Number.isSafeInteger(minimum) || available<minimum)throw fail('provider_budget_exhausted');
      payload.max_tokens=Math.min(payload.max_tokens,available);
      const row={sequence:this.rows.length+1,requestHash:hash(payload),status:'reserved',inputEstimate:estimate,estimateMargin:margin,maxOutputTokens:payload.max_tokens,reservedTokens:estimate+margin+payload.max_tokens,usage:null,createdAt:new Date().toISOString()};
      this.rows.push(row);this.inflight=row;await this.checkpoint(this.snapshot());return row.sequence;
    }catch(error){
      this.errorCode=error.code || 'provider_budget_checkpoint_failed';
      // A refusal before reservation still needs durable evidence. Otherwise
      // recovery sees only the last successful charge and can misdiagnose the
      // CLI's subsequent synthetic API error as a different model.
      if(!this.inflight)try{await this.checkpoint(this.snapshot());}catch{this.errorCode='provider_budget_checkpoint_failed';}
      throw fail(this.errorCode);
    }
    finally{this.preparing=false;}
  }
  async settle(sequence,result){
    const row=this.inflight;if(!row || row.sequence!==sequence || !result?.usage || !count(result.usage.totalTokens))throw fail('provider_usage_invalid');
    if(this.rows.some(other=>other!==row && other.messageId===result.messageId))throw fail('provider_usage_conflict');
    Object.assign(row,{status:'measured',usage:result.usage,messageId:result.messageId,finishedAt:new Date().toISOString()});
    const snapshot=this.snapshot();if(!snapshot.usageKnown || result.usage.totalTokens>row.reservedTokens || snapshot.tokensUsed>this.tokenBudget)this.errorCode='provider_budget_overshoot';
    // Do not clear the active reservation before durable accounting succeeds.
    try{await this.checkpoint(this.snapshot());this.inflight=null;}catch{this.errorCode='provider_budget_checkpoint_failed';throw fail(this.errorCode);}
  }
  async unknown(sequence){
    const row=this.inflight;if(row && row.sequence===sequence){row.status='unknown';row.finishedAt=new Date().toISOString();this.errorCode ||= 'provider_usage_unconfirmed';await this.checkpoint(this.snapshot());}
  }
}
