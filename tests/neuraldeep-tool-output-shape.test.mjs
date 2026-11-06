import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeTextToolOutputs} from '../scripts/neuraldeep/responses-input-policy.mjs';
import {listenNeuralDeepAdapter,closeNeuralDeepAdapter} from '../scripts/neuraldeep/responses-adapter.mjs';

test('text tool output blocks retain exact contents and order without mutating the transcript',()=>{
  const parts=[{type:'input_text',text:'Wall time\nOutput:'},{type:'input_text',text:''},{type:'input_text',text:'Unicode \u0410\u043d\u043d\u0430, quote" and slash\\\n'}];
  const input={input:[{type:'function_call_output',call_id:'owned_call',output:parts},{type:'message',role:'user',content:parts}]},saved=structuredClone(input);
  const result=normalizeTextToolOutputs(input);
  assert.equal(result.input[0].output,parts.map(part=>part.text).join('\n'));assert.equal(result.input[0].call_id,'owned_call');
  assert.deepEqual(input,saved);assert.strictEqual(result.input[1],input.input[1]);assert.strictEqual(normalizeTextToolOutputs(result),result);
  assert.strictEqual(normalizeTextToolOutputs({input:'ordinary user text'}).input,'ordinary user text');
});

test('images, mixed outputs, empty arrays, unknown metadata and custom calls are preserved verbatim',()=>{
  for(const [type,output] of [
    ['function_call_output',[{type:'input_text',text:'caption'},{type:'input_image',image_url:'data:image/png;base64,AAAA'}]],
    ['function_call_output',[{type:'input_text',text:'unchanged',annotations:[{type:'citation'}]}]],
    ['function_call_output',[{type:'refusal',refusal:'unchanged'}]],
    ['function_call_output',[]],['function_call_output','legacy text'],
    ['custom_tool_call_output',[{type:'input_text',text:'custom result'}]],
  ]){
    const input={input:[{type,call_id:'owned_call',output}]},saved=structuredClone(input);
    assert.strictEqual(normalizeTextToolOutputs(input),input);assert.deepEqual(input,saved);
  }
});

test('NeuralDeep normalizes text results before request hashing/admission and preserves tool identity for JSON/SSE',async t=>{
  for(const format of ['json','sse']){
    const hashes=[],receipts=[],name='mcp__pritha__read_file',model='gpt-oss-120b',token='t'.repeat(48);let calls=0;
    const server=await listenNeuralDeepAdapter({port:0,localToken:token,upstreamAuthorization:'Bearer SYNTHETIC_KEY',allowedTools:[name],
      prepareResponsesRequest:async(payload,context)=>{assert.equal(payload.input[1].output,'timing\nfile contents');assert.equal(payload.input[0].name,name);assert.equal(context.requestHash,createHash('sha256').update(JSON.stringify(payload)).digest('hex'));hashes.push(context.requestHash);return payload;},
      beforeResponsesDispatch:({payload})=>assert.equal(payload.input[1].output,'timing\nfile contents'),onRequest:event=>receipts.push(event),
      fetchImpl:async(_url,init)=>{calls++;const payload=JSON.parse(init.body);assert.equal(payload.input[1].output,'timing\nfile contents');assert.equal(payload.tools.length,1);
        const response={id:'response_fixture',model:'openai/'+model,status:'completed',output:[{type:'function_call',id:'new_call',call_id:'new_call',name,arguments:'{}',status:'completed'}],usage:{input_tokens:4,output_tokens:2,total_tokens:6}};
        return new Response(format==='json'?JSON.stringify(response):'data: '+JSON.stringify({type:'response.completed',response})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':format==='json'?'application/json':'text/event-stream'}});
      }});t.after(()=>closeNeuralDeepAdapter(server));
    for(const output of [[{type:'input_text',text:'timing'},{type:'input_text',text:'file contents'}],'timing\nfile contents']){
      const input={model,stream:true,tools:[{type:'namespace',name:'mcp__pritha',tools:[{type:'function',name:'read_file',parameters:{type:'object'}}]}],input:[{type:'function_call',namespace:'mcp__pritha',name:'read_file',call_id:'old_call',arguments:'{}'},{type:'function_call_output',call_id:'old_call',output}]},saved=structuredClone(input);
      const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)}),body=await response.text();
      assert.equal(response.status,200);assert.match(body,/"namespace":"mcp__pritha"/);assert.match(body,/"name":"read_file"/);assert.deepEqual(input,saved);
    }
    assert.equal(calls,2);assert.equal(hashes[0],hashes[1]);assert.equal(receipts.length,2);assert.ok(receipts.every(row=>row.usage.totalTokens===6 && !row.error));
  }
});
