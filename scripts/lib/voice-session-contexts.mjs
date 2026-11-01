import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isProviderConnectorId, normalizeProviderPreset } from './provider-profile.mjs';

const lifetime = 6 * 60 * 60 * 1000;
const ownerValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const idValid = value => typeof value === 'string' && /^vctx_[a-f0-9]{32}$/.test(value);
const publicId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(value);
export class VoiceContextError extends Error {
  constructor(code) { super('The voice session context is unavailable. Reconnect to continue.'); this.code = code; this.status = 409; }
}
const fail = code => { throw new VoiceContextError(code); };
function snapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !['connectorId', 'preset', 'engine', 'voiceApi', 'voiceModel', 'voice', 'serviceTier'].includes(key))) fail('voice_context_invalid');
  if (!isProviderConnectorId(input.connectorId) || !['openai', 'neuraldeep'].includes(input.engine)
      || !(input.engine === 'neuraldeep' ? input.voiceApi === 'neuraldeep' : ['live', 'realtime'].includes(input.voiceApi))
      || !publicId(input.voiceModel) || !publicId(input.voice)
      || !['standard', 'fast'].includes(input.serviceTier)) fail('voice_context_invalid');
  let preset;
  try { preset = normalizeProviderPreset(input.connectorId, input.preset); } catch { fail('voice_context_invalid'); }
  return { connectorId: input.connectorId, preset, engine: input.engine, voiceApi: input.voiceApi,
    voiceModel: input.voiceModel, voice: input.voice, serviceTier: input.serviceTier };
}

/** Host-created immutable configuration, with no transcript, credential or
 * execution queue. A context can be read after restart but cannot replay audio.
 * Model tool arguments never author or replace this record.
 */
export class VoiceSessionContexts {
  constructor({ coordinator, stateRoot, now = Date.now, ttlMs = lifetime, maxContexts = 128, maxPerOwner = 8 }) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > lifetime
        || !Number.isSafeInteger(maxContexts) || maxContexts < 1 || maxContexts > 128
        || !Number.isSafeInteger(maxPerOwner) || maxPerOwner < 1 || maxPerOwner > 8) fail('voice_context_limits_invalid');
    Object.assign(this, { coordinator, db: coordinator.db, now, ttlMs, maxContexts, maxPerOwner });
    this.identity = createHash('sha256').update('pritha-voice-context-v1:' + realpathSync(stateRoot)).digest('hex');
    if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='voice_context_meta'").get()) {
      if (this.db.prepare('SELECT value FROM voice_context_meta WHERE key=?').get('schema')?.value !== '1') fail('voice_context_schema_unsupported');
      if (this.db.prepare('SELECT value FROM voice_context_meta WHERE key=?').get('instance')?.value !== this.identity) fail('voice_context_instance_mismatch');
    }
    this.coordinator.transaction(() => {
      this.db.exec(`CREATE TABLE IF NOT EXISTS voice_context_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS voice_session_contexts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at INTEGER NOT NULL,closed INTEGER NOT NULL,record TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS voice_context_owner ON voice_session_contexts(owner,expires_at);`);
      const insert = this.db.prepare('INSERT OR IGNORE INTO voice_context_meta VALUES(?,?)');
      insert.run('schema', '1'); insert.run('instance', this.identity);
      if (this.db.prepare('SELECT value FROM voice_context_meta WHERE key=?').get('schema').value !== '1') fail('voice_context_schema_unsupported');
      if (this.db.prepare('SELECT value FROM voice_context_meta WHERE key=?').get('instance').value !== this.identity) fail('voice_context_instance_mismatch');
    });
  }
  create(owner, input) {
    if (!ownerValid(owner)) fail('voice_context_owner_invalid');
    const config = snapshot(input), timestamp = this.now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) fail('voice_context_clock_invalid');
    return this.coordinator.transaction(() => {
      this.db.prepare('DELETE FROM voice_session_contexts WHERE expires_at<=? OR closed=1').run(timestamp);
      const total = this.db.prepare('SELECT count(*) AS n FROM voice_session_contexts').get().n;
      const owned = this.db.prepare('SELECT count(*) AS n FROM voice_session_contexts WHERE owner=?').get(owner).n;
      if (total >= this.maxContexts || owned >= this.maxPerOwner) fail('voice_context_capacity');
      const context = { id: 'vctx_' + randomUUID().replaceAll('-', ''), owner, instance: this.identity, ...config,
        createdAt: new Date(timestamp).toISOString(), expiresAt: timestamp + this.ttlMs };
      this.db.prepare('INSERT INTO voice_session_contexts VALUES(?,?,?,?,?)').run(context.id, owner, context.expiresAt, 0, JSON.stringify(context));
      return structuredClone(context);
    });
  }
  record(id, owner) {
    if (!idValid(id) || !ownerValid(owner)) fail('voice_context_unavailable');
    const row = this.db.prepare('SELECT * FROM voice_session_contexts WHERE id=? AND owner=?').get(id, owner);
    if (!row) fail('voice_context_unavailable');
    const value = JSON.parse(row.record);
    if (value.id !== id || value.owner !== owner || value.instance !== this.identity || value.expiresAt !== row.expires_at) fail('voice_context_invalid');
    const { id: ignoredId, owner: ignoredOwner, instance, createdAt, expiresAt, ...config } = value;
    snapshot(config);
    return { row, value };
  }
  get(id, owner) {
    const { row, value } = this.record(id, owner);
    if (row.closed || row.expires_at <= this.now()) fail('voice_context_unavailable');
    return value;
  }
  close(id, owner) {
    this.record(id, owner);
    this.db.prepare('UPDATE voice_session_contexts SET closed=1 WHERE id=? AND owner=?').run(id, owner);
    return { closed: true };
  }
}
