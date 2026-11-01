import test from 'node:test';
import assert from 'node:assert/strict';
import { createNeuralDeepAdapter, listenNeuralDeepAdapter, closeNeuralDeepAdapter } from '../scripts/neuraldeep/responses-adapter.mjs';
import { classifyNeuralDeepProviderError } from '../scripts/neuraldeep/provider-error.mjs';

const localToken='fixture_capability_with_at_least_32_characters';
const upstreamAuthorization='Bearer FIXTURE_PROVIDER_KEY_CANARY';
const terminal={type:'response.completed',response:{id:'r1',status:'completed',output:[{type:'message',id:'m1',role:'assistant',content:[{type:'output_text',text:'Finished'}]}],usage:{input_tokens:2,output_tokens:1}}};
const sse=event=>`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`;

test('real adapter requires a private capability and exact upstream origin before allocating a listener',()=>{
  assert.throws(()=>createNeuralDeepAdapter(),/provider_adapter_credentials_required/);
  assert.throws(()=>createNeuralDeepAdapter({localToken,upstreamAuthorization,upstreamOrigin:'https://unexpected.example'}),/provider_adapter_origin_invalid/);
});

test('loopback capability gates every billable endpoint and upstream keys never enter the child request',async()=>{
  const calls=[];
  const server=await listenNeuralDeepAdapter({port:0,localToken,upstreamAuthorization,fetchImpl:async(url,init)=>{
    calls.push({url:String(url),headers:[...init.headers]});
    return new Response(sse(terminal),{headers:{'content-type':'text/event-stream','set-cookie':'PRIVATE_COOKIE_CANARY','x-request-id':'PRIVATE_ID_CANARY'}});
  }});
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const [endpoint,headers,status] of [
      ['/v1/responses',{},401],['/v1/models',{},401],['/v1/limits',{authorization:`Bearer ${localToken}`},404],
      ['/v1/responses',{authorization:`Bearer ${localToken}`,origin:'http://hostile.example'},401],
    ]) {
      const response=await fetch(url+endpoint,{method:'POST',headers,body:'{}'});
      assert.equal(response.status,status);await response.text();
    }
    assert.equal(calls.length,0);
    const response=await fetch(url+'/v1/responses',{method:'POST',headers:{authorization:`Bearer ${localToken}`,cookie:'PRIVATE_COOKIE_CANARY','x-api-key':'FOREIGN_KEY_CANARY'},body:JSON.stringify({model:'qwen3.8',stream:true})});
    const result=await response.text();assert.equal(response.status,200);assert.match(result,/Finished/);
    assert.equal(calls.length,1);assert.equal(new Map(calls[0].headers).get('authorization'),upstreamAuthorization);
    assert.doesNotMatch(JSON.stringify(calls),/fixture_capability|FOREIGN_KEY_CANARY|PRIVATE_COOKIE_CANARY/);
    assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('x-request-id'),null);
    assert.doesNotMatch(result,/CANARY/);
  } finally {await closeNeuralDeepAdapter(server);}
});

test('untrusted error fields, retry headers and transport exceptions cannot disclose raw details',async()=>{
  for(const outcome of ['http','stream','exception']) {
    const observed=[];let calls=0;
    const server=await listenNeuralDeepAdapter({port:0,localToken,upstreamAuthorization,onRequest:event=>observed.push(event),fetchImpl:async()=>{
      calls++;
      if(outcome==='exception')throw Object.assign(new Error('PRIVATE_DETAIL_CANARY'),{code:'PRIVATE_CODE_CANARY',detail:'PRIVATE_TRACE_CANARY'});
      if(outcome==='stream')return new Response(sse({type:'response.failed',response:{id:'r1',status:'failed',error:{message:'PRIVATE_DETAIL_CANARY',code:'PRIVATE_CODE_CANARY'},output:[]}}),{headers:{'content-type':'text/event-stream'}});
      return new Response(JSON.stringify({error:{message:'PRIVATE_DETAIL_CANARY',code:'PRIVATE_CODE_CANARY'}}),{status:503,headers:{'retry-after':'PRIVATE_HEADER_CANARY'}});
    }});
    try {
      const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',headers:{authorization:`Bearer ${localToken}`},body:'{}'});
      const result=await response.text();assert.doesNotMatch(result+JSON.stringify(observed)+JSON.stringify([...response.headers]),/CANARY/);
      assert.equal(calls,1,'uncertain dispatch cannot be silently retried');
      assert.ok(observed[0].error);assert.equal(observed[0].usage,null);
    } finally {await closeNeuralDeepAdapter(server);}
  }
  assert.doesNotMatch(JSON.stringify(classifyNeuralDeepProviderError({status:401,payload:{error:{code:'PRIVATE_CODE_CANARY'}},retryAfter:'PRIVATE_HEADER_CANARY'})),/CANARY/);
});
