import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { executionChannelView } from '../scripts/lib/execution-channel.mjs';
import { ProviderApprovalBroker,answerProviderRequest,pendingProviderRequests } from '../scripts/lib/provider-approvals.mjs';

const chat='chat_claude_fixture',turn='turn_fixture',request={operationId:'operation_001',kind:'command_approval',presentation:{command:['node','--test'],cwdLabel:'Task workspace'},reason:'Run the proposed verification in the task sandbox.'};
const answer=(row,decision='accept')=>({requestId:row.requestId,revision:row.presentation.revision,clientMessageId:'answer_fixture_001',decision});
async function ready(coordinator){for(let i=0;i<100;i++){const row=pendingProviderRequests(coordinator,chat)[0];if(row && executionChannelView(coordinator,'provider-answer:'+row.requestId))return row;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Approval channel unavailable');}
function fixture(t){const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-approvals-')),a=new ExecutionCoordinator({stateRoot}),b=new ExecutionCoordinator({stateRoot});const lease=a.claim(['fixture-resource'],'fixture-owner',{kind:'turn',capacity:4}),controller=new AbortController(),broker=new ProviderApprovalBroker({coordinator:a,chatId:chat,turnId:turn,lease,signal:controller.signal});
  t.after(()=>{broker.close();lease.release();a.close();b.close();rmSync(stateRoot,{recursive:true,force:true});});return {a,b,lease,broker,controller};}

test('an exact approval crosses workers and replays its durable answer without another permission grant',async t=>{
  const f=fixture(t),pending=f.broker.ask(request),row=await ready(f.a),input=answer(row);
  assert.equal((await answerProviderRequest(f.b,chat,input)).submitted,true);assert.deepEqual(await pending,{decision:'accept'});
  assert.equal((await answerProviderRequest(f.b,chat,input)).replayed,true);assert.equal(pendingProviderRequests(f.a,chat).length,0);
  await assert.rejects(answerProviderRequest(f.b,chat,{...input,decision:'decline'}),{code:'native_request_changed'});
});
test('wrong chat, revision, changed action and competing decisions cannot widen an approval',async t=>{
  const f=fixture(t),pending=f.broker.ask(request),row=await ready(f.a),input=answer(row);
  await assert.rejects(answerProviderRequest(f.b,'chat_other',input),{code:'native_request_not_found'});
  await assert.rejects(answerProviderRequest(f.b,chat,{...input,revision:input.revision+1}),{code:'native_request_changed'});
  await assert.rejects(f.broker.ask({...request,presentation:{command:['git','push']}}));
  const results=await Promise.allSettled([answerProviderRequest(f.a,chat,input),answerProviderRequest(f.b,chat,{...input,decision:'decline'})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.ok(['accept','decline'].includes((await pending).decision));
});
test('Stop and expiry reject pending permission; stale UI cannot resurrect the action',async t=>{
  const f=fixture(t),pending=f.broker.ask(request),rejected=assert.rejects(pending,{code:'provider_request_expired'}),row=await ready(f.a);f.controller.abort();await rejected;
  await assert.rejects(answerProviderRequest(f.b,chat,answer(row)),{code:'native_request_changed'});
  const other=new ProviderApprovalBroker({coordinator:f.a,chatId:chat,turnId:'another_turn',lease:f.lease});
  await assert.rejects(other.ask({...request,timeoutMs:10}),{code:'provider_request_expired'});other.close();
});
test('user input validates exact questions and cannot be exchanged for a general permission grant',async t=>{
  const f=fixture(t),pending=f.broker.ask({...request,kind:'user_input',presentation:{questions:[{id:'question_001',question:'Choose a target',options:[{label:'Fixture'}]}]}}),row=await ready(f.a);
  await assert.rejects(answerProviderRequest(f.b,chat,answer(row)),{code:'native_answer_invalid'});
  await assert.rejects(answerProviderRequest(f.b,chat,{...answer(row),answers:{foreign:['text']}}),{code:'native_answer_invalid'});
  await answerProviderRequest(f.b,chat,{...answer(row),answers:{question_001:['Fixture']}});assert.deepEqual(await pending,{answers:{question_001:['Fixture']}});
});
