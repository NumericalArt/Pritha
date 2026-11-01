import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeRequestBudget,ClaudeResponseUsage,countClaudeRequestTokens } from '../scripts/claude/request-budget.mjs';
import { listenClaudeApiProxy } from '../scripts/claude/api-proxy.mjs';
const model='claude-sonnet-5-5',payload=()=>({model,messages:[{role:'user',content:'hello'}],max_tokens:1000,stream:false});
const usage=total=>({inputTokens:100,cacheWriteTokens:0,cacheReadTokens:0,outputTokens:total-100,totalTokens:total});

test('budget reserves input estimate plus margin and bounded output before dispatch; settles exact usage once',async()=>{
  const checkpoints=[],budget=new ClaudeRequestBudget({tokenBudget:2500,checkpoint:async value=>checkpoints.push(value),countTokens:async()=>1000}),body=payload();
  const id=await budget.begin(body,{});assert.equal(body.max_tokens,476);assert.equal(checkpoints[0].usageKnown,false);assert.equal(checkpoints[0].requests[0].reservedTokens,2500);
  await assert.rejects(budget.begin(payload(),{}),{code:'provider_request_unconfirmed'});
  await budget.settle(id,{messageId:'msg_a',usage:usage(1100)});assert.equal(budget.snapshot().tokensUsed,1100);assert.equal(budget.snapshot().usageKnown,true);
  await assert.rejects(budget.settle(id,{messageId:'msg_a',usage:usage(1100)}),{code:'provider_usage_invalid'});
  await assert.rejects(budget.begin(payload(),{}),{code:'provider_budget_exhausted'});assert.equal(budget.snapshot().tokensUsed,1100);
});
test('unknown response, checkpoint failure and provider overshoot cannot authorize another request',async()=>{
  const make=checkpoint=>new ClaudeRequestBudget({tokenBudget:5000,checkpoint:checkpoint || (async()=>{}),countTokens:async()=>100});
  const unknown=make(),id=await unknown.begin(payload(),{});await unknown.unknown(id);assert.equal(unknown.snapshot().tokensUsed,null);await assert.rejects(unknown.begin(payload(),{}),{code:'provider_usage_unconfirmed'});
  const broken=make(async()=>{throw new Error('HOST_PRIVATE_CANARY');});await assert.rejects(broken.begin(payload(),{}),{code:'provider_budget_checkpoint_failed'});assert.equal(broken.snapshot().usageKnown,false);
  const over=make(),sequence=await over.begin(payload(),{});await over.settle(sequence,{messageId:'msg_over',usage:usage(6000)});assert.equal(over.snapshot().tokensUsed,6000);await assert.rejects(over.begin(payload(),{}),{code:'provider_budget_overshoot'});
});
test('response usage handles fragmented UTF-8/cache counts and requires terminal evidence without persisting reasoning',()=>{
  const observer=new ClaudeResponseUsage(model,true),events=[{type:'message_start',message:{id:'msg_a',model,usage:{input_tokens:100,cache_creation_input_tokens:20,cache_read_input_tokens:30,output_tokens:0}}},{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'PRIVATE_REASONING_Прита'}},{type:'message_delta',usage:{output_tokens:40}},{type:'message_stop'}];
  const bytes=Buffer.from(events.map(value=>'data: '+JSON.stringify(value)+'\r\n\r\n').join(''));for(const byte of bytes)observer.push(Buffer.from([byte]));
  const result=observer.finish();assert.equal(result.usage.totalTokens,190);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_REASONING/);
  const incomplete=new ClaudeResponseUsage(model,true);incomplete.push(Buffer.from('data: '+JSON.stringify(events[0])+'\n\n'));assert.throws(()=>incomplete.finish(),{code:'provider_usage_unconfirmed'});
});
test('token counting uses only the fixed endpoint and count parameters; provider diagnostics stay private',async()=>{
  let request;
  const total=await countClaudeRequestTokens({...payload(),tools:[],thinking:{type:'adaptive'}},{headers:{authorization:'Bearer SYNTHETIC'},fetchImpl:async(url,options)=>{request={url,...options};return Response.json({input_tokens:42});}});
  assert.equal(total,42);assert.equal(request.url,'https://api.anthropic.com/v1/messages/count_tokens');assert.equal(request.redirect,'error');assert.equal(JSON.parse(request.body).max_tokens,undefined);assert.equal(JSON.parse(request.body).stream,undefined);
  await assert.rejects(countClaudeRequestTokens(payload(),{fetchImpl:async()=>new Response('PRIVATE_KEY_CANARY',{status:401})}),{code:'provider_token_count_unavailable'});
});
test('proxy checkpoints before a paid request and refuses another request when the budget is exhausted',async t=>{
  let countCalls=0,paid=0;const checkpoints=[],budget=new ClaudeRequestBudget({tokenBudget:2300,checkpoint:async value=>checkpoints.push(value)});
  const proxy=await listenClaudeApiProxy({localToken:'x'.repeat(40),apiKey:'SYNTHETIC',model,timeoutMs:10000,budget,fetchImpl:async(url,request)=>{
    if(url.endsWith('/count_tokens')){countCalls++;return Response.json({input_tokens:1000});}
    paid++;assert.equal(checkpoints.at(-1).requests.at(-1).status,'reserved');assert.equal(JSON.parse(request.body).max_tokens,276);
    return Response.json({id:'msg_paid',model,stop_reason:'end_turn',content:[{type:'text',text:'ok'}],usage:{input_tokens:1000,output_tokens:200}});
  }});t.after(()=>proxy.close());
  const send=text=>fetch(proxy.baseUrl+'/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':'x'.repeat(40),'anthropic-version':'2026-10-21'},body:JSON.stringify({...payload(),messages:[{role:'user',content:text}]})});
  assert.equal((await send('first')).status,200);assert.equal(budget.snapshot().tokensUsed,1200);assert.notEqual((await send('second')).status,200);assert.equal(paid,1);assert.equal(countCalls,2);
});
