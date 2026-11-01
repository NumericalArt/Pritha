import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderTaskRuntime } from '../scripts/lib/provider-task-runtime.mjs';
import { executionChannelView } from '../scripts/lib/execution-channel.mjs';
import { CompatibleProviderService } from '../scripts/openai-compatible/provider-service.mjs';

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
  assert.equal(f.runs[1].input.prompt,'queued_second_1');assert.equal(b.queued(chat).length,0);
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
  b.reconcile(chat);assert.equal(b.activeIntent(chat).state,'unknown');
  exited=true;b.reconcile(chat);
  assert.equal(b.activeIntent(chat),null);assert.equal(b.execution.claims().length,0);
  assert.equal(b.registry.turn(chat,first.accepted.turn.turnId).status,'interrupted');
  assert.equal((await b.start(chat,message('recovery_message_1'))).replayed,true);
  await b.drainQueue(chat);assert.equal(f.runs.length,1);assert.equal(b.queued(chat).length,1);
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
