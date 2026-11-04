import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import * as bindingsModule from '../scripts/lib/voice-topic-bindings.mjs';
import * as bridgeModule from '../scripts/lib/voice-task-bridge.mjs';
const require = createRequire(import.meta.url);
function fixture(t) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pritha-voice-router-'));
  const coordinator = new ExecutionCoordinator({ stateRoot });
  t.after(() => { coordinator.close(); rmSync(stateRoot, { recursive: true, force: true }); });
  const calls = [], receipts = new Map(), answered = new Map();
  const detail = { activeTurnId: null, queued: [], pendingRequests: [] };
  const backend = {
    async create(topic) { calls.push(['create', topic.connectorId]); return { chatId: `chat_${topic.connectorId}_${'f'.repeat(32)}` }; },
    async receipt(topic, client) { return receipts.get(client) || null; },
    async detail() { return detail; },
    async start(topic, input) {
      const turn = { turnId: 'turn-one', clientMessageId: input.clientMessageId, status: 'in_progress', items: [], completedAt: null, error: null };
      detail.activeTurnId = turn.turnId;
      receipts.set(input.clientMessageId, { kind: 'turn', turnId: turn.turnId, chatId: topic.chatId, clientMessageId: input.clientMessageId, turn });
      calls.push(['start', topic.connectorId]);
    },
    async enqueue() { throw new Error('not used'); }, async cancelQueued() { throw new Error('not used'); },
    async control(topic, input) { calls.push(['control', topic.connectorId, input.expectedTurnId]); return { status: 'stop_requested' }; },
    async answer(topic, input) {
      calls.push(['answer', topic.connectorId, input]);
      const previous = answered.get(input.requestId);
      if (previous) { assert.deepEqual(input.answers, previous.answers); return { submitted: true, replayed: true }; }
      const pending = detail.pendingRequests.find(row => row.requestId === input.requestId);
      answered.set(input.requestId, { requestId: input.requestId, turnId: pending.turnId, revision: input.revision, kind: 'user_input', questions: [{ id: 'choice_001' }], answers: input.answers });
      detail.pendingRequests = []; return { submitted: true };
    },
    async answeredRequest(topic, id) { return answered.get(id) || null; },
  };
  const source = readFileSync('interfaces/control-center/src/lib/voice/task-router.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }, dependencies = {
    '../../../../../scripts/lib/voice-topic-bindings.mjs': bindingsModule,
    '../../../../../scripts/lib/voice-task-bridge.mjs': bridgeModule,
    '../codex-chat/native-turn-coordinator': { nativeExecutionCoordinator: () => coordinator },
    '../codex-chat/gateway': { getCodexChatGateway: () => ({ voiceTaskBackend: connector => { assert.equal(connector, 'neuraldeep'); return backend; } }) },
    '../pritha-paths': { resolvePrithaStateRoot: () => stateRoot },
  };
  new Function('require', 'module', 'exports', compiled)(id => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), module, module.exports);
  const api = module.exports;
  const request = { chat: { workspace: { mode: 'read-only' } }, turn: { input: [{ type: 'text', text: 'Inspect fixture' }] } };
  const reservation = api.reserveProviderVoiceTask({ taskId: 'task-one', scope: { kind: 'pritha', id: 'test' }, connectorId: 'neuraldeep',
    preset: { modelId: 'pinned-model', reasoningEffort: 'low', timeoutMs: 30000 }, workspace: { mode: 'read-only' }, request });
  return { api, reservation, request, calls, receipts, detail, backend };
}
test('server projection preserves real execution status, exact provider and bounded result', async t => {
  const f = fixture(t), empty = await f.api.providerVoiceTaskProjection('task-one');
  assert.equal(empty.status.status, 'waiting_for_operator'); assert.equal(f.calls.length, 0);
  const running = await f.api.dispatchProviderVoiceTask('task-one', f.request);
  assert.equal(running.status.status, 'running'); assert.equal(running.status.connector_id, 'neuraldeep');
  const receipt = f.receipts.get(f.reservation.task.clientMessageId);
  receipt.turn.status = 'completed'; receipt.turn.completedAt = new Date().toISOString();
  receipt.turn.items = [{ kind: 'assistant_message', message: { markdown: 'result '.repeat(4000) } }];
  receipt.resultText = 'result '.repeat(4000).slice(0,16000); receipt.resultTruncated = true;
  const completed = await f.api.providerVoiceTaskProjection('task-one');
  assert.equal(completed.status.status, 'complete'); assert.equal(completed.resultText.length, 16000);
  assert.equal(completed.status.result_truncated, true); assert.equal(completed.status.updated_at, receipt.turn.completedAt);
  assert.match(completed.status.task_chat_href, /^\/task-chat\?group=voice_work&chat=chat_neuraldeep_/);
  assert.equal(completed.status.topic_generation, 1); assert.equal(f.calls.filter(row => row[0] === 'start').length, 1);
});
test('a completed provider answer cannot turn a missing factory draft into a successful Voice task',async t=>{
  const f=fixture(t);await f.api.dispatchProviderVoiceTask('task-one',f.request);
  const receipt=f.receipts.get(f.reservation.task.clientMessageId);receipt.turn.status='completed';receipt.resultText='The model finished its answer.';
  receipt.factoryDraftReceipt={draftCreated:false,errorCode:'factory_not_started'};
  const failed=await f.api.providerVoiceTaskProjection('task-one');
  assert.equal(failed.status.status,'failed');assert.equal(failed.status.phase,'factory_draft_failed');assert.equal(failed.status.error_code,'factory_not_started');assert.equal(failed.status.factory_draft_failed,true);
  assert.equal(f.calls.filter(row=>row[0]==='start').length,1);
});
test('server answer maps one exact question and replays a lost acknowledgement through its saved descriptor', async t => {
  const f = fixture(t); await f.api.dispatchProviderVoiceTask('task-one', f.request);
  f.detail.pendingRequests = [{ requestId: 'request-one', turnId: 'turn-one', kind: 'user_input', presentation: { revision: 3, questions: [{ id: 'choice_001', question: 'Which fixture?' }] } }];
  const view = await f.api.providerVoiceTaskProjection('task-one');
  assert.equal(view.status.question, 'Which fixture?'); assert.equal(view.status.operator_request.revision, 3);
  const input = { questionId: 'request-one', revision: 3, generation: 1, answer: 'Fixture A' };
  assert.equal((await f.api.answerProviderVoiceTask('task-one', { ...input, revision: 2 })).error, 'voice_question_changed');
  assert.equal((await f.api.answerProviderVoiceTask('task-one', input)).answer_accepted, true);
  assert.equal((await f.api.answerProviderVoiceTask('task-one', input)).answer_accepted, true);
  assert.deepEqual(f.calls.filter(row => row[0] === 'answer')[0][2].answers, { choice_001: ['Fixture A'] });
});
test('voice cannot turn a free-form answer into a command approval or answer several unrelated questions', async t => {
  const f = fixture(t); await f.api.dispatchProviderVoiceTask('task-one', f.request);
  const input = { questionId: 'request-one', revision: 3, generation: 1, answer: 'yes' };
  for (const pending of [
    { kind: 'command_approval', presentation: { revision: 3 } },
    { kind: 'user_input', presentation: { revision: 3, questions: [{ id: 'first' }, { id: 'second' }] } },
  ]) {
    f.detail.pendingRequests = [{ requestId: 'request-one', turnId: 'turn-one', ...pending }];
    assert.equal((await f.api.answerProviderVoiceTask('task-one', input)).error, 'voice_answer_requires_task_chat');
  }
  assert.equal(f.calls.filter(row => row[0] === 'answer').length, 0);
});
test('readback failure stays explicit and stop acknowledges only the exact original turn', async t => {
  const f = fixture(t); const running = await f.api.dispatchProviderVoiceTask('task-one', f.request);
  await f.api.stopProviderVoiceTask('task-one', running.task.revision, 1);
  assert.deepEqual(f.calls.at(-1), ['control', 'neuraldeep', 'turn-one']);
  assert.equal((await f.api.stopProviderVoiceTask('task-one', running.task.revision, 2)).error, 'voice_task_context_changed');
  f.backend.receipt = async () => { throw Object.assign(new Error('private content must not be echoed'), { code: 'unsafe detail / token' }); };
  const failed = await f.api.providerVoiceTaskProjection('task-one');
  assert.equal(failed.status.status, 'waiting_for_operator'); assert.equal(failed.status.error_code, 'voice_task_readback_unavailable');
  assert.equal(failed.resultText, '');
});
test('unreadable operator state cannot be projected as a running or completed task', async t => {
  const f = fixture(t); await f.api.dispatchProviderVoiceTask('task-one', f.request);
  f.backend.detail = async () => { throw new Error('private upstream detail'); };
  const failed = await f.api.providerVoiceTaskProjection('task-one');
  assert.equal(failed.status.status, 'waiting_for_operator');
  assert.equal(failed.status.error_code, 'voice_task_readback_unavailable');
  const answer = await f.api.answerProviderVoiceTask('task-one', {questionId:'request-one',revision:3,generation:1,answer:'yes'});
  assert.equal(answer.error, 'voice_task_control_unconfirmed');
  assert.equal(JSON.stringify(answer).includes('private'),false);
});
test('uncertain execution and a blocked queue stay visible as requiring attention',async t=>{
  const f=fixture(t);await f.api.dispatchProviderVoiceTask('task-one',f.request);
  f.detail.executionState='unknown';
  const unknown=await f.api.providerVoiceTaskProjection('task-one');
  assert.equal(unknown.status.status,'waiting_for_operator');assert.equal(unknown.status.error_code,'fallback_confirmation_required');
  const q=fixture(t);q.detail.activeTurnId='prior-turn';
  const receipt={kind:'queue',chatId:`chat_neuraldeep_${'f'.repeat(32)}`,clientMessageId:q.reservation.task.clientMessageId,queueId:'queue-one',revision:1,status:'queued'};
  q.backend.enqueue=async()=>{q.receipts.set(receipt.clientMessageId,receipt);};
  assert.equal((await q.api.dispatchProviderVoiceTask('task-one',q.request)).status.status,'queued');
  receipt.status='blocked';receipt.reason='provider_pending_auth';receipt.revision++;
  const blocked=await q.api.providerVoiceTaskProjection('task-one');
  assert.equal(blocked.status.status,'waiting_for_operator');assert.equal(blocked.status.error_code,'provider_pending_auth');
});
