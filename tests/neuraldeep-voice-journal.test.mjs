import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openVoiceJournal} from '../scripts/neuraldeep/voice-journal-store.mjs';
import {voiceOperationId,voiceRequestHash} from '../scripts/neuraldeep/voice-journal.mjs';
import {spawnSync} from 'node:child_process';
function fixture(t){const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-voice-journal-')),a=openVoiceJournal({stateRoot}),b=openVoiceJournal({stateRoot});t.after(()=>{a.close();b.close();rmSync(stateRoot,{recursive:true,force:true});});return {a,b,j:a.journal,other:b.journal,stateRoot};}
test('lost acknowledgements retain one operation receipt across workers without redispatch',t=>{
  const {j,other}=fixture(t),input={id:voiceOperationId('session','turn',0,0),sessionId:'session',turnId:'turn',name:'run_codex_task',args:{task:'synthetic'}};
  const first=j.reserveOperation(input);assert.equal(first.dispatch,true);assert.ok(first.task_id);
  const uncertain=other.reserveOperation(input);assert.equal(uncertain.dispatch,false);assert.equal(uncertain.result,null);assert.equal(uncertain.task_id,first.task_id);
  j.finishOperation(input.id,{ok:true,task_id:first.task_id});assert.deepEqual(other.reserveOperation(input).result,{ok:true,task_id:first.task_id});
  assert.throws(()=>other.reserveOperation({...input,args:{task:'different'}}),/conflict/);
  assert.throws(()=>other.finishOperation(input.id,{ok:true,task_id:'other'}),/conflict/);
});
test('voice turns, provider requests and accounting remain durable and do not replay',t=>{
  const {j,other}=fixture(t),hash=voiceRequestHash({text:'fixture'});
  assert.equal(j.reserveTurn('session','turn',hash).dispatch,true);assert.equal(other.reserveTurn('session','turn',hash).dispatch,false);
  assert.throws(()=>other.reserveTurn('session','turn',voiceRequestHash('changed')),/conflict/);
  j.finishTurn('session','turn','interrupted');other.finishTurn('session','turn','completed');assert.equal(j.turn('session','turn').status,'interrupted');
  const request={id:'http',sessionId:'session',turnId:'turn',kind:'llm',requestHash:hash};
  j.claimRequest(request);assert.throws(()=>other.claimRequest(request),/replay_blocked/);
  j.finishRequest('http','failed',{usageKnown:false},true);other.finishRequest('http','completed',{usageKnown:true});
  assert.equal(j.request('http').status,'failed');assert.equal(other.pendingAccounting().length,1);other.accounted('http');assert.equal(j.pendingAccounting().length,0);
});
test('voice receipts coexist with canonical admission and private runtime records across reopen',t=>{
  const {a,j,stateRoot}=fixture(t),hash=voiceRequestHash('fixture');
  const intent=a.coordinator.reserveIntent('native-task',hash,{kind:'turn',chatId:'native'}).intent;
  const lease=a.coordinator.claim(['native-thread'],'native-owner',{kind:'turn'});assert.ok(lease);
  j.reserveTurn('session','turn',hash);
  const reopened=openVoiceJournal({stateRoot});try{
    assert.equal(reopened.coordinator.getIntent('native-task').id,intent.id);assert.equal(reopened.coordinator.claims().length,1);
    assert.equal(reopened.journal.reserveTurn('session','turn',hash).dispatch,false);
    assert.equal(statSync(reopened.coordinator.file).mode&0o777,0o600);
  }finally{reopened.close();lease.release();}
});
test('a dead direct-HTTP worker releases only its voice lease and retains an uncertain non-replayable receipt',t=>{
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-voice-dead-'));t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const worker=`import {openVoiceJournal} from ${JSON.stringify(new URL('../scripts/neuraldeep/voice-journal-store.mjs',import.meta.url).href)};
    const s=openVoiceJournal({stateRoot:process.argv[1]});
    s.coordinator.claim(['http'],'voice-worker',{kind:'turn',detail:{executionKind:'voice-http',requestId:'http',sessionId:'session',turnId:'turn'}});
    s.coordinator.claim(['native'],'native-worker',{kind:'turn',detail:{chatId:'native'}});
    s.journal.reserveTurn('session','turn','a'.repeat(64));
    s.journal.claimRequest({id:'http',sessionId:'session',turnId:'turn',kind:'llm',requestHash:'a'.repeat(64)});
    s.close();`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',worker,stateRoot],{encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(result.status,0,result.stderr);
  const recovered=openVoiceJournal({stateRoot});try{
    assert.equal(recovered.coordinator.claims().length,1);assert.equal(recovered.coordinator.claims()[0].detail.chatId,'native');
    assert.equal(recovered.journal.request('http').status,'interrupted');assert.equal(recovered.journal.pendingAccounting().length,1);
    assert.equal(recovered.journal.turn('session','turn').status,'interrupted');
    assert.throws(()=>recovered.journal.claimRequest({id:'http',sessionId:'session',turnId:'turn',kind:'llm',requestHash:'a'.repeat(64)}),/replay_blocked/);
  }finally{recovered.close();}
});
