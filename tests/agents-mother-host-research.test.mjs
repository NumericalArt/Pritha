import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {HostResearch} from '../scripts/agents-mother/host-research.mjs';
import {rankedSourceQuotes} from '../scripts/agents-mother/source-passages.mjs';

const prose='The Realtime interface uses an explicit session configuration and a browser WebRTC connection. The server keeps credentials private and returns short-lived access for the selected voice session.';
const topic={id:'openai-realtime',topic:'Realtime sessions',query:'Realtime session configuration WebRTC',required:true};
const synthesis={relationship:'refines',memory_comparison:'Official documentation refines the stored session configuration and transport guidance.',summary:'Retain browser WebRTC with server-owned session credentials and the reviewed configuration.',architecture_decision:'Use the reviewed session configuration with private server credentials and explicit connection controls.',repository_adoption_recommendation:'proceed',alternatives:['Use a text interface','Use server-side audio transport'],tradeoffs:['WebRTC requires browser microphone setup','Server audio adds transport complexity']};
function fixture(t,changes={}){
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-host-research-')),stateRoot=path.join(root,'state'),directory=path.join(stateRoot,'agents','research');mkdirSync(directory,{recursive:true});t.after(()=>rmSync(root,{recursive:true,force:true}));
  const fullPath=path.join(directory,'research.md'),text='---\nid: host-research-fixture\ntype: review\nstatus: draft\ncreated: 2026-11-01\nupdated: 2026-11-01\nresearch_gate_status: pending\nmemory_research_status: complete\nexternal_research_status: pending\nsynthesis_status: pending\n---\n\n# Research\n\n## External Research Evidence\n\nPending.\n\n## Memory vs External Comparison\n\nPending.\n\n## Scaffold Gate Decision\n\nPending.\n';writeFileSync(fullPath,text);
  let searchCalls=0,readCalls=0;
  const service={search:async()=>{searchCalls++;return {id:'search-fixture',ok:true,status:'ok',sources:[{url:'https://platform.openai.com/docs/guides/realtime'}]};},readPage:async({url})=>{readCalls++;return {id:'read-fixture',ok:true,status:'ok',sources:[{url,read:true,text:prose,title:'Official Realtime documentation',retrieved_at:new Date().toISOString()}]};}};
  const options={root,stateRoot,data:{fingerprint:'fixture-fingerprint',text:'accepted contract',relPath:'contract.md',repositoryAdoptionMode:'none'},report:{fullPath,text},patternLock:'fixture-pattern-lock',topics:[topic],connectorId:'neuraldeep',environment:{},service,...changes};
  const host=new HostResearch(options);
  return {host,options,service,counts:()=>({searchCalls,readCalls}),selection:()=>({facts:host.status().sources.map(source=>({topicId:source.topicId,sourceId:source.id,passageId:source.passages[0].id,versionContext:'Realtime session API documentation version fixture v1, verified during this collection.',compatibility:'The documented session configuration is compatible with the selected runtime contract.',compatibilityStatus:'compatible'})),synthesis})};
}
test('durable collection resumes without re-reading sources; passages remain exact and untrusted',async t=>{
  const f=fixture(t);const result=await f.host.collect();assert.equal(result.status,'collected');assert.equal(result.sources[0].untrusted,true);assert.equal(result.sources[0].publishedAt,'unknown');assert.ok(prose.includes(result.sources[0].passages[0].quote));assert.equal(result.sources[0].text,undefined);
  await new HostResearch(f.options).collect();assert.deepEqual(f.counts(),{searchCalls:1,readCalls:1});
  assert.equal(readFileSync(f.options.report.fullPath,'utf8'),f.options.report.text);
});
test('known source failures require an explicit retry, are bounded and preserve previous sources',async t=>{
  const f=fixture(t);f.service.readPage=async()=>({ok:false,error:{code:'auth_failed'}});
  await assert.rejects(f.host.collect(),{code:'auth_failed'});await assert.rejects(f.host.collect(),{code:'research_retry_required'});
  await assert.rejects(new HostResearch(f.options).collect({retryFailed:true}),{code:'auth_failed'});await assert.rejects(f.host.collect({retryFailed:true}),{code:'research_source_limit'});assert.equal(f.counts().searchCalls,2);
});
test('a started checkpoint after a crash never automatically repeats a source request',async t=>{
  const f=fixture(t);f.service.readPage=async()=>({ok:false,error:{code:'timeout'}});await assert.rejects(f.host.collect());
  const state=JSON.parse(readFileSync(f.host.file,'utf8'));state.topics[topic.id].status='started';writeFileSync(f.host.file,JSON.stringify(state));
  await assert.rejects(new HostResearch(f.options).collect({retryFailed:true}),{code:'research_source_unconfirmed'});assert.equal(f.counts().searchCalls,1);
});
test('source and total deadlines terminate an uncooperative provider and survive restart',async t=>{
  const f=fixture(t,{sourceMs:50,totalMs:100});f.service.readPage=()=>new Promise(()=>{});
  await assert.rejects(f.host.collect(),{code:'research_source_timeout'});
  await new Promise(resolve=>setTimeout(resolve,65));await assert.rejects(new HostResearch(f.options).collect({retryFailed:true}),{code:'research_deadline_exceeded'});
  assert.equal(f.host.status().sources.length,0);
});
test('offline, unapproved authority, changed contract and changed report fail before publication',async t=>{
  const offline=fixture(t,{connectorId:'local'});await assert.rejects(offline.host.collect(),{code:'research_offline'});assert.deepEqual(offline.counts(),{searchCalls:0,readCalls:0});
  const f=fixture(t);await assert.rejects(f.host.collect({sourceUrls:{[topic.id]:'https://evil.example/prompt'}}),{code:'research_primary_url_invalid'});assert.deepEqual(f.counts(),{searchCalls:0,readCalls:0});
  await f.host.collect();
  assert.throws(()=>new HostResearch({...f.options,data:{...f.options.data,text:'changed contract'}}).status(),{code:'research_context_changed'});
  writeFileSync(f.options.report.fullPath,'changed report');await assert.rejects(f.host.collect({retryFailed:true}),{code:'research_report_changed'});
});
test('selection binds exact source and passage IDs; unknown compatibility cannot authorize evidence',async t=>{
  const f=fixture(t);await f.host.collect();const selection=f.selection();selection.facts[0].quote=prose;
  await assert.rejects(f.host.publish(selection),{code:'research_quote_unbound'});delete selection.facts[0].quote;
  selection.facts[0].passageId='invented';await assert.rejects(f.host.publish(selection),{code:'research_quote_unbound'});
  const incompatible=f.selection();incompatible.facts[0].compatibilityStatus='unknown';await assert.rejects(f.host.publish(incompatible),{code:'research_evidence_incomplete'});
});
test('publication recovers after journal-before-CAS interruption without another model or source call',async t=>{
  const f=fixture(t);await f.host.collect();const selection=f.selection();
  await assert.rejects(f.host.publish(selection,{evaluateOverallGate:()=>({status:'pending',reasons:['independent_gate_still_required']}),afterPrepared:()=>{throw Error('simulated publication interruption');}}),/simulated publication interruption/);
  assert.equal(readFileSync(f.options.report.fullPath,'utf8'),f.options.report.text);
  const recovered=await new HostResearch(f.options).publish(selection);assert.equal(recovered.status,'completed');
  const report=readFileSync(f.options.report.fullPath,'utf8');assert.match(report,/research_gate_status: pending/);assert.match(report,/independent_gate_still_required/);assert.match(report,/research_content_lock: sha256:/);
  await f.host.publish(selection);assert.deepEqual(f.counts(),{searchCalls:1,readCalls:1});
  await assert.rejects(f.host.publish({...selection,synthesis:{...synthesis,summary:'changed'}}),{code:'research_selection_changed'});
});
test('checkpoint text corruption and a redirected report path fail closed',async t=>{
  const f=fixture(t);await f.host.collect();const state=JSON.parse(readFileSync(f.host.file,'utf8'));state.sources[0].text+=' corrupt';writeFileSync(f.host.file,JSON.stringify(state));assert.throws(()=>f.host.status(),{code:'research_source_stale'});
  const g=fixture(t);await g.host.collect();rmSync(g.options.report.fullPath);symlinkSync(f.options.report.fullPath,g.options.report.fullPath);await assert.rejects(g.host.publish(g.selection()),{code:'provider_state_path_invalid'});
});
test('ranked passages keep bounded Unicode and exclude navigation while covering requested facts',()=>{
  const text=Array.from({length:30},(_,i)=>`Данные 🌍 ${i}: HTTP server preserves records; ответы не дают новых прав. ${'Содержимое проверяется. '.repeat(10)}`).join('\n\n');
  const quotes=rankedSourceQuotes(text,'HTTP server данные records');assert.ok(quotes.length>0 && quotes.length<=8);assert.ok(quotes.reduce((sum,quote)=>sum+Buffer.byteLength(quote),0)<=2400);for(const quote of quotes){assert.ok(text.includes(quote));assert.doesNotMatch(quote,/\uFFFD/);}
  assert.deepEqual(rankedSourceQuotes('[HTTP API](https://example.com/http-api)\n\n[Other docs](https://example.com/docs)','HTTP API'),[]);
});

test('future page timestamps and caller cancellation cannot produce usable evidence',async t=>{
  const f=fixture(t);f.service.readPage=async({url})=>({ok:true,sources:[{url,read:true,text:prose,retrieved_at:new Date(Date.now()+86400000).toISOString()}]});
  await assert.rejects(f.host.collect(),{code:'research_source_stale'});assert.equal(f.host.status().sources.length,0);
  const controller=new AbortController(),g=fixture(t,{signal:controller.signal});let started;const ready=new Promise(resolve=>started=resolve);g.service.readPage=()=>{started();return new Promise(()=>{});};
  const work=g.host.collect(),rejected=assert.rejects(work,{name:'AbortError'});await ready;controller.abort();await rejected;assert.equal(g.host.status().sources.length,0);
});

test('no required external topics needs no network even in an offline local profile',async t=>{
  const f=fixture(t,{connectorId:'local',topics:[],environment:{PRITHA_SEARCH_OFFLINE:'1'}});assert.equal((await f.host.collect()).status,'collected');assert.deepEqual(f.counts(),{searchCalls:0,readCalls:0});
});
