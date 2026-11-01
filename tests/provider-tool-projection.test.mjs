import test from 'node:test';
import assert from 'node:assert/strict';
import {projectProviderToolRequest,wireCall} from '../scripts/lib/provider-tool-projection.mjs';
import {listenNeuralDeepAdapter,closeNeuralDeepAdapter} from '../scripts/neuraldeep/responses-adapter.mjs';

const model='qwen3.8-27b',token='t'.repeat(48),allowedTools=['mcp__pritha__read_file','mcp__pritha__list_files'];
const namespace=name=>({type:'namespace',name:'mcp__pritha',tools:[{type:'function',name,parameters:{type:'object'}}]});
const call=name=>({type:'function_call',id:'item_fixture',call_id:'call_fixture',name,arguments:'{}',status:'completed'});
const terminal=(output,patch={})=>({id:'response_fixture',model,status:'completed',output,usage:{input_tokens:4,output_tokens:2},...patch});
const response=(value,format)=>new Response(format==='sse'?'data: '+JSON.stringify({type:'response.completed',response:value})+'\n\ndata: [DONE]\n\n':JSON.stringify(value),{headers:{'content-type':format==='sse'?'text/event-stream':'application/json'}});
async function fixture(t,options={}){
  const server=await listenNeuralDeepAdapter({port:0,localToken:token,upstreamAuthorization:'Bearer SYNTHETIC_KEY',providerRetryAttempts:3,allowedTools,...options});
  t.after(()=>closeNeuralDeepAdapter(server));
  return body=>fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({model,stream:true,tools:[namespace('read_file')],...body})});
}

test('only approved host tools are projected; invalid historic calls preserve the caller input',()=>{
  const input={tools:[namespace('read_file'),{type:'function',name:'request_user_input'}],
    input:[{type:'function_call',namespace:'mcp__pritha',name:'read_file',call_id:'old',arguments:'{}'},{type:'function_call_output',call_id:'old',output:'original history'}],
    tool_choice:{type:'function',namespace:'mcp__pritha',name:'read_file'}};
  const original=structuredClone(input),projected=projectProviderToolRequest(input,allowedTools);
  assert.deepEqual(input,original);assert.deepEqual(projected.tools.map(tool=>tool.name),[allowedTools[0]]);
  assert.equal(projected.payload.input[0].name,allowedTools[0]);assert.equal(projected.payload.input[1].output,'original history');
  assert.deepEqual(projected.payload.tool_choice,{type:'function',name:allowedTools[0]});
  assert.deepEqual(wireCall(call(allowedTools[0]),projected.map),{...call('read_file'),namespace:'mcp__pritha'});
  const legacy={...input,input:[{type:'function_call',namespace:'legacy',name:'shell',arguments:'private historical input'}]};
  const saved=structuredClone(legacy);assert.throws(()=>projectProviderToolRequest(legacy,allowedTools),{code:'provider_tool_identity_mismatch'});
  assert.deepEqual(legacy,saved);assert.equal(projectProviderToolRequest({tools:input.tools},[]).payload.tool_choice,'none');
});

test('NeuralDeep projects initial and resumed calls without exposing builtin tools in JSON and SSE',async t=>{
  for(const format of ['json','sse']){
    const receipts=[];
    const post=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async(_url,request)=>{
      const payload=JSON.parse(request.body);assert.deepEqual(payload.tools.map(tool=>tool.name),[allowedTools[0]]);
      assert.equal(payload.input[0].name,allowedTools[0]);assert.equal(payload.input[0].namespace,undefined);
      assert.equal(payload.tool_choice.name,allowedTools[0]);return response(terminal([call(allowedTools[0])]),format);
    }});
    const result=await post({tools:[namespace('read_file'),{type:'function',name:'request_user_input'}],
      input:[{type:'function_call',namespace:'mcp__pritha',name:'read_file',call_id:'old',arguments:'{}'},{type:'function_call_output',call_id:'old',output:'previous result'}],
      tool_choice:{type:'function',namespace:'mcp__pritha',name:'read_file'}});
    const body=await result.text();assert.equal(result.status,200);assert.match(body,/"namespace":"mcp__pritha"/);
    assert.match(body,/"name":"read_file"/);assert.doesNotMatch(body,/request_user_input/);
    assert.equal(receipts.length,1);assert.equal(receipts[0].usage.totalTokens,6);
  }
});

test('foreign namespaces, explicit builtin choices and unsupported definitions are refused before admission',async t=>{
  let claims=0,calls=0;const receipts=[];
  const post=await fixture(t,{beforeResponsesDispatch:()=>claims++,onRequest:event=>receipts.push(event),fetchImpl:async()=>{calls++;throw Error('not reached');}});
  for(const patch of [
    {tools:[{type:'namespace',name:'foreign',tools:[]}]},
    {tools:[{type:'web_search'}]},
    {tools:[namespace('read_file'),namespace('read_file')]},
    {tool_choice:{type:'function',name:'request_user_input'}},
    {input:[{type:'function_call',namespace:'foreign',name:'read_file',arguments:'PRIVATE_HISTORY'}]},
  ]){
    const result=await post(patch),body=await result.text();assert.equal(result.status,400);
    assert.match(body,/provider_tools_unsupported|provider_tool_identity_mismatch/);assert.doesNotMatch(body,/PRIVATE_HISTORY|foreign/);
  }
  assert.equal(claims,0);assert.equal(calls,0);assert.equal(receipts.length,5);
  assert.ok(receipts.every(item=>item.error.class==='input' && item.upstreamAttempted===false));
});

test('unapproved returned calls and model drift never release executable calls or retry NeuralDeep',async t=>{
  for(const format of ['json','sse'])for(const mode of ['builtin','namespace','custom','shell','model']){
    let calls=0;const receipts=[];
    const output=mode==='custom'?{...call(allowedTools[0]),type:'custom_tool_call'}:mode==='shell'?{...call(allowedTools[0]),type:'local_shell_call'}:
      {...call(mode==='builtin'?'request_user_input':allowedTools[0]),...(mode==='namespace'?{namespace:'foreign'}:{})};
    const post=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async()=>{calls++;return response(terminal([output],mode==='model'?{model:'foreign-model'}:{}),format);}});
    const result=await post(),body=await result.text();
    assert.match(body,mode==='model'?/neuraldeep_model_identity_mismatch/:/provider_tool_identity_mismatch/);
    assert.doesNotMatch(body,/"type":"(?:function_call|custom_tool_call|local_shell_call)"/);
    assert.equal(calls,1);assert.equal(receipts.length,1);assert.equal(receipts[0].error.class,'input');
  }
});

test('concurrent NeuralDeep requests retain separate namespace maps',async t=>{
  const both=Promise.withResolvers();let count=0;
  const post=await fixture(t,{fetchImpl:async(_url,request)=>{
    const payload=JSON.parse(request.body);if(++count===2)both.resolve();await both.promise;
    return response(terminal([call(payload.tools[0].name)]),'sse');
  }});
  const results=await Promise.all(['read_file','list_files'].map(async name=>{
    const result=await post({tools:[namespace(name)]});return {name,status:result.status,body:await result.text()};
  }));
  for(const result of results){assert.equal(result.status,200);assert.ok(result.body.includes('"name":"'+result.name+'"'));}
});

test('failed durable receipts never release a NeuralDeep tool in JSON or SSE',async t=>{
  for(const format of ['json','sse']){
    let calls=0,receipts=0;
    const post=await fixture(t,{onRequest:()=>{receipts++;throw Error('PRIVATE_RECEIPT_ERROR');},
      fetchImpl:async()=>{calls++;return response(terminal([call(allowedTools[0])]),format);}});
    const result=await post(),body=await result.text();assert.match(body,/provider_receipt_failed/);
    assert.doesNotMatch(body,/"type":"function_call"|PRIVATE_RECEIPT_ERROR/);assert.equal(calls,1);assert.equal(receipts,1);
  }
});
