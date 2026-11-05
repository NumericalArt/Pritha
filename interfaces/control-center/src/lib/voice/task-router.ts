import { createHash } from 'node:crypto';
import { VoiceTopicBindings, type VoiceTopicBinding, type VoiceTopicScope } from '../../../../../scripts/lib/voice-topic-bindings.mjs';
import { VoiceTaskBridge, voiceTaskRequestHash, type VoiceDispatchRequest, type VoiceTaskBackend } from '../../../../../scripts/lib/voice-task-bridge.mjs';
import { nativeExecutionCoordinator } from '../codex-chat/native-turn-coordinator';
import { getCodexChatGateway } from '../codex-chat/gateway';
import { resolvePrithaStateRoot } from '../pritha-paths';
import type { ProviderConnectorId, ProviderPreset } from '../settings/provider-profile';

const routers = new Map<string, { bindings: VoiceTopicBindings; bridge: VoiceTaskBridge; backend: VoiceTaskBackend }>();
function router() {
  const coordinator = nativeExecutionCoordinator();
  let current = routers.get(coordinator.file);
  if (!current) {
    const bindings = new VoiceTopicBindings({ coordinator, stateRoot: resolvePrithaStateRoot() });
    const backend: VoiceTaskBackend = {
      create: (topic, request) => getCodexChatGateway().voiceTaskBackend(topic.connectorId).create(topic, request),
      receipt: (topic, client) => getCodexChatGateway().voiceTaskBackend(topic.connectorId).receipt(topic, client),
      detail: topic => getCodexChatGateway().voiceTaskBackend(topic.connectorId).detail(topic),
      start: (topic, input) => getCodexChatGateway().voiceTaskBackend(topic.connectorId).start(topic, input),
      enqueue: (topic, input) => getCodexChatGateway().voiceTaskBackend(topic.connectorId).enqueue(topic, input),
      cancelQueued: (topic, id, revision) => getCodexChatGateway().voiceTaskBackend(topic.connectorId).cancelQueued(topic, id, revision),
      control: (topic, input) => getCodexChatGateway().voiceTaskBackend(topic.connectorId).control(topic, input),
      answer: (topic, input) => getCodexChatGateway().voiceTaskBackend(topic.connectorId).answer(topic, input),
      answeredRequest: async (topic, id) => await getCodexChatGateway().voiceTaskBackend(topic.connectorId).answeredRequest?.(topic, id) || null,
    };
    current = { bindings, backend, bridge: new VoiceTaskBridge({ bindings, backend }) };
    routers.set(coordinator.file, current);
  }
  return current;
}
export function providerVoiceTaskBinding(taskId: string) {
  const { bindings } = router(), task = bindings.task(taskId);
  return task ? { task, topic: bindings.topic(task.topicId)! } : null;
}
export function reserveProviderVoiceTask(input: {
  taskId: string; scope: VoiceTopicScope; connectorId: ProviderConnectorId; preset: ProviderPreset;
  workspace: VoiceTopicBinding['workspace']; request: VoiceDispatchRequest; reset?: boolean; continueTaskId?: string;
}) {
  const previous = input.continueTaskId ? providerVoiceTaskBinding(input.continueTaskId) : null;
  if (input.continueTaskId && !previous) throw Object.assign(new Error('The original voice topic is unavailable.'), { code: 'voice_task_binding_missing' });
  const factoryTopic=input.workspace.factorySlug ? previous?.topic || router().bindings.latest(input.scope) : null;
  const sameFactory=factoryTopic?.workspace.factorySlug===input.workspace.factorySlug && Boolean(input.workspace.factorySlug);
  if(sameFactory && factoryTopic!.connectorId!==input.connectorId)throw Object.assign(new Error('Continue this child with its saved provider.'),{code:'voice_factory_provider_pinned'});
  // A new Voice card is a new request, not a new identity for the same child.
  // Reuse its canonical conversation and approvals even after reconnect/reset.
  return router().bindings.reserve({ ...input,...(sameFactory?{reset:false}:{}), requestHash: voiceTaskRequestHash(input.request),
    ...(previous ? { continueTopicId: previous.topic.topicId, expectedGeneration: previous.topic.scope.generation } : {}) });
}
export async function dispatchProviderVoiceTask(taskId: string, request: VoiceDispatchRequest) {
  await router().bridge.dispatch(taskId, request);
  return providerVoiceTaskProjection(taskId);
}
const safeError = (error: unknown, fallback = 'voice_task_readback_unavailable') => {
  const value = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return /^[a-z][a-z0-9_]{0,79}$/.test(value) ? value : fallback;
};
const controlFailure = (taskId: string, error: unknown) => ({ ok: false, task_id: taskId, error: safeError(error, 'voice_task_control_unconfirmed') });
export async function providerVoiceTaskProjection(taskId: string) {
  const bound = providerVoiceTaskBinding(taskId);
  if (!bound) return null;
  let view;
  try { view = await router().bridge.reconcile(taskId); }
  catch (error) { return { status: { status: 'waiting_for_operator', phase: 'voice_task_recovery_required', error_code: safeError(error) }, resultText: '', ...bound }; }
  const { task, topic, receipt } = view;
  let detail;
  try { detail = topic.chatId ? await router().backend.detail(topic) : null; }
  catch (error) { return { task, topic, resultText: '', status: { status: 'waiting_for_operator', phase: 'voice_task_recovery_required', error_code: safeError(error) } }; }
  const pending = detail?.pendingRequests.filter(row => row.turnId === task.turnId) || [];
  const question = pending.find(row => row.kind === 'user_input');
  const turn = receipt?.kind === 'turn' ? receipt.turn : null;
  const factoryReceipt=receipt?.kind === 'turn' ? receipt.factoryDraftReceipt : undefined;
  const factoryFailed=turn?.status==='completed' && factoryReceipt?.draftCreated===false;
  const unknownExecution = detail?.activeTurnId === task.turnId && detail?.executionState === 'unknown';
  const queue = receipt?.kind === 'queue' ? receipt : null;
  const statusMap: Record<string, string> = { completed: 'complete', failed: 'failed', interrupted: 'aborted', queued: 'queued',
    in_progress: 'running', waiting_for_input: 'waiting_for_operator', waiting_for_approval: 'waiting_for_operator', waiting_for_provider: 'waiting_for_operator' };
  const status = turn ? pending.length || unknownExecution ? 'waiting_for_operator' : factoryFailed ? 'failed' : statusMap[turn.status] || 'waiting_for_operator'
    : task.state === 'queued' && (!queue?.status || queue.status === 'queued') ? 'queued' : task.state === 'cancelled' ? 'aborted' : 'waiting_for_operator';
  const questions = question?.presentation && Array.isArray(question.presentation.questions) ? question.presentation.questions as Array<{id:string;question:string}> : [];
  const resultText = receipt?.kind === 'turn' ? receipt.resultText || '' : '';
  return { task, topic, resultText, status: {
    status, phase: unknownExecution ? 'execution_unknown' : factoryFailed ? 'factory_draft_failed' : turn?.status || queue?.status || task.state, transport: 'task-chat', connector_id: topic.connectorId,
    model: topic.resolvedModelId || topic.preset.modelId, chat_id: topic.chatId, turn_id: task.turnId,
    topic_id: topic.topicId, topic_generation: topic.scope.generation, task_revision: task.revision,
    task_chat_href: topic.chatId ? '/task-chat?group='+(detail?.threadGroup==='my_chats'?'my_chats':'voice_work')+'&chat=' + encodeURIComponent(topic.chatId) : null,
    updated_at: turn?.completedAt || turn?.startedAt || task.updatedAt, completed_at: turn?.completedAt || null,
    result_truncated: receipt?.kind === 'turn' && receipt.resultTruncated === true,
    error_code: unknownExecution ? 'fallback_confirmation_required' : factoryFailed ? factoryReceipt?.errorCode : turn?.error?.code || queue?.reason || task.errorCode,
    factory_draft_failed: Boolean(factoryFailed),
    question: questions.map(row => row.question).join('\n').slice(0, 2000),
    requires_operator_response: Boolean(question),
    operator_request: question ? { request_id: question.requestId, revision: question.presentation?.revision,
      topic_generation: topic.scope.generation, questions } : null,
    approval_in_task_chat: pending.some(row => row.kind !== 'user_input'),
  } };
}
export async function answerProviderVoiceTask(taskId: string, input: { answer: string; questionId: string; revision: number; generation: number }) {
  try {
  const bound = providerVoiceTaskBinding(taskId);
  if (!bound?.topic.chatId) return { ok: false, error: 'voice_task_binding_missing' };
  const detail = await router().backend.detail(bound.topic);
  const pending = detail.pendingRequests.find(row => row.requestId === input.questionId && row.turnId === bound.task.turnId);
  const answered = !pending ? await router().backend.answeredRequest?.(bound.topic, input.questionId) : null;
  const questions = pending?.kind === 'user_input' && Array.isArray(pending.presentation?.questions) ? pending.presentation.questions as Array<{id:string}>
    : answered?.kind === 'user_input' && answered.turnId === bound.task.turnId && answered.revision === input.revision ? answered.questions || [] : [];
  if (questions.length !== 1 || !input.answer.trim()) return { ok: false, error: 'voice_answer_requires_task_chat' };
  const clientMessageId = 'voice_answer_' + createHash('sha256').update(JSON.stringify([taskId, input])).digest('hex').slice(0, 48);
  await router().bridge.answer(taskId, { generation: input.generation, requestId: input.questionId, revision: input.revision,
    clientMessageId, response: { answers: { [questions[0].id]: [input.answer] } } });
  return { ok: true, answer_accepted: true, task_id: taskId };
  } catch (error) { return controlFailure(taskId, error); }
}
export async function stopProviderVoiceTask(taskId: string, revision: number, generation: number) {
  try {
  const clientMessageId = 'voice_stop_' + createHash('sha256').update(`${taskId}:${revision}:${generation}`).digest('hex').slice(0, 48);
  await router().bridge.stop(taskId, { generation, revision, clientMessageId });
  return { ok: true, task_id: taskId, ...(await providerVoiceTaskProjection(taskId)) };
  } catch (error) { return controlFailure(taskId, error); }
}
