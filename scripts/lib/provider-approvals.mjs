import { createHash } from 'node:crypto';
import { ExecutionConflict } from './execution-coordinator.mjs';
import { registerExecutionChannel,callExecutionChannel,executionChannelView } from './execution-channel.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId=value=>typeof value==='string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const failure=code=>new ExecutionConflict(code,'This approval changed or its execution owner is unavailable.');
function responseFor(row,input){
  if(row.requestKind==='user_input'){
    const questions=row.presentation.questions,answers=input.answers;
    if(!answers || typeof answers!=='object' || Array.isArray(answers) || Object.keys(answers).some(key=>!questions.some(q=>q.id===key)))throw failure('native_answer_invalid');
    const result={};
    for(const question of questions){const values=answers[question.id];if(!Array.isArray(values) || !values.length || values.length>10 || values.some(value=>typeof value!=='string' || !value.trim() || Buffer.byteLength(value)>4000))throw failure('native_answer_invalid');result[question.id]=values;}
    return {answers:result};
  }
  if(!['accept','decline','cancel'].includes(input.decision))throw failure('native_answer_invalid');return {decision:input.decision};
}
function scoped(coordinator,chatId,input){
  if(!validId(input.clientMessageId) || !Number.isSafeInteger(input.revision))throw failure('native_answer_invalid');
  const row=coordinator.getIntentById(input.requestId);
  if(!row || row.kind!=='provider-request' || row.chatId!==chatId)throw failure('native_request_not_found');return row;
}
export async function answerProviderRequest(coordinator,chatId,input){
  const row=scoped(coordinator,chatId,input),response=responseFor(row,input);
  const recorded=current=>current?.state==='answered' && current.revision-1===input.revision && current.responseHash===hash(response);
  if(recorded(row))return {submitted:true,replayed:true};
  if(row.state!=='pending' || row.revision!==input.revision)throw failure('native_request_changed');
  const channel=executionChannelView(coordinator,'provider-answer:'+row.id);
  try {
    if(!channel || channel.chatId!==chatId || channel.turnId!==row.turnId || channel.owner!==row.owner || channel.generation!==row.generation)throw failure('control_connection_expired');
    return await callExecutionChannel(coordinator,'provider-answer:'+row.id,input);
  } catch(error) {
    // A second tab, or an acknowledgement lost after the CAS, can race close.
    // Reconcile the recorded answer; never send it again from this catch.
    if(recorded(scoped(coordinator,chatId,input)))return {submitted:true,replayed:true};
    throw error;
  }
}
export function pendingProviderRequests(coordinator,chatId){
  return coordinator.listIntents({kind:'provider-request',chatId,states:['pending','channel_unavailable'],limit:200}).map(row=>{
    const endpoint=executionChannelView(coordinator,'provider-answer:'+row.id);
    const ready=row.state==='pending' && endpoint?.chatId===chatId && endpoint.turnId===row.turnId && endpoint.owner===row.owner && endpoint.generation===row.generation;
    return {requestId:row.id,chatId,turnId:row.turnId,itemId:null,kind:row.requestKind,
      title:row.requestKind==='user_input'?'Input needed':'Approval needed',reason:row.reason || null,expiresAt:row.expiresAt,resolved:false,presentation:{...row.presentation,revision:row.revision,state:ready?'pending':'channel_unavailable'}};
  });
}
export function expireProviderRequests(coordinator,chatId,turnId){
  for(const row of coordinator.listIntents({kind:'provider-request',chatId,turnId,states:['connecting','pending','channel_unavailable'],limit:1000}))if(validId(row.operationId))coordinator.updateIntent('provider-request:'+chatId+':'+turnId+':'+row.operationId,{state:'expired'},row.revision);
}

/** Permission answers authorize one exact host action. They do not execute it,
 * relax a sandbox, amend policies, or authorize another turn. */
export class ProviderApprovalBroker {
  constructor({coordinator,chatId,turnId,lease,signal,emit=()=>{}}){Object.assign(this,{coordinator,chatId,turnId,lease,signal,emit});this.waiters=new Map();this.closed=false;}
  async ask({operationId,kind,presentation,reason,timeoutMs=300000}){
    if(this.closed || this.signal?.aborted)throw failure('provider_request_expired');this.lease.assertOwned();
    if(!validId(operationId) || !['command_approval','file_change_approval','user_input'].includes(kind) || !presentation || typeof presentation!=='object' || Array.isArray(presentation)
        || Buffer.byteLength(JSON.stringify(presentation))>64000 || typeof reason!=='string' || reason.length>4000 || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>600000)throw failure('native_answer_invalid');
    if(kind==='user_input' && (!Array.isArray(presentation.questions) || presentation.questions.length<1 || presentation.questions.length>3
        || presentation.questions.some(q=>!validId(q.id) || typeof q.question!=='string' || !q.question.trim() || q.question.length>2000 || q.isSecret===true)))throw failure('native_answer_invalid');
    const key='provider-request:'+this.chatId+':'+this.turnId+':'+operationId;
    const reserved=this.coordinator.reserveIntent(key,hash({kind,presentation,reason}),{kind:'provider-request',chatId:this.chatId,turnId:this.turnId,operationId,owner:this.lease.owner,generation:this.lease.generation,requestKind:kind,presentation,reason,
      expiresAt:new Date(Date.now()+timeoutMs).toISOString()},{limit:{max:128,states:['pending','connecting']}});
    if(reserved.intent.state==='answered')return reserved.intent.response;
    if(this.waiters.has(key))return this.waiters.get(key).promise;
    if(!reserved.created)throw failure('provider_request_expired');
    const row=this.coordinator.updateIntent(key,{state:'connecting'},reserved.intent.revision);
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const waiter={promise,resolve,reject,cleanup:null};this.waiters.set(key,waiter);
    const expire=(unavailable=false)=>{
      if(this.waiters.get(key)!==waiter)return;
      const current=this.coordinator.getIntent(key);if(['connecting','pending'].includes(current?.state))this.coordinator.updateIntent(key,{state:unavailable===true?'channel_unavailable':'expired'},current.revision);
      waiter.cleanup?.();this.waiters.delete(key);this.emit();reject(failure(unavailable===true?'control_channel_unavailable':'provider_request_expired'));
    };
    const timer=setTimeout(expire,timeoutMs);this.signal?.addEventListener('abort',expire,{once:true});
    let close;
    waiter.cleanup=()=>{clearTimeout(timer);close?.();this.signal?.removeEventListener('abort',expire);};waiter.expire=expire;
    try {close=registerExecutionChannel(this.coordinator,'provider-answer:'+row.id,{
      view:()=>this.closed || !this.waiters.has(key)?null:{chatId:this.chatId,turnId:this.turnId,owner:this.lease.owner,generation:this.lease.generation},
      call:input=>this.coordinator.withMutation('provider-answer:'+row.id,async()=>{
        this.lease.assertOwned();const current=scoped(this.coordinator,this.chatId,input),response=responseFor(current,input),responseHash=hash(response);
        if(current.id!==row.id || current.turnId!==this.turnId || current.owner!==this.lease.owner || current.generation!==this.lease.generation)throw failure('native_request_not_found');
        if(current.state==='answered' && current.revision-1===input.revision && current.responseHash===responseHash)return {submitted:true,replayed:true};
        if(this.closed || this.signal?.aborted || current.state!=='pending' || current.revision!==input.revision || Date.now()>=Date.parse(current.expiresAt))throw failure('native_request_changed');
        this.coordinator.updateIntent(key,{state:'answered',responseHash,response,clientMessageId:input.clientMessageId},current.revision);
        waiter.cleanup?.();this.waiters.delete(key);this.emit();resolve(response);return {submitted:true,replayed:false};
      }),
    });}catch{expire(true);return promise;}
    void close.ready.then(()=>{
      if(!this.waiters.has(key))return;
      this.lease.assertOwned();
      this.coordinator.updateIntent(key,{state:'pending'},row.revision);
      this.emit();
    }).catch(()=>expire(true));
    if(this.signal?.aborted)expire();return promise;
  }
  close(){this.closed=true;for(const waiter of [...this.waiters.values()])waiter.expire();}
}
