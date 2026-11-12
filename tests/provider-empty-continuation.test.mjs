import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ProviderTaskRuntime} from '../scripts/lib/provider-task-runtime.mjs';
import {readFactoryBudget} from '../scripts/agents-mother/factory-budget.mjs';
import {responsesTerminalSummary} from '../scripts/neuraldeep/responses-normalizer.mjs';

const session='11111111-2222-4333-8444-555555555555';
const until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Runtime did not settle');};
async function fixture(t,{connectorId='neuraldeep',factory=true}={}){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-empty-continuation-')));
  const [root,stateRoot,agentParent]=['root','state','children'].map(name=>{const dir=path.join(base,name);fs.mkdirSync(dir);return dir;});
  const runs=[],events=[];
  const runtime=new ProviderTaskRuntime({root,stateRoot,agentParent,connectorId,privateRoot:path.join(stateRoot,'private/task-chat'),
    configuration:()=>({modelId:'test-model',reasoningEffort:'default',sandbox:'read-only',timeoutMs:30000}),
    preflight:async()=>({tools:true,approvals:true}),
    normalizeEvent:(_active,event)=>({item:{id:event.item.id,kind:'notice',tone:'info',text:event.item.text,status:'completed',startedAt:null,completedAt:null}}),
    launch:async input=>{
      await input.beforeStart({identity:'a'.repeat(64),evidence:{kind:'fixture-process',attempt:runs.length}});
      input.onRawChunk(Buffer.from(JSON.stringify({type:'thread.started',thread_id:session})+'\n'));
      input.onEvent({type:'thread.started',thread_id:session});
      let resolve;const completion=new Promise(done=>resolve=done);
      const run={input,resolve,completion,stop:()=>resolve({ok:false,errorCode:'operator_cancel',processTreeExited:true})};runs.push(run);return run;
    }});
  t.after(async()=>{await runtime.dispose();fs.rmSync(base,{recursive:true,force:true});});
  const binding=(await runtime.create({clientThreadId:'empty_fixture_chat',source:'chat',...(factory?{factoryIntent:{action:'create-new-agent',slug:'empty-fixture'},workspace:{mode:'read-only'}}:{})})).binding;
  runtime.subscribe(binding.chatId,event=>events.push(event));
  const started=await runtime.start(binding.chatId,{clientMessageId:'empty_fixture_turn',input:[{type:'text',text:'Create the requested LLM agent.'}]});
  await until(()=>runs.length===1);
  const turnId=started.accepted.turn.turnId,key='turn:'+binding.chatId+':empty_fixture_turn';
  const settle=async(index,{ok=false,usageKnown=true,retrySafe=true,processTreeExited=true,errorCode='neuraldeep_empty_response',sessionId=session}={})=>{
    const input=runs[index].input,tokens=100+index;
    if(input.onBudgetCheckpoint)await input.onBudgetCheckpoint({requests:[{status:'measured',reservedTokens:tokens,usage:{totalTokens:tokens},createdAt:'2026-11-12T10:00:00.000Z',finishedAt:'2026-11-12T10:00:01.000Z'}]});
    input.onProviderRequest({method:'POST',path:'/v1/responses',status:ok?200:502,upstreamAttempted:true,durationMs:1000,usageKnown,
      usage:{inputTokens:tokens-10,outputTokens:10,cachedInputTokens:0,reasoningTokens:0,totalTokens:tokens},responseSummary:{emptyOutputRetrySafe:retrySafe,rejectedToolRetrySafe:retrySafe},error:ok?null:{code:errorCode}});
    input.cancelPendingApprovals(); // The real runner closes its tool/approval owner on exit.
    runs[index].resolve({ok,errorCode:ok?null:errorCode,sessionId,processTreeExited,budget:{usageKnown,tokensUsed:tokens}});
  };
  return {runtime,runs,events,binding,key,turnId,settle,root,stateRoot,agentParent,
    turn:()=>runtime.registry.turn(binding.chatId,turnId),receipt:()=>runtime.execution.getIntent(key)};
}

test('completed empty factory output resumes the pinned session, keeps its lease and accounts for every attempt',async t=>{
  const f=await fixture(t),owner=f.receipt().owner,generation=f.receipt().generation;
  f.runs[0].input.onEvent({type:'item.completed',item:{id:'item_0',text:'Earlier saved step'}});
  await f.settle(0);await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.resume,session);assert.equal(f.runs[1].input.model,'test-model');
  assert.match(f.runs[1].input.prompt,/saved factory.*same session/);assert.ok(f.runs[1].input.timeoutMs<=f.runs[0].input.timeoutMs);
  assert.equal(f.runs[1].input.tokenBudget,f.runs[0].input.tokenBudget-100);
  f.runs[1].input.onEvent({type:'item.completed',item:{id:'item_0',text:'Continued saved step'}});
  assert.equal(f.receipt().owner,owner);assert.equal(f.receipt().generation,generation);assert.equal(f.turn().status,'in_progress');
  // The previous runner closed its approval broker. Continuation must install
  // a new owner while retaining the same document/operation receipt namespace.
  const question=f.runs[1].input.approve({operationId:'continuation_question',kind:'user_input',presentation:{questions:[{id:'question_fixture',question:'Fixture?',options:[]}]},reason:'Fixture'});
  await until(()=>f.runtime.pendingRequests(f.binding.chatId).length===1);
  const request=f.runtime.pendingRequests(f.binding.chatId)[0];
  await f.runtime.answerRequest(f.binding.chatId,{requestId:request.requestId,revision:request.presentation.revision,clientMessageId:'continuation_answer',answers:{question_fixture:['yes']}});
  assert.deepEqual(await question,{answers:{question_fixture:['yes']}});
  await f.settle(1,{ok:true});await until(()=>!f.runtime.active.size);
  assert.equal(f.turn().status,'completed');assert.equal(f.turn().usage.totalTokens,201);
  const budget=readFactoryBudget({...f,slug:'empty-fixture',chatId:f.binding.chatId,connectorId:'neuraldeep'});
  assert.equal(budget.observedTokens,201);assert.equal(budget.activeMs,2000);assert.equal(budget.usageKnown,true);
  assert.equal(f.receipt().providerRecoveries.length,1);assert.equal(f.receipt().providerRequests,2);
  await until(()=>JSON.stringify(f.events).includes('automatic continuation 1 of 2'));
  assert.match(JSON.stringify(f.events),/Earlier saved step/);assert.match(JSON.stringify(f.events),/continuation_1_item_0/);
  const journal=fs.readFileSync(path.join(f.stateRoot,'private/task-chat/neuraldeep/attempts',f.turnId+'.jsonl'),'utf8');
  assert.equal(journal.match(/thread.started/g).length,2);assert.match(journal,/pritha.provider_continuation/);
});

test('repeated empty output stops after two continuations with useful diagnostics and retained usage',async t=>{
  const f=await fixture(t);
  for(let i=0;i<3;i++){await until(()=>f.runs.length===i+1);await f.settle(i);}
  await until(()=>!f.runtime.active.size);
  assert.equal(f.runs.length,3);assert.equal(f.turn().status,'failed');assert.match(f.turn().error.message,/Two automatic continuations also returned empty output/);
  assert.equal(f.turn().usage.totalTokens,303);assert.equal(f.receipt().providerRecoveries.length,2);
});

test('a completed, billed rejected tool resumes the same model with a correction and shares the empty-response retry limit',async t=>{
  const f=await fixture(t);
  await f.settle(0,{errorCode:'provider_tool_identity_mismatch'});await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.resume,session);assert.equal(f.runs[1].input.model,'test-model');
  assert.match(f.runs[1].input.prompt,/undeclared tool.*without executing.*only tools actually declared/s);
  await f.settle(1);await until(()=>f.runs.length===3);
  assert.match(f.runs[2].input.prompt,/no usable answer/);
  await f.settle(2,{errorCode:'provider_tool_identity_mismatch'});await until(()=>!f.runtime.active.size);
  assert.equal(f.runs.length,3);assert.equal(f.receipt().providerRecoveries.length,2);
  assert.equal(f.turn().usage.totalTokens,303);assert.match(f.turn().error.message,/Two automatic continuations did not resolve/);
  await until(()=>JSON.stringify(f.events).includes('blocked that call'));
});

for(const patch of [{usageKnown:false},{retrySafe:false},{processTreeExited:false},{sessionId:null}])test('a rejected tool without complete recovery evidence is never repeated: '+JSON.stringify(patch),async t=>{
  const f=await fixture(t);await f.settle(0,{errorCode:'provider_tool_identity_mismatch',...patch});await until(()=>!f.runtime.active.size);
  assert.equal(f.runs.length,1);assert.equal(f.receipt().providerRecoveries,undefined);
});

test('an unanswered document approval remains pending instead of launching a continuation',async t=>{
  const f=await fixture(t);
  const pending=f.runs[0].input.approve({operationId:'pending_contract',kind:'file_change_approval',durableDocument:true,
    presentation:{approvalScope:'contract only',beforeSha256:'a'.repeat(64)},reason:'Review the Contract'}).catch(error=>error.code);
  await until(()=>f.runtime.pendingRequests(f.binding.chatId).length===1);
  await f.settle(0);await until(()=>!f.runtime.active.size);await pending;
  assert.equal(f.runs.length,1);assert.equal(f.runtime.pendingRequests(f.binding.chatId).length,1);
});

test('Stop during an automatic continuation interrupts the same turn without another request',async t=>{
  const f=await fixture(t);await f.settle(0);await until(()=>f.runs.length===2);
  await f.runtime.control(f.binding.chatId,{clientMessageId:'stop_continuation',action:'interrupt',expectedTurnId:f.turnId});
  await until(()=>!f.runtime.active.size);
  assert.equal(f.runs.length,2);assert.equal(f.turn().status,'interrupted');
});

test('automatic continuation cannot renew the original time limit',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});
  const f=await fixture(t);t.mock.timers.tick(31000);
  await f.settle(0);await until(()=>!f.runtime.active.size);
  assert.equal(f.runs.length,1);assert.equal(f.receipt().providerRecoveries,undefined);
});

test('an uncertain second launcher cannot inherit exit proof from the first attempt',async t=>{
  const f=await fixture(t);
  f.runtime.options.launch=async()=>{throw Object.assign(new Error('Fixture launch uncertainty'),{processTreeExited:false});};
  await f.settle(0);await until(()=>!f.runtime.active.size);
  assert.equal(f.turn().error.code,'provider_process_exit_unconfirmed');assert.equal(f.receipt().state,'unknown');assert.equal(f.receipt().exitConfirmed,false);
});

test('continuation checks the original execution identity before starting another process',async t=>{
  const f=await fixture(t);
  f.runtime.options.launch=async input=>{await input.beforeStart({identity:'b'.repeat(64),evidence:{kind:'wrong-profile'}});assert.fail('Changed profile must not start');};
  await f.settle(0);await until(()=>!f.runtime.active.size);
  assert.equal(f.receipt().errorCode,'runtime_identity_mismatch');assert.equal(f.receipt().exitConfirmed,true);
});

for(const [name,configuration,result] of [
  ['ordinary chat',{factory:false},{}],['another transport',{connectorId:'claude'},{}],
  ['unknown exit',{}, {processTreeExited:false}],['unknown usage',{}, {usageKnown:false}],
  ['unrecognized output',{}, {retrySafe:false}],['missing native session',{}, {sessionId:null}],
  ['provider refusal',{}, {errorCode:'neuraldeep_response_incomplete'}],['successful model',{}, {ok:true}],
])test(name+' never triggers automatic empty-response continuation',async t=>{
  const f=await fixture(t,configuration);await f.settle(0,result);await until(()=>!f.runtime.active.size);
  assert.equal(f.runs.length,1);assert.equal(f.receipt().providerRecoveries,undefined);
});

test('empty-response eligibility excludes refusals, unknown shapes, tools, incomplete output and output limits',()=>{
  const response={status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'  '}]}],usage:{input_tokens:30,output_tokens:5}};
  const check=value=>responsesTerminalSummary(value,{outputLimit:20}).emptyOutputRetrySafe;
  assert.equal(check(response),true);
  for(const output of [[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'PRIVATE'}]}],
    [{type:'message',role:'assistant',content:[{type:'text',text:'PRIVATE'}]}],
    [{type:'message',role:'assistant',content:'PRIVATE'}],[{type:'function_call',name:'tool',arguments:'{}'}],
    [{type:'message',role:'assistant',content:[{type:'output_text',text:'answer'}]}]])assert.equal(check({...response,output}),false);
  for(const delta of [{status:'incomplete'},{usage:null},{usage:{input_tokens:30,output_tokens:20}},{error:{message:'PRIVATE'}},{incomplete_details:{reason:'content_filter'}}])assert.equal(check({...response,...delta}),false);
});
