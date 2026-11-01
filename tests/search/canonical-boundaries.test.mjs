import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,copyFileSync,linkSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {SearchService} from '../../scripts/search/service.mjs';
import {SearchStore,searchDirectory} from '../../scripts/search/store.mjs';
import {searchSettingsRequest} from '../../scripts/search/settings-api.mjs';
import {createSearchHost} from '../../scripts/search/host.mjs';
import {searchIntent} from '../../scripts/search/intent.mjs';

const context={surface:'task_chat',owner:'chat1',turn:'turn1',connectorId:'neuraldeep'};
function fixture(t,environment={}){
  let calls=0;
  const store=new SearchStore({databasePath:':memory:'});t.after(()=>store.close());
  const provider={search:async()=>{calls++;return {items:[{url:'https://example.com/doc',title:'Evidence',content:'Public data'}],quota:{remaining:5,private_value:'QUOTA_SECRET_CANARY'}};},read:async()=>({items:[]}),quota:async()=>({search:{day:{remaining:2,secret:'QUOTA_SECRET_CANARY'}},private_value:'QUOTA_SECRET_CANARY'})};
  const service=new SearchService({store,environment,providers:{neuraldeep:provider},codeRoot:'/fixture/code',stateRoot:'/fixture/state'});
  return {store,service,provider,calls:()=>calls};
}
test('private queries, offline contexts and original user denials fail before any provider call',async t=>{
  const f=fixture(t);
  for(const query of ['inspect /fixture/code/file','look up /Users/fixture/private','api_key=PRIVATE_CANARY_123456789','https://example.com/?token=PRIVATE_CANARY_123456789'])assert.equal((await f.service.search({query},context)).error.code,'search_query_private');
  for(const change of [{offline:true},{connectorId:'local'},{privacy:'local-private'},{denied:true}])assert.equal((await f.service.search({query:'public'}, {...context,...change})).ok,false);
  for(const text of ['не ищи в интернете','do not browse','do not use search','без интернета'])assert.equal(searchIntent(text).denied,true);
  assert.equal(f.calls(),0);
  const voice=fixture(t,{PRITHA_VOICE_OFFLINE:'1'});assert.equal((await voice.service.search({query:'x'},{...context,surface:'voice'})).error.code,'search_offline');assert.equal(voice.calls(),0);
});
test('host Requested mode trusts original user intent and never model arguments',async t=>{
  const f=fixture(t);f.service.configure({mode:'requested'},1);
  const host=createSearchHost({connectorId:'neuraldeep',chatId:'chat1',turnId:'turn1',text:'Explain this',service:f.service});
  assert.equal((await host.call('web_search',{query:'public',explicit:true})).isError,true);
  assert.equal(f.calls(),0);await host.close();
  const explicit=createSearchHost({connectorId:'neuraldeep',chatId:'chat1',turnId:'turn2',text:'Найди актуальную документацию',service:f.service});
  assert.equal((await explicit.call('web_search',{query:'public'})).isError,false);await explicit.close();
  assert.throws(()=>createSearchHost({connectorId:'openrouter'}),{code:'search_provider_mismatch'});
});
test('closing a task aborts an uncooperative search and cannot publish a late result',async t=>{
  const f=fixture(t);let release,started;const ready=new Promise(resolve=>started=resolve);
  f.provider.search=()=>new Promise(resolve=>{release=resolve;started();});
  const host=createSearchHost({connectorId:'neuraldeep',chatId:'chat1',turnId:'turn1',service:f.service});
  const pending=host.call('web_search',{query:'public'});const rejected=assert.rejects(pending,{code:'operator_cancel'});
  await ready;await host.close();await rejected;release({items:[{url:'https://example.com',content:'LATE_SECRET_CANARY'}]});
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM sources').get().n,0);
  assert.equal(f.store.history('chat1')[0].status,'failed');
});
test('quota and settings responses exclude upstream private fields and search history; settings use CAS',async t=>{
  const f=fixture(t);const result=await f.service.search({query:'public'},context);assert.equal(result.quota.search.remaining,5);assert.ok(!JSON.stringify(result).includes('QUOTA_SECRET_CANARY'));
  const quota=await f.service.diagnose({kind:'quota'},context);assert.equal(quota.quota.search.day.remaining,2);assert.ok(!JSON.stringify(quota).includes('QUOTA_SECRET_CANARY'));
  const request=(method,body)=>searchSettingsRequest(new Request('http://fixture.invalid/search',{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),{service:f.service});
  const status=await(await request('GET')).json();assert.deepEqual(Object.keys(status).sort(),['budgets','health','ok','provider','settings']);
  assert.equal((await request('POST',{mode:'requested',expectedRevision:1})).status,200);
  assert.equal((await request('POST',{mode:'off',expectedRevision:1})).status,409);
  assert.equal((await request('POST',{mode:'off',expectedRevision:2,apiKey:'UNTRUSTED'})).status,400);
  assert.equal(f.store.settings().mode,'requested');
});
test('copied instance databases and hardlinks never acquire authority in another state root',()=>{
  const base=mkdtempSync(path.join(os.tmpdir(),'pritha-search-boundary-'));
  try{
    const a=path.join(base,'a'),b=path.join(base,'b');mkdirSync(a);mkdirSync(b);
    const first=new SearchStore({stateRoot:a,codeRoot:'/code'});first.close();
    const target=searchDirectory(b,'/code');mkdirSync(target,{recursive:true});
    const source=path.join(searchDirectory(a,'/code'),'search.sqlite'),destination=path.join(target,'search.sqlite');copyFileSync(source,destination);
    assert.throws(()=>new SearchStore({stateRoot:b,codeRoot:'/code'}),{code:'instance_mismatch'});
    rmSync(destination);linkSync(source,destination);
    assert.throws(()=>new SearchStore({stateRoot:b,codeRoot:'/code'}),{code:'provider_state_path_invalid'});
  }finally{rmSync(base,{recursive:true,force:true});}
});
