import test from 'node:test';
import assert from 'node:assert/strict';
import { ANTHROPIC_API_VERSION,buildClaudeMessageRequest,createClaudeMessage,listClaudeModels,resolveClaudeModel,claudeAssistantTurn } from '../scripts/claude/messages-client.mjs';

const model='claude-sonnet-5-5',request={model,messages:[{role:'user',content:'Fixture prompt'}],maxTokens:512};
const response=extra=>({id:'msg_123',model,content:[{type:'text',text:'Fixture answer'}],stop_reason:'end_turn',usage:{input_tokens:5,output_tokens:3,cache_creation_input_tokens:1,cache_read_input_tokens:2},...extra});
test('child client pins API version/model and reports cache usage without executing tools',async()=>{
  let calls=0,dispatched=false;
  const output=await createClaudeMessage({...request,tools:[{name:'lookup',description:'Read fixture',input_schema:{type:'object'}}]}, {apiKey:'KEY_CANARY',onDispatch:()=>{dispatched=true;},fetchImpl:async(url,init)=>{
    calls++;assert.equal(dispatched,true);assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init.redirect,'error');assert.equal(init.headers['anthropic-version'],ANTHROPIC_API_VERSION);
    assert.equal(init.headers.authorization,'Bearer KEY_CANARY');assert.equal(JSON.parse(init.body).model,model);
    return Response.json(response({stop_reason:'tool_use',content:[{type:'tool_use',id:'tool_a',name:'lookup',input:{key:'a'}},{type:'thinking',thinking:'REASONING_CANARY'}]}));
  }});
  assert.equal(calls,1);assert.equal(output.complete,false);assert.equal(output.content.length,1);assert.equal(output.usage.totalTokens,11);assert.doesNotMatch(JSON.stringify(output),/KEY_CANARY|REASONING_CANARY/);
});
test('unapproved tools, model substitution and unknown fields are rejected',async()=>{
  for(const extra of [{baseUrl:'http://evil.invalid'},{temperature:1},{tools:[{type:'web_search_20250305',name:'web_search'}]}])assert.throws(()=>buildClaudeMessageRequest({...request,...extra}),{code:'provider_input_invalid'});
  await assert.rejects(createClaudeMessage(request,{apiKey:'x',fetchImpl:async()=>Response.json(response({model:'claude-opus-5-5'}))}),{code:'runtime_identity_mismatch'});
  await assert.rejects(createClaudeMessage(request,{apiKey:'x',fetchImpl:async()=>Response.json(response({content:[{type:'tool_use',id:'tool_a',name:'shell',input:{}}]}))}),{code:'provider_tool_policy_violation'});
});
test('uncertain provider errors are sanitized and never retried; cancellation prevents dispatch',async()=>{
  let calls=0;
  await assert.rejects(createClaudeMessage(request,{apiKey:'x',fetchImpl:async()=>{calls++;return new Response('SECRET_SERVER_BODY',{status:429});}}),error=>error.code==='provider_rate_limited' && !error.message.includes('SECRET'));assert.equal(calls,1);
  const controller=new AbortController();controller.abort();await assert.rejects(createClaudeMessage(request,{apiKey:'x',signal:controller.signal,fetchImpl:async()=>{calls++;}}),{code:'operator_cancel'});assert.equal(calls,1);
  const stopped=await createClaudeMessage(request,{apiKey:'x',fetchImpl:async()=>Response.json(response({stop_reason:'max_tokens'}))});assert.equal(stopped.complete,false);assert.equal(stopped.truncated,true);
});
test('model aliases resolve from current, complete account metadata, never a retired or guessed ID',async()=>{
  const rows=await listClaudeModels({apiKey:'x',fetchImpl:async(_url,init)=>{
    assert.equal(init.method,'GET');return Response.json({has_more:false,data:[{id:model,line:'sonnet',lifecycle:'active',created_at:'2026-09-28T00:00:00Z',capabilities:{effort:{high:{supported:true},medium:{supported:true}}},max_tokens:128000},{id:'claude-sonnet-4-5-20250929',line:'sonnet',lifecycle:'retired',created_at:'2025-09-29T00:00:00Z'}]});
  }});
  assert.equal(resolveClaudeModel('sonnet',rows).id,model);assert.deepEqual(rows[0].efforts,['medium','high']);assert.throws(()=>resolveClaudeModel('opus',rows),{code:'provider_model_unavailable'});
  assert.throws(()=>resolveClaudeModel('claude-sonnet-4-5-20250929',rows),{code:'provider_model_unavailable'});
  await assert.rejects(listClaudeModels({apiKey:'x',fetchImpl:async()=>Response.json({has_more:true,last_id:'arbitrary',data:[]})}),{code:'provider_metadata_invalid'});
});

test('signed reasoning survives a private child tool continuation without entering serialized public output',async()=>{
  const tools=[{name:'lookup',description:'Read fixture',input_schema:{type:'object'}}];
  const first=await createClaudeMessage({...request,tools},{apiKey:'x',fetchImpl:async()=>Response.json(response({stop_reason:'tool_use',content:[{type:'thinking',thinking:'PRIVATE_REASONING_CANARY',signature:'PRIVATE_SIGNATURE_CANARY'},{type:'tool_use',id:'tool_a',name:'lookup',input:{}}]}))});
  const turn=claudeAssistantTurn(first);assert.doesNotMatch(JSON.stringify([first,turn]),/PRIVATE_REASONING|PRIVATE_SIGNATURE/);
  await createClaudeMessage({...request,tools,messages:[...request.messages,turn,{role:'user',content:[{type:'tool_result',tool_use_id:'tool_a',content:'Found'}]}]}, {apiKey:'x',fetchImpl:async(_url,init)=>{
    const sent=JSON.parse(init.body);assert.equal(sent.messages[1].content[0].signature,'PRIVATE_SIGNATURE_CANARY');return Response.json(response());
  }});
  assert.throws(()=>claudeAssistantTurn(JSON.parse(JSON.stringify(first))),{code:'provider_continuation_unavailable'});
});
