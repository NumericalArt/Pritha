import { ProviderTaskRuntime, providerTurnText, providerTurnView, type ProviderTaskOptions } from '../../../../../scripts/lib/provider-task-runtime.mjs';
import type { ProviderChatBinding } from '../../../../../scripts/lib/provider-chat-registry.mjs';
import { executionChannelView } from '../../../../../scripts/lib/execution-channel.mjs';
import type { TaskChatBackend, TaskProviderHealth } from './driver-types';
import type { ThreadSummary, RuntimeStatus, ThreadGroup } from './types';
import { CodexChatGatewayError } from './native-gateway';
import type {ProviderPreset} from '../settings/provider-profile';
import { providerVoiceTaskBackend } from '../../../../../scripts/lib/provider-voice-task-backend.mjs';
type CatalogHealth=TaskProviderHealth & {model?:{id:string}|null;models?:Array<{id:string;efforts?:string[];tools?:boolean;responses?:boolean;available?:boolean|null}>};

/** UI protocol adapter for private provider history. Native history is never mirrored here. */
export class ExternalChatGateway implements TaskChatBackend {
  readonly core:ProviderTaskRuntime;
  voiceTaskBackend=()=>providerVoiceTaskBackend(this.core);
  constructor(readonly attachments:TaskChatBackend['attachments'],private readonly options:ProviderTaskOptions,private readonly health:(modelId?:string,preset?:ProviderChatBinding['executionConfig'])=>Promise<CatalogHealth>){this.core=new ProviderTaskRuntime({...options,attachmentStore:attachments});}
  private summary(binding:ProviderChatBinding):ThreadSummary {
    const active=this.core.activeIntent(binding.chatId),pending=this.core.pendingRequests(binding.chatId);
    return {chatId:binding.chatId,title:binding.title,preview:binding.preview,group:binding.group,origin:binding.origin,
      ...(binding.subject?{subject:binding.subject}:{}),
      status:binding.archived?'archived':active?'active':binding.lastStatus,activeFlags:active && active.state!=='unknown'?(pending.length?[pending.some(row=>row.kind==='user_input')?'waiting_on_input':'waiting_on_approval']:['streaming']):[],pinned:binding.pinned,archived:binding.archived,historyKind:'mirrored',createdAt:binding.createdAt,updatedAt:binding.updatedAt,
      runtime:{connectorId:binding.connectorId,modelId:binding.modelId,providerId:binding.providerId,version:null,protocol:'exec_resume',stateIdentityHash:binding.stateIdentityHash,compatibility:'bound'},
      taskLinks:this.core.voiceTaskLinks(binding.chatId),continuationState:active?'blocked_active_turn':binding.continuationEnabled?'continuation_enabled':'read_only'};
  }
  runtimeStatus:TaskChatBackend['runtimeStatus']=chatId=>this.runtimeView(chatId);
  previewRuntime=(preset:ProviderPreset)=>this.runtimeView(undefined,preset);
  private async runtimeView(chatId?:string,preset?:ProviderPreset):Promise<RuntimeStatus>{
    const binding=chatId?this.core.require(chatId):null,selected=binding?.executionConfig || {...this.options.configuration(),...preset},status=await this.health(binding?.modelId || selected.modelId,selected);
    const providerId=(this.options.connectorId+'_runtime') as NonNullable<RuntimeStatus['effectiveProvider']> & `${string}_runtime`;
    const c=status.capabilities,availability=status.status==='ready'?'ready':status.status==='not-configured' || status.status==='unavailable'?'unavailable':'degraded';
    const selectedModelId=binding?.modelId || (status.status==='ready'?status.model?.id:null) || selected.modelId;
    return {connectorId:this.options.connectorId,preferredProvider:providerId,effectiveProvider:providerId,effectiveProtocol:'exec_resume',availability,fallbackEnabled:false,
      providers:[{providerId,label:this.options.connectorId,availability,version:status.version,protocol:'exec_resume',locationLabel:this.options.connectorId==='local'?'Local model':this.options.connectorId,stateIdentityHash:binding?.stateIdentityHash || null,warning:status.error?.message || null,
        capabilities:{fullChat:status.status==='ready',nativeHistory:false,listThreads:true,readThread:true,forkThread:false,archiveThread:true,unarchiveThread:true,renameThread:false,pinThread:false,steerTurn:c.steer,interruptTurn:c.interrupt,commandApprovals:c.approvals,fileChangeApprovals:c.approvals,permissionApprovals:c.approvals,requestUserInput:c.approvals,historyPagination:true,audioInput:false,imageInput:c.attachments.images,fileMetadata:c.attachments.files,goalControl:false}}],
      models:(binding || !status.models?.length?[{id:selectedModelId,efforts:selected.reasoningEffort?[selected.reasoningEffort]:[]}]:status.models.filter(row=>row.tools!==false && row.responses!==false && row.available!==false)).map(row=>({id:row.id,label:row.id,effortIds:row.efforts || (selected.reasoningEffort?[selected.reasoningEffort]:[]),serviceTierIds:[],defaultEffortId:selected.reasoningEffort || null,inputModalities:c.attachments.images?['text','image']:['text']})),
      selected:{modelId:selectedModelId,effortId:binding?.effortId || selected.reasoningEffort || null,serviceTierId:null,sandboxMode:selected.sandbox==='workspace-write'?'workspace_write':'read_only',approvalMode:c.approvals?'on_request':'never'},probedAt:status.checkedAt};
  }
  listThreads:TaskChatBackend['listThreads']=async(input={})=>{
    if(input.group && !['all','my_chats','voice_work','other_sessions'].includes(input.group))throw new CodexChatGatewayError('invalid_request','Unknown chat group.',400);
    if(input.view==='legacy')return {data:[],nextCursor:null};
    const page=this.core.registry.list({...input,group:input.group as ThreadGroup|'all'|undefined});this.core.scheduleQueues();return {...page,data:page.data.map(binding=>this.summary(binding))};
  };
  createThread:TaskChatBackend['createThread']=async input=>{const result=await this.core.create(input);return {detail:await this.threadDetail(result.binding.chatId),replayed:result.replayed};};
  createThreadWithFirstTurn:TaskChatBackend['createThreadWithFirstTurn']=async input=>{
    providerTurnText(input.initialTurn);
    const {initialTurn,...request}=input,created=await this.createThread(request);
    const first={...initialTurn,settings:{...initialTurn.settings,...(!initialTurn.settings?.modelId || initialTurn.settings.modelId===request.settings?.modelId?{modelId:created.detail.thread.runtime.modelId || undefined}:{})}};
    const started=await this.startTurn(created.detail.thread.chatId,first);
    return {data:{detail:await this.threadDetail(created.detail.thread.chatId),accepted:started.accepted},replayed:created.replayed && started.replayed};
  };
  threadDetail:TaskChatBackend['threadDetail']=async chat=>{
    await this.core.reconcile(chat);const binding=this.core.require(chat),thread=this.summary(binding),active=this.core.activeIntent(chat),control=executionChannelView(this.core.execution,'provider-control:'+chat);
    return {thread,activeTurnId:active?.turnId || null,controls:control?{turnId:String(control.turnId),steer:control.steer===true,interrupt:control.interrupt===true}:null,pendingRequests:this.core.pendingRequests(chat),queued:await this.core.queued(chat),streamUrl:'/api/codex-chat/v1/threads/'+encodeURIComponent(chat)+'/events',continuationState:thread.continuationState,history:{state:'available',code:null,recoverable:false}};
  };
  startTurn:TaskChatBackend['startTurn']=(chat,input,options)=>this.core.start(chat,input,options);
  queuedMessages:TaskChatBackend['queuedMessages']=async chat=>this.core.queued(chat);
  enqueueMessage:TaskChatBackend['enqueueMessage']=(...args)=>this.core.enqueue(...args);
  cancelQueued:TaskChatBackend['cancelQueued']=(...args)=>this.core.cancelQueued(...args);
  controlTurn:TaskChatBackend['controlTurn']=(...args)=>this.core.control(...args);
  archiveThread:TaskChatBackend['archiveThread']=async(chat,archived)=>{const binding=this.core.registry.mutate(chat,row=>({...row,archived,updatedAt:new Date().toISOString()}));this.core.emit(chat,archived?'thread.archived':'thread.unarchived',{archived});return this.summary(binding);};
  restoreAccess:TaskChatBackend['restoreAccess']=async chat=>this.threadDetail(chat);
  historyPage:TaskChatBackend['historyPage']=async(chat,cursor,limit=20)=>{const page=this.core.registry.turnsPage(chat,{cursor,limit});return {...page,sourceMode:'compatibility' as const,data:page.data.map(providerTurnView)};};
  listTurns:TaskChatBackend['listTurns']=async(chat,input={})=>this.historyPage(chat,input.cursor,input.limit);
  historyItems:TaskChatBackend['historyItems']=async(...args)=>this.core.registry.itemsPage(...args);
  historyContent:TaskChatBackend['historyContent']=async(...args)=>this.core.registry.content(...args);
  assertChat:TaskChatBackend['assertChat']=async chat=>{this.core.require(chat);};
  subscribe:TaskChatBackend['subscribe']=(...args)=>this.core.subscribe(...args);
  eventsAfter:TaskChatBackend['eventsAfter']=(...args)=>this.core.registry.eventsAfter(...args);
  connectionReady:TaskChatBackend['connectionReady']=(chat,runtime)=>this.core.emit(chat,'connection.ready',{runtime,latestEventId:this.core.registry.latestEventId(chat)});
  heartbeat:TaskChatBackend['heartbeat']=chat=>this.core.emit(chat,'heartbeat',{});
  streamReset:TaskChatBackend['streamReset']=(chat,reason)=>this.core.emit(chat,'stream.reset',{reason,refresh:true});
  dispose:TaskChatBackend['dispose']=()=>this.core.dispose();
  workspacePreview:TaskChatBackend['workspacePreview']=async()=>{const {inspectTaskWorkspace}=await import('../../../../../scripts/lib/task-workspace.mjs');return {...await inspectTaskWorkspace(this.options.root),sandbox:this.options.configuration().sandbox};};
  activity:TaskChatBackend['activity']=async(after=0)=>{
    this.core.scheduleQueues();const execution=this.core.execution,window=execution.eventWindow(),reset=after===0 || after>window.newest || window.oldest>0 && after<window.oldest-1;
    const events=execution.events(reset?0:after),active=execution.listIntents({kind:'turn',states:['dispatching','running','unknown'],limit:1000}).filter(row=>row.connectorId===this.options.connectorId);
    for(const row of active.slice(0,4))await this.core.reconcile(row.chatId);
    const changed=reset?this.core.registry.list({group:'all',limit:50}).data.map(row=>row.chatId):[...new Set(events.filter(row=>String(row.chatId || '').startsWith('chat_'+this.options.connectorId+'_')).map(row=>String(row.chatId)))];
    const waiting=execution.listIntents({kind:'provider-request',states:['pending'],limit:1000}).filter(row=>String(row.chatId || '').startsWith('chat_'+this.options.connectorId+'_'));
    return {cursor:reset?window.newest:events.at(-1)?.sequence || after,reset,changed,admissionEnabled:execution.admission().enabled,active:active.map(row=>({chatId:row.chatId,state:row.state,revision:row.revision})),capacity:0,counts:{active:0,queued:0,waitingForOperator:waiting.length,unknown:0}};
  };
  private unsupported():never {throw new CodexChatGatewayError('provider_capability_unavailable','This provider does not expose this operation yet. The task and its history are preserved.',422);}
  threadGoal:TaskChatBackend['threadGoal']=async chat=>{this.core.require(chat);return {availability:'unsupported',objective:null,status:null,tokensUsed:null,tokenBudget:null,revision:null,pendingRequest:null};};
  updateGoalBudget:TaskChatBackend['updateGoalBudget']=async()=>this.unsupported();
  applyBudgetIntent:TaskChatBackend['applyBudgetIntent']=async()=>this.unsupported();
  applyDeliveryBudgetIntent:TaskChatBackend['applyDeliveryBudgetIntent']=async()=>this.unsupported();
  voiceControl:TaskChatBackend['voiceControl']=async()=>this.unsupported();
  answerRequest:TaskChatBackend['answerRequest']=(...args)=>this.core.answerRequest(...args);
  operationDecision:TaskChatBackend['operationDecision']=async()=>this.unsupported();
  taskDeliveries:TaskChatBackend['taskDeliveries']=async()=>this.unsupported();
  deliveryAction:TaskChatBackend['deliveryAction']=async()=>this.unsupported();
  createTaskLink:TaskChatBackend['createTaskLink']=async()=>this.unsupported();
  taskChatLinkForTask:TaskChatBackend['taskChatLinkForTask']=async taskId=>{const chat=this.core.voiceTaskChat(taskId) || this.core.registry.history.chatForTask(taskId);return chat?{chatId:chat,href:'/task-chat?group=voice_work&chat='+encodeURIComponent(chat),historyAvailable:true,continuationState:this.summary(this.core.require(chat)).continuationState}:null;};
}
