import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { VoiceTopicBindings } from '../scripts/lib/voice-topic-bindings.mjs';
import { defaultProviderPreset, PROVIDER_CONNECTOR_IDS } from '../scripts/lib/provider-profile.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const scope = { kind: 'agent', id: 'example-agent', label: 'Example' };
const chat = connector => connector === 'codex' ? 'chat_native_example' : `chat_${connector}_${'a'.repeat(32)}`;
function input(taskId = 'task-one', connectorId = 'neuraldeep', extra = {}) {
  return { taskId, connectorId, scope, preset: { ...defaultProviderPreset(connectorId), modelId: `${connectorId}-model` }, requestHash: hash(taskId), ...extra };
}
function fixture(t) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pritha-voice-bindings-'));
  const handles = [];
  const open = () => { const coordinator = new ExecutionCoordinator({ stateRoot }); handles.push(coordinator); return new VoiceTopicBindings({ coordinator, stateRoot }); };
  t.after(() => { for (const coordinator of handles) try { coordinator.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); });
  return { stateRoot, open, bindings: open() };
}
const error = code => value => value.code === code;

test('all five providers persist their topic, model, chat and session across restart without dispatch', t => {
  const { bindings, open } = fixture(t);
  for (const connector of PROVIDER_CONNECTOR_IDS) {
    const reservation = bindings.reserve(input(connector, connector, { scope: { kind: 'task', id: connector } }));
    const bound = bindings.bindChat(reservation.topic.topicId, chat(connector), 1);
    bindings.pinSession(bound.topicId, `session-${connector}`, bound.revision);
    const restarted = open();
    assert.equal(restarted.task(connector).state, 'reserved');
    assert.equal(restarted.topic(bound.topicId).connectorId, connector);
    assert.equal(restarted.topic(bound.topicId).preset.modelId, `${connector}-model`);
    assert.equal(restarted.topic(bound.topicId).sessionId, `session-${connector}`);
    assert.equal(bindings.coordinator.claims().length, 0);
  }
});
test('same topic pins its preset; changing connector or explicit reset creates a new generation', t => {
  const { bindings } = fixture(t), first = bindings.reserve(input());
  const second = bindings.reserve(input('task-two', 'neuraldeep', { preset: { ...input().preset, modelId: 'new-model' } }));
  assert.equal(second.topic.topicId, first.topic.topicId);
  assert.equal(second.topic.preset.modelId, first.topic.preset.modelId);
  const third = bindings.reserve(input('task-three', 'claude'));
  assert.equal(third.topic.scope.generation, 2);
  const fourth = bindings.reserve(input('task-four', 'claude', { reset: true }));
  assert.equal(fourth.topic.scope.generation, 3);
  assert.equal(bindings.topic(first.topic.topicId).connectorId, 'neuraldeep');
});
test('explicit continuation requires exact original topic generation and cannot cross provider', t => {
  const { bindings } = fixture(t), first = bindings.reserve(input());
  bindings.reserve(input('task-two', 'claude'));
  const continuation = { continueTopicId: first.topic.topicId, expectedGeneration: 1 };
  assert.equal(bindings.reserve(input('continued', 'neuraldeep', continuation)).topic.topicId, first.topic.topicId);
  assert.throws(() => bindings.reserve(input('wrong-provider', 'claude', continuation)), error('voice_topic_provider_mismatch'));
  assert.throws(() => bindings.reserve(input('wrong-generation', 'neuraldeep', { ...continuation, expectedGeneration: 2 })), error('voice_topic_generation_conflict'));
  assert.throws(() => bindings.reserve(input('no-generation', 'neuraldeep', { continueTopicId: first.topic.topicId })), error('voice_topic_generation_required'));
  assert.throws(() => bindings.reserve(input('wrong-scope', 'neuraldeep', { ...continuation, scope: { kind: 'pritha', id: 'different' } })), error('voice_topic_generation_conflict'));
});
test('task reservation is idempotent but changed prompt, selection or reset cannot reuse it', t => {
  const { bindings } = fixture(t), first = bindings.reserve(input());
  assert.deepEqual(bindings.reserve(input()), { ...first, replayed: true });
  for (const patch of [{ requestHash: hash('changed') }, { reset: true }, { connectorId: 'claude' }]) {
    assert.throws(() => bindings.reserve({ ...input(), ...patch }), error('voice_task_idempotency_conflict'));
  }
  assert.equal(bindings.latest(scope).scope.generation, 1);
});
test('chat and session binding reject stale revisions, wrong namespaces and identity changes', t => {
  const { bindings } = fixture(t), { topic } = bindings.reserve(input());
  assert.throws(() => bindings.bindChat(topic.topicId, chat('claude'), 1), error('voice_topic_chat_mismatch'));
  assert.throws(() => bindings.bindChat(topic.topicId, chat('neuraldeep'), 2), error('voice_topic_revision_conflict'));
  const bound = bindings.bindChat(topic.topicId, chat('neuraldeep'), 1);
  assert.deepEqual(bindings.bindChat(topic.topicId, chat('neuraldeep'), 1), bound);
  assert.throws(() => bindings.bindChat(topic.topicId, chat('neuraldeep').replaceAll('a', 'b'), 2), error('voice_topic_chat_mismatch'));
  const session = bindings.pinSession(topic.topicId, 'session-one', 2);
  assert.deepEqual(bindings.pinSession(topic.topicId, 'session-one', 2), session);
  assert.throws(() => bindings.pinSession(topic.topicId, 'session-two', 3), error('voice_topic_session_mismatch'));
});
test('dispatch is fenced with CAS; unknown work can only reconcile to an exact receipt, never reserve again', t => {
  const { bindings, open } = fixture(t), { task, topic } = bindings.reserve(input());
  assert.throws(() => bindings.transition(task.taskId, 1, { state: 'dispatching' }), error('voice_topic_chat_missing'));
  bindings.bindChat(topic.topicId, chat('neuraldeep'), 1);
  const started = bindings.transition(task.taskId, 1, { state: 'dispatching' });
  assert.throws(() => open().transition(task.taskId, 1, { state: 'dispatching' }), error('voice_task_revision_conflict'));
  const unknown = bindings.transition(task.taskId, started.revision, { state: 'unknown', errorCode: 'response_lost' });
  assert.throws(() => bindings.transition(task.taskId, unknown.revision, { state: 'reserved' }), error('voice_task_transition_invalid'));
  assert.throws(() => bindings.transition(task.taskId, unknown.revision, { state: 'accepted' }), error('voice_task_turn_missing'));
  const accepted = open().transition(task.taskId, unknown.revision, { state: 'accepted', turnId: 'turn-exact' });
  assert.equal(accepted.turnId, 'turn-exact');
  assert.throws(() => bindings.transition(task.taskId, accepted.revision, { state: 'accepted', turnId: 'different-turn' }), error('voice_task_transition_invalid'));
});
test('queue acceptance retains its exact receipt and cancellation cannot be dispatched', t => {
  const { bindings } = fixture(t), { task, topic } = bindings.reserve(input());
  bindings.bindChat(topic.topicId, chat('neuraldeep'), 1);
  const started = bindings.transition(task.taskId, 1, { state: 'dispatching' });
  assert.throws(() => bindings.transition(task.taskId, started.revision, { state: 'queued' }), error('voice_task_queue_missing'));
  const queued = bindings.transition(task.taskId, started.revision, { state: 'queued', queueId: 'queue-one' });
  const cancelled = bindings.transition(task.taskId, queued.revision, { state: 'cancelled' });
  assert.throws(() => bindings.transition(task.taskId, cancelled.revision, { state: 'dispatching' }), error('voice_task_transition_invalid'));
  assert.equal(bindings.task(task.taskId).queueId, 'queue-one');
});
test('invalid or secret-bearing input is rejected before creating any topic', t => {
  const { bindings } = fixture(t);
  for (const patch of [{ scope: { kind: 'unknown', id: 'x' } }, { scope: { kind: 'task', id: '../escape' } },
    { connectorId: 'invented' }, { taskId: '../escape' }, { requestHash: 'secret' },
    { preset: { ...input().preset, apiKey: 'synthetic-secret' } }, { preset: { ...input().preset, modelId: '' } }]) {
    assert.throws(() => bindings.reserve({ ...input(), ...patch }));
  }
  assert.equal(bindings.latest(scope), null);
});
test('copying a private registry to another instance cannot rebind its topics', t => {
  const first = fixture(t), second = fixture(t);
  first.bindings.reserve(input());
  first.bindings.coordinator.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  second.bindings.coordinator.close();
  copyFileSync(first.bindings.coordinator.file, second.bindings.coordinator.file);
  assert.throws(() => second.open(), error('voice_binding_instance_mismatch'));
});
test('two process reservations share one topic and exactly one dispatch owner', async t => {
  const { bindings, stateRoot } = fixture(t);
  const coordinatorUrl = new URL('../scripts/lib/execution-coordinator.mjs', import.meta.url).href;
  const bindingsUrl = new URL('../scripts/lib/voice-topic-bindings.mjs', import.meta.url).href;
  const source = `import {ExecutionCoordinator} from ${JSON.stringify(coordinatorUrl)}; import {VoiceTopicBindings} from ${JSON.stringify(bindingsUrl)};
    const c=new ExecutionCoordinator({stateRoot:process.argv[1]}), b=new VoiceTopicBindings({coordinator:c,stateRoot:process.argv[1]});
    const r=b.reserve(JSON.parse(process.argv[2])); b.bindChat(r.topic.topicId,${JSON.stringify(chat('neuraldeep'))},1);
    try{b.transition(r.task.taskId,1,{state:'dispatching'});process.stdout.write('owner');}catch(e){process.stdout.write(e.code);}finally{c.close();}`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, stateRoot, JSON.stringify(input())], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', x => out += x); child.stderr.on('data', x => err += x);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(out) : reject(new Error(err)));
  });
  assert.deepEqual((await Promise.all([run(), run()])).sort(), ['owner', 'voice_task_revision_conflict']);
  assert.equal(bindings.latest(scope).scope.generation, 1);
  assert.equal(bindings.task('task-one').state, 'dispatching');
});
test('generation exhaustion cannot wrap or overwrite the last accepted topic', t => {
  const { bindings } = fixture(t), { topic } = bindings.reserve(input());
  const last = { ...topic, scope: { ...topic.scope, generation: 999 } };
  last.topicId = bindings.topicId(last.scope, 999);
  bindings.db.prepare('INSERT INTO voice_topic_bindings VALUES (?,?,?,?,?)').run(last.topicId, scope.kind, scope.id, 999, JSON.stringify(last));
  assert.throws(() => bindings.reserve(input('new-reset', 'neuraldeep', { reset: true })), error('voice_topic_generation_exhausted'));
  assert.equal(bindings.latest(scope).topicId, last.topicId);
  assert.equal(bindings.task('new-reset'), null);
});
test('native chat bindings reject another provider namespace and unsupported schemas stay untouched', t => {
  const { bindings, open } = fixture(t), { topic } = bindings.reserve(input('native-task', 'codex'));
  assert.throws(() => bindings.bindChat(topic.topicId, chat('claude'), 1), error('voice_topic_chat_mismatch'));
  bindings.db.prepare('UPDATE voice_binding_meta SET value=? WHERE key=?').run('future', 'schema');
  assert.throws(() => open(), error('voice_binding_schema_unsupported'));
  assert.equal(bindings.db.prepare('SELECT value FROM voice_binding_meta WHERE key=?').get('schema').value, 'future');
});
