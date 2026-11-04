import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderTaskRuntime } from '../scripts/lib/provider-task-runtime.mjs';
import { executionChannelView } from '../scripts/lib/execution-channel.mjs';
import { CompatibleProviderService } from '../scripts/openai-compatible/provider-service.mjs';
import { ImmutableAttachmentStore } from '../scripts/lib/chat-attachment-store.mjs';
import {hostFileAttachmentTransport} from '../scripts/lib/provider-file-attachments.mjs';

const session='11111111-2222-4333-8444-555555555555',identity='a'.repeat(64);
const message=(id,text=id)=>({clientMessageId:id,input:[{type:'text',text}]});
const create=(id='test_thread_0001')=>({clientThreadId:id,source:'chat'});
async function until(predicate){for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Fixture state did not settle');}
function fixture(t,options={}){
  const directory=mkdtempSync(path.join(tmpdir(),'pritha-task-runtime-')),root=path.join(directory,'source'),stateRoot=path.join(directory,'state');mkdirSync(root);mkdirSync(stateRoot);
  const runs=[],instances=[];
  const launch=async input=>{
    await input.beforeStart({identity,evidence:{schema:1,fixture:true}});
    await input.onRawChunk(Buffer.from('{"type":"private.fixture"}\n'));
    await input.onEvent({type:'thread.started',thread_id:session});
    let resolve;
    const completion=new Promise(done=>{resolve=done;});
    const run={input,resolve,completion,stop(){resolve({ok:false,errorCode:'operator_cancel',processTreeExited:true});return true;}};
    runs.push(run);return run;
  };
  const settings={modelId:'test-model',reasoningEffort:'low',timeoutMs:30000,sandbox:'read-only'};
  const make=(connectorId='neuraldeep',override={})=>{
    const runtime=new ProviderTaskRuntime({root,stateRoot,privateRoot:path.join(stateRoot,'private','task-chat'),executionDirectory:path.join(stateRoot,'codex-chat','execution'),connectorId,
      configuration:()=>settings,preflight:async()=>({steer:false,interrupt:true}),launch,
      normalizeEvent:(active,event)=>({item:{id:'item_'+active.turnId,kind:'assistant_message',status:'completed',startedAt:null,completedAt:null,message:{id:'item_'+active.turnId,role:'assistant',markdown:event.item.text,status:'completed',createdAt:new Date().toISOString()}},originalText:event.item.text}),...options,...override});
    instances.push(runtime);return runtime;
  };
  t.after(async()=>{for(const runtime of instances)await runtime.dispose();rmSync(directory,{recursive:true,force:true});});
  return {make,runs,settings,stateRoot};
}

test('compatible metadata preflight accepts the real host execution binding and preserves its model and sandbox',async t=>{
  const f=fixture(t);Object.assign(f.settings,{modelId:'vendor/model',reasoningEffort:'default'});
  const service=new CompatibleProviderService({connectorId:'openrouter',root:'/fixture',stateRoot:f.stateRoot,readCredential:()=> 'SYNTHETIC_KEY',probeCli:async()=>({available:true,version:'0.153.0'}),probeSandbox:()=>true,
    fetchImpl:async url=>Response.json(url.endsWith('/key')?{data:{is_free_tier:false}}:{data:[{id:'vendor/model',supported_parameters:['tools'],context_length:32768,top_provider:{max_completion_tokens:4096}}]})});
  const runtime=f.make('openrouter',{preflight:async binding=>(await service.require(binding.executionConfig)).capabilities,beforeRequest:binding=>service.require(binding.executionConfig)});
  const binding=(await runtime.create(create('openrouter_contract_1'))).binding;
  assert.equal(binding.executionConfig.sandbox,'read-only');assert.equal(binding.modelId,'vendor/model');
  await runtime.start(binding.chatId,message('openrouter_message_1'));await until(()=>f.runs.length===1);
  await f.runs[0].input.beforeRequest();assert.equal(f.runs[0].input.effort,'default');assert.equal(f.runs[0].input.maxOutputTokens,4096);assert(f.runs[0].input.hostExecutionContext);
});

test('a provider model substitution gives an actionable error without changing the pinned chat or defaults',async t=>{
  const f=fixture(t),runtime=f.make(),binding=(await runtime.create(create('model_drift_thread'))).binding;
  const started=await runtime.start(binding.chatId,message('model_drift_message'));
  await until(()=>f.runs.length===1);
  f.runs[0].resolve({ok:false,errorCode:'neuraldeep_model_identity_mismatch',processTreeExited:true});
  await until(()=>runtime.registry.turn(binding.chatId,started.accepted.turn.turnId).status==='failed');
  const turn=runtime.registry.turn(binding.chatId,started.accepted.turn.turnId);
  assert.equal(turn.error.code,'neuraldeep_model_identity_mismatch');assert.match(turn.error.message,/different model/);
  assert.match(turn.error.message,/new chat/);assert.equal(runtime.require(binding.chatId).modelId,'test-model');assert.equal(f.settings.modelId,'test-model');
});

test('external turns retain exact creation/model/session and replay the accepted receipt across workers',async t=>{
  const f=fixture(t),a=f.make(),b=f.make();
  const {binding}=await a.create(create()),chat=binding.chatId;
  const first=await a.start(chat,message('message_first_1','Полный исходный запрос 🐉'));
  await until(()=>f.runs.length===1);
  f.settings.modelId='a-new-default';
  assert.equal((await b.create(create())).binding.modelId,'test-model');
  assert.equal((await b.start(chat,message('message_first_1','Полный исходный запрос 🐉'))).replayed,true);
  assert.equal(f.runs.length,1);
  await assert.rejects(b.start(chat,message('message_first_1','Changed')),{code:'idempotency_conflict'});
  await assert.rejects(b.start(chat,{...message('message_first_2'),settings:{modelId:'a-new-default'}}),{code:'runtime_identity_mismatch'});
  await f.runs[0].input.onEvent({type:'item.completed',item:{text:'Ответ '.repeat(5000)}});
  f.runs[0].resolve({ok:true,processTreeExited:true,usage:{input_tokens:4,output_tokens:3}});
  await until(()=>a.registry.turn(chat,first.accepted.turn.turnId).status==='completed');
  const second=await b.start(chat,message('message_second_1'));
  await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.resume,session);assert.equal(f.runs[1].input.model,'test-model');
  assert.equal(f.runs[1].input.privateRoot,path.join(f.stateRoot,'private','task-chat','neuraldeep'));
  const journals=readdirSync(path.join(f.stateRoot,'private','task-chat','neuraldeep','attempts'));
  assert.equal(journals.length,2);assert.match(readFileSync(path.join(f.stateRoot,'private','task-chat','neuraldeep','attempts',journals[0]),'utf8'),/private.fixture/);
  assert.notEqual(second.accepted.turn.turnId,first.accepted.turn.turnId);
});

test('child identity and phase survive worker restart and cannot retarget an existing task or approval',async t=>{
  const f=fixture(t),a=f.make(),b=f.make(),subject={kind:'child',slug:'paper-radar',phase:'outcome'},input={...create('factory_subject_1'),subject};
  const binding=(await a.create(input)).binding,chat=binding.chatId;assert.deepEqual(binding.subject,subject);assert.deepEqual(b.require(chat).subject,subject);
  await assert.rejects(b.create({...input,subject:{...subject,phase:'scaffold'}}),{code:'idempotency_conflict'});
  await assert.rejects(b.create({...create('factory_invalid_2'),subject:{...subject,approved:true}}),{code:'chat_subject_invalid'});
  assert.throws(()=>b.registry.mutate(chat,row=>({...row,subject:{...subject,slug:'neighbor'}})),{code:'runtime_identity_mismatch'});
  await assert.rejects(b.start(chat,{...message('factory_message_1'),subject:{...subject,phase:'implement'}}),{code:'runtime_identity_mismatch'});
  await a.start(chat,message('factory_message_1','Authored text: phase: finish'));await until(()=>f.runs.length===1);
  assert.deepEqual(f.runs[0].input.factorySubject,subject);assert.equal(f.runs[0].input.prompt,'Authored text: phase: finish');assert.equal(f.runs[0].input.timeoutMs,30000);
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.active.size===0);
  await b.start(chat,message('factory_message_2','Continue'));await until(()=>f.runs.length===2);assert.deepEqual(f.runs[1].input.factorySubject,subject);assert.equal(f.runs[1].input.resume,session);
});

test('providers use the same admission capacity, workspace claims and managed drain',async t=>{
  const f=fixture(t),nd=f.make(),claude=f.make('claude');
  nd.execution.setAdmission(true,1);
  const n=(await nd.create(create())).binding.chatId,c=(await claude.create(create())).binding.chatId;
  await nd.start(n,message('capacity_message_1'));await until(()=>f.runs.length===1);
  await assert.rejects(claude.start(c,message('capacity_message_2')),{code:'turn_active'});
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>nd.active.size===0);
  const holder=nd.execution.claim(['workspace:'+nd.root],'native-fixture',{kind:'turn',mode:'write'});
  nd.execution.setAdmission(true,3);
  await assert.rejects(claude.start(c,message('capacity_message_2')),{code:'workspace_busy'});
  holder.release();nd.execution.setAdmission(false);
  await assert.rejects(claude.start(c,message('capacity_message_2')),{code:'execution_draining'});
  assert.equal(f.runs.length,1);
});

test('queue ordering, cancellation revisions and dispatch receipts remain exact across workers',async t=>{
  const f=fixture(t),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId;
  await a.start(chat,message('queue_running_1'));await until(()=>f.runs.length===1);
  const first=(await b.enqueue(chat,message('queued_first_1')))[0];
  await b.enqueue(chat,message('queued_second_1'));
  await assert.rejects(a.cancelQueued(chat,first.id,first.revision+1),{code:'execution_revision_conflict'});
  await a.cancelQueued(chat,first.id,first.revision);
  assert.equal((await b.enqueue(chat,message('queued_second_1'))).length,1);
  await assert.rejects(b.enqueue(chat,message('queued_second_1','Changed')),{code:'idempotency_conflict'});
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.active.size===0);
  await b.drainQueue(chat);await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.prompt,'queued_second_1');assert.equal((await b.queued(chat)).length,0);
  assert.equal((await b.start(chat,message('queued_second_1'))).replayed,true);assert.equal(f.runs.length,2);
});

test('unknown process exit fences workspace and retry while interrupted turns never drain their queue',async t=>{
  const f=fixture(t),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId;
  const result=await a.start(chat,message('unknown_message_1'));await until(()=>f.runs.length===1);
  await b.enqueue(chat,message('unknown_queued_1'));
  f.runs[0].resolve({ok:true,processTreeExited:false});await until(()=>a.active.size===0);
  assert.equal(b.registry.turn(chat,result.accepted.turn.turnId).error.code,'provider_process_exit_unconfirmed');
  assert.equal(b.activeIntent(chat).state,'unknown');assert.ok(b.execution.claims().length>0);
  assert.equal((await b.start(chat,message('unknown_message_1'))).replayed,true);
  await assert.rejects(b.start(chat,message('unknown_message_2')),{code:'turn_active'});
  await b.drainQueue(chat);assert.equal(f.runs.length,1);
});

test('cross-worker Stop addresses the exact turn and SSE history survives dispatcher loss',async t=>{
  const f=fixture(t),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId;
  const events=[],unsubscribe=b.subscribe(chat,event=>events.push(event));t.after(unsubscribe);
  const {accepted}=await a.start(chat,message('stop_message_1'));await until(()=>f.runs.length===1);
  await until(()=>a.execution.getIntent('execution-channel:provider-control:'+chat)?.state==='available');
  await assert.rejects(b.control(chat,{action:'interrupt',expectedTurnId:'another_turn',clientMessageId:'wrong_stop_1'}),{code:'control_turn_changed'});
  await b.enqueue(chat,message('stop_queued_1'));
  await b.control(chat,{action:'interrupt',expectedTurnId:accepted.turn.turnId,clientMessageId:'valid_stop_1'});
  await until(()=>a.active.size===0);
  assert.equal(a.registry.turn(chat,accepted.turn.turnId).status,'interrupted');
  assert.equal((await b.control(chat,{action:'interrupt',expectedTurnId:accepted.turn.turnId,clientMessageId:'valid_stop_1'})).replayed,true);
  await b.drainQueue(chat);assert.equal(f.runs.length,1);
  await until(()=>events.some(event=>event.event==='turn.interrupted'));
  assert.ok(b.registry.eventsAfter(chat,events[0].data.eventId).events.some(event=>event.event==='turn.interrupted'));
  assert.equal(b.execution.claims().filter(row=>row.kind==='turn').length,0);
});

test('provider parallel slots supplement global capacity and release only after confirmed exit',async t=>{
  const f=fixture(t,{preflight:async()=>({steer:false,parallelLimit:1})}),a=f.make(),b=f.make();
  a.execution.setAdmission(true,4);
  const one=(await a.create(create('parallel_thread_1'))).binding.chatId,two=(await b.create(create('parallel_thread_2'))).binding.chatId;
  await a.start(one,message('parallel_message_1'));await until(()=>f.runs.length===1);
  await assert.rejects(b.start(two,message('parallel_message_2')),{code:'provider_rate_limited'});
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.active.size===0);
  await b.start(two,message('parallel_message_2'));await until(()=>f.runs.length===2);
});

test('recovery proves process exit before freeing a stale claim and never restarts an interrupted request',async t=>{
  let exited=false;
  const f=fixture(t,{proveExit:()=>exited}),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId;
  const first=await a.start(chat,message('recovery_message_1'));await until(()=>f.runs.length===1);
  await b.enqueue(chat,message('recovery_queued_1'));
  f.runs[0].resolve({ok:false,processTreeExited:false});await until(()=>a.active.size===0);
  await b.reconcile(chat);assert.equal(b.activeIntent(chat).state,'unknown');
  exited=true;await b.reconcile(chat);
  assert.equal(b.activeIntent(chat),null);assert.equal(b.execution.claims().length,0);
  assert.equal(b.registry.turn(chat,first.accepted.turn.turnId).status,'interrupted');
  assert.equal((await b.start(chat,message('recovery_message_1'))).replayed,true);
  await b.drainQueue(chat);assert.equal(f.runs.length,1);assert.equal((await b.queued(chat)).length,1);
});

test('host approvals survive a different HTTP worker, expire on Stop and cannot leak across provider chats',async t=>{
  const f=fixture(t,{preflight:async()=>({steer:false,approvals:true})}),a=f.make('claude'),b=f.make('claude'),chat=(await a.create(create())).binding.chatId;
  const first=await a.start(chat,message('approval_message_1'));await until(()=>f.runs.length===1);
  const pending=f.runs[0].input.approve({operationId:'approval_fixture_001',kind:'file_change_approval',presentation:{path:'file',proposedContent:'exact'},reason:'Exact fixture write'});
  await until(()=>b.pendingRequests(chat).length && executionChannelView(a.execution,'provider-answer:'+b.pendingRequests(chat)[0].requestId));
  const row=b.pendingRequests(chat)[0];assert.equal(row.turnId,first.accepted.turn.turnId);
  await b.answerRequest(chat,{requestId:row.requestId,revision:row.presentation.revision,decision:'accept',clientMessageId:'answer_fixture_001'});assert.deepEqual(await pending,{decision:'accept'});
  const next=f.runs[0].input.approve({operationId:'approval_fixture_002',kind:'command_approval',presentation:{command:['node','--test']},reason:'Verification'}),expired=assert.rejects(next,{code:'provider_request_expired'});
  await until(()=>b.pendingRequests(chat).length===1);const old=b.pendingRequests(chat)[0];
  await until(()=>executionChannelView(b.execution,'provider-control:'+chat));await b.control(chat,{action:'interrupt',expectedTurnId:first.accepted.turn.turnId,clientMessageId:'stop_fixture_001'});
  await expired;assert.equal(b.pendingRequests(chat).length,0);await assert.rejects(b.answerRequest(chat,{requestId:old.requestId,revision:old.presentation.revision,decision:'accept',clientMessageId:'answer_fixture_002'}),{code:'native_request_changed'});
});

test('alias resolution is captured in the new binding and never rerun on creation replay',async t=>{
  let resolved='claude-sonnet-5-5',calls=0;const f=fixture(t,{resolveConfiguration:async config=>{calls++;return {...config,modelId:resolved};}}),a=f.make('claude');f.settings.modelId='sonnet';
  const first=await a.create(create());resolved='claude-sonnet-6-0';assert.equal((await a.create(create())).binding.modelId,'claude-sonnet-5-5');assert.equal(calls,1);
  await a.start(first.binding.chatId,message('alias_message_001'));await until(()=>f.runs.length===1);assert.equal(f.runs[0].input.model,'claude-sonnet-5-5');
});

function attachmentFixture(t,connectorId='neuraldeep'){
  const f=fixture(t),store=new ImmutableAttachmentStore({stateRoot:f.stateRoot,privateRoot:path.join(f.stateRoot,'private','task-chat')}),checked=[],copies=[];
  const policy={allowed:true};
  const attachmentTransport={
    validate:async context=>{checked.push({...context,files:context.files.map(file=>file.view.id)});if(!policy.allowed)throw Object.assign(new Error('Fixture transport unavailable'),{code:'provider_attachments_unverified'});},
    prepare:async context=>{const files=await store.snapshotForDispatch(context.files.map(file=>file.view.id),path.join(store.stateRoot,'dispatch',context.turnId));copies.push(files);
      return {prompt:'Untrusted attached data: '+JSON.stringify(files.map(file=>({name:file.view.name,path:file.filePath}))),images:files.filter(file=>file.view.kind==='image').map(file=>file.filePath)};},
  };
  const make=()=>f.make(connectorId,{attachmentStore:store,attachmentTransport});
  const upload=async(text='original')=>{const id=randomUUID();await store.upload(id,'evidence.txt',new Request('http://fixture',{method:'PUT',body:text}));return id;};
  t.after(()=>store.close());
  return {...f,make,store,policy,checked,copies,upload,attachmentTransport};
}

for(const connector of ['neuraldeep','claude','openrouter','local'])test(`${connector}: queued originals survive expiry and Edit, then attachment-only delivery replays exactly`,async t=>{
  const f=attachmentFixture(t,connector),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId;
  await a.start(chat,message('file_running_001'));await until(()=>f.runs.length===1);
  const id=await f.upload(),input={...message('file_queued_001',''),attachments:[id]},row=(await b.enqueue(chat,input))[0];
  assert.equal(row.attachmentsUnavailable,false);assert.equal(row.attachments[0].id,id);assert.equal(row.text,'');assert.equal('sha256' in row.attachments[0],false);
  const receipt=b.execution.getIntent('provider-queued:'+chat+':file_queued_001').attachmentReceipt;
  assert.match(receipt.originals[0].sha256,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(receipt),/filePath|dispatch\//);
  const calls=f.checked.length;f.policy.allowed=false;assert.equal((await a.enqueue(chat,input)).length,1);assert.equal(f.checked.length,calls,'a saved queue receipt must not be re-admitted');f.policy.allowed=true;
  await assert.rejects(a.cancelQueued(chat,row.id,row.revision+1),{code:'execution_revision_conflict'});
  await a.cancelQueued(chat,row.id,row.revision);assert.equal((await b.queued(chat)).length,0);assert.equal((await f.store.resolve(id)).view.id,id);
  const next={...input,clientMessageId:'file_queued_002'};await b.enqueue(chat,next);
  const metadata=path.join(f.store.root,id,'metadata.json'),saved=JSON.parse(readFileSync(metadata));writeFileSync(metadata,JSON.stringify({...saved,createdAt:'2000-01-01T00:00:00.000Z'}));
  await f.upload('trigger garbage collection');assert.equal((await b.queued(chat))[0].attachments[0].id,id);
  f.settings.modelId='changed-default';f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.active.size===0);
  await b.drainQueue(chat);await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.model,'test-model');assert.equal(f.runs[1].input.resume,session);assert.equal((await b.queued(chat)).length,0);
  assert.equal(f.copies.length,1);assert.equal(readFileSync(f.copies[0][0].filePath,'utf8'),'original');assert.match(f.runs[1].input.prompt,/Untrusted attached data/);
  const turn=b.registry.turnsPage(chat).data.find(turn=>turn.clientMessageId===next.clientMessageId);assert.equal(turn.userMessage.markdown,'');assert.equal(turn.userMessage.attachments[0].id,id);
  f.policy.allowed=false;rmSync(path.join(f.store.root,id),{recursive:true});const checked=f.checked.length;
  const replay=await a.start(chat,next);assert.equal(replay.replayed,true);assert.equal(f.runs.length,2);assert.equal(f.checked.length,checked);
  assert.equal('sha256' in replay.accepted.turn.userMessage.attachments[0],false);
});

test('attachment policy rejection before queue acceptance preserves an unreferenced upload and text',async t=>{
  const f=attachmentFixture(t),a=f.make(),chat=(await a.create(create())).binding.chatId;
  await a.start(chat,message('reject_running_01'));await until(()=>f.runs.length===1);
  const id=await f.upload(),input={...message('reject_queued_001','Keep this draft'),attachments:[id]};f.policy.allowed=false;
  await assert.rejects(a.enqueue(chat,input),{code:'provider_attachments_unverified'});assert.equal((await a.queued(chat)).length,0);
  assert.equal(JSON.parse(readFileSync(path.join(f.store.root,id,'metadata.json'))).referenced,false);
  assert.equal(readFileSync((await f.store.resolve(id)).filePath,'utf8'),'original');assert.equal(input.input[0].text,'Keep this draft');assert.equal(f.runs.length,1);
});

for(const mode of ['missing','changed','retagged','policy'])test(`queued attachment ${mode} blocks dispatch and preserves its exact queue identity`,async t=>{
  const f=attachmentFixture(t),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId;
  await a.start(chat,message('blocked_running_01'));await until(()=>f.runs.length===1);
  const id=await f.upload(),input={...message('blocked_queued_001','Keep this exact request'),attachments:[id]},row=(await a.enqueue(chat,input))[0],original=await f.store.resolve(id);
  if(mode==='missing')rmSync(original.filePath);
  if(mode==='changed' || mode==='retagged')writeFileSync(original.filePath,'modified');
  if(mode==='retagged'){
    const file=path.join(f.store.root,id,'metadata.json'),record=JSON.parse(readFileSync(file));record.sha256=createHash('sha256').update('modified').digest('hex');writeFileSync(file,JSON.stringify(record));
  }
  if(mode==='policy')f.policy.allowed=false;
  const before=(await b.queued(chat))[0];assert.equal(before.id,row.id);assert.equal(before.text,'Keep this exact request');assert.equal(before.attachmentsUnavailable,mode!=='policy');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.active.size===0);await b.drainQueue(chat);
  assert.equal(f.runs.length,1);const blocked=(await b.queued(chat))[0];assert.equal(blocked.state,'blocked');assert.equal(blocked.id,row.id);assert.equal(blocked.clientMessageId,input.clientMessageId);
  assert.equal(blocked.reason,mode==='policy'?'provider_attachments_unverified':mode==='retagged'?'attachment_integrity_failed':mode==='changed'?'attachment_corrupt':'attachment_storage_unavailable');
  await assert.rejects(a.cancelQueued(chat,blocked.id,row.revision),{code:'execution_revision_conflict'});await a.cancelQueued(chat,blocked.id,blocked.revision);assert.equal((await a.queued(chat)).length,0);
});

test('an unverified adapter and a forged queue handoff cannot start attachment-only work',async t=>{
  const f=fixture(t),a=f.make(),chat=(await a.create(create())).binding.chatId;
  await assert.rejects(a.start(chat,{...message('unsupported_files_1',''),attachments:[randomUUID()]}),{code:'provider_attachments_unverified'});
  await assert.rejects(a.start(chat,message('forged_queue_001'),{fromQueue:'provider-queued:missing'}),{code:'queue_dispatch_identity_changed'});
  assert.equal(f.runs.length,0);assert.equal(a.registry.turnsPage(chat).data.length,0);
});

test('Stop during attachment preparation never launches a provider or releases a different turn',async t=>{
  const f=attachmentFixture(t),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId,id=await f.upload();
  let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
  f.attachmentTransport.prepare=async()=>{entered=true;await gate;return {prompt:'fixture file',images:[]};};
  const {accepted}=await a.start(chat,{...message('copy_stop_message',''),attachments:[id]});await until(()=>entered && executionChannelView(a.execution,'provider-control:'+chat));
  await b.control(chat,{action:'interrupt',expectedTurnId:accepted.turn.turnId,clientMessageId:'copy_stop_control'});release();
  await until(()=>a.active.size===0);assert.equal(f.runs.length,0);assert.equal(a.registry.turn(chat,accepted.turn.turnId).status,'interrupted');
  assert.equal(readFileSync((await f.store.resolve(id)).filePath,'utf8'),'original');assert.equal(a.execution.claims().filter(row=>row.kind==='turn').length,0);
});

test('historical image evidence remains scoped to the original chat and is rechecked on text-only resume',async t=>{
  const f=attachmentFixture(t),a=f.make(),chat=(await a.create(create())).binding.chatId,id=randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10,0,1,2]);
  await f.store.upload(id,'pixel.png',new Request('http://fixture',{method:'PUT',body:bytes}));
  await a.start(chat,{...message('image_message_001',''),attachments:[id]});await until(()=>f.runs.length===1);
  assert.equal(f.runs[0].input.images.length,1);assert.deepEqual(readFileSync(f.runs[0].input.images[0]),bytes);
  const expected={sha256:createHash('sha256').update(bytes).digest('hex'),mediaType:'image/png',size:bytes.length};
  assert.equal(a.registry.history.attachmentInSession(chat,expected),true);
  const other=(await a.create(create('separate_image_chat'))).binding.chatId;assert.equal(a.registry.history.attachmentInSession(other,expected),false);
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.active.size===0);f.policy.allowed=false;
  await assert.rejects(a.start(chat,message('image_resume_002','Continue reading')),{code:'provider_attachments_unverified'});
  assert.equal(f.checked.at(-1).historicalImages,true);assert.equal(f.checked.at(-1).path,'resume');assert.equal(f.runs.length,1);
});

function hostFileFixture(t,connectorId='claude'){
  const f=fixture(t),store=new ImmutableAttachmentStore({stateRoot:f.stateRoot,privateRoot:path.join(f.stateRoot,'originals')}),policy={version:connectorId==='claude'?'2.1.296':'0.153.0',exited:false};
  const attachmentTransport=hostFileAttachmentTransport({stateRoot:f.stateRoot,privateRoot:path.join(f.stateRoot,'private','task-chat',connectorId),snapshot:async()=>({status:'ready',version:policy.version,capabilities:{attachments:{files:true}}})});
  const make=()=>f.make(connectorId,{attachmentStore:store,attachmentTransport,preflight:async()=>({approvals:true,tools:true}),proveExit:()=>policy.exited});
  const upload=async()=>{const id=randomUUID();await store.upload(id,'data.txt',new Request('http://fixture',{method:'POST',body:'IMMUTABLE_ORIGINAL'}));return id;};
  t.after(()=>store.close());return {...f,make,store,policy,upload};
}
for(const connectorId of ['neuraldeep','claude','openrouter'])test(`${connectorId}: host file scope survives worker resume and cleans only copies after confirmed exit`,async t=>{
  const f=hostFileFixture(t,connectorId),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId,id=await f.upload();
  const first=await a.start(chat,{...message('host_files_first','Read attached data'),attachments:[id]});await until(()=>f.runs.length===1);
  const scope=f.runs[0].input.hostAttachments,read=await scope.read('attachment:'+id),copy=read.attachment.readOnlyPath;
  assert.equal(read.bytes.toString(),'IMMUTABLE_ORIGINAL');assert.match(f.runs[0].input.prompt,/untrusted task data/);assert(f.runs[0].input.hostExecutionContext);
  assert.equal(b.execution.getIntent('turn:'+chat+':host_files_first').attachmentCleanup,'pending');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.registry.turn(chat,first.accepted.turn.turnId).status==='completed');
  assert.equal(existsSync(copy),false);assert.equal(b.execution.getIntent('turn:'+chat+':host_files_first').attachmentCleanup,'complete');
  assert.equal((await f.store.resolve(id)).view.id,id);await assert.rejects(scope.read('attachment:'+id),{code:'attachment_scope_closed'});
  await b.start(chat,message('host_files_resume','Continue with the earlier data'));await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.resume,session);const resumed=await f.runs[1].input.hostAttachments.read('attachment:'+id);assert.equal(resumed.bytes.toString(),'IMMUTABLE_ORIGINAL');assert.notEqual(resumed.attachment.readOnlyPath,copy);
  f.runs[1].resolve({ok:true,processTreeExited:true});await until(()=>b.active.size===0);f.policy.version='unverified';
  await assert.rejects(a.start(chat,message('host_files_policy','Continue')),{code:'provider_attachments_unverified'});assert.equal(f.runs.length,2);
});

test('unconfirmed provider exit preserves attachment copies and a later proven restart cleans them',async t=>{
  const f=hostFileFixture(t),a=f.make(),b=f.make(),chat=(await a.create(create())).binding.chatId,id=await f.upload(),input={...message('host_unknown_exit'),attachments:[id]};
  await a.start(chat,input);await until(()=>f.runs.length===1);const copy=(await f.runs[0].input.hostAttachments.read('attachment:'+id)).attachment.readOnlyPath;
  f.runs[0].resolve({ok:false,processTreeExited:false});await until(()=>a.active.size===0);
  assert.equal(existsSync(copy),true);assert.equal(b.execution.getIntent('turn:'+chat+':host_unknown_exit').attachmentCleanup,'preserved');
  await b.reconcile(chat);assert.equal(existsSync(copy),true);assert.equal((await b.start(chat,input)).replayed,true);assert.equal(f.runs.length,1);
  f.policy.exited=true;await b.reconcile(chat);assert.equal(existsSync(copy),false);assert.equal(b.activeIntent(chat),null);assert.equal(b.execution.getIntent('turn:'+chat+':host_unknown_exit').attachmentCleanup,'complete');
  assert.equal((await f.store.resolve(id)).view.id,id);
});

for(const damaged of ['copy','original'])test(`a damaged ${damaged} preserves recovery data without misreporting the provider result`,async t=>{
  const f=hostFileFixture(t),a=f.make(),chat=(await a.create(create())).binding.chatId,id=await f.upload();
  const started=await a.start(chat,{...message('host_changed_copy'),attachments:[id]});await until(()=>f.runs.length===1);
  const copy=(await f.runs[0].input.hostAttachments.read('attachment:'+id)).attachment.readOnlyPath,original=(await f.store.resolve(id)).filePath;
  writeFileSync(damaged==='copy'?copy:original,'PRESERVE_DAMAGED_DATA');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>a.active.size===0);
  assert.equal(a.registry.turn(chat,started.accepted.turn.turnId).status,'completed');assert.equal(a.execution.getIntent('turn:'+chat+':host_changed_copy').attachmentCleanup,'recovery_required');
  assert.equal(readFileSync(copy,'utf8'),damaged==='copy'?'PRESERVE_DAMAGED_DATA':'IMMUTABLE_ORIGINAL');assert.equal(readFileSync(original,'utf8'),damaged==='original'?'PRESERVE_DAMAGED_DATA':'IMMUTABLE_ORIGINAL');
});
