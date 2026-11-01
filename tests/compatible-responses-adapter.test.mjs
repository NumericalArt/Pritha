import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {listenCompatibleAdapter,compatibleRequest} from '../scripts/openai-compatible/responses-adapter.mjs';
const model='vendor/model',token='a'.repeat(48),input={model,input:[{role:'user',content:'Привет'}],stream:true};
const terminal=(patch={})=>({id:'response_fixture',model,object:'response',status:'completed',output:[{type:'message',id:'message_fixture',role:'assistant',status:'completed',content:[{type:'output_text',text:'Готово 🐉',annotations:[]}]}],usage:{input_tokens:12,output_tokens:3,total_tokens:15},...patch});
const upstream=value=>new Response('data: '+JSON.stringify({type:'response.completed',response:value})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream','set-cookie':'PRIVATE_COOKIE'}});
const post=(adapter,body=input,headers={})=>fetch(adapter.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+token,...headers},body:JSON.stringify(body)});
async function fixture(t,options={}){const adapter=await listenCompatibleAdapter({connectorId:'openrouter',model,localToken:token,apiKey:'REAL_KEY_FIXTURE',timeoutMs:5000,...options});t.after(()=>adapter.close());return adapter;}

test('bridge pins host model, stateless history, tool boundary and effort without forwarding routing or media URLs',()=>{
  const policy={model,effort:'high',maxOutputTokens:100};
  assert.equal(compatibleRequest({...input,max_output_tokens:1000,reasoning:{effort:'low'}},policy).reasoning.effort,'high');
  assert.equal(compatibleRequest(input,policy).max_output_tokens,100);assert.equal(compatibleRequest(input,policy).store,false);
  assert.equal(compatibleRequest({...input,reasoning:{effort:'high'}},{model,effort:'default',reasoningControl:true}).reasoning,undefined);
  for(const patch of [{model:'wrong'},{store:true},{previous_response_id:'old'},{provider:{allow_fallbacks:true}},{models:['other']},{plugins:[{id:'web'}]},{tools:[{type:'web_search'}]},{input:[{type:'message',content:[{type:'input_image',image_url:'https://private.invalid'}]}]}])assert.throws(()=>compatibleRequest({...input,...patch},policy));
});

test('fixed OpenRouter origin receives only its key and attribution; request receipt precedes release of tool calls',async t=>{
  const seen=[],events=[];let counted=false;
  const adapter=await fixture(t,{beforeRequest:()=>events.push('admit'),onRequest:event=>{events.push('receipt');seen.push(event);counted=true;},fetchImpl:async(url,request)=>{
    events.push('dispatch');assert.equal(url,'https://openrouter.ai/api/v1/responses');assert.equal(request.headers.get('authorization'),'Bearer REAL_KEY_FIXTURE');assert.equal(request.headers.get('HTTP-Referer'),'https://github.com/NumericalArt/Pritha');assert.equal(request.headers.get('X-Title'),'Pritha Control Center');assert.equal(request.headers.get('cookie'),null);assert.equal(request.redirect,'error');
    return upstream(terminal({output:[{type:'function_call',id:'call_fixture',call_id:'call_fixture',name:'shell',arguments:'{"command":"pwd"}',status:'completed'}]}));}});
  const response=await post(adapter,input,{cookie:'HOST_COOKIE'}),body=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(counted,true);assert.match(body,/function_call/);assert.deepEqual(events,['admit','dispatch','receipt']);assert.equal(seen[0].usage.totalTokens,15);
  assert.doesNotMatch(body,/REAL_KEY_FIXTURE|HOST_COOKIE|PRIVATE_COOKIE/);
  const duplicate=await post(adapter);assert.equal(duplicate.status,409);assert.match(await duplicate.text(),/provider_request_uncertain/);assert.equal(seen.length,1);
});

test('capabilities reject browser origins, alternate routes, foreign models and untrusted upstream URLs before dispatch',async t=>{
  let calls=0;const adapter=await fixture(t,{fetchImpl:async()=>{calls++;return upstream(terminal());}});
  assert.equal((await post(adapter,input,{origin:'http://127.0.0.1',authorization:'Bearer '+token})).status,401);
  assert.equal((await fetch(adapter.baseUrl+'/responses?target=https://evil.invalid',{method:'POST',headers:{authorization:'Bearer '+token},body:'{}'})).status,404);
  assert.equal((await post(adapter,{...input,model:'wrong'})).status,400);assert.equal(calls,0);
  await assert.rejects(listenCompatibleAdapter({connectorId:'openrouter',model,localToken:token,apiKey:'key',baseUrl:'https://evil.invalid/v1'}),{code:'provider_adapter_configuration_invalid'});
});

test('Local adapter sends no credential to IPv6 loopback and cannot accept a cloud key or redirected upstream',async t=>{
  let calls=0;const adapter=await listenCompatibleAdapter({connectorId:'local',model,localToken:token,baseUrl:'http://[::1]:11434',timeoutMs:5000,fetchImpl:async(url,request)=>{calls++;assert.equal(url,'http://[::1]:11434/v1/responses');assert.equal(request.headers.get('authorization'),null);assert.equal(request.redirect,'error');return upstream(terminal());}});t.after(()=>adapter.close());
  assert.equal((await post(adapter)).status,200);assert.equal(calls,1);
  await assert.rejects(listenCompatibleAdapter({connectorId:'local',model,localToken:token,baseUrl:'http://127.0.0.1:1234',apiKey:'CLOUD_SECRET'}),{code:'provider_local_credentials_disallowed'});
});

test('unknown usage stays unknown, incomplete tools never execute, and provider errors contain no private upstream text',async t=>{
  for(const mode of ['no-usage','truncated','incomplete','wrong-model','http-error']){
    const receipts=[];const adapter=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async()=>mode==='http-error'?new Response('SECRET_PRIVATE_PROVIDER_ERROR',{status:429}):mode==='truncated'?new Response('data: {"type":"response.output_item.added","item":{"type":"function_call","name":"shell"}}\n\n',{headers:{'content-type':'text/event-stream'}}):upstream(terminal(mode==='no-usage'?{usage:undefined}:mode==='wrong-model'?{model:'wrong'}:{status:'incomplete',output:[{type:'function_call',id:'x',call_id:'x',name:'shell',arguments:'{'}]}))});
    const response=await post(adapter),body=await response.text();assert.equal(receipts.length,1);assert.doesNotMatch(body,/SECRET_PRIVATE_PROVIDER_ERROR/);
    if(mode==='no-usage'){assert.equal(receipts[0].usage,null);assert.equal(receipts[0].usageKnown,false);assert.match(body,/Готово/);}
    else{assert.match(body,/provider_/);assert.doesNotMatch(body,/"type":"function_call"/);}
  }
});

test('absolute deadline aborts a provider request once and preserves unknown accounting',async t=>{
  let calls=0;const receipts=[],adapter=await fixture(t,{timeoutMs:50,onRequest:event=>receipts.push(event),fetchImpl:async(_url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
  const response=await post(adapter);assert.match(await response.text(),/provider_timeout/);assert.equal(calls,1);assert.equal(receipts[0].usageKnown,false);
});

test('stock Codex namespace tools and resumed call history are projected without exposing unapproved tools',async t=>{
  const allowedTools=['mcp__pritha__read_file'],tools=[{type:'namespace',name:'mcp__pritha',tools:[{type:'function',name:'read_file',parameters:{type:'object'}},{type:'function',name:'injected_tool'}]},{type:'function',name:'request_user_input'}];
  const body={...input,tools,input:[{type:'function_call',namespace:'mcp__pritha',name:'read_file',call_id:'old',arguments:'{}'},{type:'function_call_output',call_id:'old',output:'previous'}],tool_choice:{type:'function',namespace:'mcp__pritha',name:'read_file'}};
  const adapter=await fixture(t,{allowedTools,fetchImpl:async(_url,request)=>{
    const sent=JSON.parse(request.body);assert.deepEqual(sent.tools.map(tool=>tool.name),allowedTools);assert.equal(sent.input[0].name,allowedTools[0]);assert.equal(sent.input[0].namespace,undefined);assert.deepEqual(sent.tool_choice,{type:'function',name:allowedTools[0]});
    return upstream(terminal({output:[{type:'function_call',id:'call_one',call_id:'one',name:allowedTools[0],arguments:'{}',status:'completed'}]}));}});
  const text=await (await post(adapter,body)).text();assert.match(text,/"namespace":"mcp__pritha"/);assert.match(text,/"name":"read_file"/);assert.doesNotMatch(text,/injected_tool/);
  assert.throws(()=>compatibleRequest({...body,input:[{type:'function_call',namespace:'other',name:'read_file'}]},{model,allowedTools}));
});

test('unknown tool calls and failed durable receipts never release executable calls',async t=>{
  for(const mode of ['unknown-tool','receipt-failed']){
    let receipts=0;
    const adapter=await fixture(t,{allowedTools:['mcp__pritha__read_file'],onRequest:()=>{receipts++;if(mode==='receipt-failed')throw new Error('PRIVATE_RECEIPT_FAILURE');},fetchImpl:async()=>upstream(terminal({output:[{type:'function_call',id:'call_one',call_id:'one',name:mode==='unknown-tool'?'unauthorized':'mcp__pritha__read_file',arguments:'{}',status:'completed'}]}))});
    const body=await (await post(adapter,{...input,tools:[{type:'function',name:'mcp__pritha__read_file',parameters:{type:'object'}}]})).text();
    assert.match(body,/provider_/);assert.doesNotMatch(body,/"type":"function_call"|PRIVATE_RECEIPT_FAILURE/);assert.equal(receipts,1);
    if(mode==='receipt-failed')assert.match(body,/provider_receipt_failed/);
  }
});

test('close waits for the interrupted upstream receipt and incomplete request bodies honor the absolute deadline',async t=>{
  let dispatched,release,receipts=0;const started=new Promise(resolve=>dispatched=resolve),receipt=new Promise(resolve=>release=resolve);
  const adapter=await fixture(t,{onRequest:async()=>{receipts++;await receipt;},fetchImpl:async(_url,{signal})=>{dispatched();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
  const request=post(adapter).catch(()=>null);await started;let closed=false;const closing=adapter.close().then(()=>{closed=true;});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(closed,false);assert.equal(receipts,1);release();await closing;await request;assert.equal(closed,true);
  let calls=0;const slow=await fixture(t,{timeoutMs:80,fetchImpl:async()=>{calls++;return upstream(terminal());}});
  const result=await new Promise((resolve,reject)=>{const request=httpRequest(slow.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+token,'content-length':'10000'}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));});request.on('error',reject);request.write('{');});
  assert.equal(result.status,504);assert.match(result.body,/provider_timeout/);assert.equal(calls,0);
});
