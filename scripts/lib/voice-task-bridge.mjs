import { VoiceBindingError } from './voice-topic-bindings.mjs';
import { createHash } from 'node:crypto';

export const voiceTaskRequestHash = request => createHash('sha256').update(JSON.stringify(request)).digest('hex');

const fail = code => { throw new VoiceBindingError(code); };
const safeCode = error => /^[a-z][a-z0-9_]{0,79}$/.test(error?.code || '') ? error.code : 'voice_dispatch_unconfirmed';
const knownBeforeDispatch = new Set(['provider_not_configured', 'provider_runtime_unavailable', 'provider_model_invalid',
  'provider_model_unavailable', 'provider_sandbox_invalid', 'provider_attachments_unverified', 'chat_archived',
  'execution_draining', 'workspace_busy', 'runtime_identity_mismatch', 'queue_target_ended']);

/** Thin host bridge: canonical backend receipts remain the execution truth.
 * Opening/reconciling a topic never resends a prompt or restarts a provider.
 * The host adapter, not a model tool argument, supplies every callback below.
 */
export class VoiceTaskBridge {
  constructor({ bindings, backend }) { this.bindings = bindings; this.backend = backend; }
  bound(taskId) {
    const task = this.bindings.task(taskId);
    if (!task) fail('voice_task_binding_missing');
    return { task, topic: this.bindings.topic(task.topicId) };
  }
  view(task, topic, receipt = null) { return { task, topic, receipt }; }
  async reconcile(taskId) {
    return this.bindings.coordinator.withMutation('voice-task-dispatch:' + taskId, () => this.reconcileOwned(taskId));
  }
  async reconcileOwned(taskId) {
    let { task, topic } = this.bound(taskId);
    if (!topic.chatId) return this.view(task, topic);
    const receipt = await this.backend.receipt(topic, task.clientMessageId);
    if (!receipt) return this.view(task, topic);
    if (receipt.chatId !== topic.chatId || receipt.clientMessageId !== task.clientMessageId) fail('voice_task_receipt_mismatch');
    if (receipt.sessionId) topic = this.bindings.pinSession(topic.topicId, receipt.sessionId, topic.revision);
    if (receipt.kind === 'turn') {
      if (task.turnId && task.turnId !== receipt.turnId) fail('voice_task_receipt_mismatch');
      if (task.state !== 'accepted') task = this.bindings.transition(taskId, task.revision, { state: 'accepted', turnId: receipt.turnId, errorCode: null });
    } else if (receipt.kind === 'queue') {
      if (task.queueId && task.queueId !== receipt.queueId || task.state === 'accepted') fail('voice_task_receipt_mismatch');
      if (task.state !== 'queued') task = this.bindings.transition(taskId, task.revision, { state: 'queued', queueId: receipt.queueId, errorCode: null });
    } else if (receipt.kind === 'cancelled') {
      if (task.queueId !== receipt.queueId || !['queued', 'cancelled'].includes(task.state)) fail('voice_task_receipt_mismatch');
      if (task.state !== 'cancelled') task = this.bindings.transition(taskId, task.revision, { state: 'cancelled' });
    } else fail('voice_task_receipt_invalid');
    return this.view(task, topic, receipt);
  }
  async dispatch(taskId, request) {
    return this.bindings.coordinator.withMutation('voice-task-dispatch:' + taskId, async () => {
      let { task, topic } = this.bound(taskId);
      if (voiceTaskRequestHash(request) !== task.requestHash) fail('voice_task_idempotency_conflict');
      if (task.state !== 'reserved') return this.reconcileOwned(taskId);
      if (!topic.chatId) {
        // A creation response can be lost before bindChat. The canonical backend
        // deduplicates this same clientThreadId; creation cannot execute a turn.
        const created = await this.backend.create(topic, request);
        topic = this.bindings.bindChat(topic.topicId, created.chatId, topic.revision, created.modelId);
      }
      task = this.bindings.transition(taskId, task.revision, { state: 'dispatching' });
      try {
        const detail = await this.backend.detail(topic);
        const input = { ...request.turn, clientMessageId: task.clientMessageId };
        if (detail.activeTurnId || detail.queued.length) await this.backend.enqueue(topic, input);
        else {
          try { await this.backend.start(topic, input); }
          catch (error) {
            // Only these canonical errors prove that a racing start admitted no
            // turn. They may join its queue; no transport error permits retry.
            if (!['turn_active', 'queue_waiting'].includes(error?.code)) throw error;
            await this.backend.enqueue(topic, input);
          }
        }
        const saved = await this.reconcileOwned(taskId);
        if (!saved.receipt) fail('voice_dispatch_unconfirmed');
        return saved;
      } catch (error) {
        // The response may have been lost after the durable provider receipt.
        // Read only. Storage/transport failure here leaves dispatch fenced.
        try { const saved = await this.reconcileOwned(taskId); if (saved.receipt) return saved; } catch {}
        const current = this.bindings.task(taskId);
        if (current.state === 'dispatching') this.bindings.transition(taskId, current.revision, {
          state: knownBeforeDispatch.has(error?.code) ? 'blocked' : 'unknown', errorCode: safeCode(error),
        });
        throw error;
      }
    });
  }
  async stop(taskId, { generation, revision, clientMessageId }) {
    return this.bindings.coordinator.withMutation('voice-task-dispatch:' + taskId, async () => {
      const current = this.bound(taskId);
      if (current.topic.scope.generation !== generation || current.task.revision !== revision) fail('voice_task_context_changed');
      if (current.task.state === 'reserved') return this.view(this.bindings.transition(taskId, revision, { state: 'cancelled' }), current.topic);
      const view = await this.reconcileOwned(taskId), { task, topic, receipt } = view;
      if (task.revision !== revision) fail('voice_task_context_changed');
      if (task.state === 'cancelled') return view;
      if (task.state === 'queued' && receipt?.kind === 'queue') {
        await this.backend.cancelQueued(topic, receipt.queueId, receipt.revision);
        return this.view(this.bindings.transition(taskId, revision, { state: 'cancelled' }), topic);
      }
      if (task.state !== 'accepted' || receipt?.kind !== 'turn') fail('voice_task_recovery_required');
      const detail = await this.backend.detail(topic);
      if (detail.activeTurnId !== task.turnId) fail('voice_task_not_active');
      // An acknowledgement means stop requested. The backend owns the proof of
      // process exit; this bridge never marks the turn completed or releases it.
      return { ...view, stop: await this.backend.control(topic, { action: 'interrupt', expectedTurnId: task.turnId, clientMessageId }) };
    });
  }
  async answer(taskId, { generation, requestId, revision, clientMessageId, response }) {
    const { task, topic } = await this.reconcile(taskId);
    if (topic.scope.generation !== generation || task.state !== 'accepted') fail('voice_task_context_changed');
    const detail = await this.backend.detail(topic);
    const pending = detail.pendingRequests.find(row => row.requestId === requestId && row.turnId === task.turnId);
    if (!pending || pending.presentation?.revision !== revision) {
      const answered = await this.backend.answeredRequest?.(topic, requestId);
      if (!answered || answered.turnId !== task.turnId || answered.revision !== revision) fail('voice_question_changed');
    }
    // The canonical request broker rechecks request ID, owner, revision and the
    // allowed answer/approval shape immediately before accepting the response.
    return this.backend.answer(topic, { ...response, requestId, revision, clientMessageId });
  }
}
