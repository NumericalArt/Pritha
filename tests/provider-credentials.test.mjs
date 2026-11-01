import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { providerCredentialService,providerCredentialStatus,readProviderCredential,storeProviderCredential } from '../scripts/lib/provider-credential.mjs';

test('provider credential services isolate instances and status does not retrieve Keychain secrets',()=>{
  const calls=[],options={stateRoot:'/fixture/one',env:{},platform:'darwin',runSync:(command,args)=>{calls.push({command,args});return {status:0,stdout:'SECRET_CANARY'};}};
  const first=providerCredentialService('neuraldeep',options);
  assert.notEqual(first,providerCredentialService('neuraldeep',{...options,stateRoot:'/fixture/two'}));
  assert.notEqual(first,providerCredentialService('claude',options));
  assert.equal(providerCredentialStatus('neuraldeep',options).configured,true);
  assert.ok(!calls[0].args.includes('-w'));assert.doesNotMatch(JSON.stringify(providerCredentialStatus('neuraldeep',options)),/SECRET_CANARY/);
  assert.equal(readProviderCredential('neuraldeep',options),'SECRET_CANARY');assert.ok(calls.at(-1).args.includes('-w'));
  assert.equal(providerCredentialService('neuraldeep',{...options,env:{PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'pritha-neuraldeep'}}),'pritha-neuraldeep');
  assert.throws(()=>providerCredentialService('claude',{...options,env:{PRITHA_ANTHROPIC_KEYCHAIN_SERVICE:'../other'}}),{code:'provider_credential_service_invalid'});
});

test('environment lookup uses only the requested provider and never extracts OAuth',()=>{
  const options={stateRoot:'/fixture',platform:'linux',env:{ANTHROPIC_API_KEY:'ANTHROPIC_CANARY',OPENAI_API_KEY:'OPENAI_CANARY',OPENROUTER_API_KEY:'OPENROUTER_CANARY',CLAUDE_CODE_OAUTH_TOKEN:'OAUTH_CANARY'}};
  assert.equal(readProviderCredential('neuraldeep',options),'');
  assert.equal(readProviderCredential('claude',options),'ANTHROPIC_CANARY');
  assert.equal(readProviderCredential('openrouter',options),'OPENROUTER_CANARY');
  assert.equal(readProviderCredential('claude',{...options,env:{CLAUDE_CODE_OAUTH_TOKEN:'OAUTH_CANARY'}}),'');
  assert.throws(()=>readProviderCredential('claude',{...options,env:{ANTHROPIC_API_KEY:'BAD\nKEY'}}),{code:'provider_credential_invalid'});
  assert.throws(()=>providerCredentialStatus('codex',options),{code:'provider_credentials_not_applicable'});
});

test('Keychain writes carry the secret only on stdin with a bounded process and masked result',async()=>{
  let invocation,input='';
  const options={stateRoot:'/fixture',env:{},platform:'darwin',runSync:()=>({status:0}),spawnImpl:(command,args,options)=>{
    invocation={command,args,options};const child=new EventEmitter();child.stdin=new PassThrough();child.stdin.on('data',chunk=>input+=chunk);child.stdin.on('finish',()=>child.emit('close',0));child.kill=()=>{};return child;
  }};
  const result=await storeProviderCredential('openrouter','SECRET_CANARY',options);
  assert.equal(result.stored,true);assert.equal(result.configured,true);assert.equal(invocation.args.at(-1),'-w');
  assert.equal(input,'SECRET_CANARY\nSECRET_CANARY\n');assert.doesNotMatch(JSON.stringify(invocation)+JSON.stringify(result),/SECRET_CANARY/);
  assert.equal(invocation.options.shell,false);
});
