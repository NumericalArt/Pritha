import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {childProviderConfiguration,readChildProvider,requestChildModel} from '../scripts/lib/child-model-client.mjs';
import {issueChildModelConnection,revokeChildModelConnection,serveChildModel} from '../scripts/lib/child-model-broker.mjs';

function fixture(t,provider='openai',modelId=provider==='openai'?'gpt-4.1-mini':provider==='claude'?'claude-haiku-4-5-20251001':'qwen3.8-flash'){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-child-broker-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const stateRoot=path.join(root,'state'),projectPath=path.join(root,'child');fs.mkdirSync(stateRoot);fs.mkdirSync(path.join(projectPath,'runtime'),{recursive:true});
  const configuration=childProviderConfiguration({childModelProvider:provider,childModelId:modelId,childModelConnection:'pritha',childMaxOutputTokens:256});
  fs.writeFileSync(path.join(projectPath,'runtime/provider.json'),JSON.stringify(configuration));
  const options={root,stateRoot,projectPath,configuration,agentId:'agent-'+'a'.repeat(24),contractHash:'b'.repeat(64),port:3420};
  const environment=issueChildModelConnection(options),token=environment.PRITHA_CHILD_MODEL_TOKEN;
  return {...options,environment,token};
}
for(const provider of ['openai','claude','neuraldeep'])test(provider+': child uses its scoped Pritha connection without receiving a parent API key',async t=>{
  const f=fixture(t,provider),local=readChildProvider(f.projectPath,{environment:{...f.environment,OPENAI_API_KEY:'parent-canary'}});
  assert.equal(local.apiKey,undefined);let calls=0;
  const upstream=async(url,options)=>{
    calls++;const body=JSON.parse(options.body);assert.equal(body.model,f.configuration.modelId);
    assert.equal(body.max_completion_tokens ?? body.max_tokens,256);assert.ok(!options.body.includes('parent-canary'));
    assert.equal(options.headers.authorization,'Bearer parent-canary');
    return Response.json(provider==='claude'?{id:'msg_test',model:body.model,content:[{type:'text',text:'model answer'}],stop_reason:'end_turn',usage:{input_tokens:3,output_tokens:2}}:{model:provider==='openai'?'gpt-4.1-mini-2025-04-14':body.model,choices:[{message:{role:'assistant',content:'model answer'},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}});
  };
  const result=await requestChildModel(local.configuration,{messages:[{role:'user',content:'input'}]}, {...local,fetchImpl:async(url,options)=>{
    assert.equal(url,f.environment.PRITHA_CHILD_MODEL_URL);assert.equal(options.headers.authorization,'Bearer '+f.token);assert.ok(!options.body.includes('parent-canary'));
    return Response.json(await serveChildModel({...f,request:JSON.parse(options.body),validateGrant:g=>g.contractHash===f.contractHash,readCredential:()=> 'parent-canary',fetchImpl:upstream}));
  }});
  assert.equal(result.content[0].text,'model answer');assert.equal(calls,1);
  assert.equal(fs.existsSync(path.join(f.projectPath,'.env.local')),false);
  const files=fs.readdirSync(path.join(f.stateRoot,'private','child-model'));
  for(const file of files){const content=fs.readFileSync(path.join(f.stateRoot,'private','child-model',file),'utf8');assert.ok(!content.includes(f.token));assert.ok(!content.includes('parent-canary'));}
});
test('a child pinned to a documented Claude alias reaches the provider under its exact dated model ID',async t=>{
  // Observed 2026-11-14: a verified agent whose Contract selected
  // claude-sonnet-4-5 failed every live request with runtime_identity_mismatch,
  // because the provider reports claude-sonnet-4-5-20250929 for that alias.
  const f=fixture(t,'claude','claude-sonnet-4-5'),local=readChildProvider(f.projectPath,{environment:f.environment});
  const requested=[];let reported='claude-sonnet-4-5-20250929';
  const upstream=async(url,options)=>{
    const body=JSON.parse(options.body);requested.push(body.model);assert.equal(body.max_tokens,256);
    return Response.json({id:'msg_test',model:reported,content:[{type:'text',text:'model answer'}],stop_reason:'end_turn',usage:{input_tokens:3,output_tokens:2}});
  };
  const viaBroker=async(url,options)=>{
    try{return Response.json(await serveChildModel({...f,request:JSON.parse(options.body),validateGrant:()=>true,readCredential:()=> 'parent-key',fetchImpl:upstream}));}
    catch(error){return Response.json({error:error.code},{status:503});}
  };
  const result=await requestChildModel(local.configuration,{messages:[{role:'user',content:'input'}]},{...local,fetchImpl:viaBroker});
  // The provider is asked for the dated ID; the child sees the model its accepted Contract selected.
  assert.deepEqual(requested,['claude-sonnet-4-5-20250929']);
  assert.equal(result.model,'claude-sonnet-4-5');assert.equal(result.content[0].text,'model answer');
  const grant=JSON.parse(fs.readFileSync(path.join(f.stateRoot,'private','child-model',f.agentId+'.json'),'utf8'));
  assert.equal(grant.configuration.modelId,'claude-sonnet-4-5');assert.deepEqual(grant.usage,{requests:1,tokens:5,unknown:0,activeMs:grant.usage.activeMs});
  // Canonicalization is not a relaxed identity check: any other reported model is still refused.
  for(reported of ['claude-sonnet-4-5','claude-sonnet-5-5','claude-sonnet-4-5-20250929-preview']){
    await assert.rejects(requestChildModel(local.configuration,{messages:[{role:'user',content:'input'}]},{...local,fetchImpl:viaBroker}),{code:'runtime_identity_mismatch'});
  }
  assert.equal(requested.length,4);
});
test('broker rejects changed authority, revoked tokens and repeated requests before another inference',async t=>{
  const f=fixture(t);let calls=0;
  const opts={...f,request:{requestId:'request-00000000001',input:{messages:[{role:'user',content:'one'}]}},validateGrant:()=>false,readCredential:()=> 'key',fetchImpl:async()=>{calls++;throw Error('upstream failed');}};
  await assert.rejects(serveChildModel(opts),{code:'pritha_connection_changed'});
  opts.validateGrant=()=>true;await assert.rejects(serveChildModel(opts),{code:'provider_transport_failed'});
  await assert.rejects(serveChildModel(opts),{code:'pritha_request_already_dispatched'});assert.equal(calls,1);
  revokeChildModelConnection(f);await assert.rejects(serveChildModel({...opts,request:{...opts.request,requestId:'request-00000000002'}}),{code:'pritha_connection_revoked'});
});
test('child refuses arbitrary broker destinations and output limits before any network request',async t=>{
  const f=fixture(t);assert.throws(()=>readChildProvider(f.projectPath,{environment:{...f.environment,PRITHA_CHILD_MODEL_URL:'https://foreign.invalid/api/child-model'}}),{code:'pritha_connection_unavailable'});
  await assert.rejects(requestChildModel(f.configuration,{messages:[{role:'user',content:'input'}],maxTokens:257},{environment:f.environment,fetchImpl:()=>assert.fail()}),{code:'provider_input_invalid'});
});

test('formatting the child configuration cannot break its connection, while changed authority still fails',t=>{
  const f=fixture(t),file=path.join(f.projectPath,'runtime/provider.json');
  fs.writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(f.configuration).reverse()),null,2));
  assert.match(issueChildModelConnection(f).PRITHA_CHILD_MODEL_TOKEN,/^[a-f0-9]{64}$/);
  fs.writeFileSync(file,JSON.stringify({...f.configuration,modelId:'another-model'}));
  assert.throws(()=>issueChildModelConnection(f),{code:'pritha_connection_configuration'});
});
