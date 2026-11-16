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
    const snapshots=[];const budget=new ResponsesRequestBudget({tokenBudget:50000,checkpoint:async value=>snapshots.push(value)});await assert.rejects(budget.begin({...payload(),...patch}),{code:'provider_budget_input_unbounded'});assert.equal(snapshots.length,1);assert.deepEqual(snapshots[0].requests,[]);assert.equal(snapshots[0].errorCode,'provider_budget_input_unbounded');
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
test('a budget refusal is recorded before a reservation can authorize a request',async()=>{
  const snapshots=[],budget=new ResponsesRequestBudget({tokenBudget:100,checkpoint:async value=>snapshots.push(value)});
  await assert.rejects(budget.begin(payload()),{code:'provider_budget_exhausted'});
  assert.equal(snapshots.length,1);assert.deepEqual(snapshots[0].requests,[]);assert.equal(snapshots[0].usageKnown,true);assert.equal(snapshots[0].tokensUsed,0);
  assert.equal(snapshots[0].admissionFailure.upstreamAttempted,false);assert.equal(snapshots[0].admissionFailure.remainingTokens,100);assert.ok(snapshots[0].admissionFailure.shortfallTokens>0);
});
test('a conservative byte estimate does not masquerade as a measured model context limit',async()=>{
  const snapshots=[],budget=new ResponsesRequestBudget({tokenBudget:50000,contextTokens:9000,checkpoint:async value=>snapshots.push(value)});
  const request={...payload(),input:'ordinary words '.repeat(1000),max_output_tokens:1024};
  await budget.begin(request,{requestHash:'original'});
  const row=snapshots[0].requests[0];assert.ok(row.contextEstimate.estimatedTokens>9000);assert.equal(row.contextEstimate.enforcement,'advisory');assert.ok(row.reservedTokens<=50000);
  await budget.record(event({usage:{input_tokens:2400,output_tokens:12,total_tokens:2412}}));
  assert.equal(budget.snapshot().tokensUsed,2412);assert.equal(budget.snapshot().errorCode,null);
});
test('a later reservation refusal durably preserves measured spend and the unspent shortfall',async()=>{
  const snapshots=[],budget=new ResponsesRequestBudget({tokenBudget:15000,checkpoint:async value=>snapshots.push(value)});
  await budget.begin(payload(),{requestHash:'original'});await budget.record(event());
  await assert.rejects(budget.begin({...payload(),input:'x'.repeat(14000)},{requestHash:'too-large'}),{code:'provider_budget_exhausted'});
  const saved=snapshots.at(-1);assert.equal(saved.errorCode,'provider_budget_exhausted');assert.equal(saved.tokensUsed,400);assert.equal(saved.requests.length,1);assert.equal(saved.admissionFailure.remainingTokens,14600);
  assert.equal(saved.admissionFailure.shortfallTokens,saved.admissionFailure.requiredTokens-14600);
  const failed=new ResponsesRequestBudget({tokenBudget:100,checkpoint:async()=>{throw Error('disk full');}});
  await assert.rejects(failed.begin(payload()),{code:'provider_budget_checkpoint_failed'});
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


test('durable response diagnostics retain only structural counts and preserve measured usage',async()=>{
  const snapshots=[],budget=new ResponsesRequestBudget({tokenBudget:50000,checkpoint:async value=>snapshots.push(value)});
  await budget.begin(payload(),{requestHash:'original'});
  const secret='PRIVATE_PROVIDER_TEXT_MUST_NOT_PERSIST';
  await budget.record(event({responseSummary:{version:1,status:'completed',outputItems:{message:0,reasoning:1,function_call:0,custom_tool_call:0,local_shell_call:0,other:0,private:secret},terminalPublicText:false,incompleteReason:null,outputTokens:55,outputLimit:16384,outputLimitReached:false,reasoningTokens:32,id:secret,text:secret,reasoning:secret}}));
  const snapshot=budget.snapshot(),diagnostic=snapshot.requests[0].responseDiagnostics;
  assert.equal(snapshot.tokensUsed,400);assert.equal(snapshot.usageKnown,true);
  assert.equal(diagnostic.outputTokens,55);assert.equal(diagnostic.reasoningTokens,32);assert.equal(diagnostic.outputItems.reasoning,1);assert.equal(diagnostic.terminalPublicText,false);
  assert(!JSON.stringify(snapshots).includes(secret));assert.equal(diagnostic.id,undefined);assert.equal(diagnostic.outputItems.private,undefined);
});

// A stateless Responses client (Codex CLI 0.153.0, checked 2026-11-16) resends the same
// instructions, tools and earlier items and appends the model's call and its output.
const conversation=(turns,{instructions='Build the approved agent.',pad=4000,output=200}={})=>({model:'vendor/model',instructions,tools:[{type:'function',name:'shell',parameters:{type:'object'}}],max_output_tokens:16384,
  input:[{type:'message',role:'user',content:[{type:'input_text',text:'Implement the approved result. '+'context '.repeat(pad)}]},
    ...Array.from({length:turns},(_,i)=>[{type:'function_call',call_id:'call_'+i,name:'shell',arguments:'{"command":["ls"]}'},{type:'function_call_output',call_id:'call_'+i,output:'file '.repeat(output)+i}]).flat()]});
const measured=(hash,input,output=200)=>({requestHash:hash,upstreamAttempted:true,usage:{input_tokens:input,output_tokens:output,total_tokens:input+output}});

test('a request that extends the measured previous one reserves its measured tokens plus only the new bytes',async()=>{
  const snapshots=[],budget=new ResponsesRequestBudget({tokenBudget:400000,checkpoint:async value=>snapshots.push(value)});
  const first=conversation(0),firstBytes=Buffer.byteLength(JSON.stringify(first));
  await budget.begin(first,{requestHash:'r1'});
  let row=budget.snapshot().requests[0];assert.equal(row.estimateBasis,'utf8-bytes');assert.equal(row.inputEstimate,firstBytes);
  await budget.record(measured('r1',7000));
  const second=conversation(1),newItems=Buffer.byteLength(JSON.stringify(second.input.slice(1)));
  await budget.begin(second,{requestHash:'r2'});row=budget.snapshot().requests[1];
  assert.equal(row.estimateBasis,'measured-prefix');assert.deepEqual(row.measuredPrefix,{sequence:1,inputTokens:7000,newItemBytes:newItems});
  assert.equal(row.inputEstimate,7000+newItems);assert.equal(row.reservedTokens,7000+newItems+8192+row.maxOutputTokens);
  assert.ok(row.inputEstimate<Buffer.byteLength(JSON.stringify(second))/2,'the measured prefix replaces most of the byte estimate');
  await budget.record(measured('r2',7400));
  // A local refusal that never reached the provider keeps the last measured base.
  await budget.begin(conversation(2),{requestHash:'r3'});await budget.record({requestHash:'r3',upstreamAttempted:false,usage:null});
  await budget.begin(conversation(2),{requestHash:'r4'});row=budget.snapshot().requests[3];
  assert.equal(row.estimateBasis,'measured-prefix');assert.equal(row.measuredPrefix.sequence,2);
});

test('changed instructions, tools or earlier items fall back to the full byte reservation',async()=>{
  const base=conversation(1);
  const changes={instructions:{...conversation(2),instructions:'Something else.'},tools:{...conversation(2),tools:[]},
    history:{...conversation(2),input:[{...base.input[0],content:[{type:'input_text',text:'A compacted summary.'}]},...conversation(2).input.slice(1)]},
    text:{...conversation(2),input:'one string input'}};
  for(const [name,next] of Object.entries(changes)){
    const budget=new ResponsesRequestBudget({tokenBudget:400000,checkpoint:async()=>{}});
    await budget.begin(base,{requestHash:'r1'});await budget.record(measured('r1',7000));
    await budget.begin(next,{requestHash:'r2'});const row=budget.snapshot().requests[1];
    assert.equal(row.estimateBasis,'utf8-bytes',name);assert.equal(row.inputEstimate,Buffer.byteLength(JSON.stringify(next)),name);assert.equal(row.measuredPrefix,undefined,name);
  }
});

test('usage above a measured-prefix reservation still stops the run as an overshoot',async()=>{
  const budget=new ResponsesRequestBudget({tokenBudget:400000,checkpoint:async()=>{}});
  await budget.begin(conversation(0),{requestHash:'r1'});await budget.record(measured('r1',7000));
  await budget.begin(conversation(1),{requestHash:'r2'});const reserved=budget.snapshot().requests[1].reservedTokens;
  await assert.rejects(budget.record(measured('r2',reserved,10)),{code:'provider_budget_overshoot'});
  await assert.rejects(budget.begin(conversation(2),{requestHash:'r3'}));
});

test('a long build reaches most of its authorized budget instead of pausing at half (Cork Label replay)',async()=>{
  // Measured 2026-11-16: kimi requests carried about 4.5 UTF-8 bytes per input token.
  const run=async prefixAware=>{
    const budget=new ResponsesRequestBudget({tokenBudget:400000,checkpoint:async()=>{}});let turns=0;
    for(;turns<200;turns++){
      // About 15K tokens at the start and 3K more per step, as in Cork Label's first iteration.
      const request=conversation(turns,{pad:8400,output:2700});
      if(!prefixAware)budget.measuredPrefix=null;
      try{await budget.begin(request,{requestHash:'t'+turns});}catch(error){assert.equal(error.code,'provider_budget_exhausted');break;}
      await budget.record(measured('t'+turns,Math.ceil(Buffer.byteLength(JSON.stringify(request))/4.5),600));
    }
    return budget.snapshot().tokensUsed;
  };
  const before=await run(false),after=await run(true);
  // Byte reservations paused the replay at 249,658 with 150K tokens left (Cork Label: 206,125 with 194K left).
  assert.ok(before<0.65*400000,'bytes alone pause early: '+before);
  assert.ok(after>0.8*400000,'the measured prefix uses most of the budget: '+after);
});
