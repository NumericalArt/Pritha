import {createHash,randomUUID} from 'node:crypto';
import {openSync,closeSync,writeFileSync,fsyncSync,constants} from 'node:fs';
import path from 'node:path';
import {atomicWriteFile} from './atomic-file.mjs';
import {privateStateFile} from './private-state-path.mjs';
import {neuralDeepUsageKnown,normalizeNeuralDeepUsage} from '../neuraldeep/usage-ledger.mjs';

const count=value=>Number.isSafeInteger(value) && value>=0;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>Object.assign(new Error('The host could not authorize a request within its recorded budget.'),{code,statusCode:409});
/** Whitelist counts and enums; provider text, identities and reasoning are never retained. */
function responseDiagnostics(value){
  if(value?.version!==1 || !['completed','incomplete','failed','cancelled'].includes(value.status))return null;
  const number=n=>Number.isSafeInteger(n) && n>=0 && n<=Number.MAX_SAFE_INTEGER?n:null;
  const outputItems=Object.fromEntries(['message','reasoning','function_call','custom_tool_call','local_shell_call','other'].map(key=>[key,number(value.outputItems?.[key])]));
  return {version:1,status:value.status,outputItems,terminalPublicText:value.terminalPublicText===true,
    emptyOutputRetrySafe:value.emptyOutputRetrySafe===true,
    rejectedToolRetrySafe:value.rejectedToolRetrySafe===true,
    incompleteReason:value.incompleteReason==null?null:['max_output_tokens','content_filter'].includes(value.incompleteReason)?value.incompleteReason:'other',
    outputTokens:number(value.outputTokens),outputLimit:number(value.outputLimit),outputLimitReached:value.outputLimitReached===true,reasoningTokens:number(value.reasoningTokens)};
}
// Adapted from the pinned NeuralDeep provider-budget text-only admission policy.
function assertText(payload){
  const reject=()=>{throw fail('provider_budget_input_unbounded');};
  if(payload.previous_response_id || payload.conversation)reject();
  const content=value=>{if(typeof value==='string')return;if(!Array.isArray(value))reject();for(const part of value)if(!part || !['input_text','output_text','summary_text','reasoning_text','refusal'].includes(part.type) || typeof(part.type==='refusal'?part.refusal:part.text)!=='string')reject();};
  if(payload.input!=null && typeof payload.input!=='string'){
    if(!Array.isArray(payload.input))reject();
    for(const item of payload.input){
      if(!item || typeof item!=='object' || item.encrypted_content)reject();
      if(item.type==='message' || !item.type && item.role)content(item.content);
      else if(item.type==='function_call'){if(typeof item.arguments!=='string')reject();}
      else if(item.type==='custom_tool_call'){if(typeof item.input!=='string')reject();}
      else if(['function_call_output','custom_tool_call_output'].includes(item.type))content(item.output);
      else if(item.type==='reasoning'){content(item.summary || []);if(item.content!=null)content(item.content);}
      else reject();
    }
  }
  const tools=list=>{if(list==null)return;if(!Array.isArray(list))reject();for(const tool of list){if(tool?.type==='namespace' && Array.isArray(tool.tools))tools(tool.tools);else if(!['function','custom'].includes(tool?.type))reject();}};tools(payload.tools);
}

/** Request shape for the measured-prefix reservation: everything except the
 * input list, and one hash per input item. */
function requestShape(payload){
  if(!Array.isArray(payload.input))return null;
  const {input,max_output_tokens:_output,...envelope}=payload;
  return {envelope:hash(envelope),items:input.map(item=>hash(item))};
}
function extendsPrefix(prior,shape){
  return Boolean(prior && shape && prior.envelope===shape.envelope && shape.items.length>=prior.items.length
    && prior.items.every((item,index)=>item===shape.items[index]));
}

/** Conservative reservations, never claimed to be tokenizer counts.
 *
 * A stateless Responses client resends the whole conversation with every
 * request. When a request repeats the previous measured request exactly (same
 * instructions, tools and leading input items) and only appends items, the
 * provider's measured input tokens stand for that prefix and only the appended
 * items are reserved at one token per UTF-8 byte. Any other request is reserved
 * entirely by its bytes. Bytes alone overstated kimi requests about 4.5 times
 * and paused builds at half their authorized budget (2026-11-16). The overshoot
 * check below still stops a run whose usage exceeds its reservation.
 * Every completed receipt is durable before executable tool output is released. */
export class ResponsesRequestBudget {
  constructor({tokenBudget,checkpoint,contextTokens=null}){
    if(!Number.isSafeInteger(tokenBudget) || tokenBudget<1 || typeof checkpoint!=='function')throw fail('provider_budget_invalid');
    this.tokenBudget=tokenBudget;this.checkpoint=checkpoint;this.contextTokens=contextTokens;this.rows=[];this.current=null;this.preparing=false;this.errorCode=null;this.admissionFailure=null;
    // The last measured request this process sent: its shape and its provider-measured input tokens.
    this.measuredPrefix=null;this.currentShape=null;
  }
  snapshot(){const observed=this.rows.reduce((n,row)=>n+(row.usage?.totalTokens || 0),0),known=count(observed) && this.rows.every(row=>row.status==='measured');return {version:1,tokenBudget:this.tokenBudget,tokensUsed:known?observed:null,observedTokens:observed,usageKnown:known,errorCode:this.errorCode,...(this.admissionFailure?{admissionFailure:{...this.admissionFailure}}:{}),requests:structuredClone(this.rows)};}
  async begin(payload,{requestHash}={}){
    if(this.preparing || this.current || this.errorCode)throw fail(this.errorCode || 'provider_request_unconfirmed');this.preparing=true;
    try{
      assertText(payload);const snapshot=this.snapshot();if(!snapshot.usageKnown)throw fail('provider_usage_unconfirmed');
      if(this.rows.length>=384)throw fail('provider_request_limit');
      if(!Number.isSafeInteger(payload.max_output_tokens) || payload.max_output_tokens<1)throw fail('provider_budget_invalid');
      const bytes=Buffer.byteLength(JSON.stringify(payload)),shape=requestShape(payload),prior=this.measuredPrefix;
      const prefix=extendsPrefix(prior,shape)?{sequence:prior.sequence,inputTokens:prior.inputTokens,newItemBytes:Buffer.byteLength(JSON.stringify(payload.input.slice(prior.items.length)))}:null;
      const estimate=prefix?prefix.inputTokens+prefix.newItemBytes:bytes;
      const reserve=estimate+8192,available=this.tokenBudget-snapshot.tokensUsed-reserve-64;
      const output=Math.min(payload.max_output_tokens,32768,available);
      if(output<Math.min(payload.max_output_tokens,1024)){
        const requiredTokens=reserve+64+Math.min(payload.max_output_tokens,1024),remainingTokens=this.tokenBudget-snapshot.tokensUsed;
        this.admissionFailure={code:'provider_budget_exhausted',upstreamAttempted:false,remainingTokens,requiredTokens,shortfallTokens:requiredTokens-remainingTokens};
        throw fail('provider_budget_exhausted');
      }
      // Byte estimates safely reserve spend, but are not model-token counts.
      // Do not reject a conversation as over-context from this heuristic: the
      // native runtime uses provider token usage for compaction and the selected
      // model's configured context window. Keep the estimate as a diagnostic.
      const contextEstimate=this.contextTokens?{estimatedTokens:Math.ceil(bytes/2)+8192+output,declaredLimit:this.contextTokens,basis:'utf8-bytes-divided-by-two',enforcement:'advisory'}:null;
      payload={...payload,max_output_tokens:output};
      const row={sequence:this.rows.length+1,requestHash:requestHash || hash(payload),wireHash:hash(payload),status:'reserved',inputEstimate:estimate,estimateBasis:prefix?'measured-prefix':'utf8-bytes',...(prefix?{measuredPrefix:prefix}:{}),estimateMargin:8192,maxOutputTokens:output,reservedTokens:reserve+output,...(contextEstimate?{contextEstimate}:{}),usage:null,createdAt:new Date().toISOString()};
      if(this.rows.some(prior=>prior.requestHash===row.requestHash))throw fail('provider_request_uncertain');
      this.rows.push(row);this.current=row;this.currentShape=shape;await this.checkpoint(this.snapshot());return payload;
    }catch(error){
      this.errorCode=error.code || 'provider_budget_checkpoint_failed';
      // A refused request has no reservation or usage row. Persist its reason
      // separately, so recovery can distinguish a local shortfall from dispatch.
      if(!this.current)try{await this.checkpoint(this.snapshot());}catch{this.errorCode='provider_budget_checkpoint_failed';}
      throw fail(this.errorCode);
    }finally{this.preparing=false;}
  }
  async record(event){
    if(!this.current)return;
    const row=this.current;if(event.requestHash!==row.requestHash)throw fail('provider_usage_conflict');
    const known=event.upstreamAttempted===false || neuralDeepUsageKnown(event.usage);
    Object.assign(row,{status:known?'measured':'unknown',usage:known?normalizeNeuralDeepUsage(event.upstreamAttempted===false?{input_tokens:0,output_tokens:0}:event.usage):null,upstreamAttempted:event.upstreamAttempted===true,finishedAt:new Date().toISOString()});
    const diagnostics=responseDiagnostics(event.responseSummary);if(diagnostics)row.responseDiagnostics=diagnostics;
    if(!known)this.errorCode='provider_usage_unconfirmed';
    else if(row.usage.totalTokens>row.reservedTokens || this.snapshot().tokensUsed>this.tokenBudget)this.errorCode='provider_budget_overshoot';
    // Only a request the provider answered and measured becomes the base of the next reservation.
    if(known && row.upstreamAttempted && row.usage.inputTokens>0 && this.currentShape)this.measuredPrefix={...this.currentShape,inputTokens:row.usage.inputTokens,sequence:row.sequence};
    else if(!known)this.measuredPrefix=null;
    this.currentShape=null;
    try{await this.checkpoint(this.snapshot());this.current=null;}catch{this.errorCode='provider_budget_checkpoint_failed';throw fail(this.errorCode);}
    if(this.errorCode)throw fail(this.errorCode);
  }
}

export async function openResponsesBudget(options){
  if(options.tokenBudget===undefined)return null;
  const {stateRoot,privateRoot,identity,model,onCheckpoint,contextTokens}=options,budgetId=options.budgetId || randomUUID();
  if(!/^[a-f0-9-]{36}$/i.test(budgetId))throw fail('provider_budget_invalid');
  const file=privateStateFile(stateRoot,path.join(privateRoot,'budgets',budgetId+'.json'));let sessionId=options.resume || null;
  const serialized=snapshot=>JSON.stringify({identity,model,sessionId,budgetId,...snapshot})+'\n';
  const budget=new ResponsesRequestBudget({tokenBudget:options.tokenBudget,contextTokens,checkpoint:async snapshot=>{privateStateFile(stateRoot,file);atomicWriteFile(file,serialized(snapshot));await onCheckpoint?.({...snapshot,sessionId});}});
  let fd;try{fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,serialized(budget.snapshot()));fsyncSync(fd);}catch{throw fail('provider_budget_receipt_exists');}finally{if(fd!==undefined)closeSync(fd);}
  return {budgetId,budget,snapshot:()=>budget.snapshot(),begin:(...args)=>budget.begin(...args),record:event=>budget.record(event),
    async bindSession(id){if(sessionId && sessionId!==id)throw fail('provider_budget_session_mismatch');sessionId=id;await budget.checkpoint(budget.snapshot());}};
}
