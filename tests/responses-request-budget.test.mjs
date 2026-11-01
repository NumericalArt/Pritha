import test from 'node:test';
import assert from 'node:assert/strict';
import {ResponsesRequestBudget} from '../scripts/lib/responses-request-budget.mjs';
import {listenCompatibleAdapter} from '../scripts/openai-compatible/responses-adapter.mjs';
import {listenNeuralDeepAdapter,closeNeuralDeepAdapter} from '../scripts/neuraldeep/responses-adapter.mjs';
const payload=()=>({model:'vendor/model',input:[{role:'user',content:'Implement the approved result.'}],max_output_tokens:16384,tools:[]});
const event=(extra={})=>({requestHash:'original',upstreamAttempted:true,usage:{input_tokens:300,output_tokens:100,total_tokens:400},...extra});

async function adapterFor(connectorId,budget,fetchImpl){
  const options={model:'vendor/model',localToken:'x'.repeat(32),allowedTools:['mcp__pritha__read_file'],onRequest:event=>budget.record(event),fetchImpl};
  if(connectorId==='openrouter')return listenCompatibleAdapter({...options,connectorId,apiKey:'synthetic',prepareRequest:(payload,context)=>budget.begin(payload,context)});
  const server=await listenNeuralDeepAdapter({...options,port:0,upstreamAuthorization:'Bearer synthetic',responsesOnly:true,prepareResponsesRequest:(payload,context)=>budget.begin(payload,context)});
  return {baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',close:()=>closeNeuralDeepAdapter(server)};
}

test('host reservations cap output before dispatch and measured receipts admit later requests',async()=>{
  const snapshots=[],budget=new ResponsesRequestBudget({tokenBudget:12000,checkpoint:async value=>snapshots.push(value)});
  const first=await budget.begin(payload(),{requestHash:'first'});assert.ok(first.max_output_tokens<16384);assert.equal(snapshots[0].usageKnown,false);assert.ok(snapshots[0].requests[0].reservedTokens<=12000);
  await budget.record(event({requestHash:'first'}));assert.equal(budget.snapshot().tokensUsed,400);
  await budget.begin({...payload(),input:'Second bounded request'},{requestHash:'second'});await budget.record(event({requestHash:'second',upstreamAttempted:false,usage:null}));assert.equal(budget.snapshot().tokensUsed,400);
});
test('media, remote tools and stateful history cannot use a text-only reservation',async()=>{
  for(const patch of [{previous_response_id:'hidden'},{conversation:'hidden'},{input:[{role:'user',content:[{type:'input_image',image_url:'https://example.com/image'}]}]},{tools:[{type:'web_search'}]},{input:[{type:'reasoning',encrypted_content:'opaque'}]}]){
    let checkpoints=0;const budget=new ResponsesRequestBudget({tokenBudget:50000,checkpoint:async()=>checkpoints++});await assert.rejects(budget.begin({...payload(),...patch}),{code:'provider_budget_input_unbounded'});assert.equal(checkpoints,0);
  }
});
test('missing usage, duplicate requests, overshoot and durable-write failures close admission',async()=>{
  for(const mode of ['unknown','overshoot','checkpoint','duplicate']){
    let saved=0;const budget=new ResponsesRequestBudget({tokenBudget:15000,checkpoint:async()=>{if(++saved===2 && mode==='checkpoint')throw Error('write failed');}});
    await budget.begin(payload(),{requestHash:'original'});
    const receipt=mode==='unknown'?event({usage:null}):mode==='overshoot'?event({usage:{input_tokens:20000,output_tokens:10,total_tokens:20010}}):event();
    if(mode==='duplicate'){await budget.record(receipt);await assert.rejects(budget.begin(payload(),{requestHash:'original'}),{code:'provider_request_uncertain'});}
    else await assert.rejects(budget.record(receipt),{code:mode==='unknown'?'provider_usage_unconfirmed':mode==='overshoot'?'provider_budget_overshoot':'provider_budget_checkpoint_failed'});
    await assert.rejects(budget.begin({...payload(),input:'Do not repeat the ambiguous request'}));
  }
});
test('budget and model context refusals occur before a reservation can authorize a request',async()=>{
  for(const options of [{tokenBudget:100},{tokenBudget:50000,contextTokens:9000}]){
    let writes=0;const budget=new ResponsesRequestBudget({...options,checkpoint:async()=>writes++});await assert.rejects(budget.begin(payload()),{code:options.contextTokens?'provider_budget_model_context':'provider_budget_exhausted'});assert.equal(writes,0);
  }
});
for(const connectorId of ['neuraldeep','openrouter'])test(connectorId+': adapter holds completed tool output until async usage accounting is durable',{timeout:5000},async()=>{
  let release,started;const ready=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve),budget=new ResponsesRequestBudget({tokenBudget:50000,checkpoint:async value=>{if(value.usageKnown){started();await gate;}}});
  const adapter=await adapterFor(connectorId,budget,async()=>Response.json({id:'r1',model:'vendor/model',status:'completed',output:[{type:'function_call',id:'c1',call_id:'c1',name:'mcp__pritha__read_file',arguments:'{"path":"README.md"}',status:'completed'}],usage:{input_tokens:100,output_tokens:20,total_tokens:120}}));
  try{
    const request={...payload(),tools:[{type:'function',name:'mcp__pritha__read_file',parameters:{type:'object',properties:{path:{type:'string'}}}}]};
    let delivered=false;const response=fetch(adapter.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+'x'.repeat(32),'Content-Type':'application/json'},body:JSON.stringify(request)}).then(response=>response.text()).then(text=>{delivered=true;return text;});
    await ready;assert.equal(delivered,false);release();assert.match(await response,/completed/);assert.equal(budget.snapshot().tokensUsed,120);
  }finally{release();await adapter.close();}
});

for(const connectorId of ['neuraldeep','openrouter'])test(connectorId+': ambiguous network failure records unknown usage and never repeats',{timeout:5000},async()=>{
  let requests=0;const budget=new ResponsesRequestBudget({tokenBudget:50000,checkpoint:async()=>{}}),adapter=await adapterFor(connectorId,budget,async()=>{requests++;throw Error('synthetic disconnect');});
  try{const send=()=>fetch(adapter.baseUrl+'/responses',{method:'POST',headers:{Authorization:'Bearer '+'x'.repeat(32),'Content-Type':'application/json'},body:JSON.stringify(payload())});
    await (await send()).text();await (await send()).text();assert.equal(requests,1);assert.equal(budget.snapshot().usageKnown,false);assert.equal(budget.snapshot().requests[0].status,'unknown');
  }finally{await adapter.close();}
});

test('a rejected overlapping request cannot settle a different reservation as zero',async()=>{
  const budget=new ResponsesRequestBudget({tokenBudget:50000,checkpoint:async()=>{}});await budget.begin(payload(),{requestHash:'first'});
  for(const requestHash of [null,'second'])await assert.rejects(budget.record({requestHash,upstreamAttempted:false}),{code:'provider_usage_conflict'});
  assert.equal(budget.snapshot().requests[0].status,'reserved');await budget.record(event({requestHash:'first'}));assert.equal(budget.snapshot().tokensUsed,400);
});
