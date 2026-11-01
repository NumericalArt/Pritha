import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {ImmutableAttachmentStore} from '../scripts/lib/chat-attachment-store.mjs';
import {VoiceIntakeReceipts,voiceIntakeIdentity,voiceIntakeAttachmentIds} from '../scripts/lib/voice-intake-receipts.mjs';

const input=()=>({contextId:'vctx_'+'1'.repeat(32),sourceIntakeId:'voice-intake-fixture',sessionId:'voice-session',text:'Summarize the supplied fixture.',
  confirmation:{instruction:'Summarize',intent:'summarize',timestamp:'first'},selection:{connectorId:'neuraldeep',preset:{modelId:'fixture-model',timeoutMs:30000},serviceTier:'standard'},
  files:[{name:'one.txt',type:'text/plain',size:5,bytes:Buffer.from('hello')}]});
function fixture(t){
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-intake-receipt-')),instances=[];
  const worker=()=>{const coordinator=new ExecutionCoordinator({stateRoot}),receipts=new VoiceIntakeReceipts({coordinator});instances.push(coordinator);return {coordinator,receipts};};
  const store=new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(stateRoot,'private','chat')});
  t.after(async()=>{await store.close();for(const instance of instances)instance.close();rmSync(stateRoot,{recursive:true,force:true});});
  return {stateRoot,store,worker,...worker()};
}
test('identity excludes HTTP timestamp but preserves semantic confirmation, bytes, order and pinned selection',()=>{
  const base=input(),first=voiceIntakeIdentity(base);
  assert.deepEqual(voiceIntakeIdentity({...base,confirmation:{...base.confirmation,timestamp:'retry'}}),first);
  for(const changed of [{text:'changed'},{sessionId:'other'},{confirmation:{...base.confirmation,intent:'research'}},{selection:{...base.selection,connectorId:'claude'}},{files:[{...base.files[0],bytes:Buffer.from('other')}]}]){
    const next=voiceIntakeIdentity({...base,...changed});assert.equal(next.key,first.key);assert.notEqual(next.hash,first.hash);
  }
  assert.notEqual(voiceIntakeIdentity({...base,contextId:'vctx_'+'2'.repeat(32)}).key,first.key);
  const duplicate=voiceIntakeIdentity({...base,files:[...base.files,...base.files]});assert.equal(new Set(duplicate.attachmentIds).size,2);
});
test('concurrent workers and a lost acknowledgement produce one durable task and replay its exact receipt',async t=>{
  const f=fixture(t),other=f.worker(),body=input();let prepared=0,created=0;
  const callbacks={prepare:async()=>{prepared++;await new Promise(resolve=>setTimeout(resolve,25));},create:async identity=>{created++;return {ok:true,task_id:identity.taskId,status:'queued',connector_id:'neuraldeep'};}};
  const [one,two]=await Promise.all([f.receipts.submit(body,callbacks),other.receipts.submit(body,callbacks)]);
  assert.equal(created,1);assert.equal(prepared,1);assert.equal(two.replayed,true);assert.equal(two.task_id,one.task_id);
  const replay=await f.worker().receipts.submit(body,{create:()=>{assert.fail('must not dispatch after restart');}});
  assert.equal(replay.task_id,one.task_id);assert.equal(replay.replayed,true);
  await assert.rejects(other.receipts.submit({...body,text:'new instructions'},callbacks),{code:'voice_intake_idempotency_conflict'});assert.equal(created,1);
});
test('a failed original upload can retry the same IDs before dispatch while partial bytes remain immutable',async t=>{
  const f=fixture(t),body=input();let createCount=0,fail=true;
  const callbacks={prepare:async identity=>{
    await f.store.upload(identity.attachmentIds[0],body.files[0].name,new Request('http://fixture.invalid',{method:'PUT',body:body.files[0].bytes}));
    if(fail){fail=false;throw new Error('lost before prepare acknowledgement');}
    await f.store.prepare(identity.attachmentIds,{retain:true});
  },create:async identity=>{createCount++;return {ok:true,task_id:identity.taskId};}};
  await assert.rejects(f.receipts.submit(body,callbacks));assert.equal(createCount,0);
  await f.worker().receipts.submit(body,callbacks);assert.equal(createCount,1);
  assert.equal(readFileSync((await f.store.resolve(voiceIntakeIdentity(body).attachmentIds[0])).filePath,'utf8'),'hello');
});
test('unknown dispatch preserves a recovery receipt and never resends; only a matching saved task can recover',async t=>{
  const f=fixture(t),body=input();let calls=0;
  await assert.rejects(f.receipts.submit(body,{create:async()=>{calls++;throw new Error('lost dispatch result');}}));
  const identity=voiceIntakeIdentity(body);
  for(const recover of [async()=>null,async()=>({ok:true,task_id:'wrong-task'})]){
    const response=await f.worker().receipts.submit(body,{create:async()=>{calls++;},recover});
    assert.equal(response.error,'voice_intake_recovery_required');assert.equal(response.task_id,identity.taskId);assert.equal(calls,1);
  }
  const recovered=await f.receipts.submit(body,{create:()=>assert.fail(),recover:async()=>({ok:true,task_id:identity.taskId,status:'waiting_for_operator',recovered:true})});
  assert.equal(recovered.replayed,true);assert.equal(recovered.recovered,true);assert.equal(calls,1);
});
test('negative preparation results are durable and never silently change provider or dispatch on retry',async t=>{
  const f=fixture(t),body=input();let calls=0;
  const callbacks={create:async()=>{calls++;return {ok:false,error:'provider_model_invalid'};}};
  const first=await f.receipts.submit(body,callbacks),again=await f.worker().receipts.submit(body,callbacks);
  assert.equal(first.ok,false);assert.equal(again.replayed,true);assert.equal(calls,1);
  await assert.rejects(f.receipts.submit({...body,selection:{...body.selection,preset:{modelId:'another-model'}}},callbacks),{code:'voice_intake_idempotency_conflict'});
});
test('external intake validates immutable original metadata and refuses legacy paths or corrupt references',async t=>{
  const f=fixture(t),body=input(),identity=voiceIntakeIdentity(body),id=identity.attachmentIds[0];
  await f.store.upload(id,'one.txt',new Request('http://fixture.invalid',{method:'PUT',body:body.files[0].bytes}));
  const file=await f.store.resolve(id),intake={attachment_protocol:'pritha-voice-originals-v1',files:[{id}],attachment_refs:[{...file.view,sha256:file.sha256}]};
  assert.deepEqual(await voiceIntakeAttachmentIds(intake,f.store),[id]);
  for(const bad of [{files:[{id:'file-1',relative_path:'/private/legacy'}]},{...intake,files:[]},{...intake,attachment_refs:[{...intake.attachment_refs[0],sha256:'f'.repeat(64)}]}])await assert.rejects(voiceIntakeAttachmentIds(bad,f.store));
  writeFileSync(file.filePath,'other');await assert.rejects(voiceIntakeAttachmentIds(intake,f.store));assert.equal(readFileSync(file.filePath,'utf8'),'other');
});
