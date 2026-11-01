import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { VoiceSessionContexts } from '../scripts/lib/voice-session-contexts.mjs';

const owner='a'.repeat(64);
const config=()=>({connectorId:'neuraldeep',preset:{modelId:'pinned-model',reasoningEffort:'low',timeoutMs:30000},engine:'neuraldeep',voiceApi:'neuraldeep',voiceModel:'voice-model',voice:'serena',serviceTier:'standard'});
function fixture(t,options={}){
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-voice-context-')),coordinator=new ExecutionCoordinator({stateRoot});let time=100000;
  const store=new VoiceSessionContexts({coordinator,stateRoot,now:()=>time,...options});
  t.after(()=>{coordinator.close();rmSync(stateRoot,{recursive:true,force:true});});
  return {store,coordinator,stateRoot,advance:ms=>{time+=ms;}};
}
test('voice session configuration is immutable and survives reopening its instance',t=>{
  const f=fixture(t),input=config(),saved=f.store.create(owner,input);
  input.preset.modelId='changed-default';saved.preset.timeoutMs=90000;
  const reopened=new ExecutionCoordinator({stateRoot:f.stateRoot});
  let restored;
  try { restored=new VoiceSessionContexts({coordinator:reopened,stateRoot:f.stateRoot,now:()=>100000}).get(saved.id,owner); }
  finally { reopened.close(); }
  assert.equal(restored.preset.modelId,'pinned-model');assert.equal(restored.preset.timeoutMs,30000);
  assert.equal(restored.engine,'neuraldeep');assert.equal(restored.connectorId,'neuraldeep');
  assert.equal(f.coordinator.db.prepare('SELECT count(*) AS n FROM voice_session_contexts').get().n,1);
});
test('wrong owners, unknown IDs, expired and closed contexts fail without selecting current defaults',t=>{
  const f=fixture(t,{ttlMs:1000}),saved=f.store.create(owner,config());
  for(const [id,who] of [[saved.id,'b'.repeat(64)],['vctx_'+'c'.repeat(32),owner],['private token / invalid',owner]])assert.throws(()=>f.store.get(id,who),{code:'voice_context_unavailable'});
  assert.deepEqual(f.store.close(saved.id,owner),{closed:true});assert.deepEqual(f.store.close(saved.id,owner),{closed:true});
  assert.throws(()=>f.store.get(saved.id,owner),{code:'voice_context_unavailable'});
  const fresh=f.store.create(owner,config());f.advance(1000);assert.throws(()=>f.store.get(fresh.id,owner),{code:'voice_context_unavailable'});
});
test('invalid snapshots cannot persist secrets, provider substitutions or incompatible transports',t=>{
  const f=fixture(t);
  for(const patch of [{token:'PRIVATE_CONTEXT_KEY_CANARY'},{preset:{...config().preset,apiKey:'PRIVATE_CONTEXT_KEY_CANARY'}},{engine:'other'},{voiceApi:'live'},{connectorId:'other'},{voice:'private text'},{serviceTier:'unbounded'}])assert.throws(()=>f.store.create(owner,{...config(),...patch}),{code:'voice_context_invalid'});
  assert.equal(f.coordinator.db.prepare('SELECT count(*) AS n FROM voice_session_contexts').get().n,0);
  assert.throws(()=>f.store.create('private owner',config()),{code:'voice_context_owner_invalid'});
});
test('context capacity is bounded and expired records can be collected without evicting active sessions',t=>{
  const f=fixture(t,{ttlMs:1000,maxContexts:2,maxPerOwner:1});
  const a=f.store.create(owner,config());assert.throws(()=>f.store.create(owner,config()),{code:'voice_context_capacity'});
  const b=f.store.create('b'.repeat(64),config());assert.throws(()=>f.store.create('c'.repeat(64),config()),{code:'voice_context_capacity'});
  assert.equal(f.store.get(a.id,owner).id,a.id);assert.equal(f.store.get(b.id,'b'.repeat(64)).id,b.id);
  f.advance(1000);f.store.create(owner,config());assert.equal(f.coordinator.db.prepare('SELECT count(*) AS n FROM voice_session_contexts').get().n,1);
});
test('unknown schema and another state identity stay untouched',t=>{
  const f=fixture(t);f.store.create(owner,config());
  f.coordinator.db.prepare('UPDATE voice_context_meta SET value=? WHERE key=?').run('future','schema');
  assert.throws(()=>new VoiceSessionContexts({coordinator:f.coordinator,stateRoot:f.stateRoot}),{code:'voice_context_schema_unsupported'});
  assert.equal(f.coordinator.db.prepare('SELECT value FROM voice_context_meta WHERE key=?').get('schema').value,'future');
  f.coordinator.db.prepare('UPDATE voice_context_meta SET value=? WHERE key=?').run('1','schema');
  const other=mkdtempSync(path.join(os.tmpdir(),'pritha-context-other-'));t.after(()=>rmSync(other,{recursive:true,force:true}));
  assert.throws(()=>new VoiceSessionContexts({coordinator:f.coordinator,stateRoot:other}),{code:'voice_context_instance_mismatch'});
  assert.equal(f.coordinator.db.prepare('SELECT count(*) AS n FROM voice_session_contexts').get().n,1);
});
