import test from 'node:test';
import assert from 'node:assert/strict';
import {projectProviderToolRequest,wireCall} from '../scripts/lib/provider-tool-projection.mjs';
import {listenNeuralDeepAdapter,closeNeuralDeepAdapter} from '../scripts/neuraldeep/responses-adapter.mjs';
import {PROVIDER_FACTORY_TOOLS} from '../scripts/lib/provider-factory-tools.mjs';

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
  assert.deepEqual(wireCall({...call(allowedTools[0]),namespace:null},projected.map),{...call('read_file'),namespace:'mcp__pritha'});
  const legacy={...input,input:[{type:'function_call',namespace:'legacy',name:'shell',arguments:'private historical input'}]};
  const saved=structuredClone(legacy);assert.throws(()=>projectProviderToolRequest(legacy,allowedTools),{code:'provider_tool_identity_mismatch'});
  assert.deepEqual(legacy,saved);assert.equal(projectProviderToolRequest({tools:input.tools},[]).payload.tool_choice,'none');
});

test('NeuralDeep receives a required delivery blocker answer and returns it intact through the MCP projection',async t=>{
  const tool=PROVIDER_FACTORY_TOOLS.find(row=>row.name==='factory_delivery_resume');
  for(const format of ['json','sse']){
    const name='mcp__pritha__factory_delivery_resume',args={operation_id:'resume-reviewed-blocker',answer:'retry-after-upgrade'};
    const post=await fixture(t,{allowedTools:[name],fetchImpl:async(_url,request)=>{
      const payload=JSON.parse(request.body),parameters=payload.tools[0].parameters;
      assert.ok(parameters.required.includes('answer'));assert.equal(parameters.properties.answer.type,'string');assert.equal(parameters.properties.answer.minLength,1);
      return response(terminal([{...call(name),arguments:JSON.stringify(args)}]),format);
    }});
    const result=await post({tools:[{type:'namespace',name:'mcp__pritha',tools:[{type:'function',name:tool.name,description:tool.description,parameters:tool.inputSchema}]}]});
    assert.equal(result.status,200);const body=await result.text();
    const value=format==='json'?JSON.parse(body):body.split('\n').filter(line=>line.startsWith('data: ') && line!=='data: [DONE]').map(line=>JSON.parse(line.slice(6))).find(event=>event.type==='response.completed').response;
    assert.equal(value.output[0].namespace,'mcp__pritha');assert.equal(value.output[0].name,tool.name);assert.deepEqual(JSON.parse(value.output[0].arguments),args);
  }
});

test('native compaction preserves authorized historical calls without granting current tools',()=>{
  for(const tools of [undefined,[]]){
    const input={tools,input:[{...call('read_file'),namespace:'mcp__pritha'},{type:'function_call_output',call_id:'call_fixture',output:'previous result'}],tool_choice:'auto'};
    const original=structuredClone(input),projected=projectProviderToolRequest(input,allowedTools);
    assert.deepEqual(input,original);assert.deepEqual(projected.tools,[]);assert.equal(projected.map.size,0);assert.equal(projected.payload.tool_choice,'none');
    assert.deepEqual(projected.payload.input,[call(allowedTools[0]),original.input[1]]);
    assert.throws(()=>wireCall(call(allowedTools[0]),projected.map),{code:'provider_tool_identity_mismatch'});
    for(const denied of [{...call('read_file'),namespace:'foreign'},{...call('run_command'),namespace:'mcp__pritha'},{...call('pritha__read_file'),namespace:'mcp'}])
      assert.throws(()=>projectProviderToolRequest({...input,input:[denied]},allowedTools),{code:'provider_tool_identity_mismatch'});
  }
});

test('NeuralDeep compaction and subsequent tool turn use distinct execution maps and measured receipts',async t=>{
  for(const format of ['json','sse']){
    const receipts=[];let calls=0;
    const post=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async(_url,request)=>{
      calls++;const payload=JSON.parse(request.body);assert.equal(payload.input[0].name,allowedTools[0]);assert.equal(payload.input[0].namespace,undefined);
      if(!payload.tools.length){assert.equal(payload.tool_choice,'none');return response(terminal([{type:'message',id:'summary_fixture',role:'assistant',content:[{type:'output_text',text:'Preserved summary'}]}]),format);}
      assert.deepEqual(payload.tools.map(tool=>tool.name),[allowedTools[0]]);return response(terminal([call(allowedTools[0])]),format);
    }});
    const input=[{...call('read_file'),namespace:'mcp__pritha'},{type:'function_call_output',call_id:'call_fixture',output:'original'}];
    const compact=await post({tools:[],input}),summary=await compact.text();assert.equal(compact.status,200);assert.match(summary,/Preserved summary/);assert.doesNotMatch(summary,/"type":"function_call"/);
    const resumed=await post({input}),body=await resumed.text();assert.equal(resumed.status,200);assert.match(body,/"namespace":"mcp__pritha"/);assert.match(body,/"name":"read_file"/);
    assert.equal(calls,2);assert.equal(receipts.length,2);assert.ok(receipts.every(r=>r.usage.totalTokens===6&&!r.error));
  }
});

test('a tool-free compaction response cannot revive even an otherwise host-allowed tool',async t=>{
  for(const format of ['json','sse']){
    const post=await fixture(t,{fetchImpl:async()=>response(terminal([call(allowedTools[0])]),format)});
    const result=await post({tools:[],input:[{...call('read_file'),namespace:'mcp__pritha'}]}),body=await result.text();
    assert.match(body,/provider_tool_identity_mismatch/);assert.doesNotMatch(body,/"type":"function_call"/);
  }
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

const metadataPrelude=()=>({type:'response.created',response:{id:'response_fixture',model:'qwen3.8-flash-next',status:'in_progress',output:[]}});
const sse=event=>'data: '+JSON.stringify(event)+'\n\n';

test('streaming tool placeholders are held until the complete declared identity and durable receipt arrive',async t=>{
  for(const name of [undefined,null,'']){
    const receipts=[];
    const post=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async()=>new Response(
      sse({type:'response.output_item.added',output_index:0,item:{...call(name),status:'in_progress',arguments:''}})
      +sse({type:'response.completed',response:terminal([call(allowedTools[0])])})+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})});
    const result=await post(),body=await result.text();assert.equal(result.status,200);assert.match(body,/"name":"read_file"/);
    assert.equal(receipts.length,1);assert.equal(receipts[0].usage.totalTokens,6);assert.equal(receipts[0].error,null);
  }
});
test('complete qualified namespace calls resolve exactly; unknown complete calls remain refused and billed',async t=>{
  for(const good of [true,false]){
    const receipts=[];
    const post=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async()=>response(terminal([{...call(good?'read_file':'PRIVATE_FOREIGN_TOOL'),namespace:'mcp__pritha'}]),'sse')});
    const result=await post(),body=await result.text();assert.equal(result.status,good?200:502);
    assert.equal(receipts[0].usage.totalTokens,6);
    if(!good){assert.deepEqual(receipts[0].toolDiagnostic,{phase:'response-complete',reason:'undeclared',toolCount:1});assert.doesNotMatch(JSON.stringify(receipts),/PRIVATE_FOREIGN_TOOL/);assert.doesNotMatch(body,/"type":"function_call"/);}
  }
});

test('provisional NeuralDeep model metadata holds all output until exact terminal identity and accounting pass',async t=>{
  const started=Promise.withResolvers(),finish=Promise.withResolvers(),receipts=[];
  let released=false;
  const post=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async()=>new Response(new ReadableStream({async start(controller){
    controller.enqueue(new TextEncoder().encode(sse(metadataPrelude())));started.resolve();await finish.promise;
    controller.enqueue(new TextEncoder().encode(sse({type:'response.completed',response:terminal([call(allowedTools[0])])})+'data: [DONE]\n\n'));controller.close();
  }}),{headers:{'content-type':'text/event-stream'}})});
  const pending=post().then(value=>{released=true;return value;});await started.promise;
  try{await new Promise(resolve=>setTimeout(resolve,50));assert.equal(released,false);}finally{finish.resolve();}
  const result=await pending,body=await result.text();assert.equal(result.status,200);
  assert.doesNotMatch(body,/qwen3\.8-flash-next/);assert.match(body,/"model":"qwen3.8-27b"/);assert.match(body,/"name":"read_file"/);
  assert.equal(receipts.length,1);assert.equal(receipts[0].error,null);assert.equal(receipts[0].usage.totalTokens,6);
});

test('quarantined NeuralDeep metadata never permits wrong or absent terminal identity, truncated streams, foreign tools or failed accounting',async t=>{
  for(const mode of ['wrong-model','missing-model','truncated','foreign-tool','receipt']){
    const completed=terminal([call(mode==='foreign-tool'?'request_user_input':allowedTools[0])]);
    if(mode==='wrong-model')completed.model='foreign-model';if(mode==='missing-model')delete completed.model;
    const post=await fixture(t,{onRequest:()=>{if(mode==='receipt')throw Error('PRIVATE_RECEIPT_ERROR');},fetchImpl:async()=>new Response(
      sse(metadataPrelude())+(mode==='truncated'?'':sse({type:'response.completed',response:completed})+'data: [DONE]\n\n'),{headers:{'content-type':'text/event-stream'}})});
    const result=await post(),body=await result.text();assert.equal(result.status,mode==='receipt'?503:502);
    assert.doesNotMatch(body,/"type":"function_call"|"type":"response.created"|qwen3\.8-flash-next|PRIVATE_RECEIPT_ERROR/);
    assert.match(body,/neuraldeep_model_identity_mismatch|neuraldeep_stream_truncated|provider_tool_identity_mismatch|provider_receipt_failed/);
  }
});

test('a model mismatch in nonempty, terminal or already-published metadata is never treated as a provisional placeholder',async t=>{
  for(const mode of ['nonempty','terminal-status','late','quarantined-matching-model','quarantined-missing-model']){
    const prelude=metadataPrelude();if(mode==='nonempty')prelude.response.output=[call(allowedTools[0])];if(mode==='terminal-status')prelude.response.status='completed';
    const quarantined=mode.startsWith('quarantined-');
    if(quarantined){prelude.response.output=[call('request_user_input')];if(mode==='quarantined-matching-model')prelude.response.model=model;else delete prelude.response.model;}
    const prefix=quarantined?sse(metadataPrelude()):mode==='late'?sse({type:'response.created',response:{...prelude.response,model}}):'';
    const post=await fixture(t,{fetchImpl:async()=>new Response(prefix+sse(prelude)+sse({type:'response.completed',response:terminal([call(allowedTools[0])])})+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})});
    const body=await (await post()).text();assert.match(body,/neuraldeep_model_identity_mismatch/);assert.doesNotMatch(body,/"type":"function_call"/);
  }
});

test('only the verified publisher-qualified model ID is equivalent; another publisher or model remains blocked',async t=>{
  for(const requested of ['gpt-oss-20b','gpt-oss-120b'])for(const returned of ['openai/'+requested,'other/'+requested,'openai/'+(requested==='gpt-oss-20b'?'gpt-oss-120b':'gpt-oss-20b'),'openai/openai/'+requested]){
    const prelude={type:'response.created',response:{id:'response_fixture',model:'openai/openai/'+requested,status:'in_progress',output:[]}};
    const post=await fixture(t,{fetchImpl:async()=>new Response(sse(prelude)+sse({type:'response.completed',response:terminal([call(allowedTools[0])],{model:returned})})+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}})});
    const result=await post({model:requested}),body=await result.text();
    if(returned==='openai/'+requested){assert.equal(result.status,200);assert.match(body,/"name":"read_file"/);assert.ok(body.includes('"model":"'+returned+'"'));}
    else{assert.equal(result.status,502);assert.match(body,/neuraldeep_model_identity_mismatch/);assert.doesNotMatch(body,/"type":"function_call"/);}
  }
});

test('Kimi catalog identity accepts its verified publisher identity for JSON and SSE without permitting another model',async t=>{
  const requested='kimi-k3.1-pro';
  for(const format of ['json','sse'])for(const returned of [requested,'moonshotai/'+requested,'other/'+requested,'moonshotai/kimi-k3','moonshotai/kimi-k2.6','moonshotai/moonshotai/'+requested]){
    const receipts=[];
    const post=await fixture(t,{onRequest:event=>receipts.push(event),fetchImpl:async()=>response(terminal([call(allowedTools[0])],{model:returned}),format)});
    const result=await post({model:requested}),body=await result.text(),accepted=[requested,'moonshotai/'+requested].includes(returned);
    assert.equal(result.status,accepted?200:502);assert.equal(receipts.length,1);assert.equal(receipts[0].usage.totalTokens,6);
    if(accepted){assert.match(body,/"name":"read_file"/);assert.ok(body.includes('"model":"'+returned+'"'));assert.equal(receipts[0].error,null);}
    else{assert.match(body,/neuraldeep_model_identity_mismatch/);assert.doesNotMatch(body,/"type":"function_call"/);}
  }
});

test('Kimi publisher identity does not weaken tool or durable accounting checks or authorize other chats',async t=>{
  for(const mode of ['foreign-tool','receipt','other-chat']){
    const post=await fixture(t,{onRequest:()=>{if(mode==='receipt')throw Error('PRIVATE_RECEIPT_ERROR');},fetchImpl:async()=>response(terminal([call(mode==='foreign-tool'?'request_user_input':allowedTools[0])],{model:'moonshotai/kimi-k3.1-pro'}),'sse')});
    const result=await post({model:mode==='other-chat'?'kimi-k3':'kimi-k3.1-pro'}),body=await result.text();
    assert.equal(result.status,mode==='receipt'?503:502);
    assert.match(body,/provider_tool_identity_mismatch|provider_receipt_failed|neuraldeep_model_identity_mismatch/);
    assert.doesNotMatch(body,/"type":"function_call"|PRIVATE_RECEIPT_ERROR/);
  }
});
