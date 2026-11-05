import {VoiceBindingError} from '../../../../../scripts/lib/voice-topic-bindings.mjs';
import type {VoiceTaskBackend} from '../../../../../scripts/lib/voice-task-bridge.mjs';
import type {VoiceTopicBinding} from '../../../../../scripts/lib/voice-topic-bindings.mjs';
import type {CodexChatGateway,CreateThreadInput} from './native-gateway';
import type {ChatBinding} from './private-store';
import type {ExecutionCoordinator} from '../../../../../scripts/lib/execution-coordinator.mjs';

type Host={gateway:CodexChatGateway;execution:ExecutionCoordinator;binding:(id:string)=>Promise<ChatBinding>;
  factory:(slug:string)=>Promise<ChatBinding|null>;create:(input:CreateThreadInput,topic:VoiceTopicBinding)=>Promise<ChatBinding>;receipt:VoiceTaskBackend['receipt']};
/** Voice is an entry point into the native conversation, never a second transcript. */
export function nativeVoiceTaskBackend(host:Host):VoiceTaskBackend{
  function settings(topic:VoiceTopicBinding,input?:{modelId?:string;effortId?:string;serviceTierId?:string}){
    const modelId=topic.resolvedModelId || topic.preset.modelId;
    if(input?.modelId && ![modelId,topic.preset.modelId].includes(input.modelId) || input?.effortId && input.effortId!==topic.preset.reasoningEffort || input?.serviceTierId)throw new VoiceBindingError('voice_topic_model_mismatch');
    return {modelId,effortId:topic.preset.reasoningEffort};
  }
  async function check(topic:VoiceTopicBinding){
    if(topic.connectorId!=='codex' || !topic.chatId)throw new VoiceBindingError('voice_topic_provider_mismatch');
    const binding=await host.binding(topic.chatId);
    const typed=binding.origin==='chat' && binding.group==='my_chats' && topic.workspace.factorySlug && (await host.factory(topic.workspace.factorySlug))?.chatId===binding.chatId;
    if(!typed && (binding.origin!=='voice' || binding.group!=='voice_work' || binding.voiceTopicId!==topic.topicId || binding.voiceTopicGeneration!==topic.scope.generation)
      || binding.modelId!==(topic.resolvedModelId || topic.preset.modelId) || binding.factoryEffortId!==topic.preset.reasoningEffort
      || topic.sessionId && binding.nativeThreadId!==topic.sessionId)throw new VoiceBindingError('voice_topic_chat_mismatch');
    if(!topic.workspace.factorySlug || binding.workspace?.factorySlug!==topic.workspace.factorySlug || binding.subject?.slug!==topic.scope.id
      || topic.scope.kind!=='agent' || binding.sandbox!=='read-only')throw new VoiceBindingError('voice_topic_workspace_mismatch');
    return binding;
  }
  return {
    async create(topic,request){
      const slug=topic.workspace.factorySlug;
      if(topic.connectorId!=='codex' || !slug || topic.scope.kind!=='agent' || topic.scope.id!==slug || topic.workspace.mode!=='read-only'
        || request.chat.subject?.slug!==slug || request.chat.subject.phase!=='interview' || topic.workspace.agentId || topic.workspace.baseRevision)throw new VoiceBindingError('voice_topic_workspace_mismatch');
      if(request.chat.workspace && JSON.stringify(request.chat.workspace)!==JSON.stringify(topic.workspace))throw new VoiceBindingError('voice_topic_workspace_mismatch');
      const existing=await host.factory(slug);
      if(existing?.origin==='chat' && existing.group==='my_chats'){
        if(!existing.modelId || !existing.factoryEffortId)throw new VoiceBindingError('voice_factory_settings_unavailable');
        const preset={...topic.preset,modelId:existing.modelId,reasoningEffort:existing.factoryEffortId};
        await check({...topic,chatId:existing.chatId,resolvedModelId:existing.modelId,preset});
        return {chatId:existing.chatId,modelId:existing.modelId,factoryPreset:preset};
      }
      const binding=await host.create({clientThreadId:topic.clientThreadId,source:'chat',title:'Voice · '+(topic.scope.label || slug).slice(0,100),
        factoryIntent:{action:'create-new-agent',slug},settings:settings(topic,request.chat.settings)},topic);
      await check({...topic,chatId:binding.chatId,resolvedModelId:binding.modelId || null});
      return {chatId:binding.chatId,modelId:binding.modelId};
    },
    async receipt(topic,id){await check(topic);return host.receipt(topic,id);},
    async detail(topic){const binding=await check(topic);const detail=await host.gateway.threadDetail(topic.chatId!);return {activeTurnId:detail.activeTurnId,queued:detail.queued || [],pendingRequests:detail.pendingRequests,threadGroup:binding.group==='my_chats'?'my_chats' as const:'voice_work' as const};},
    async start(topic,input){await check(topic);return host.gateway.startTurn(topic.chatId!,{...input,settings:settings(topic,input.settings)});},
    async enqueue(topic,input){await check(topic);return host.gateway.enqueueMessage(topic.chatId!,{...input,settings:settings(topic,input.settings)});},
    async cancelQueued(topic,id,revision){await check(topic);return host.gateway.cancelQueued(topic.chatId!,id,revision);},
    async control(topic,input){await check(topic);return host.gateway.controlTurn(topic.chatId!,input);},
    async answer(topic,input){await check(topic);return host.gateway.answerRequest(topic.chatId!,input as Parameters<CodexChatGateway['answerRequest']>[1]);},
    async answeredRequest(topic,id){await check(topic);const row=host.execution.getIntentById(id);
      return row?.kind==='provider-request' && row.chatId===topic.chatId && row.state==='answered'
        ? {requestId:row.id,turnId:row.turnId,revision:row.revision-1,kind:row.requestKind,...(row.requestKind==='user_input'?{questions:row.presentation.questions.map((q:{id:string})=>({id:q.id}))}:{})}:null;},
  };
}
