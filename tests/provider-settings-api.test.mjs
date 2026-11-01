import test from 'node:test';
import assert from 'node:assert/strict';
import {providerSettingsRequest} from '../scripts/lib/provider-settings-api.mjs';

const key='PRIVATE_PROVIDER_KEY_CANARY';
const post=(body,headers={'content-type':'application/json'})=>new Request('http://127.0.0.1/api/task-runtime/providers/openrouter',{method:'POST',headers,body:JSON.stringify(body)});
function fixture(){
  const calls=[];
  return {calls,options:{stateRoot:'/instance/state',env:{},
    save:async(...args)=>calls.push(['save',...args]),
    status:(...args)=>{calls.push(['status',...args]);return {configured:true,status:'configured',source:'macos_keychain',maskedValue:'••••••••'};},
    snapshot:async(...args)=>{calls.push(['snapshot',...args]);return {connectorId:args[0],status:'ready'};}}};
}
test('provider key saving is exact, instance-scoped and never echoed; status is private and uncached',async()=>{
  for(const connectorId of ['neuraldeep','claude','openrouter']){
    const f=fixture(),response=await providerSettingsRequest(post({value:key,confirmation:'save-'+connectorId+'-key'}),connectorId,f.options);
    const body=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(body,/PRIVATE_PROVIDER_KEY_CANARY|\/instance\/state/);
    assert.equal(JSON.parse(body).stored,true);assert.deepEqual(f.calls.map(row=>row[0]),['save','status','snapshot']);
    assert.deepEqual(f.calls[0],['save',connectorId,key,{stateRoot:'/instance/state',env:{}}]);
  }
});
test('invalid provider, foreign confirmation and non-key lanes fail before credential or snapshot access',async()=>{
  for(const [connectorId,body] of [['foreign',{value:key}],['codex',{value:key}],['local',{value:key}],['openrouter',{value:key,confirmation:'save-claude-key'}],['claude',{value:key,confirmation:'save-claude-key',apiKey:key}]]){
    const f=fixture(),response=await providerSettingsRequest(post(body),connectorId,f.options);
    assert.equal(response.status,400);assert.equal(f.calls.length,0);assert.doesNotMatch(await response.text(),/PRIVATE_PROVIDER_KEY_CANARY|foreign/);
  }
  for(const connectorId of ['codex','local']){
    const f=fixture(),response=await providerSettingsRequest(new Request('http://127.0.0.1/status'),connectorId,f.options);
    assert.equal(response.status,200);assert.deepEqual(f.calls,[['snapshot',connectorId]]);
  }
});
test('bounded JSON intake rejects streaming overflow, malformed UTF-8 and other content types before saving',async()=>{
  const requests=[post({value:key},{'content-type':'text/plain'}),post({value:'x'.repeat(20000),confirmation:'save-openrouter-key'}),
    new Request('http://127.0.0.1/status',{method:'POST',headers:{'content-type':'application/json'},body:new Uint8Array([0xff,0xfe])})];
  for(const request of requests){const f=fixture(),response=await providerSettingsRequest(request,'openrouter',f.options);assert(response.status>=400);assert.equal(f.calls.length,0);}
});
test('a successful save remains reported when probing fails, with no raw exception or credential details',async()=>{
  const f=fixture();f.options.snapshot=async()=>{throw new Error(key+' PRIVATE_SERVER_ERROR');};
  const response=await providerSettingsRequest(post({value:key,confirmation:'save-openrouter-key'}),'openrouter',f.options),body=await response.text();
  assert.equal(response.status,503);assert.equal(JSON.parse(body).stored,true);assert.match(body,/key was saved/);assert.doesNotMatch(body,/PRIVATE_PROVIDER_KEY_CANARY|PRIVATE_SERVER_ERROR/);
  f.options.save=async()=>{throw null;};const failed=await providerSettingsRequest(post({value:key,confirmation:'save-openrouter-key'}),'openrouter',f.options);assert.equal((await failed.json()).stored,false);
});
