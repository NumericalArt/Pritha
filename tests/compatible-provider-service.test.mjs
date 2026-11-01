import test from 'node:test';
import assert from 'node:assert/strict';
import {CompatibleProviderService,LOCAL_DISCOVERY_ENDPOINTS} from '../scripts/openai-compatible/provider-service.mjs';
import {normalizeOpenRouterModels,normalizeOpenRouterAccount,openRouterShortlist,OPENROUTER_SHORTLIST} from '../scripts/openai-compatible/catalog.mjs';
const model='vendor/model',preset={modelId:model,reasoningEffort:'default',timeoutMs:10000};
const catalog={data:[{id:model,supported_parameters:['tools'],context_length:65536,top_provider:{max_completion_tokens:8192},architecture:{input_modalities:['text'],output_modalities:['text']},reasoning:{supported_efforts:['low','high']}}]};
const options={connectorId:'openrouter',root:'/fixture',stateRoot:'/fixture-state',readCredential:()=> 'PRIVATE_KEY_CANARY',probeCli:async()=>({available:true,version:'0.153.0'}),probeSandbox:()=>true};
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

test('OpenRouter normalizes only budget metadata, preserves unknowns and retains the exact historical shortlist',()=>{
  const account=normalizeOpenRouterAccount({data:{is_free_tier:false,usage:12,limit:100,limit_remaining:88,effective_budget:{remaining_usd:3,limit_usd:15,spend_usd:12},label:'SECRET',creator_user_id:'SECRET',workspace_id:'SECRET'}});
  assert.equal(account.remainingUsd,3);assert.equal(account.remainingSource,'effective-budget');assert.equal(account.effectiveLimitUsd,15);assert.doesNotMatch(JSON.stringify(account),/SECRET/);
  const unknown=normalizeOpenRouterAccount({data:{is_free_tier:false,usage:null,limit:null,effective_budget:{remaining_usd:null}}});assert.equal(unknown.remainingUsd,null);assert.equal(unknown.usageUsd,null);
  const models=normalizeOpenRouterModels(catalog);assert.deepEqual(models[0].efforts,['default','low','high']);assert.equal(models[0].contextTokens,65536);
  assert.deepEqual(openRouterShortlist(models).map(row=>row.id),OPENROUTER_SHORTLIST);assert(openRouterShortlist(models).every(row=>!row.available));
  assert.throws(()=>normalizeOpenRouterAccount({data:{label:'SECRET'}}),{code:'provider_metadata_invalid'});
  assert.deepEqual(normalizeOpenRouterModels({data:[{...catalog.data[0],reasoning:{mandatory:true,supported_efforts:['high']}}]})[0].efforts,['default','high']);
  assert.deepEqual(normalizeOpenRouterModels({data:[{...catalog.data[0],reasoning:{mandatory:true}}]})[0].efforts,['default']);
});

test('OpenRouter uses bounded read-only /key and /models probes, fixed attribution, deduplicated cache and no inference',async()=>{
  const seen=[];const service=new CompatibleProviderService({...options,fetchImpl:async(url,request)=>{seen.push({url,request});assert.equal(request.method,'GET');assert.equal(request.redirect,'error');assert.equal(request.headers.authorization,'Bearer PRIVATE_KEY_CANARY');assert.equal(request.headers['X-Title'],'Pritha Control Center');return response(url.endsWith('/key')?{data:{is_free_tier:false,usage:5,limit:null}}:catalog);}});
  const [a,b]=await Promise.all([service.snapshot(preset),service.snapshot(preset)]);assert.equal(a.status,'ready');assert.equal(b.status,'ready');assert.equal(seen.length,2);assert.equal(a.capabilities.tools,true);assert.equal(a.capabilities.offline,false);
  assert.deepEqual(seen.map(row=>row.url).sort(),['https://openrouter.ai/api/v1/key','https://openrouter.ai/api/v1/models']);assert.doesNotMatch(JSON.stringify(a),/PRIVATE_KEY_CANARY/);
  await service.snapshot(preset);assert.equal(seen.length,2);
  assert.equal((await service.require({...preset,sandbox:'workspace-write'})).status,'ready');assert.equal(seen.length,2);
  assert.notEqual((await service.snapshot({...preset,sandbox:'danger-full-access'})).status,'ready');
  assert.notEqual((await service.snapshot({...preset,unexpected:'PRIVATE_CANARY'})).status,'ready');
});

test('model, effort, protocol, tools, auth, budget and CLI failures never authorize dispatch or substitute a model',async()=>{
  for(const item of [
    {catalog:{data:[]},code:'provider_model_unavailable'},
    {catalog:{data:[{...catalog.data[0],supported_parameters:[]}]},code:'provider_tools_unverified'},
    {catalog:{data:[{...catalog.data[0],endpoints:['/api/v1/chat/completions']}]},code:'provider_protocol_unverified'},
    {preset:{...preset,reasoningEffort:'xhigh'},code:'provider_effort_unavailable'},
    {account:{data:{is_free_tier:false,limit_remaining:0}},code:'provider_billing_required'},
    {account:{data:{is_free_tier:false,is_management_key:true}},code:'provider_pending_auth'},
    {probeCli:async()=>({available:false}),code:'provider_runtime_unavailable'},
  ]){
    const service=new CompatibleProviderService({...options,...item,fetchImpl:async url=>response(url.endsWith('/key')?item.account || {data:{is_free_tier:false}}:item.catalog || catalog)});
    await assert.rejects(service.require(item.preset || preset),{code:item.code});
  }
  let requests=0;const missing=new CompatibleProviderService({...options,readCredential:()=>'',fetchImpl:async()=>{requests++;}});assert.equal((await missing.snapshot(preset)).status,'not-configured');assert.equal(requests,0);
});

test('remote errors and redirect bodies never escape the metadata boundary',async()=>{
  for(const status of [401,402,429,503]){
    const service=new CompatibleProviderService({...options,fetchImpl:async()=>new Response('SECRET_RAW_BODY',{status})});
    const result=await service.snapshot(preset);assert.notEqual(result.status,'ready');assert.doesNotMatch(JSON.stringify(result),/SECRET_RAW_BODY|PRIVATE_KEY_CANARY/);
  }
});

test('Local discovery has no credentials or automatic selection, and loopback is never called offline proof',async()=>{
  let credentials=0;const seen=[];
  const service=new CompatibleProviderService({...options,connectorId:'local',readCredential:()=>{credentials++;throw new Error();},fetchImpl:async(url,request)=>{seen.push(url);assert.equal(request.headers.authorization,undefined);return response({data:[{id:'local-model'}]});}});
  const result=await service.snapshot({...preset,modelId:'local-model'});assert.equal(result.status,'configured');assert.equal(result.endpoint,null);assert.equal(credentials,0);assert.equal(result.capabilities.offline,false);
  assert.deepEqual(seen,LOCAL_DISCOVERY_ENDPOINTS.map(endpoint=>endpoint+'/models'));assert.equal(result.discovery.length,2);
  const invalid=await service.snapshot({...preset,baseUrl:'https://remote.example/v1'});assert.notEqual(invalid.status,'ready');assert.equal(seen.length,2);
});

test('Local preserves selected IPv6 endpoint, verifies native tool metadata, rejects cloud aliases and leaves offline gate closed',async()=>{
  for(const cloud of [false,true]){
    const seen=[],service=new CompatibleProviderService({...options,connectorId:'local',fetchImpl:async(url,request)=>{seen.push(url);assert.equal(request.headers.authorization,undefined);
      if(url.endsWith('/v1/models') && !url.endsWith('/api/v1/models'))return response({data:[{id:'local-model'}]});
      if(url.endsWith('/api/v1/models'))return new Response('',{status:404});
      assert.equal(url,'http://[::1]:11434/api/show');assert.equal(request.method,'POST');assert.deepEqual(JSON.parse(request.body),{model:'local-model'});
      return response({capabilities:['completion','tools'],model_info:{'llama.context_length':8192},...(cloud?{remote_host:'https://cloud.invalid'}:{})});}});
    const result=await service.snapshot({...preset,modelId:'local-model',baseUrl:'http://[::1]:11434/v1'});
    assert.equal(result.status,'configured');assert.equal(result.error.code,cloud?'provider_local_cloud_model':'provider_offline_unverified');assert.equal(result.models[0].tools,true);assert.equal(result.capabilities.offline,false);
    assert(seen.every(url=>url.startsWith('http://[::1]:11434/')));
  }
});
