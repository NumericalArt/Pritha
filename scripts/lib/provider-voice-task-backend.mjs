import { VoiceBindingError } from './voice-topic-bindings.mjs';

/** Voice uses the same provider runtime as typed Task Chat: one queue, history,
 * approval broker, workspace policy and execution coordinator. */
export function providerVoiceTaskBackend(runtime) {
  function pinnedSettings(topic, settings) {
    const modelId = topic.resolvedModelId || topic.preset.modelId;
    if (settings?.serviceTierId || settings?.modelId && ![modelId, topic.preset.modelId].includes(settings.modelId)
        || settings?.effortId && settings.effortId !== topic.preset.reasoningEffort) throw new VoiceBindingError('voice_topic_model_mismatch');
    return { modelId, effortId: topic.preset.reasoningEffort };
  }
  function check(topic) {
    if (topic.connectorId !== runtime.connectorId || !topic.chatId) throw new VoiceBindingError('voice_topic_provider_mismatch');
    const binding = runtime.require(topic.chatId);
    if (binding.voiceTopicId !== topic.topicId || binding.voiceTopicGeneration !== topic.scope.generation
        || binding.origin !== 'voice' || binding.group !== 'voice_work' || binding.modelId !== (topic.resolvedModelId || topic.preset.modelId)
        || binding.effortId !== topic.preset.reasoningEffort) throw new VoiceBindingError('voice_topic_chat_mismatch');
    if (topic.sessionId && binding.nativeThreadId !== topic.sessionId) throw new VoiceBindingError('voice_topic_session_mismatch');
    if(binding.workspace.agentId!==topic.workspace.agentId || topic.workspace.agentId && (topic.scope.kind!=='agent' || topic.scope.id!==topic.workspace.agentId))throw new VoiceBindingError('voice_topic_workspace_mismatch');
    if (topic.workspace.mode === 'read-only' ? binding.executionConfig.sandbox !== 'read-only'
      : binding.executionConfig.sandbox !== 'workspace-write' || binding.workspace.mode !== 'worktree') throw new VoiceBindingError('voice_topic_workspace_mismatch');
    return binding;
  }
  return {
    async create(topic, request) {
      if (topic.connectorId !== runtime.connectorId) throw new VoiceBindingError('voice_topic_provider_mismatch');
      if(topic.scope.kind==='agent' && topic.workspace.agentId!==topic.scope.id || topic.workspace.agentId && topic.scope.kind!=='agent')throw new VoiceBindingError('voice_topic_workspace_mismatch');
      // Every task in this topic uses the same creation identity, including when
      // two tasks race before bindChat receives the first creation response.
      if (request.chat.subject) throw new VoiceBindingError('voice_factory_subject_binding_required');
      if (request.chat.workspace && (request.chat.workspace.mode !== topic.workspace.mode
          || request.chat.workspace.baseRevision !== topic.workspace.baseRevision || request.chat.workspace.agentId!==topic.workspace.agentId)) throw new VoiceBindingError('voice_topic_workspace_mismatch');
      const result = await runtime.create({ title: 'Voice · ' + (topic.scope.label || topic.scope.id).slice(0, 100), workspace: topic.workspace, clientThreadId: topic.clientThreadId, source: 'chat',
        settings: pinnedSettings(topic, request.chat.settings) },
      { voice: { topicId: topic.topicId, generation: topic.scope.generation, preset: topic.preset } });
      check({ ...topic, chatId: result.binding.chatId, resolvedModelId: result.binding.modelId });
      return { chatId: result.binding.chatId, modelId: result.binding.modelId };
    },
    async receipt(topic, clientMessageId) { check(topic); return runtime.voiceReceipt(topic.chatId, clientMessageId); },
    async detail(topic) {
      check(topic); await runtime.reconcile(topic.chatId);
      const active=runtime.activeIntent(topic.chatId);
      return { activeTurnId: active?.turnId || null,executionState:active?.state || null,
        queued: await runtime.queued(topic.chatId), pendingRequests: runtime.pendingRequests(topic.chatId) };
    },
    async start(topic, input) { check(topic); return runtime.start(topic.chatId, { ...input, settings: pinnedSettings(topic, input.settings) }); },
    async enqueue(topic, input) { check(topic); return runtime.enqueue(topic.chatId, { ...input, settings: pinnedSettings(topic, input.settings) }); },
    async cancelQueued(topic, queueId, revision) { check(topic); return runtime.cancelQueued(topic.chatId, queueId, revision); },
    async control(topic, input) { check(topic); return runtime.control(topic.chatId, input); },
    async answer(topic, input) { check(topic); return runtime.answerRequest(topic.chatId, input); },
    async answeredRequest(topic, requestId) {
      check(topic);
      const row = runtime.execution.getIntentById(requestId);
      if (row?.kind !== 'provider-request' || row.chatId !== topic.chatId || row.state !== 'answered') return null;
      return { requestId: row.id, turnId: row.turnId, revision: row.revision - 1, kind: row.requestKind,
        ...(row.requestKind === 'user_input' ? { questions: row.presentation.questions.map(question => ({ id: question.id })) } : {}) };
    },
  };
}
