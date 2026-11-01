import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProviderTaskRuntime } from '../scripts/lib/provider-task-runtime.mjs';
import { VoiceTopicBindings } from '../scripts/lib/voice-topic-bindings.mjs';
import { VoiceTaskBridge, voiceTaskRequestHash } from '../scripts/lib/voice-task-bridge.mjs';
import { providerVoiceTaskBackend } from '../scripts/lib/provider-voice-task-backend.mjs';
import { executionChannelView } from '../scripts/lib/execution-channel.mjs';

async function until(predicate) { for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Fixture did not settle'); }
const request = text => ({ chat: { title: 'Voice fixture', workspace: { mode: 'read-only' } }, turn: { input: [{ type: 'text', text }] } });
function fixture(t, connectorId = 'neuraldeep', options = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pritha-provider-voice-'));
  const root = path.join(directory, 'source'), stateRoot = path.join(directory, 'state'); mkdirSync(root); mkdirSync(stateRoot);
  const settings = { modelId: 'new-default', reasoningEffort: 'high', timeoutMs: 90000, sandbox: 'read-only' }, runs = [], instances = [];
  const make = () => {
    const runtime = new ProviderTaskRuntime({ connectorId, root, stateRoot, privateRoot: path.join(stateRoot, 'task-chat'), executionDirectory: path.join(stateRoot, 'execution'),
      configuration: () => settings, preflight: async () => ({ interrupt: true, steer: false }), ...options,
      launch: async input => {
        await input.beforeStart({ identity: 'a'.repeat(64), evidence: { schema: 1, fixture: true } });
        await input.onRawChunk(Buffer.from('{"type":"fixture"}\n'));
        await input.onEvent({ type: 'thread.started', thread_id: '11111111-2222-4333-8444-555555555555' });
        let resolve; const completion = new Promise(done => { resolve = done; });
        const run = { input, resolve, completion, stop() { resolve({ ok: false, errorCode: 'operator_cancel', processTreeExited: true }); return true; } };
        runs.push(run); return run;
      } });
    instances.push(runtime); return runtime;
  };
  const runtime = make(), bindings = new VoiceTopicBindings({ coordinator: runtime.execution, stateRoot });
  const reserve = (taskId, body) => bindings.reserve({ taskId, scope: { kind: 'pritha', id: 'fixture' }, connectorId,
    preset: { modelId: 'voice-pinned', reasoningEffort: 'low', timeoutMs: 30000 }, requestHash: voiceTaskRequestHash(body) });
  t.after(async () => { for (const item of instances) await item.dispose(); rmSync(directory, { recursive: true, force: true }); });
  return { runtime, bindings, bridge: new VoiceTaskBridge({ bindings, backend: providerVoiceTaskBackend(runtime) }), runs, settings, make, reserve };
}
for (const connector of ['neuraldeep', 'claude', 'openrouter', 'local']) {
  test(`${connector}: voice and typed tasks share one pinned chat, queue and execution receipt`, async t => {
    const f = fixture(t, connector), body = request('First'), original = f.reserve('task-one', body);
    const started = await f.bridge.dispatch('task-one', body);
    await until(() => f.runs.length === 1);
    const binding = f.runtime.require(started.topic.chatId);
    assert.equal(binding.group, 'voice_work'); assert.equal(binding.origin, 'voice');
    assert.equal(binding.voiceTopicId, original.topic.topicId); assert.equal(binding.modelId, 'voice-pinned');
    assert.equal(binding.executionConfig.timeoutMs, 30000); assert.equal(f.runs[0].input.model, 'voice-pinned');
    assert.equal(f.runs[0].input.effort, 'low'); assert.equal(f.runs[0].input.timeoutMs, 30000);
    const queuedBody = request('Second'); f.reserve('task-two', queuedBody);
    const queued = await f.bridge.dispatch('task-two', queuedBody);
    assert.equal(queued.task.state, 'queued'); assert.equal(f.runtime.queued(binding.chatId).length, 1);
    f.settings.modelId = 'changed-after-start'; f.settings.timeoutMs = 60000;
    f.runs[0].resolve({ ok: true, processTreeExited: true });
    await until(() => f.runs.length === 2);
    assert.equal(f.runs[1].input.model, 'voice-pinned'); assert.equal(f.runs[1].input.timeoutMs, 30000);
    assert.equal(f.runs[1].input.resume, binding.nativeThreadId);
    const second = await f.bridge.reconcile('task-two');
    assert.equal(second.task.state, 'accepted'); assert.notEqual(second.task.turnId, started.task.turnId);
    await f.bridge.dispatch('task-one', body); assert.equal(f.runs.length, 2);
    f.runs[1].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
    const typed = await f.runtime.start(binding.chatId, { clientMessageId: 'typed_after_voice', input: [{ type: 'text', text: 'Continue here' }] });
    await until(() => f.runs.length === 3);
    assert.equal(f.runs[2].input.resume, binding.nativeThreadId);
    assert.notEqual(typed.accepted.turn.turnId, second.task.turnId);
    f.runs[2].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
  });
}
test('another worker recovers a lost voice acknowledgement from canonical history with no replay', async t => {
  const f = fixture(t), body = request('Lost acknowledgement'); f.reserve('task-one', body);
  const backend = providerVoiceTaskBackend(f.runtime), start = backend.start;
  backend.start = async (...args) => { await start(...args); throw Object.assign(new Error('lost'), { code: 'transport_closed' }); };
  const receipt = await new VoiceTaskBridge({ bindings: f.bindings, backend }).dispatch('task-one', body);
  await until(() => f.runs.length === 1);
  const worker = f.make(), recovered = await new VoiceTaskBridge({ bindings: f.bindings, backend: providerVoiceTaskBackend(worker) }).dispatch('task-one', body);
  assert.equal(recovered.task.turnId, receipt.task.turnId); assert.equal(f.runs.length, 1);
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
});
test('queued cancellation uses canonical CAS and never interrupts its active predecessor', async t => {
  const f = fixture(t), body = request('Predecessor'); f.reserve('task-one', body);
  const first = await f.bridge.dispatch('task-one', body); await until(() => f.runs.length === 1);
  const nextBody = request('Cancel queued'); f.reserve('task-two', nextBody);
  const next = await f.bridge.dispatch('task-two', nextBody);
  const cancelled = await f.bridge.stop('task-two', { generation: 1, revision: next.task.revision, clientMessageId: 'cancel_queue_001' });
  assert.equal(cancelled.task.state, 'cancelled'); assert.equal(f.runtime.activeIntent(first.topic.chatId).turnId, first.task.turnId);
  assert.equal((await f.bridge.reconcile('task-two')).receipt.kind, 'cancelled');
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
  assert.equal(f.runs.length, 1);
});
test('an ordinary HTTP-style creation cannot inject voice origin or replace a pinned topic', async t => {
  const f = fixture(t), body = request('Voice'); const r = f.reserve('task-one', body);
  const plain = await f.runtime.create({ clientThreadId: 'plain_fake_voice_1', source: 'chat', hostVoice: { topicId: r.topic.topicId, generation: 1 } });
  assert.equal(plain.binding.origin, 'chat'); assert.equal(plain.binding.voiceTopicId, undefined);
  await assert.rejects(f.bridge.dispatch('task-one', { ...body, turn: { input: [{ type: 'text', text: 'Changed' }] } }), { code: 'voice_task_idempotency_conflict' });
  assert.equal(f.runs.length, 0);
});
test('provider model aliases resolve once at chat creation and remain pinned after restart', async t => {
  let calls = 0, resolved = 'claude-exact-model-one';
  const f = fixture(t, 'claude', { resolveConfiguration: async config => { calls++; return { ...config, modelId: resolved }; } });
  const body = request('Resolve alias'); f.reserve('task-one', body);
  const first = await f.bridge.dispatch('task-one', body); await until(() => f.runs.length === 1);
  assert.equal(first.topic.preset.modelId, 'voice-pinned'); assert.equal(first.topic.resolvedModelId, 'claude-exact-model-one');
  assert.equal(f.runs[0].input.model, 'claude-exact-model-one'); resolved = 'claude-new-alias-target';
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
  const nextBody = request('Continue alias'); f.reserve('task-two', nextBody);
  const worker = f.make();
  await new VoiceTaskBridge({ bindings: f.bindings, backend: providerVoiceTaskBackend(worker) }).dispatch('task-two', nextBody);
  await until(() => f.runs.length === 2);
  assert.equal(f.runs[1].input.model, 'claude-exact-model-one'); assert.equal(calls, 1);
  f.runs[1].resolve({ ok: true, processTreeExited: true }); await until(() => worker.active.size === 0);
});
test('a lost operator acknowledgement replays the exact saved broker answer without authorizing another question', async t => {
  const f = fixture(t, 'claude', { preflight: async () => ({ interrupt: true, approvals: true }) });
  const body = request('Ask operator'); f.reserve('task-one', body);
  const active = await f.bridge.dispatch('task-one', body); await until(() => f.runs.length === 1);
  const answer = f.runs[0].input.approve({ operationId: 'voice_input_001', kind: 'user_input',
    presentation: { questions: [{ id: 'choice_001', question: 'Which local fixture?', isSecret: false }] }, reason: 'Pick the input.' });
  answer.catch(() => {});
  await until(() => f.runtime.pendingRequests(active.topic.chatId).length === 1);
  const pending = f.runtime.pendingRequests(active.topic.chatId)[0];
  await until(() => executionChannelView(f.runtime.execution, 'provider-answer:' + pending.requestId));
  const context = { generation: 1, requestId: pending.requestId, revision: pending.presentation.revision,
    clientMessageId: 'voice_answer_001', response: { answers: { choice_001: ['Fixture A'] } } };
  const backend = providerVoiceTaskBackend(f.runtime), submit = backend.answer;
  backend.answer = async (...args) => { await submit(...args); throw Object.assign(new Error('lost acknowledgement'), { code: 'response_lost' }); };
  await assert.rejects(new VoiceTaskBridge({ bindings: f.bindings, backend }).answer('task-one', context), { code: 'response_lost' });
  assert.deepEqual(await answer, { answers: { choice_001: ['Fixture A'] } });
  assert.deepEqual(await f.bridge.answer('task-one', context), { submitted: true, replayed: true });
  await assert.rejects(f.bridge.answer('task-one', { ...context, revision: context.revision + 1 }), { code: 'voice_question_changed' });
  await assert.rejects(f.bridge.answer('task-one', { ...context, response: { answers: { choice_001: ['Fixture B'] } } }), { code: 'native_request_changed' });
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
});
