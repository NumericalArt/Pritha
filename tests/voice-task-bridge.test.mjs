import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { VoiceTopicBindings } from '../scripts/lib/voice-topic-bindings.mjs';
import { VoiceTaskBridge, voiceTaskRequestHash } from '../scripts/lib/voice-task-bridge.mjs';
const request = { chat: { title: 'Voice task', workspace: { mode: 'read-only' } }, turn: { input: [{ type: 'text', text: 'Inspect a local fixture.' }] } };
const err = code => Object.assign(new Error(code), { code });
function fixture(t) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pritha-voice-bridge-'));
  const coordinator = new ExecutionCoordinator({ stateRoot });
  const bindings = new VoiceTopicBindings({ coordinator, stateRoot });
  t.after(() => { coordinator.close(); rmSync(stateRoot, { recursive: true, force: true }); });
  const calls = [], receipts = new Map();
  const detail = { activeTurnId: null, queued: [], pendingRequests: [] };
  const backend = {
    async create(topic) { calls.push(['create', topic.connectorId, topic.preset.modelId]); return { chatId: `chat_${topic.connectorId}_${'a'.repeat(32)}` }; },
    async receipt(topic, clientMessageId) { return receipts.get(clientMessageId) || null; },
    async detail() { return detail; },
    async start(topic, input) {
      calls.push(['start', topic.connectorId, input]); detail.activeTurnId = 'turn-exact';
      receipts.set(input.clientMessageId, { kind: 'turn', chatId: topic.chatId, clientMessageId: input.clientMessageId, turnId: detail.activeTurnId });
    },
    async enqueue(topic, input) {
      calls.push(['enqueue', topic.connectorId, input]);
      receipts.set(input.clientMessageId, { kind: 'queue', chatId: topic.chatId, clientMessageId: input.clientMessageId, queueId: 'queue-exact', revision: 4 });
    },
    async cancelQueued(topic, queueId, revision) { calls.push(['cancel', topic.connectorId, queueId, revision]); },
    async control(topic, input) { calls.push(['control', topic.connectorId, input]); return { status: 'stop_requested' }; },
    async answer(topic, input) { calls.push(['answer', topic.connectorId, input]); return { submitted: true }; },
  };
  const reserve = (taskId = 'task-one', connectorId = 'neuraldeep') => bindings.reserve({ taskId,
    scope: { kind: 'pritha', id: 'voice' }, connectorId, preset: { modelId: 'pinned-model', reasoningEffort: 'low', timeoutMs: 30000 }, requestHash: voiceTaskRequestHash(request) });
  return { bindings, reserve, calls, receipts, detail, backend, bridge: new VoiceTaskBridge({ bindings, backend }) };
}
test('concurrent dispatch and a replay use one canonical start and its exact provider receipt', async t => {
  const f = fixture(t), r = f.reserve();
  const results = await Promise.all([f.bridge.dispatch(r.task.taskId, request), f.bridge.dispatch(r.task.taskId, request)]);
  assert.equal(f.calls.filter(row => row[0] === 'start').length, 1);
  assert.ok(results.every(result => result.task.turnId === 'turn-exact'));
  assert.equal(f.calls.find(row => row[0] === 'start')[2].clientMessageId, r.task.clientMessageId);
});
test('a changed dispatch body cannot reuse an earlier reservation or call a backend', async t => {
  const f = fixture(t); f.reserve();
  await assert.rejects(f.bridge.dispatch('task-one', { ...request, chat: { title: 'Changed' } }), { code: 'voice_task_idempotency_conflict' });
  assert.equal(f.calls.length, 0);
});
test('lost acknowledgement is reconciled from history without a second provider request', async t => {
  const f = fixture(t); f.reserve(); const start = f.backend.start;
  f.backend.start = async (...args) => { await start(...args); throw err('response_lost'); };
  const result = await f.bridge.dispatch('task-one', request);
  assert.equal(result.task.state, 'accepted');
  await new VoiceTaskBridge({ bindings: f.bindings, backend: f.backend }).dispatch('task-one', request);
  assert.equal(f.calls.filter(row => row[0] === 'start').length, 1);
});
test('unknown dispatch remains fenced across restart and does not select another connector', async t => {
  const f = fixture(t); f.reserve();
  f.backend.start = async topic => { f.calls.push(['start', topic.connectorId]); throw err('transport_closed'); };
  await assert.rejects(f.bridge.dispatch('task-one', request), { code: 'transport_closed' });
  f.reserve('new-default-task', 'claude');
  const result = await new VoiceTaskBridge({ bindings: f.bindings, backend: f.backend }).dispatch('task-one', request);
  assert.equal(result.task.state, 'unknown'); assert.equal(result.topic.connectorId, 'neuraldeep');
  assert.equal(f.calls.filter(row => row[0] === 'start').length, 1);
});
test('busy and racing tasks join the canonical queue; a transport error cannot trigger queue fallback', async t => {
  const f = fixture(t); f.reserve(); f.detail.activeTurnId = 'preceding-turn';
  const queued = await f.bridge.dispatch('task-one', request);
  assert.equal(queued.task.queueId, 'queue-exact');
  assert.equal(f.calls.filter(row => row[0] === 'start').length, 0);
  f.reserve('racing-task'); f.detail.activeTurnId = null;
  f.backend.start = async () => { throw err('turn_active'); };
  assert.equal((await f.bridge.dispatch('racing-task', request)).task.state, 'queued');
  assert.equal(f.calls.filter(row => row[0] === 'enqueue').length, 2);
});
test('stop cancels the exact queue revision, while active stop keeps execution proof with its backend', async t => {
  const f = fixture(t); f.reserve(); f.detail.activeTurnId = 'preceding-turn';
  const queued = await f.bridge.dispatch('task-one', request);
  const cancelled = await f.bridge.stop('task-one', { generation: 1, revision: queued.task.revision, clientMessageId: 'cancel_0001' });
  assert.equal(cancelled.task.state, 'cancelled');
  assert.deepEqual(f.calls.at(-1), ['cancel', 'neuraldeep', 'queue-exact', 4]);
  f.reserve('active-task'); f.detail.activeTurnId = null;
  const active = await f.bridge.dispatch('active-task', request);
  const stopped = await f.bridge.stop('active-task', { generation: 1, revision: active.task.revision, clientMessageId: 'stop_0001' });
  assert.equal(stopped.task.state, 'accepted'); assert.equal(stopped.stop.status, 'stop_requested');
  assert.equal(f.calls.at(-1)[2].expectedTurnId, active.task.turnId);
});
test('stale context or a later active turn cannot receive a stop intended for a preceding task', async t => {
  const f = fixture(t); f.reserve(); const active = await f.bridge.dispatch('task-one', request);
  await assert.rejects(f.bridge.stop('task-one', { generation: 2, revision: active.task.revision, clientMessageId: 'stop_0001' }), { code: 'voice_task_context_changed' });
  f.detail.activeTurnId = 'different-turn';
  await assert.rejects(f.bridge.stop('task-one', { generation: 1, revision: active.task.revision, clientMessageId: 'stop_0001' }), { code: 'voice_task_not_active' });
  assert.equal(f.calls.filter(row => row[0] === 'control').length, 0);
});
test('answers require exact task, topic generation, request and revision before reaching the canonical broker', async t => {
  const f = fixture(t); f.reserve(); const active = await f.bridge.dispatch('task-one', request);
  f.detail.pendingRequests = [{ requestId: 'request-exact', turnId: active.task.turnId, presentation: { revision: 7 } }];
  const context = { generation: 1, requestId: 'request-exact', revision: 7, clientMessageId: 'answer_0001', response: { answer: 'The stated option' } };
  for (const patch of [{ generation: 2 }, { requestId: 'other-question' }, { revision: 6 }]) await assert.rejects(f.bridge.answer('task-one', { ...context, ...patch }));
  assert.equal(f.calls.filter(row => row[0] === 'answer').length, 0);
  assert.deepEqual(await f.bridge.answer('task-one', context), { submitted: true });
  assert.deepEqual(f.calls.at(-1), ['answer', 'neuraldeep', { answer: 'The stated option', requestId: 'request-exact', revision: 7, clientMessageId: 'answer_0001' }]);
});
test('wrong-chat receipts and a changed session never authorize another task or a new dispatch', async t => {
  const f = fixture(t), r = f.reserve(); await f.bridge.dispatch('task-one', request);
  const receipt = f.receipts.get(r.task.clientMessageId);
  f.receipts.set(r.task.clientMessageId, { ...receipt, sessionId: 'original-session' });
  await f.bridge.reconcile('task-one');
  f.receipts.set(r.task.clientMessageId, { ...receipt, sessionId: 'changed-session' });
  await assert.rejects(f.bridge.reconcile('task-one'), { code: 'voice_topic_session_mismatch' });
  f.receipts.set(r.task.clientMessageId, { ...receipt, chatId: 'wrong-chat' });
  await assert.rejects(f.bridge.reconcile('task-one'), { code: 'voice_task_receipt_mismatch' });
  assert.equal(f.calls.filter(row => row[0] === 'start').length, 1);
});
