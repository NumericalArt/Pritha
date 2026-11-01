import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, constants, openSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ProviderChatRegistry } from './provider-chat-registry.mjs';
import {normalizeChatSubject} from './chat-subject.mjs';
import { ExecutionCoordinator } from './execution-coordinator.mjs';
import { callExecutionChannel, executionChannelView, registerExecutionChannel } from './execution-channel.mjs';
import { inspectTaskWorkspace, prepareTaskWorkspace, taskWorkspaceResources, verifyTaskWorkspace } from './task-workspace.mjs';
import { privateStateDirectory, privateStateFile } from './private-state-path.mjs';
import { providerProcessTreesExited } from './provider-process-proof.mjs';
import { ProviderApprovalBroker,answerProviderRequest,pendingProviderRequests,expireProviderRequests } from './provider-approvals.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=()=>new Date().toISOString();
const validClient=value=>typeof value==='string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const activeStates=['dispatching','running','unknown'];
const waitingStates=['queued','dispatching','unknown','blocked'];
const safeCode=error=>/^[a-z][a-z0-9_]{0,79}$/.test(error?.code || '') ? error.code : 'provider_runtime_failed';
export class ProviderTaskError extends Error { constructor(code,message='The provider task could not be completed safely.',status=409){super(message);this.code=code;this.status=status;this.retryable=false;} }
const failure=(code,message,status)=>new ProviderTaskError(code,message,status);
const queueKey=(chat,client)=>'provider-queued:'+chat+':'+client;
const turnKey=(chat,client)=>'turn:'+chat+':'+client;
const channelKey=chat=>'provider-control:'+chat;
const streamUrl=chat=>'/api/codex-chat/v1/threads/'+encodeURIComponent(chat)+'/events';

export function providerTurnView(turn){
  if(!turn)return null;
  const {history,...value}=turn;
  return {...value,...(history?.itemsCursor ? {history:{itemsRef:history.itemsCursor,itemsState:'not_loaded',sourceMode:'compatibility'}} : {})};
}

export function providerTurnText(input){
  if(!validClient(input?.clientMessageId) || !Array.isArray(input.input) || input.input.length!==1 || input.input[0]?.type!=='text' || typeof input.input[0].text!=='string')throw failure('invalid_request','A valid message identifier and text are required.',400);
  const text=input.input[0].text.trim();
  if(!text || Buffer.byteLength(text)>64000)throw failure('invalid_request','A message must contain at most 64,000 UTF-8 bytes.',400);
  if(input.attachments!=null && (!Array.isArray(input.attachments) || input.attachments.some(id=>typeof id!=='string')))throw failure('invalid_request','Invalid attachment identifiers.',400);
  return text;
}

/** Durable host execution, shared with native admission, workspace leases and managed drain.
 * Provider transports never decide whether an uncertain request may run a second time. */
export class ProviderTaskRuntime {
  constructor(options){
    this.options=options;this.connectorId=options.connectorId;
    this.root=realpathSync(options.root);this.stateRoot=path.resolve(options.stateRoot);
    this.privateRoot=path.resolve(options.privateRoot);
    this.active=new Map();this.subscribers=new Map();this.stopped=false;
  }
  get registry(){return this._registry ||= new ProviderChatRegistry({stateRoot:this.stateRoot,privateRoot:this.privateRoot,connectorId:this.connectorId});}
  get execution(){return this._execution ||= new ExecutionCoordinator({stateRoot:this.stateRoot,directory:this.options.executionDirectory});}
  require(chat){return this.registry.require(chat);}
  activeIntent(chat){return this.execution.listIntents({kind:'turn',states:activeStates,limit:1000}).find(row=>row.chatId===chat) || null;}
  async workspacePreview(){return inspectTaskWorkspace(this.root);}
  async create(input){
    const subject=normalizeChatSubject(input?.subject);
    if(!validClient(input?.clientThreadId) || input.source!=='chat' || (input.workspace?.mode!==undefined && !['isolated','configured','read-only'].includes(input.workspace.mode)))throw failure('invalid_request','A valid chat request is required.',400);
    const {initialTurn:ignored,...request}=input;
    const existing=this.registry.findByClient(input.clientThreadId);
    if(existing){if(existing.createHash!==hash(request))throw failure('idempotency_conflict');return {binding:existing,replayed:true};}
    return this.execution.withMutation('provider-create:'+this.connectorId+':'+input.clientThreadId,async()=>{
      const raced=this.registry.findByClient(input.clientThreadId);
      if(raced){if(raced.createHash!==hash(request))throw failure('idempotency_conflict');return {binding:raced,replayed:true};}
      const config=this.options.configuration();
      const modelId=input.settings?.modelId || config.modelId;
      const sandbox=input.workspace?.mode==='read-only' ? 'read-only' : config.sandbox || 'read-only';
      if(!['read-only','workspace-write'].includes(sandbox))throw failure('provider_sandbox_invalid','This provider requires a bounded workspace sandbox.');
      let executionConfig={...config,modelId,sandbox,reasoningEffort:input.settings?.effortId || config.reasoningEffort};
      if(this.options.resolveConfiguration)executionConfig=await this.options.resolveConfiguration(executionConfig);
      const capabilities=await this.options.preflight({connectorId:this.connectorId,modelId:executionConfig.modelId,executionConfig},{phase:'create'});
      privateStateDirectory(this.stateRoot,path.join(this.privateRoot,'workspaces'));
      const workspace=await prepareTaskWorkspace({coordinator:this.execution,source:this.root,directory:path.join(this.privateRoot,'workspaces'),id:this.connectorId+':'+input.clientThreadId,
        mode:sandbox==='read-only'?'read-only':'worktree',baseRevision:input.workspace?.baseRevision});
      const result=this.registry.create({clientThreadId:input.clientThreadId,request,title:input.title,modelId:executionConfig.modelId,effortId:executionConfig.reasoningEffort,timeoutMs:executionConfig.timeoutMs,
        workspacePath:workspace.cwd,workspace,capabilitySnapshot:capabilities,executionConfig,...(subject?{subject}:{})});
      this.changed(result.binding.chatId);return {binding:result.binding,replayed:!result.created};
    });
  }
  validateTurn(binding,input){
    if(input && Object.hasOwn(input,'subject'))throw failure('runtime_identity_mismatch','This chat retains its original subject and factory phase.');
    const text=providerTurnText(input);
    if(binding.archived)throw failure('chat_archived','Restore this chat before sending a message.');
    if(input.settings?.modelId && input.settings.modelId!==binding.modelId || input.settings?.effortId && input.settings.effortId!==binding.effortId || input.settings?.serviceTierId)throw failure('runtime_identity_mismatch','This chat retains its original provider, model and execution settings.');
    // Attachments are admitted only by a transport that verifies their delivery.
    if(input.attachments?.length && !this.options.prepareAttachments)throw failure('provider_attachments_unverified','Attachment transport is not verified for this provider. Your originals are preserved.',422);
    this.options.validateText?.(text);
    return text;
  }
  async start(chat,input,{fromQueue}={}){
    return this.execution.withMutation('provider-admission:'+chat,async()=>{
      if(this.stopped)throw failure('execution_draining');
      const binding=this.require(chat),text=this.validateTurn(binding,input),key=turnKey(chat,input.clientMessageId),requestHash=hash(input);
      const prior=this.registry.history.receipt(chat,input.clientMessageId);
      if(prior){if(prior.kind!=='message' || prior.value.requestHash!==requestHash)throw failure('idempotency_conflict');const turn=this.registry.turn(chat,prior.value.turnId);if(!turn)throw failure('history_receipt_incomplete');return {accepted:{turn:providerTurnView(turn),streamUrl:streamUrl(chat)},replayed:true};}
      if(this.activeIntent(chat))throw failure('turn_active','This chat already owns an active or unconfirmed turn.');
      if(!fromQueue && this.queuedRows(chat).some(row=>row.input.clientMessageId!==input.clientMessageId))throw failure('queue_waiting','Send this draft to the queue or cancel the queued messages first.');
      const intent=this.execution.reserveIntent(key,requestHash,{kind:'turn',connectorId:this.connectorId,chatId:chat,clientMessageId:input.clientMessageId}).intent;
      if(!['reserved','not_dispatched'].includes(intent.state))throw failure('fallback_confirmation_required','The original dispatch is unconfirmed and will not be repeated.');
      await verifyTaskWorkspace(binding.workspace);
      const capabilities=await this.options.preflight(binding,{phase:'turn'});
      const attachments=await this.options.prepareAttachments?.(binding,input) || {views:[],prompt:''};
      const lease=this.execution.claim(['provider-thread:'+this.registry.scope+':'+chat,'chat-binding:'+chat],key,{kind:'turn',capacity:this.execution.admission().capacity,detail:{chatId:chat,connectorId:this.connectorId,intentKey:key}});
      if(!lease)throw failure('turn_active','Execution capacity or this task is already reserved.');
      let accepted=false;
      try{
        const policy=taskWorkspaceResources(binding.workspace,binding.executionConfig.sandbox);
        if(!this.execution.extend(lease.owner,lease.generation,policy.resources,{mode:policy.mode}) || !this.execution.extend(lease.owner,lease.generation,['execution-ambient-effects'],{mode:'read'}))throw failure('workspace_busy','Another task owns this workspace.');
        if(capabilities.parallelLimit!==undefined){
          const limit=capabilities.parallelLimit;
          if(!Number.isSafeInteger(limit) || limit<1 || limit>64)throw failure('provider_limits_unknown');
          let slot=false;
          for(let i=0;i<limit && !slot;i++)slot=this.execution.extend(lease.owner,lease.generation,['provider-slot:'+this.connectorId+':'+i]);
          if(!slot)throw failure('provider_rate_limited','This provider has no free parallel execution slot.');
        }
        lease.assertOwned();
        const {turn,created}=this.registry.reserveTurn(chat,{clientMessageId:input.clientMessageId,text,request:input,attachments:attachments.views});
        if(!created){lease.release();return {accepted:{turn:providerTurnView(turn),streamUrl:streamUrl(chat)},replayed:true};}
        this.execution.updateIntent(key,{state:'dispatching',turnId:turn.turnId,owner:lease.owner,generation:lease.generation},intent.revision);
        const active={chat,turnId:turn.turnId,clientMessageId:input.clientMessageId,key,lease,capabilities,controller:new AbortController(),run:null,identity:null,started:false,stopping:false,finished:false};
        this.active.set(chat,active);
        if(capabilities.approvals===true)active.approvals=new ProviderApprovalBroker({coordinator:this.execution,chatId:chat,turnId:turn.turnId,lease,signal:active.controller.signal,emit:()=>this.emit(chat,'history.changed',{})});
        active.cleanup=registerExecutionChannel(this.execution,channelKey(chat),{view:()=>active.finished?null:{turnId:active.turnId,steer:capabilities.steer===true,interrupt:true},call:request=>this.controlOwned(active,request)});
        this.registry.updateTurn(chat,turn.turnId,row=>({...row,status:'in_progress'}));
        this.registry.mutate(chat,row=>({...row,lastStatus:'active',updatedAt:stamp()}));
        this.emit(chat,'turn.started',{turn:providerTurnView(this.registry.turn(chat,turn.turnId))},{turnId:turn.turnId});
        accepted=true;
        active.completion=this.launch(binding,active,text,attachments).catch(()=>{/* State is fenced; a storage failure never releases its claim. */});
        return {accepted:{turn:providerTurnView(this.registry.turn(chat,turn.turnId)),streamUrl:streamUrl(chat)},replayed:false};
      }finally{if(!accepted)lease.release();}
    });
  }
  async launch(binding,active,text,attachments){
    let journal;
    try{
      const file=privateStateFile(this.stateRoot,path.join(this.privateRoot,this.connectorId,'attempts',active.turnId+'.jsonl'));
      journal=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      active.run=await this.options.launch({...binding.executionConfig,root:this.root,stateRoot:this.stateRoot,privateRoot:path.join(this.privateRoot,this.connectorId),cwd:binding.workspacePath,
        modelContextTokens:active.capabilities.contextTokens,maxOutputTokens:active.capabilities.outputTokens,
        reasoningControl:active.capabilities.reasoningControl,
        model:binding.modelId,effort:binding.effortId,timeoutMs:binding.timeoutMs,resume:binding.nativeThreadId || undefined,prompt:attachments.prompt?text+'\n\n'+attachments.prompt:text,
        ...(binding.subject?{factorySubject:binding.subject}:{}),
        images:attachments.images || [],signal:active.controller.signal,
        ...(active.approvals?{hostExecutionContext:{coordinator:this.execution,chatId:active.chat,turnId:active.turnId,lease:active.lease},approve:request=>active.approvals.ask(request),cancelPendingApprovals:()=>active.approvals.close()}:{}),
        beforeStart:async proof=>{
          active.lease.assertOwned();
          if(binding.profileIdentity && binding.profileIdentity!==proof.identity)throw failure('runtime_identity_mismatch');
          active.identity=proof.identity;
          this.execution.updateIntent(active.key,{processProof:proof.evidence,profileIdentity:proof.identity});
          active.started=true;
        },
        onEvidence:evidence=>this.execution.updateIntent(active.key,{processProof:evidence}),
        onRawChunk:chunk=>appendFileSync(journal,chunk),
        onEvent:event=>this.handleEvent(binding,active,event),
        beforeRequest:()=>{active.lease.assertOwned();if(active.controller.signal.aborted)throw failure('operator_cancel');return this.options.beforeRequest?.(binding,active);},
        onProviderRequest:event=>{
          if(event.method==='POST' && event.path==='/v1/responses'){
            const row=this.execution.getIntent(active.key),count=(row.providerRequests || 0)+1;
            const observed=event.usage && event.usageKnown!==false && Number.isSafeInteger(event.usage.inputTokens) && Number.isSafeInteger(event.usage.outputTokens);
            const total={...(row.providerUsage || {inputTokens:0,outputTokens:0,cachedInputTokens:0,reasoningTokens:0,totalTokens:0})};
            if(observed)for(const field of Object.keys(total))total[field]+=Number.isSafeInteger(event.usage[field])?event.usage[field]:0;
            this.execution.updateIntent(active.key,{providerRequests:count,providerUsage:total,providerUsageKnown:row.providerUsageKnown!==false && Boolean(observed)});
          }
          this.options.onProviderRequest?.(binding,active,event);
        },
      });
      if(active.stopping)active.run.stop();
      const result=await active.run.completion;
      try{await this.options.recordUsage?.(binding,active,result);}catch{this.execution.updateIntent(active.key,{usageRecording:'failed'});}
      this.finish(active,result);
    }catch(error){
      this.finish(active,{ok:false,errorCode:safeCode(error),processTreeExited:error?.processTreeExited===true || (error?.processTreeExited!==false && !active.started && !active.run)});
    }finally{if(journal!==undefined)closeSync(journal);}
  }
  handleEvent(binding,active,event){
    if(active.finished)return;
    active.lease.assertOwned();
    if(event.type==='thread.started'){
      if(!active.identity)throw failure('runtime_identity_mismatch');
      this.registry.pinSession(active.chat,event.thread_id,active.identity);
      this.execution.updateIntent(active.key,{state:'running',nativeThreadId:event.thread_id});
    }
    if(['item.started','item.updated','item.completed'].includes(event.type)){
      const normalized=this.options.normalizeEvent?.(active,event,binding);
      if(normalized){
        const item=this.registry.putItem(active.chat,active.turnId,normalized.item,normalized.originalText);
        this.emit(active.chat,event.type==='item.updated'?'item.started':event.type,{item},{turnId:active.turnId,itemId:item.id});
        if(event.type==='item.completed' && item.kind==='assistant_message')this.emit(active.chat,'message.completed',{message:item.message},{turnId:active.turnId,itemId:item.id});
      }
    }
  }
  finish(active,result){
    if(active.finished)return;
    active.finished=true;
    const exited=result.processTreeExited===true;
    const status=!exited?'failed':active.stopping || result.errorCode==='operator_cancel'?'interrupted':result.ok?'completed':'failed';
    const code=exited ? result.errorCode || 'provider_runtime_failed' : 'provider_process_exit_unconfirmed';
    const error=status==='failed'?{code,message:exited?'The provider task stopped with an error. Its history has been saved.':'Process exit is unconfirmed. This workspace remains reserved; the request will not repeat automatically.'}:null;
    this.registry.updateTurn(active.chat,active.turnId,row=>({...row,status,error,completedAt:stamp(),usage:result.usage || null}));
    this.registry.mutate(active.chat,row=>({...row,lastStatus:exited?'idle':'system_error',updatedAt:stamp()}));
    this.execution.updateIntent(active.key,{state:exited?status:'unknown',exitConfirmed:exited,errorCode:error?.code || null});
    active.approvals?.close();active.cleanup?.();this.active.delete(active.chat);
    if(exited)active.lease.release();
    this.emit(active.chat,'turn.'+status,{turn:providerTurnView(this.registry.turn(active.chat,active.turnId))},{turnId:active.turnId});
    this.scheduleQueues();
  }
  controlOwned(active,input){
    if(active.finished || input.expectedTurnId!==active.turnId)throw failure('control_turn_changed');
    if(input.action!=='interrupt')throw failure('control_unsupported','This transport cannot steer an active turn.',422);
    active.stopping=true;active.controller.abort();active.run?.stop();
    return {status:'requested',action:input.action};
  }
  async control(chat,input){
    this.require(chat);
    if(!validClient(input.clientMessageId) || !['steer','interrupt'].includes(input.action) || !input.expectedTurnId)throw failure('invalid_request','Exact turn and control identifiers are required.',400);
    const key='provider-control:'+chat+':'+input.clientMessageId;
    this.execution.reserveIntent(key,hash(input),{kind:input.action,chatId:chat,connectorId:this.connectorId});
    return this.execution.withMutation('provider-controls:'+chat,async()=>{
      const row=this.execution.getIntent(key);
      if(row.state==='confirmed')return {status:'requested',action:input.action,replayed:true};
      if(!['reserved','not_dispatched'].includes(row.state))throw failure('control_delivery_unknown');
      const view=executionChannelView(this.execution,channelKey(chat));
      if(!view || view.turnId!==input.expectedTurnId)throw failure('control_turn_changed','The selected turn ended or its owner is unavailable.');
      if(input.action==='steer' && !view.steer)throw failure('control_unsupported','This transport cannot steer an active turn. Queue the draft or stop this turn first.',422);
      this.execution.updateIntent(key,{state:'dispatching'},row.revision);
      try{await callExecutionChannel(this.execution,channelKey(chat),input);this.execution.updateIntent(key,{state:'confirmed'});return {status:'requested',action:input.action,replayed:false};}
      catch(error){this.execution.updateIntent(key,{state:'unknown'});throw failure('control_delivery_unknown','The owner did not confirm this control. It will not be repeated.');}
    });
  }
  reconcile(chat){
    this.require(chat);if(this.active.has(chat))return;
    const row=this.activeIntent(chat);if(!row)return;
    let exited=false;
    try{exited=Boolean(row.processProof && (this.options.proveExit || providerProcessTreesExited)(row.processProof));}catch{/* Unknown coverage cannot release resources. */}
    if(!exited){
      if(!executionChannelView(this.execution,channelKey(chat)) && Date.now()-Date.parse(row.updatedAt)>5000){expireProviderRequests(this.execution,chat,row.turnId);if(row.state!=='unknown')this.execution.updateIntent(turnKey(chat,row.clientMessageId),{state:'unknown'});}
      return;
    }
    expireProviderRequests(this.execution,chat,row.turnId);
    this.registry.updateTurn(chat,row.turnId,turn=>({...turn,status:'interrupted',completedAt:stamp(),error:{code:'provider_owner_restarted',message:'The previous execution owner ended. Its output is preserved; continue explicitly when ready.'}}));
    this.registry.mutate(chat,binding=>({...binding,lastStatus:'idle',updatedAt:stamp()}));
    this.execution.updateIntent(turnKey(chat,row.clientMessageId),{state:'interrupted',exitConfirmed:true,recoveredAt:stamp()},row.revision);
    this.execution.reconcileRelease(row.owner,row.generation);
    this.emit(chat,'turn.interrupted',{turn:providerTurnView(this.registry.turn(chat,row.turnId))},{turnId:row.turnId});
  }
  queuedRows(chat){return this.execution.listIntents({kind:'provider-queued-message',states:waitingStates,limit:1000}).filter(row=>row.chatId===chat);}
  queued(chat){this.require(chat);return this.queuedRows(chat).map(row=>({id:row.id,revision:row.revision,state:row.state,text:row.input.input[0].text,clientMessageId:row.input.clientMessageId,createdAt:row.createdAt,reason:row.reason || null,attachments:[],attachmentsUnavailable:Boolean(row.input.attachments?.length)}));}
  async enqueue(chat,input){
    return this.execution.withMutation('provider-admission:'+chat,async()=>{
      const binding=this.require(chat);this.validateTurn(binding,input);
      const key=queueKey(chat,input.clientMessageId),prior=this.execution.getIntent(key);
      if(!prior){
        const tail=this.queuedRows(chat).at(-1),direct=this.activeIntent(chat);
        if(!tail && !direct)throw failure('queue_target_ended','The preceding task ended. Send this draft as a new turn.');
        const predecessorKey=tail?turnKey(chat,tail.input.clientMessageId):turnKey(chat,direct.clientMessageId);
        this.execution.reserveIntent(key,hash(input),{kind:'provider-queued-message',connectorId:this.connectorId,chatId:chat,input,predecessorKey},{initialState:'queued',limit:{max:128,scopeField:'chatId',scopeMax:16,states:waitingStates}});
      }else if(prior.hash!==hash(input))throw failure('idempotency_conflict');
      this.changed(chat);this.scheduleQueues();return this.queued(chat);
    });
  }
  async cancelQueued(chat,id,revision){
    this.require(chat);const row=this.execution.getIntentById(id);
    if(!row || row.kind!=='provider-queued-message' || row.chatId!==chat)throw failure('queue_not_found','Queued message was not found.',404);
    if(row.state!=='cancelled'){
      if(!['queued','blocked'].includes(row.state))throw failure('queue_already_dispatching','This message has reached dispatch. Stop its exact turn instead.');
      this.execution.updateIntent(queueKey(chat,row.input.clientMessageId),{state:'cancelled'},revision);
    }
    this.changed(chat);return this.queued(chat);
  }
  scheduleQueues(){
    if(this.stopped || this.queueTimer)return;
    this.queueTimer=setTimeout(async()=>{
      this.queueTimer=null;
      try{
        const rows=this.execution.listIntents({kind:'provider-queued-message',states:['queued'],limit:1000}).filter(row=>row.connectorId===this.connectorId);
        for(const chat of [...new Set(rows.map(row=>row.chatId))].slice(0,8))await this.drainQueue(chat);
        if(rows.length)this.scheduleQueues();
      }catch{this.scheduleQueues();}
    },500);this.queueTimer.unref?.();
  }
  async drainQueue(chat){
    return this.execution.withMutation('provider-queue-drain:'+chat,async()=>{
      const row=this.queuedRows(chat).find(item=>item.state==='queued');if(!row)return;
      let key=row.predecessorKey,predecessor=this.execution.getIntent(key);
      for(let depth=0;!predecessor && depth<32;depth++){
        const cancelled=this.execution.getIntent('provider-queued:'+key.slice(5));
        if(cancelled?.state!=='cancelled')break;
        key=cancelled.predecessorKey;predecessor=this.execution.getIntent(key);
      }
      if(predecessor?.state!=='completed' || this.require(chat).archived)return;
      const queuedKey=queueKey(chat,row.input.clientMessageId);
      this.execution.updateIntent(queuedKey,{state:'dispatching'},row.revision);
      try{await this.start(chat,row.input,{fromQueue:queuedKey});this.execution.updateIntent(queuedKey,{state:'delivered'});}
      catch(error){const code=safeCode(error);this.execution.updateIntent(queuedKey,{state:['turn_active','workspace_busy','execution_draining','execution_metadata_busy'].includes(code)?'queued':code==='fallback_confirmation_required'?'unknown':'blocked',reason:code});}
      this.changed(chat);
    });
  }
  changed(chat){this.execution.appendEvent({chatId:chat,connectorId:this.connectorId});}
  pendingRequests(chat){this.require(chat);return pendingProviderRequests(this.execution,chat);}
  async answerRequest(chat,input){this.require(chat);return answerProviderRequest(this.execution,chat,input);}
  emit(chat,event,payload={},refs={}){const record=this.registry.appendEvent(chat,event,payload,refs);this.changed(chat);return record;}
  subscribe(chat,send,close=null){
    this.require(chat);let cursor=this.registry.latestEventId(chat) || this.emit(chat,'connection.ready',{}).data.eventId,closed=false;
    const timer=setInterval(()=>{
      if(closed)return;
      try{
        const page=this.registry.eventsAfter(chat,cursor);
        if(page.reset){const reset=this.emit(chat,'stream.reset',{reason:'cursor_expired',refresh:true});cursor=reset.data.eventId;send(reset);return;}
        for(const event of page.events){cursor=event.data.eventId;send(event);}
      }catch{cleanup();close?.();}
    },250);timer.unref?.();
    const cleanup=()=>{closed=true;clearInterval(timer);this.subscribers.delete(cleanup);};this.subscribers.set(cleanup,close);return cleanup;
  }
  async dispose(){
    this.stopped=true;clearTimeout(this.queueTimer);
    for(const [cleanup,close] of this.subscribers){cleanup();close?.();}
    const active=[...this.active.values()];
    for(const item of active){item.stopping=true;item.controller.abort();item.run?.stop();}
    await Promise.all(active.map(item=>item.completion));
    this._registry?.close();this._execution?.close();
  }
}
