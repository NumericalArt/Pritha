import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {readProviderCredential,providerCredentialStatus,storeProviderCredential} from '../scripts/lib/provider-credential.mjs';
import {providerSettingsRequest} from '../scripts/lib/provider-settings-api.mjs';
import {ClaudeProviderService} from '../scripts/claude/provider-service.mjs';
import {NeuralDeepProviderService} from '../scripts/neuraldeep/provider-service.mjs';
import {CompatibleProviderService} from '../scripts/openai-compatible/provider-service.mjs';

const canary='PRIVATE_CREDENTIAL_CANARY',privatePath='/private/credential-path-canary';
const safe=value=>assert.doesNotMatch(JSON.stringify(value),/PRIVATE_CREDENTIAL_CANARY|credential-path-canary|private-service-canary/);
const failures=[
  ['auth denied',{status:51},'provider_credential_access_denied'],
  ['interaction denied',{status:36},'provider_credential_access_denied'],
  ['timeout',{status:null,signal:'SIGKILL',error:{code:'ETIMEDOUT',message:canary}},'provider_credential_read_timeout'],
  ['unexpected exit',{status:7},'provider_credential_read_failed'],
  ['generic exit is not missing',{status:1},'provider_credential_read_failed'],
  ['spawn failure',{status:null,error:{code:'EPERM',message:canary}},'provider_credential_read_failed'],
  ['interrupted',{status:null,signal:'SIGTERM'},'provider_credential_read_failed'],
];
const options=runSync=>({stateRoot:'/fixture',env:{},platform:'darwin',runSync});
for(const [label,result,code] of failures){
  test('credential '+label+' remains distinct from missing and never exposes process output',()=>{
    const calls=[],read=options((command,args)=>{calls.push(args);return {...result,stdout:canary,stderr:privatePath+' private-service-canary'};});
    assert.throws(()=>readProviderCredential('claude',read),error=>{assert.equal(error.code,code);safe({message:error.message,...error});return true;});
    const metadata=providerCredentialStatus('claude',read);
    assert.equal(metadata.status,'unavailable');assert.equal(metadata.configured,false);assert.equal(metadata.error.code,code);safe(metadata);
    assert.ok(calls[0].includes('-w'));assert.ok(!calls[1].includes('-w'));
  });
}
test('missing and successful credential reads preserve compatibility; thrown runner errors are sanitized',()=>{
  const missing=options(()=>({status:44,stdout:canary,stderr:privatePath}));
  assert.equal(readProviderCredential('claude',missing),'');assert.equal(providerCredentialStatus('claude',missing).status,'missing');
  const ready=options(()=>({status:0,stdout:canary}));assert.equal(readProviderCredential('claude',ready),canary);safe(providerCredentialStatus('claude',ready));
  for(const errorCode of ['ETIMEDOUT','PRIVATE_CREDENTIAL_CANARY']){
    const throwing=options(()=>{throw Object.assign(new Error(privatePath),{code:errorCode,stdout:canary});});
    assert.throws(()=>readProviderCredential('claude',throwing),error=>{assert.equal(error.code,errorCode==='ETIMEDOUT'?'provider_credential_read_timeout':'provider_credential_read_failed');safe({message:error.message,...error});return true;});
  }
});

const providers=[
  ['claude',options=>new ClaudeProviderService(options),{modelId:'sonnet',reasoningEffort:'high',authMode:'api-key'}],
  ['neuraldeep',options=>new NeuralDeepProviderService(options),'fixture-model'],
  ['openrouter',options=>new CompatibleProviderService({...options,connectorId:'openrouter'}),{modelId:'vendor/model',reasoningEffort:'default',timeoutMs:10000}],
];
for(const [provider,create,preset] of providers){
  test(provider+' keeps credential failures actionable through readiness and HTTP without any runtime/network probe',async()=>{
    const forbidden=()=>assert.fail('Credential failures must stop before any runtime or network probe');
    for(const [label,result,code] of failures){
      const reader=options(()=>({...result,stdout:canary,stderr:privatePath}));
      const service=create({root:'/fixture',stateRoot:'/fixture/state',readCredential:name=>readProviderCredential(name,reader),probeCli:forbidden,checkSandbox:forbidden,probeSandbox:forbidden,listModels:forbidden,fetchImpl:forbidden});
      const value=await service.snapshot(preset);assert.equal(value.status,'error',label);assert.equal(value.error.code,code);safe(value);
      await assert.rejects(service.require(preset),error=>{assert.equal(error.code,code);safe({message:error.message,...error});return true;});
      const response=await providerSettingsRequest(new Request('http://127.0.0.1/settings'),provider,{stateRoot:'/fixture/state',snapshot:()=>service.snapshot(preset),status:name=>providerCredentialStatus(name,reader)});
      const body=await response.json();assert.equal(body.provider.error.code,code);assert.equal(body.credentials.status,'unavailable');safe(body);
    }
    const unknown=create({readCredential:()=>{throw Object.assign(new Error(canary),{code:canary,path:privatePath});},fetchImpl:forbidden});
    assert.equal((await unknown.snapshot(preset)).error.code,'provider_credential_read_failed');safe(await unknown.snapshot(preset));
    const missing=create({readCredential:()=>'',fetchImpl:forbidden,probeCli:forbidden});
    assert.equal((await missing.snapshot(preset)).status,'not-configured');
  });
}
test('successful secret read is used only by the server transport and never returned by Settings',async()=>{
  const reader=options(()=>({status:0,stdout:canary}));
  const model={id:'claude-sonnet-5-5',line:'sonnet',lifecycle:'active',createdAt:'2026-10-20T00:00:00Z',efforts:['high'],maxOutputTokens:8192};
  const service=new ClaudeProviderService({root:'/fixture',stateRoot:'/fixture/state',readCredential:provider=>readProviderCredential(provider,reader),checkSandbox:()=>true,probeCli:async()=>({available:true,version:'2.1.296'}),listModels:async({apiKey})=>{assert.equal(apiKey,canary);return [model];}});
  const response=await providerSettingsRequest(new Request('http://127.0.0.1/settings'),'claude',{stateRoot:'/fixture/state',snapshot:()=>service.snapshot(providers[0][2]),status:provider=>providerCredentialStatus(provider,reader)});
  const body=await response.json();assert.equal(body.provider.status,'ready');safe(body);
});
test('successful storage remains reported when the subsequent metadata check is denied or times out',async()=>{
  for(const result of [{status:51},{status:null,error:{code:'ETIMEDOUT',message:canary}}]){
    const args=[];const stored=await storeProviderCredential('claude',canary,{...options((command,argv)=>{args.push(argv);return result;}),spawnImpl:()=>{
      const child=new EventEmitter();child.stdin=new PassThrough();child.stdin.resume();child.stdin.on('finish',()=>child.emit('close',0));child.kill=()=>{};return child;
    }});
    assert.equal(stored.stored,true);assert.equal(stored.status,'unavailable');assert.ok(stored.error);assert.ok(args.every(argv=>!argv.includes('-w')));safe(stored);
  }
});
