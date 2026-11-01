import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,symlinkSync,existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NeuralDeepProviderService } from '../scripts/neuraldeep/provider-service.mjs';
import { loadNeuralDeepAccountSnapshot,sanitizeNeuralDeepLimits } from '../scripts/neuraldeep/account-snapshot.mjs';
import { providerJson } from '../scripts/lib/provider-http.mjs';
import { summarizeNeuralDeepUsage,recordNeuralDeepRun,readNeuralDeepSessionUsage } from '../scripts/neuraldeep/usage-ledger.mjs';

function fixture(t){
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-nd-account-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const stateRoot=path.join(root,'state');mkdirSync(stateRoot);
  let key='PRIVATE_KEY_CANARY',model={id:'qwen3.8-27b',type:'chat',capabilities:{tools:true},limit:{context:262144,output:32768}};
  let limits={key:{status:'ok',billing_mode:'subscription'},decision:{can_request:true},parallel_limit:2,chat:{session:{remaining:100},week:{remaining:500}},night:{active:true,capacity_factor:2}};
  let price={model:'qwen3.8-27b',billing:'token',in_rub_1m:1,out_rub_1m:2};
  const calls=[];
  const fetchImpl=async(url,options)=>{
    const target=new URL(url);calls.push({url:target.href,headers:options.headers});
    assert.equal(options.redirect,'error');assert.equal(options.method,'GET');
    if(target.host==='api.neuraldeep.ru')assert.equal(options.headers.authorization,'Bearer '+key);
    else {assert.equal(target.host,'neuraldeep.ru');assert.equal(options.headers.authorization,undefined);}
    const payload=target.pathname==='/v1/limits'?limits:target.pathname==='/v1/models'?{data:[model]}:target.pathname.endsWith('wallet-prices')?{prices:[price]}:{};
    return Response.json(payload);
  };
  const options={root,stateRoot,privateRoot:path.join(stateRoot,'private','neuraldeep'),fetchImpl,readCredential:()=>key,probeCli:async()=> '0.153.0',checkSandbox:()=>true};
  return {options,calls,stateRoot,setKey:value=>{key=value;},setLimits:value=>{limits=value;},setModel:value=>{model=value;},setPrice:value=>{price=value;}};
}

test('NeuralDeep readiness requires current limits, declared tools and the exact catalog model without doubling night capacity',async t=>{
  const f=fixture(t),service=new NeuralDeepProviderService(f.options),ready=await service.snapshot('qwen3.8-27b');
  assert.equal(ready.status,'ready');assert.equal(ready.capabilities.parallelLimit,2);assert.equal(ready.account.limits.chat.session.remaining,100);
  assert.equal(ready.capabilities.attachments.images,false);assert.equal(f.calls.length,6);
  assert.equal(ready.capabilities.attachments.files,true);assert.equal(ready.capabilities.approvals,true);assert.equal(ready.capabilities.sandbox,'host-enforced');
  await service.snapshot('qwen3.8-27b');assert.equal(f.calls.length,6);
  assert.equal((await service.snapshot('missing-model')).status,'configured');
  const cache=readFileSync(path.join(f.options.privateRoot,'account-snapshot.json'),'utf8');assert.ok(!cache.includes('PRIVATE_KEY_CANARY'));
});
test('direct voice checks account and model readiness without probing or requiring a CLI',async t=>{
  const f=fixture(t);let probes=0;f.options.probeCli=async()=>{probes++;throw new Error('no CLI installed');};
  const voice=await new NeuralDeepProviderService({...f.options,requireCli:false}).snapshot('qwen3.8-27b');
  assert.equal(voice.status,'ready');assert.equal(voice.version,null);assert.equal(probes,0);
  assert.equal(voice.capabilities.attachments.files,false);assert.equal(voice.capabilities.approvals,false);
  const task=await new NeuralDeepProviderService(f.options).snapshot('qwen3.8-27b');
  assert.equal(task.status,'unavailable');assert.equal(probes,1);
});
test('task file readiness requires the verified CLI and host sandbox without coupling direct voice to them',async t=>{
  const f=fixture(t),changed=await new NeuralDeepProviderService({...f.options,probeCli:async()=> '0.154.0'}).snapshot('qwen3.8-27b');
  assert.equal(changed.status,'ready');assert.equal(changed.capabilities.attachments.files,false);
  const options={...f.options,checkSandbox:()=>{throw new Error('unavailable');}};
  assert.equal((await new NeuralDeepProviderService(options).snapshot('qwen3.8-27b')).error.code,'provider_sandbox_unavailable');
  assert.equal((await new NeuralDeepProviderService({...options,requireCli:false}).snapshot('qwen3.8-27b')).status,'ready');
});

test('unknown decision is not permission and rotated credentials cannot inherit old account limits',async t=>{
  const f=fixture(t),service=new NeuralDeepProviderService(f.options);
  assert.equal(sanitizeNeuralDeepLimits({}).decision.canRequest,null);
  await service.snapshot('qwen3.8-27b');
  f.setKey('ROTATED_KEY_CANARY');f.setLimits({key:{status:'ok',billing_mode:'subscription'},parallel_limit:2});
  const result=await service.snapshot('qwen3.8-27b');assert.equal(result.status,'configured');assert.equal(result.error.code,'provider_limits_unknown');
  assert.equal(f.calls.filter(row=>row.url.endsWith('/v1/limits')).length,2);
  f.setKey('');const before=f.calls.length;assert.equal((await service.snapshot('qwen3.8-27b')).status,'not-configured');assert.equal(f.calls.length,before);
});

test('a listed premium model cannot bypass Wallet gating, tool metadata or current key status',async t=>{
  const f=fixture(t);f.setPrice({model:'qwen3.8-27b',premium:true,billing:'token',out_rub_1m:10});
  const result=await new NeuralDeepProviderService(f.options).snapshot('qwen3.8-27b');assert.equal(result.status,'billing-required');
  f.setKey('key_2');f.setLimits({key:{status:'disabled',billing_mode:'wallet'},parallel_limit:2,decision:{can_request:true}});
  assert.equal((await new NeuralDeepProviderService(f.options).snapshot('qwen3.8-27b')).status,'pending-auth');
  f.setKey('key_3');f.setLimits({key:{status:'ok',billing_mode:'wallet'},wallet:{balance_rub:100},parallel_limit:2,decision:{can_request:true}});
  f.setModel({id:'qwen3.8-27b',type:'chat'});assert.equal((await new NeuralDeepProviderService(f.options).snapshot('qwen3.8-27b')).error.code,'provider_tools_unverified');
});

test('metadata responses are bounded and provider errors, redirects and auth headers cannot leak into public views',async t=>{
  await assert.rejects(providerJson('https://api.neuraldeep.ru/v1/limits',{maxBytes:32,fetchImpl:async()=>new Response('x'.repeat(100))}),{code:'provider_metadata_too_large'});
  await assert.rejects(providerJson('https://api.neuraldeep.ru/v1/limits',{fetchImpl:async()=>new Response('PRIVATE_PROVIDER_ERROR',{status:429,headers:{'retry-after':'PRIVATE_KEY_CANARY'}})}),error=>error.code==='provider_rate_limited' && error.retryAfter===null && !JSON.stringify(error).includes('PRIVATE'));
  const f=fixture(t);f.options.fetchImpl=async()=>new Response('PRIVATE_PROVIDER_ERROR',{status:401});
  const result=await new NeuralDeepProviderService(f.options).snapshot('qwen3.8-27b');assert.equal(result.status,'pending-auth');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  await assert.rejects(loadNeuralDeepAccountSnapshot({...f.options,token:'KEY',apiOrigin:'https://unrelated.invalid'}),/provider_origin_invalid/);
});

test('usage reads do not create storage and private symlinks cannot redirect the ledger or account cache',async t=>{
  const f=fixture(t),empty=path.join(f.stateRoot,'empty');mkdirSync(empty);
  assert.equal(summarizeNeuralDeepUsage({stateRoot:empty}).totals.runs,0);assert.deepEqual(readdirSync(empty),[]);
  const outside=path.join(f.stateRoot,'outside');mkdirSync(outside);mkdirSync(path.join(f.stateRoot,'private'));symlinkSync(outside,path.join(f.stateRoot,'private','neuraldeep'));
  await loadNeuralDeepAccountSnapshot({...f.options,token:'PRIVATE_KEY_CANARY'});assert.deepEqual(readdirSync(outside),[]);
  assert.throws(()=>readNeuralDeepSessionUsage({stateRoot:f.stateRoot,profileIdentity:'a'.repeat(64),sessionId:'session1'}),{code:'provider_state_path_invalid'});
  assert.throws(()=>recordNeuralDeepRun({stateRoot:f.stateRoot,profileIdentity:'a'.repeat(64),runId:'run_1',model:'qwen',usage:{input_tokens:1,output_tokens:1}}),{code:'provider_state_path_invalid'});
  assert.equal(existsSync(path.join(outside,'neuraldeep-usage.sqlite')),false);
});
