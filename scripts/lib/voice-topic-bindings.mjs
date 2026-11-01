import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isProviderConnectorId, normalizeProviderPreset } from './provider-profile.mjs';
import {normalizeChatSubject} from './chat-subject.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = () => new Date().toISOString();
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
const generation = value => Number.isSafeInteger(value) && value > 0 && value <= 999;
const taskStates = new Set(['reserved', 'dispatching', 'accepted', 'queued', 'unknown', 'blocked', 'cancelled']);
const copy = value => JSON.parse(JSON.stringify(value));
export class VoiceBindingError extends Error {
  constructor(code) { super('The saved voice task binding needs attention.'); this.code = code; }
}
const fail = code => { throw new VoiceBindingError(code); };
function scopeOf(value) {
  if (!value || !['agent', 'pritha', 'task', 'control'].includes(value.kind) || !id(value.id)) fail('voice_topic_scope_invalid');
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 120)) fail('voice_topic_scope_invalid');
  return { kind: value.kind, id: value.id, label: value.label || value.id };
}
function presetOf(connectorId, value) {
  if (!isProviderConnectorId(connectorId)) fail('voice_topic_provider_invalid');
  // Only public preset fields are persisted: credentials and arbitrary host data
  // cannot enter the topic registry. Missing model IDs never gain a default here.
  const preset = normalizeProviderPreset(connectorId, value);
  if (!preset.modelId) fail('voice_topic_model_missing');
  return preset;
}
function workspaceOf(value = { mode: 'read-only' }) {
  if (!value || !['read-only', 'isolated'].includes(value.mode) || Object.keys(value).some(key => !['mode', 'baseRevision','agentId','factorySlug'].includes(key)) || value.agentId!==undefined && !id(value.agentId)
      || value.baseRevision !== undefined && (typeof value.baseRevision !== 'string' || !/^[a-f0-9]{40,64}$/.test(value.baseRevision))) fail('voice_topic_workspace_invalid');
  if(value.factorySlug!==undefined && (value.mode!=='read-only' || value.agentId || value.baseRevision || !normalizeChatSubject({kind:'child',slug:value.factorySlug,phase:'interview'})))fail('voice_topic_workspace_invalid');
  return { mode: value.mode, ...(value.baseRevision ? { baseRevision: value.baseRevision } : {}),...(value.agentId?{agentId:value.agentId}:{}),...(value.factorySlug?{factorySlug:value.factorySlug}:{}) };
}

/** Persistent identity only. Admission, FIFO, process proof and history belong to
 * the canonical Task Chat runtime. No task is replayed by opening this store.
 * Topic/generation semantics are adapted from the pinned NeuralDeep reference.
 */
export class VoiceTopicBindings {
  constructor({ coordinator, stateRoot }) {
    this.coordinator = coordinator;
    this.db = coordinator.db;
    this.stateIdentity = digest(['pritha-voice-topics-v1', realpathSync(stateRoot)]);
    if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='voice_binding_meta'").get()) {
      const meta = this.db.prepare('SELECT value FROM voice_binding_meta WHERE key=?');
      if (meta.get('schema')?.value !== '1') fail('voice_binding_schema_unsupported');
      if (meta.get('stateIdentity')?.value !== this.stateIdentity) fail('voice_binding_instance_mismatch');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voice_binding_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_topic_bindings (
        topic_id TEXT PRIMARY KEY, scope_kind TEXT NOT NULL, scope_id TEXT NOT NULL,
        generation INTEGER NOT NULL, record TEXT NOT NULL,
        UNIQUE(scope_kind, scope_id, generation)
      );
      CREATE TABLE IF NOT EXISTS voice_task_bindings (
        task_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, record TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS voice_task_bindings_topic ON voice_task_bindings(topic_id);
    `);
    coordinator.transaction(() => {
      const meta = this.db.prepare('SELECT value FROM voice_binding_meta WHERE key=?');
      const version = meta.get('schema')?.value, identity = meta.get('stateIdentity')?.value;
      if (version && version !== '1') fail('voice_binding_schema_unsupported');
      if (identity && identity !== this.stateIdentity) fail('voice_binding_instance_mismatch');
      const insert = this.db.prepare('INSERT OR IGNORE INTO voice_binding_meta VALUES (?,?)');
      insert.run('schema', '1'); insert.run('stateIdentity', this.stateIdentity);
    });
  }
  topicId(scope, version) { return 'topic_' + digest([this.stateIdentity, scope.kind, scope.id, version]).slice(0, 40); }
  topic(topicId) {
    const row = this.db.prepare('SELECT record FROM voice_topic_bindings WHERE topic_id=?').get(topicId);
    if (!row) return null;
    const topic = JSON.parse(row.record), scope = scopeOf(topic.scope);
    if (topic.stateIdentity !== this.stateIdentity || !generation(topic.scope.generation)
        || topic.topicId !== this.topicId(scope, topic.scope.generation)) fail('voice_binding_instance_mismatch');
    presetOf(topic.connectorId, topic.preset);
    if (!topic.workspace) fail('voice_binding_workspace_missing');
    workspaceOf(topic.workspace);
    return topic;
  }
  latest(scope) {
    scope = scopeOf(scope);
    const row = this.db.prepare('SELECT topic_id FROM voice_topic_bindings WHERE scope_kind=? AND scope_id=? ORDER BY generation DESC LIMIT 1').get(scope.kind, scope.id);
    return row ? this.topic(row.topic_id) : null;
  }
  task(taskId) {
    const row = this.db.prepare('SELECT record FROM voice_task_bindings WHERE task_id=?').get(taskId);
    if (!row) return null;
    const record = JSON.parse(row.record);
    if (!id(record.taskId) || record.taskId !== taskId || !taskStates.has(record.state) || !this.topic(record.topicId)) fail('voice_task_binding_invalid');
    return record;
  }
  tasksForTopic(topicId, limit = 200) {
    if (!this.topic(topicId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) fail('voice_topic_query_invalid');
    return this.db.prepare('SELECT task_id FROM voice_task_bindings WHERE topic_id=? ORDER BY rowid DESC LIMIT ?')
      .all(topicId, limit).reverse().map(row => this.task(row.task_id));
  }
  /** Selection is captured once. A changed connector starts a new generation;
   * another model for the same topic requires reset. Explicit continuation uses
   * its exact topic, even after the global default changes.
   */
  reserve({ taskId, scope, connectorId, preset, workspace, requestHash, reset = false, continueTopicId, expectedGeneration }) {
    if (!id(taskId) || typeof requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(requestHash)) fail('voice_task_identity_invalid');
    scope = scopeOf(scope); preset = presetOf(connectorId, preset); workspace = workspaceOf(workspace);
    if (typeof reset !== 'boolean' || expectedGeneration !== undefined && (!generation(expectedGeneration) || !continueTopicId)) fail('voice_topic_generation_invalid');
    if (continueTopicId && (reset || expectedGeneration === undefined)) fail('voice_topic_generation_required');
    const reservationHash = digest({ scope, connectorId, preset, workspace, requestHash, reset, continueTopicId, expectedGeneration });
    return this.coordinator.transaction(() => {
      const prior = this.task(taskId);
      if (prior) {
        if (prior.reservationHash !== reservationHash) fail('voice_task_idempotency_conflict');
        return { task: prior, topic: this.topic(prior.topicId), replayed: true };
      }
      let topic = continueTopicId ? this.topic(continueTopicId) : this.latest(scope);
      if (continueTopicId && (!topic || topic.scope.kind !== scope.kind || topic.scope.id !== scope.id
          || topic.scope.generation !== expectedGeneration)) fail('voice_topic_generation_conflict');
      if (continueTopicId && digest(topic.workspace) !== digest(workspace)) fail('voice_topic_workspace_mismatch');
      if (!continueTopicId && (reset || topic?.connectorId !== connectorId || digest(topic.workspace) !== digest(workspace))) {
        const next = (this.latest(scope)?.scope.generation || 0) + 1;
        if (!generation(next)) fail('voice_topic_generation_exhausted');
        const now = stamp();
        topic = { topicId: this.topicId(scope, next), scope: { ...scope, generation: next },
          connectorId, preset, workspace, resolvedModelId: null, stateIdentity: this.stateIdentity, chatId: null, sessionId: null,
          clientThreadId: 'voice_' + digest([this.stateIdentity, scope.kind, scope.id, next]).slice(0, 48),
          revision: 1, createdAt: now, updatedAt: now };
        this.db.prepare('INSERT INTO voice_topic_bindings VALUES (?,?,?,?,?)').run(topic.topicId, scope.kind, scope.id, next, JSON.stringify(topic));
      }
      if (continueTopicId && connectorId !== topic.connectorId) fail('voice_topic_provider_mismatch');
      const now = stamp(), task = { taskId, topicId: topic.topicId, requestHash, reservationHash,
        clientMessageId: 'voice_' + digest([topic.topicId, taskId]).slice(0, 48),
        state: 'reserved', turnId: null, queueId: null, errorCode: null,
        revision: 1, createdAt: now, updatedAt: now };
      this.db.prepare('INSERT INTO voice_task_bindings VALUES (?,?,?)').run(taskId, topic.topicId, JSON.stringify(task));
      return { topic: copy(topic), task, replayed: false };
    });
  }
  bindChat(topicId, chatId, expectedRevision, resolvedModelId) {
    return this.coordinator.transaction(() => {
      const topic = this.topic(topicId);
      if (!topic) fail('voice_topic_missing');
      const modelId = resolvedModelId ?? topic.resolvedModelId ?? topic.preset.modelId;
      presetOf(topic.connectorId, { ...topic.preset, modelId });
      const validChat = topic.connectorId === 'codex' ? /^chat_[A-Za-z0-9_-]{1,160}$/ : new RegExp('^chat_' + topic.connectorId + '_[a-f0-9]{32}$');
      if (typeof chatId !== 'string' || !validChat.test(chatId)
          || topic.connectorId === 'codex' && /^chat_(neuraldeep|claude|openrouter|local)_/.test(chatId)) fail('voice_topic_chat_mismatch');
      if (topic.chatId === chatId && topic.resolvedModelId === modelId) return topic;
      if (topic.chatId) fail('voice_topic_chat_mismatch');
      if (topic.revision !== expectedRevision) fail('voice_topic_revision_conflict');
      return this.writeTopic({ ...topic, chatId, resolvedModelId: modelId });
    });
  }
  pinSession(topicId, sessionId, expectedRevision) {
    if (!id(sessionId)) fail('voice_topic_session_mismatch');
    return this.coordinator.transaction(() => {
      const topic = this.topic(topicId);
      if (!topic?.chatId) fail('voice_topic_chat_missing');
      if (topic.sessionId === sessionId) return topic;
      if (topic.sessionId) fail('voice_topic_session_mismatch');
      if (topic.revision !== expectedRevision) fail('voice_topic_revision_conflict');
      return this.writeTopic({ ...topic, sessionId });
    });
  }
  writeTopic(topic) {
    const next = { ...topic, revision: topic.revision + 1, updatedAt: stamp() };
    this.db.prepare('UPDATE voice_topic_bindings SET record=? WHERE topic_id=?').run(JSON.stringify(next), topic.topicId);
    return next;
  }
  transition(taskId, expectedRevision, patch) {
    if (!patch || !taskStates.has(patch.state) || Object.keys(patch).some(key => !['state', 'turnId', 'queueId', 'errorCode'].includes(key))) fail('voice_task_transition_invalid');
    for (const field of ['turnId', 'queueId', 'errorCode']) if (patch[field] !== undefined && patch[field] !== null && !id(patch[field])) fail('voice_task_transition_invalid');
    return this.coordinator.transaction(() => {
      const task = this.task(taskId);
      if (!task || task.revision !== expectedRevision) fail('voice_task_revision_conflict');
      const allowed = {
        reserved: ['dispatching', 'cancelled'], dispatching: ['accepted', 'queued', 'unknown', 'blocked'],
        queued: ['accepted', 'unknown', 'blocked', 'cancelled'], unknown: ['accepted', 'queued'],
        accepted: [], blocked: [], cancelled: [],
      };
      if (!allowed[task.state].includes(patch.state)) fail('voice_task_transition_invalid');
      if (task.turnId && patch.turnId !== undefined && task.turnId !== patch.turnId) fail('voice_task_turn_mismatch');
      if (patch.state === 'accepted' && !id(patch.turnId || task.turnId)) fail('voice_task_turn_missing');
      if (patch.state === 'queued' && !id(patch.queueId || task.queueId)) fail('voice_task_queue_missing');
      if (!this.topic(task.topicId).chatId && patch.state !== 'cancelled') fail('voice_topic_chat_missing');
      const next = { ...task, ...patch, revision: task.revision + 1, updatedAt: stamp() };
      this.db.prepare('UPDATE voice_task_bindings SET record=? WHERE task_id=?').run(JSON.stringify(next), taskId);
      return next;
    });
  }
}
