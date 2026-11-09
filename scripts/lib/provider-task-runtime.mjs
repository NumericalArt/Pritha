import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, constants, openSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ProviderChatRegistry } from './provider-chat-registry.mjs';
import {normalizeChatSubject,normalizeFactoryIntent} from './chat-subject.mjs';
import { ExecutionCoordinator } from './execution-coordinator.mjs';
import { callExecutionChannel, executionChannelView, registerExecutionChannel } from './execution-channel.mjs';
import { inspectTaskWorkspace, prepareTaskWorkspace, taskWorkspaceResources, verifyTaskWorkspace } from './task-workspace.mjs';
import { privateStateDirectory, privateStateFile } from './private-state-path.mjs';
import { providerProcessTreesExited } from './provider-process-proof.mjs';
import { ProviderApprovalBroker,answerProviderRequest,pendingProviderRequests,expireProviderRequests } from './provider-approvals.mjs';
import { normalizeProviderPreset } from './provider-profile.mjs';
import { VoiceTopicBindings } from './voice-topic-bindings.mjs';
import {resolveProviderAgentWorkspace} from './provider-agent-workspace.mjs';
import {voiceFactoryPaths,prepareFactoryBinding,factoryDraftReceipt,readFactoryConversation} from '../agents-mother/voice-factory-state.mjs';
import {factoryControlInput,runFactoryControl} from './provider-factory-control.mjs';
import {FactoryBudget} from '../agents-mother/factory-budget.mjs';

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
  const {history,userMessage,...value}=turn;
  const message=userMessage?{...userMessage,...(userMessage.attachments?{attachments:userMessage.attachments.map(({sha256,...view})=>view)}:{})}:userMessage;
  return {...value,...(message?{userMessage:message}:{}),...(history?.itemsCursor ? {history:{itemsRef:history.itemsCursor,itemsState:'not_loaded',sourceMode:'compatibility'}} : {})};
}

export function providerTurnText(input){
  if(!validClient(input?.clientMessageId) || !Array.isArray(input.input) || input.input.length!==1 || input.input[0]?.type!=='text' || typeof input.input[0].text!=='string')throw failure('invalid_request','A valid message identifier and text are required.',400);
  const text=input.input[0].text.trim();
  if(input.attachments!=null && (!Array.isArray(input.attachments) || input.attachments.some(id=>typeof id!=='string')))throw failure('invalid_request','Invalid attachment identifiers.',400);
  if((!text && !input.attachments?.length) || Buffer.byteLength(text)>64000)throw failure('invalid_request','A message needs text or attachments and at most 64,000 UTF-8 text bytes.',400);
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
  factoryConversation(slug){
    const saved=readFactoryConversation({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent,slug});
    if(!saved)return null;
    if(saved.connectorId!==this.connectorId)throw failure('voice_factory_provider_pinned');
    const binding=this.require(saved.chatId);
    if(binding.workspace.factorySlug!==slug || binding.workspace.factoryTarget!==saved.target || binding.subject?.slug!==slug || binding.subject.phase!=='interview' || binding.executionConfig.sandbox!=='read-only')throw failure('factory_binding_changed');
    return binding;
  }
  isTypedFactory(binding){return Boolean(binding.origin==='chat' && binding.group==='my_chats' && binding.workspace.factorySlug && this.factoryConversation(binding.workspace.factorySlug)?.chatId===binding.chatId);}
  get voiceBindings(){return this._voiceBindings ||= new VoiceTopicBindings({coordinator:this.execution,stateRoot:this.stateRoot});}
  voiceTaskChat(taskId){
    const task=this.voiceBindings.task(taskId),topic=task && this.voiceBindings.topic(task.topicId);
    if(!topic?.chatId || topic.connectorId!==this.connectorId)return null;
    const binding=this.require(topic.chatId);
    if(!this.isTypedFactory(binding) && (binding.voiceTopicId!==topic.topicId || binding.voiceTopicGeneration!==topic.scope.generation))throw failure('voice_topic_chat_mismatch');
    return binding.chatId;
  }
  voiceTaskLinks(chat){
    const binding=this.require(chat);
    const typed=this.isTypedFactory(binding);
    if(binding.origin!=='voice' && !typed)return binding.taskLinks;
    const topic=typed?this.voiceBindings.latest({kind:'agent',id:binding.workspace.factorySlug}):this.voiceBindings.topic(binding.voiceTopicId);
    if(typed && !topic?.chatId)return binding.taskLinks;
    if(!topic || topic.chatId!==chat || topic.connectorId!==this.connectorId || !typed && topic.scope.generation!==binding.voiceTopicGeneration)throw failure('voice_topic_chat_mismatch');
    const pending=new Set(this.pendingRequests(chat).map(row=>row.turnId)),active=this.activeIntent(chat);
    const statuses={completed:'complete',failed:'failed',interrupted:'aborted',in_progress:'running',queued:'queued',waiting_for_input:'waiting_for_operator',waiting_for_approval:'waiting_for_operator',waiting_for_provider:'waiting_for_operator'};
    const links=this.voiceBindings.tasksForTopic(topic.topicId).map(task=>{
      const receipt=this.registry.history.receipt(chat,task.clientMessageId);
      const turn=receipt?.kind==='message'?this.registry.history.turnState(chat,receipt.value.turnId):null;
      const queue=this.execution.getIntent(queueKey(chat,task.clientMessageId));
      const status=turn?pending.has(turn.turnId) || active?.turnId===turn.turnId && active.state==='unknown'?'waiting_for_operator':statuses[turn.status] || 'waiting_for_operator'
        :task.state==='cancelled' || queue?.state==='cancelled'?'aborted':queue?.state==='queued'?'queued':'waiting_for_operator';
      return {taskId:task.taskId,shortId:null,label:'Voice · '+topic.scope.label,origin:'voice',mode:'shared_thread',subjectScope:topic.scope,status,linkedAt:task.createdAt};
    });
    // This index contains links only. Transcripts and execution truth stay in
    // their existing stores; readback never dispatches or resumes a task.
    if(JSON.stringify(links)!==JSON.stringify(binding.taskLinks))this.registry.mutate(chat,current=>({...current,taskLinks:links}));
    return links;
  }
  activeIntent(chat){return this.execution.listIntents({kind:'turn',states:activeStates,limit:1000}).find(row=>row.chatId===chat) || null;}
  async workspacePreview(){return inspectTaskWorkspace(this.root);}
  async create(input,{voice}={}){
    const intent=normalizeFactoryIntent(input?.factoryIntent);
    if(intent && (Object.keys(input).some(key=>!['factoryIntent','clientThreadId','source','title','settings','workspace','subject','initialTurn'].includes(key)) || voice || input.subject!=null || input.workspace && (Object.keys(input.workspace).some(key=>key!=='mode') || input.workspace.mode!=='read-only')))
      throw failure('factory_intent_invalid','Create a new agent separately from subject context and workspace settings.',400);
    const subject=intent?normalizeChatSubject({kind:'child',slug:intent.slug,phase:'interview'}):normalizeChatSubject(input?.subject);
    const factorySlug=input?.workspace?.factorySlug;
    if(factorySlug!==undefined && (!voice || subject?.slug!==factorySlug || subject.phase!=='interview' || input.workspace.mode!=='read-only' || input.workspace.agentId || input.workspace.baseRevision))throw failure('voice_factory_subject_binding_required');
    const requestedFactorySlug=intent?.slug || factorySlug;
    const child=input?.workspace?.agentId===undefined?null:resolveProviderAgentWorkspace({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent},input.workspace.agentId);
    if(child && child.agentId!==input.workspace.agentId)throw failure('provider_agent_workspace_identity');
    if(!validClient(input?.clientThreadId) || input.source!=='chat' || (input.workspace?.mode!==undefined && !['isolated','configured','read-only'].includes(input.workspace.mode)))throw failure('invalid_request','A valid chat request is required.',400);
    if(voice && (!/^topic_[a-f0-9]{40}$/.test(voice.topicId) || !Number.isSafeInteger(voice.generation) || voice.generation<1 || voice.generation>999))throw failure('voice_topic_identity_invalid');
    const voicePreset=voice?normalizeProviderPreset(this.connectorId,voice.preset):null;
    if(voicePreset && (!voicePreset.modelId || input.settings?.modelId && input.settings.modelId!==voicePreset.modelId || input.settings?.effortId && input.settings.effortId!==voicePreset.reasoningEffort))throw failure('runtime_identity_mismatch');
    const {initialTurn:ignored,...baseRequest}=input;
    const request={...baseRequest,...(voice?{hostVoice:{topicId:voice.topicId,generation:voice.generation,preset:voicePreset}}:{})};
    const existing=this.registry.findByClient(input.clientThreadId);
    if(existing){if(existing.createHash!==hash(request))throw failure('idempotency_conflict');return {binding:existing,replayed:true};}
    return this.execution.withMutation('provider-create:'+this.connectorId+':'+input.clientThreadId,async()=>{
      const raced=this.registry.findByClient(input.clientThreadId);
      if(raced){if(raced.createHash!==hash(request))throw failure('idempotency_conflict');return {binding:raced,replayed:true};}
      const factory=requestedFactorySlug?prepareFactoryBinding({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent,slug:requestedFactorySlug}):null;
      const current=this.options.configuration(),config=voicePreset?{...voicePreset,sandbox:current.sandbox}:current;
      if(voice && input.workspace?.mode==='isolated' && config.sandbox!=='workspace-write')throw failure('voice_workspace_write_unavailable');
      const modelId=input.settings?.modelId || config.modelId;
      const sandbox=factory || input.workspace?.mode==='read-only' ? 'read-only' : config.sandbox || 'read-only';
      if(!['read-only','workspace-write'].includes(sandbox))throw failure('provider_sandbox_invalid','This provider requires a bounded workspace sandbox.');
      let executionConfig={...config,modelId,sandbox,reasoningEffort:input.settings?.effortId || config.reasoningEffort};
      if(this.options.resolveConfiguration)executionConfig=await this.options.resolveConfiguration(executionConfig);
      const capabilities=await this.options.preflight({connectorId:this.connectorId,modelId:executionConfig.modelId,executionConfig},{phase:'create'});
      if(factory && (capabilities.approvals!==true || capabilities.tools!==true))throw failure('voice_factory_tools_unavailable');
      if(child && resolveProviderAgentWorkspace({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent},child.agentId).source!==child.source)throw failure('provider_agent_workspace_identity');
      if(voice && sandbox==='workspace-write' && !(await inspectTaskWorkspace(child?.source || this.root)).git)throw failure('voice_workspace_isolation_required','Voice write tasks require a committed Git project.');
      privateStateDirectory(this.stateRoot,path.join(this.privateRoot,'workspaces'));
      const workspace=await prepareTaskWorkspace({coordinator:this.execution,source:child?.source || this.root,directory:path.join(this.privateRoot,'workspaces'),id:this.connectorId+':'+input.clientThreadId,
        mode:sandbox==='read-only'?'read-only':'worktree',baseRevision:input.workspace?.baseRevision});
      if(child)workspace.agentId=child.agentId;
      if(factory){workspace.factorySlug=factory.slug;workspace.factoryTarget=factory.target;}
      const result=this.registry.create({clientThreadId:input.clientThreadId,request,title:input.title,modelId:executionConfig.modelId,effortId:executionConfig.reasoningEffort,timeoutMs:executionConfig.timeoutMs,
        workspacePath:workspace.cwd,workspace,capabilitySnapshot:capabilities,executionConfig,...(subject?{subject}:{}),...(voice?{voice:{topicId:voice.topicId,generation:voice.generation}}:{})});
      this.changed(result.binding.chatId);return {binding:result.binding,replayed:!result.created};
    });
  }
  voiceReceipt(chat,clientMessageId){
    const binding=this.require(chat);
    if(binding.origin!=='voice' && !this.isTypedFactory(binding) || !validClient(clientMessageId))throw failure('voice_topic_chat_mismatch');
    const common={chatId:chat,clientMessageId,sessionId:binding.nativeThreadId || null};
    const receipt=this.registry.history.receipt(chat,clientMessageId);
    if(receipt?.kind==='message'){
      const turn=this.registry.turn(chat,receipt.value.turnId);
      if(!turn || turn.clientMessageId!==clientMessageId)throw failure('history_receipt_incomplete');
      // Voice reads authored answers, not the last page of tool activity. A
      // long transcript can otherwise hide the final answer from its receipt.
      let resultText='',resultTruncated=false;
      try{resultText=this.registry.history.originalAssistantText(chat,turn.turnId,128000);}
      catch(error){
        if(error?.code!=='creation_context_too_large')throw error;
        resultText=this.registry.history.turn(chat,turn.turnId,{compact:true})?.items[0]?.message?.markdown || '';
        resultTruncated=true;
      }
      resultTruncated ||= resultText.length>16000;
      const factory=binding.workspace.factorySlug && turn.status==='completed'
        ? turn.factoryDraftReceipt || {draftCreated:false,errorCode:'factory_draft_evidence_missing'} : undefined;
      return {...common,kind:'turn',turnId:turn.turnId,turn:providerTurnView(turn),resultText:resultText.slice(0,16000),resultTruncated,...(factory?{factoryDraftReceipt:factory}:{})};
    }
    const queued=this.execution.getIntent(queueKey(chat,clientMessageId));
    if(!queued)return null;
    if(queued.chatId!==chat || queued.input?.clientMessageId!==clientMessageId)throw failure('voice_task_receipt_mismatch');
    if(queued.state==='cancelled')return {...common,kind:'cancelled',queueId:queued.id};
    if(!waitingStates.includes(queued.state))throw failure('voice_task_receipt_unconfirmed');
    return {...common,kind:'queue',queueId:queued.id,revision:queued.revision,status:queued.state,reason:queued.reason || null};
  }
  validateTurn(binding,input){
    if(input && ['subject','factoryIntent','workspace'].some(key=>Object.hasOwn(input,key)))throw failure('runtime_identity_mismatch','This chat retains its original subject and factory phase.');
    const text=providerTurnText(input);
    factoryControlInput(binding,input);
    if(binding.archived)throw failure('chat_archived','Restore this chat before sending a message.');
    if(input.settings?.modelId && input.settings.modelId!==binding.modelId || input.settings?.effortId && input.settings.effortId!==binding.effortId || input.settings?.serviceTierId)throw failure('runtime_identity_mismatch','This chat retains its original provider, model and execution settings.');
    this.options.validateText?.(text);
    return text;
  }
  async attachmentInput(binding,input,{phase,expected,retain=false}={}){
    const ids=input.attachments || [],historicalImages=this.registry.history.attachmentInSession(binding.chatId),historicalAttachments=this.registry.hasAttachments(binding.chatId);
    if(!ids.length && !historicalAttachments)return {files:[],receipt:{version:1,originals:[]}};
    const store=this.options.attachmentStore,transport=this.options.attachmentTransport;
    if(!store || !transport)throw failure('provider_attachments_unverified','Attachment transport is not verified for this provider. Your originals are preserved.',422);
    const files=await store.prepare(ids);
    const receipt={version:1,originals:files.map(({view,sha256})=>({...view,sha256}))};
    if(expected && JSON.stringify(expected)!==JSON.stringify(receipt))throw failure('attachment_integrity_failed','The accepted attachment references changed. Your message and originals have been kept.');
    await transport.validate({binding,files,historicalImages,historicalAttachments,path:binding.nativeThreadId?'resume':'initial',phase});
    if(retain && ids.length)await store.retain(ids);
    return {files,receipt};
  }
  async start(chat,input,{fromQueue}={}){
    return this.execution.withMutation('provider-admission:'+chat,async()=>{
      if(this.stopped)throw failure('execution_draining');
      const binding=this.require(chat),text=this.validateTurn(binding,input),key=turnKey(chat,input.clientMessageId),requestHash=hash(input);
      const prior=this.registry.history.receipt(chat,input.clientMessageId);
      if(prior){if(prior.kind!=='message' || prior.value.requestHash!==requestHash)throw failure('idempotency_conflict');const turn=this.registry.turn(chat,prior.value.turnId);if(!turn)throw failure('history_receipt_incomplete');return {accepted:{turn:providerTurnView(turn),streamUrl:streamUrl(chat)},replayed:true};}
      if(this.activeIntent(chat))throw failure('turn_active','This chat already owns an active or unconfirmed turn.');
      if(!fromQueue && this.queuedRows(chat).some(row=>row.input.clientMessageId!==input.clientMessageId))throw failure('queue_waiting','Send this draft to the queue or cancel the queued messages first.');
      const queue=fromQueue?this.execution.getIntent(fromQueue):null;
      if(fromQueue && (!queue || queue.kind!=='provider-queued-message' || queue.chatId!==chat || queue.hash!==requestHash || queue.state!=='dispatching'
        || input.attachments?.length && !queue.attachmentReceipt))throw failure('queue_dispatch_identity_changed');
      let intent=this.execution.reserveIntent(key,requestHash,{kind:'turn',connectorId:this.connectorId,chatId:chat,clientMessageId:input.clientMessageId}).intent;
      if(!['reserved','not_dispatched'].includes(intent.state))throw failure('fallback_confirmation_required','The original dispatch is unconfirmed and will not be repeated.');
      if(queue?.attachmentReceipt && intent.attachmentReceipt && JSON.stringify(queue.attachmentReceipt)!==JSON.stringify(intent.attachmentReceipt))throw failure('attachment_integrity_failed');
      await verifyTaskWorkspace(binding.workspace);
      if(binding.workspace.agentId){
        const child=resolveProviderAgentWorkspace({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent},binding.workspace.agentId);
        if(child.agentId!==binding.workspace.agentId || child.source!==binding.workspace.source)throw failure('provider_agent_workspace_identity');
      }
      const capabilities=await this.options.preflight(binding,{phase:'turn'});
      if(binding.workspace.factorySlug && (capabilities.approvals!==true || capabilities.tools!==true))throw failure('voice_factory_tools_unavailable');
      const attachments=await this.attachmentInput(binding,input,{phase:'turn',expected:queue?.attachmentReceipt || intent.attachmentReceipt,retain:true});
      if(attachments.files.length && !intent.attachmentReceipt)intent=this.execution.updateIntent(key,{attachmentReceipt:attachments.receipt},intent.revision);
      const lease=this.execution.claim(['provider-thread:'+this.registry.scope+':'+chat,'chat-binding:'+chat],key,{kind:'turn',capacity:this.execution.admission().capacity,detail:{chatId:chat,connectorId:this.connectorId,intentKey:key}});
      if(!lease)throw failure('turn_active','Execution capacity or this task is already reserved.');
      let accepted=false;
      try{
        const policy=taskWorkspaceResources(binding.workspace,binding.executionConfig.sandbox);
        if(!this.execution.extend(lease.owner,lease.generation,policy.resources,{mode:policy.mode}) || !this.execution.extend(lease.owner,lease.generation,['execution-ambient-effects'],{mode:'read'}))throw failure('workspace_busy','Another task owns this workspace.');
        if(binding.workspace.factorySlug){
          const factory=voiceFactoryPaths({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent,slug:binding.workspace.factorySlug});
          if(factory.target!==binding.workspace.factoryTarget || !this.execution.extend(lease.owner,lease.generation,['workspace:'+factory.target]))throw failure('workspace_busy','Another task owns this factory target.');
        }
        if(capabilities.parallelLimit!==undefined){
          const limit=capabilities.parallelLimit;
          if(!Number.isSafeInteger(limit) || limit<1 || limit>64)throw failure('provider_limits_unknown');
          let slot=false;
          for(let i=0;i<limit && !slot;i++)slot=this.execution.extend(lease.owner,lease.generation,['provider-slot:'+this.connectorId+':'+i]);
          if(!slot)throw failure('provider_rate_limited','This provider has no free parallel execution slot.');
        }
        lease.assertOwned();
        const {turn,created}=this.registry.reserveTurn(chat,{clientMessageId:input.clientMessageId,text,request:input,attachments:attachments.receipt.originals});
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
        active.completion=(input.factoryAction?runFactoryControl(this,binding,active,input):this.launch(binding,active,text,{...attachments,input})).catch(()=>{/* State is fenced; a storage failure never releases its claim. */});
        return {accepted:{turn:providerTurnView(this.registry.turn(chat,turn.turnId)),streamUrl:streamUrl(chat)},replayed:false};
      }finally{if(!accepted)lease.release();}
    });
  }
  async launch(binding,active,text,attachments){
    let journal,delivery;
    try{
      const factoryBudget=binding.workspace.factorySlug?new FactoryBudget({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent,
        slug:binding.workspace.factorySlug,target:binding.workspace.factoryTarget,chatId:binding.chatId,connectorId:this.connectorId}):null;
      if(factoryBudget){
        await factoryBudget.ensure();
        for(const row of this.execution.listIntents({kind:'turn',chatId:binding.chatId,limit:1000})){
          if(row.turnId===active.turnId || row.factoryBudgetRecorded || !row.turnId)continue;
          const savedUsage=row.providerUsage || this.registry.turn(binding.chatId,row.turnId)?.usage;
          const tokens=savedUsage?.totalTokens;
          if(Number.isSafeInteger(tokens) && tokens>=0)await factoryBudget.observe('legacy:'+row.turnId,'preparation',{
            observedTokens:tokens,chargedTokens:tokens,activeMs:0,usageKnown:row.providerUsageKnown===true || !row.providerUsage && row.state==='completed',source:'legacy-observation'});
        }
        factoryBudget.check();
        this.execution.updateIntent(active.key,{factoryBudgetRecorded:true});
      }
      const reservedAccounting=Boolean(factoryBudget && !(this.connectorId==='claude' && binding.executionConfig.authMode==='local-cli-session'));
      let nativeClock=Date.now(),hostCalls=0;
      const nativeUsage=async value=>{const now=Date.now(),delta=hostCalls?0:now-nativeClock;nativeClock=now;
        if(!factoryBudget || reservedAccounting)return;
        const tokens=value?.usage?.totalTokens;
        await factoryBudget.native(active.turnId,'preparation',Number.isSafeInteger(tokens)?tokens:undefined,delta);factoryBudget.check();};
      const toolActivity=async phase=>{if(phase==='start'){await nativeUsage();hostCalls++;}else{hostCalls--;nativeClock=Date.now();}};
      const file=privateStateFile(this.stateRoot,path.join(this.privateRoot,this.connectorId,'attempts',active.turnId+'.jsonl'));
      journal=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      const checked=await this.attachmentInput(binding,attachments.input,{phase:'dispatch',expected:attachments.receipt});
      const check=()=>{active.lease.assertOwned();if(active.controller.signal.aborted)throw failure('operator_cancel');};
      delivery=this.options.attachmentTransport && (checked.files.length || this.registry.hasAttachments(binding.chatId))
        ?await this.options.attachmentTransport.prepare({binding,files:checked.files,receipt:checked.receipt,turnId:active.turnId,store:this.options.attachmentStore,registry:this.registry,check}):{prompt:'',images:[]};
      if(delivery.receipt)this.execution.updateIntent(active.key,{attachmentDelivery:delivery.receipt,attachmentCleanup:'pending'});
      active.lease.assertOwned();
      if(active.controller.signal.aborted)throw failure('operator_cancel');
      active.run=await this.options.launch({...binding.executionConfig,root:this.root,stateRoot:this.stateRoot,privateRoot:path.join(this.privateRoot,this.connectorId),cwd:binding.workspacePath,
        ...(reservedAccounting?{tokenBudget:factoryBudget.check().remainingTokens,onBudgetCheckpoint:snapshot=>factoryBudget.checkpoint(active.turnId,'preparation',snapshot)}:{}),
        ...(!reservedAccounting && factoryBudget?{onNativeUsage:nativeUsage}:{}),
        modelContextTokens:active.capabilities.contextTokens,maxOutputTokens:active.capabilities.outputTokens,
        reasoningControl:active.capabilities.reasoningControl,
        model:binding.modelId,effort:binding.effortId,timeoutMs:binding.timeoutMs,resume:binding.nativeThreadId || undefined,prompt:[text,delivery.prompt,binding.workspace.factorySlug?'Use factory_step for this exact child. Read status first and resume the saved phase; never restart or ask again to approve an accepted document. Prioritize a working product and useful progress over token economy. Read workflowBudget and recommendedBuildBudget from status; absent an explicit smaller user limit, propose the generous stability defaults for all budgets. For a new workflow prepare a complete brief and proposed build budget, obtain separate Contract and Outcome approvals, then continue canonical research, scaffold, bounded delivery and verification. For a deterministic local HTTP/CLI product set childModelProvider and childModelId to none with no repository adoption. The host supplies operation IDs. Consult continued results before selecting the next step. Read each research_status page with offset until nextOffset is null; select actual passages and publish your synthesis. Give the verified directory, first-use command and observed output. General workspace tools cannot write factory state. Final operator acceptance remains separate.':''].filter(Boolean).join('\n\n'),
        // The host pins the Voice search intent in this turn's hashed request,
        // including queued/resumed delivery. Never infer it from an assembled prompt.
        searchUserText:binding.origin==='voice'?(typeof attachments.input.voiceSearchText==='string'?attachments.input.voiceSearchText.slice(0,16000):'Do not browse.'):text,
        ...(binding.subject?{factorySubject:binding.subject}:{}),
        images:delivery.images || [],...(delivery.attachmentManifest?{attachmentManifest:delivery.attachmentManifest}:{}),signal:active.controller.signal,
        ...(delivery.hostAttachments?{hostAttachments:delivery.hostAttachments}:{}),
        ...(active.approvals?{hostExecutionContext:{coordinator:this.execution,chatId:active.chat,turnId:active.turnId,lease:active.lease,...(!reservedAccounting && factoryBudget?{onToolActivity:toolActivity}:{}),...(binding.workspace.factorySlug?{factory:{slug:binding.workspace.factorySlug,target:binding.workspace.factoryTarget,agentParent:this.options.agentParent,preset:binding.executionConfig,model:binding.modelId,effort:binding.effortId}}:{})},approve:request=>active.approvals.ask(request),cancelPendingApprovals:()=>active.approvals.close()}:{}),
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
        beforeRequest:()=>{active.lease.assertOwned();if(active.controller.signal.aborted)throw failure('operator_cancel');factoryBudget?.check();return this.options.beforeRequest?.(binding,active);},
        onProviderRequest:event=>{
          if(event.method==='POST' && event.path==='/v1/responses'){
            const row=this.execution.getIntent(active.key),count=(row.providerRequests || 0)+1;
            const observed=event.upstreamAttempted===false || event.usage && event.usageKnown!==false && Number.isSafeInteger(event.usage.inputTokens) && Number.isSafeInteger(event.usage.outputTokens);
            const total={...(row.providerUsage || {inputTokens:0,outputTokens:0,cachedInputTokens:0,reasoningTokens:0,totalTokens:0})};
            if(observed)for(const field of Object.keys(total))total[field]+=Number.isSafeInteger(event.usage?.[field])?event.usage[field]:0;
            this.execution.updateIntent(active.key,{providerRequests:count,providerUsage:total,providerUsageKnown:row.providerUsageKnown!==false && Boolean(observed),
              lastProviderRequest:{status:event.status,upstreamAttempted:event.upstreamAttempted===true,durationMs:event.durationMs,errorCode:event.error?.code || null,...(event.toolDiagnostic?{toolDiagnostic:event.toolDiagnostic}:{})}});
          }
          this.options.onProviderRequest?.(binding,active,event);
        },
      });
      if(active.stopping)active.run.stop();
      const result=await active.run.completion;
      if(factoryBudget && !reservedAccounting)await nativeUsage(result);
      try{await this.options.recordUsage?.(binding,active,result);}catch{this.execution.updateIntent(active.key,{usageRecording:'failed'});}
      await delivery.hostAttachments?.close();await this.cleanupAttachmentDelivery(active.key,result.processTreeExited===true);
      this.finish(active,result);
    }catch(error){
      const exited=error?.processTreeExited===true || (error?.processTreeExited!==false && !active.started && !active.run);
      await delivery?.hostAttachments?.close();await this.cleanupAttachmentDelivery(active.key,exited);
      this.finish(active,{ok:false,errorCode:safeCode(error),processTreeExited:exited});
    }finally{if(journal!==undefined)closeSync(journal);}
  }
  async cleanupAttachmentDelivery(key,exited){
    const row=this.execution.getIntent(key);if(!row?.attachmentDelivery || row.attachmentCleanup==='complete')return;
    let status='preserved';
    if(exited && this.options.attachmentTransport?.cleanup){
      try{status=await this.options.attachmentTransport.cleanup({receipt:row.attachmentDelivery,store:this.options.attachmentStore});}catch{status='recovery_required';}
    }
    this.execution.updateIntent(key,{attachmentCleanup:status});
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
    const error=status==='failed'?{code,message:exited?(code==='provider_native_login_required'?'Claude Code needs you to sign in again. Open Settings → Providers → Claude Code → Local CLI session, complete sign-in, then continue this chat.':code==='neuraldeep_model_identity_mismatch'?'NeuralDeep returned a different model from the one selected for this chat. The response was stopped. Retry when the provider restores this model, or select another available model for a new chat; saved history and defaults are unchanged.':'The provider task stopped with an error. Its history has been saved.'):'Process exit is unconfirmed. This workspace remains reserved; the request will not repeat automatically.'}:null;
    const binding=this.require(active.chat);
    const factory=status==='completed' && binding.workspace.factorySlug
      ? factoryDraftReceipt({root:this.root,stateRoot:this.stateRoot,agentParent:this.options.agentParent,slug:binding.workspace.factorySlug,chatId:binding.chatId,connectorId:this.connectorId}) : undefined;
    this.registry.updateTurn(active.chat,active.turnId,row=>({...row,status,error,completedAt:stamp(),usage:result.usage || null,...(factory?{factoryDraftReceipt:factory}:{})}));
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
  async reconcile(chat){
    this.require(chat);if(this.active.has(chat))return;
    return this.execution.withMutation('provider-reconcile:'+chat,async()=>{
    const row=this.activeIntent(chat);if(!row)return;
    let exited=false;
    try{exited=Boolean(row.processProof && (this.options.proveExit || providerProcessTreesExited)(row.processProof));}catch{/* Unknown coverage cannot release resources. */}
    if(!exited){
      if(!executionChannelView(this.execution,channelKey(chat)) && Date.now()-Date.parse(row.updatedAt)>5000){expireProviderRequests(this.execution,chat,row.turnId);if(row.state!=='unknown')this.execution.updateIntent(turnKey(chat,row.clientMessageId),{state:'unknown'});}
      return;
    }
    await this.cleanupAttachmentDelivery(turnKey(chat,row.clientMessageId),true);
    expireProviderRequests(this.execution,chat,row.turnId);
    this.registry.updateTurn(chat,row.turnId,turn=>({...turn,status:'interrupted',completedAt:stamp(),error:{code:'provider_owner_restarted',message:'The previous execution owner ended. Its output is preserved; continue explicitly when ready.'}}));
    this.registry.mutate(chat,binding=>({...binding,lastStatus:'idle',updatedAt:stamp()}));
    this.execution.updateIntent(turnKey(chat,row.clientMessageId),{state:'interrupted',exitConfirmed:true,recoveredAt:stamp()});
    this.execution.reconcileRelease(row.owner,row.generation);
    this.emit(chat,'turn.interrupted',{turn:providerTurnView(this.registry.turn(chat,row.turnId))},{turnId:row.turnId});
    });
  }
  queuedRows(chat){return this.execution.listIntents({kind:'provider-queued-message',states:waitingStates,limit:1000}).filter(row=>row.chatId===chat);}
  async queued(chat){
    this.require(chat);
    return Promise.all(this.queuedRows(chat).map(async row=>{
      const ids=row.input.attachments || [],saved=row.attachmentReceipt?.version===1?row.attachmentReceipt.originals:null;
      const files=await Promise.all(ids.map(async(id,index)=>{
        try{
          if(!this.options.attachmentStore || !saved || saved.length!==ids.length)return null;
          const {view,sha256}=await this.options.attachmentStore.resolve(id);
          return JSON.stringify({...view,sha256})===JSON.stringify(saved[index])?view:null;
        }catch{return null;}
      }));
      return {id:row.id,revision:row.revision,state:row.state,text:row.input.input[0].text,clientMessageId:row.input.clientMessageId,createdAt:row.createdAt,reason:row.reason || null,
        attachments:files.filter(Boolean),attachmentsUnavailable:files.some(file=>!file)};
    }));
  }
  async enqueue(chat,input){
    if(Object.hasOwn(input || {},'factoryAction'))throw failure('factory_control_queue_denied','Run an agent action after the current turn completes.',400);
    return this.execution.withMutation('provider-admission:'+chat,async()=>{
      const binding=this.require(chat);this.validateTurn(binding,input);
      const key=queueKey(chat,input.clientMessageId),prior=this.execution.getIntent(key);
      if(!prior){
        const tail=this.queuedRows(chat).at(-1),direct=this.activeIntent(chat);
        if(!tail && !direct)throw failure('queue_target_ended','The preceding task ended. Send this draft as a new turn.');
        const predecessorKey=tail?turnKey(chat,tail.input.clientMessageId):turnKey(chat,direct.clientMessageId);
        const attachments=await this.attachmentInput(binding,input,{phase:'queue',retain:true});
        this.execution.reserveIntent(key,hash(input),{kind:'provider-queued-message',connectorId:this.connectorId,chatId:chat,input,predecessorKey,...(attachments.files.length?{attachmentReceipt:attachments.receipt}:{})},{initialState:'queued',limit:{max:128,scopeField:'chatId',scopeMax:16,states:waitingStates}});
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
