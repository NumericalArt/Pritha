import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import {openVoiceJournal} from '../scripts/neuraldeep/voice-journal-store.mjs';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {VoiceProviderError} from '../scripts/neuraldeep/voice-provider.mjs';
const compiled=ts.transpileModule(readFileSync('interfaces/control-center/src/lib/voice/host.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(t){
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-voice-host-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const state={allowed:true,probes:0,gate:null,status:{status:'ready',capabilities:{parallelLimit:2}}},closers=[];
  const modules={
    'node:path':path,
    '../../../../../scripts/neuraldeep/voice-journal-store.mjs':{openVoiceJournal},
    '../../../../../scripts/neuraldeep/voice-provider.mjs':{VoiceProviderError},
    '../../../../../scripts/neuraldeep/provider-service.mjs':{NeuralDeepProviderService:class{constructor(options){assert.equal(options.requireCli,false);}async snapshot(){state.probes++;if(state.gate)await state.gate;return state.status;}}},
    '../pritha-paths':{resolvePrithaRoot:()=>root,resolvePrithaStateRoot:()=>root,resolvePrithaStatePath:(_kind,...parts)=>path.join(root,'.private',...parts)},
    '../realtime/voice-engine-server':{requireVoiceEngine:engine=>{assert.equal(engine,'neuraldeep');if(!state.allowed)throw new Error('voice_engine_changed');}},
    '../settings/provider-settings-server':{providerSettingsStore:()=>({read:()=>({})})},
    './settings':{DEFAULT_CHAINED_VOICE_SETTINGS:{model:'fixture-model'},normalizeChainedVoiceSettings:x=>x},
  };
  const module={exports:{}};
  new Function('module','exports','require','process','globalThis',compiled)(module,module.exports,name=>{assert.ok(modules[name],name);return modules[name];},{once:(_event,fn)=>closers.push(fn)},{});
  const host=module.exports.getVoiceHost(),coordinator=new ExecutionCoordinator({stateRoot:root,directory:path.join(root,'.private','codex-chat','execution')});
  t.after(()=>{coordinator.close();for(const close of closers)close();});
  const input=id=>({attemptId:id,sessionId:'session',workloadId:'turn',signal:new AbortController().signal});
  return {host,coordinator,state,input};
}
test('direct voice and existing NeuralDeep task execution use the same account slots and host capacity',async t=>{
  const f=fixture(t),native=f.coordinator.claim(['provider-slot:neuraldeep:0'],'native',{kind:'turn'});assert.ok(native);
  const voice=await f.host.acquire(f.input('voice-a'));
  await assert.rejects(f.host.acquire(f.input('voice-b')),{code:'provider_capacity'});
  assert.equal(new Set(f.coordinator.claims().map(row=>row.owner)).size,2);
  await voice.release();native.release();
  const next=await f.host.acquire(f.input('voice-c'));await next.release();assert.equal(f.coordinator.claims().length,0);
});
test('draining, wrong engine and unknown metadata cannot dispatch or leave a partial voice lease',async t=>{
  const f=fixture(t);f.coordinator.setAdmission(false);
  await assert.rejects(f.host.acquire(f.input('paused')),{code:'provider_capacity'});assert.equal(f.state.probes,0);
  f.coordinator.setAdmission(true);f.state.allowed=false;
  await assert.rejects(f.host.acquire(f.input('wrong-engine')),/voice_engine_changed/);assert.equal(f.state.probes,0);
  f.state.allowed=true;f.state.status={status:'configured',capabilities:{parallelLimit:2}};
  await assert.rejects(f.host.acquire(f.input('unverified')),{code:'provider_unavailable'});assert.equal(f.coordinator.claims().length,0);
});
test('a pause or cancellation during metadata checks is rechecked before admission',async t=>{
  const f=fixture(t);let release;f.state.gate=new Promise(resolve=>{release=resolve;});
  const waiting=f.host.acquire(f.input('pause-race'));f.coordinator.setAdmission(false);release();
  await assert.rejects(waiting,{code:'provider_capacity'});assert.equal(f.coordinator.claims().length,0);
  f.coordinator.setAdmission(true);const abort=new AbortController();
  f.state.gate=new Promise(resolve=>{release=resolve;});const cancelled=f.host.acquire({...f.input('cancel-race'),signal:abort.signal});abort.abort();release();
  await assert.rejects(cancelled);assert.equal(f.coordinator.claims().length,0);
});
