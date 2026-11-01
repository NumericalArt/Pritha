import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeProviderService } from '../scripts/claude/provider-service.mjs';

const models=[{id:'claude-sonnet-5-5',line:'sonnet',lifecycle:'active',createdAt:'2026-10-20T00:00:00Z',efforts:['low','medium','high'],maxOutputTokens:64000}];
const preset={modelId:'sonnet',reasoningEffort:'medium',timeoutMs:30000,authMode:'api-key',sandbox:'read-only'};
function fixture(options={}){return new ClaudeProviderService({root:'/fixture',stateRoot:'/fixture/state',privateRoot:'/fixture/state/claude',readCredential:()=> 'SYNTHETIC_KEY',probeCli:async()=>({available:true,version:'2.1.296'}),checkSandbox:()=>true,listModels:async()=>models,...options});}
test('Claude readiness resolves an alias once using current metadata and verifies effort',async()=>{
  let calls=0;const service=fixture({listModels:async()=>{calls++;return models;}}),ready=await service.snapshot(preset);
  assert.equal(ready.status,'ready');assert.equal(ready.capabilities.sandbox,'host-enforced');assert.equal(ready.model.id,models[0].id);
  const pinned=await service.resolveConfiguration(preset);assert.equal(pinned.modelId,models[0].id);assert.equal(calls,1);
  assert.equal((await service.snapshot({...preset,reasoningEffort:'max'})).error.code,'provider_effort_unavailable');
  await assert.rejects(service.require({...preset,modelId:'claude-retired-1'}),{code:'provider_model_unavailable'});
});
test('unavailable auth, CLI and sandbox cannot look ready or trigger inference',async()=>{
  const missing=fixture({readCredential:()=>null,listModels:async()=>assert.fail('No key must not invoke a catalog')});assert.equal((await missing.snapshot(preset)).status,'not-configured');
  assert.equal((await missing.snapshot({...preset,authMode:'local-cli-session'})).error.code,'provider_auth_mode_unverified');
  assert.equal((await fixture({probeCli:async()=>({available:false,code:'provider_runtime_unverified'})}).snapshot(preset)).status,'unavailable');
  assert.equal((await fixture({checkSandbox:()=>{throw Object.assign(new Error('PRIVATE_CANARY'),{code:'provider_sandbox_unavailable'});}}).snapshot(preset)).error.code,'provider_sandbox_unavailable');
});
test('catalog failures are sanitized and credential rotation invalidates metadata cache',async()=>{
  let key='FIRST_CANARY',calls=0;const service=fixture({readCredential:()=>key,listModels:async()=>{calls++;return models;}});
  await service.snapshot(preset);await service.snapshot(preset);assert.equal(calls,1);key='SECOND_CANARY';await service.snapshot(preset);assert.equal(calls,2);
  const error=await fixture({listModels:async()=>{throw new Error('SECRET_CANARY');}}).snapshot(preset);assert.equal(error.status,'error');assert.doesNotMatch(JSON.stringify(error),/CANARY/);
});
