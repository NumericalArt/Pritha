import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as crypto from 'node:crypto';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as http from '../scripts/neuraldeep/voice-provider.mjs';
import * as journal from '../scripts/neuraldeep/voice-journal.mjs';
import {openVoiceJournal} from '../scripts/neuraldeep/voice-journal-store.mjs';
const source=ts.transpileModule(readFileSync('interfaces/control-center/src/lib/voice/provider.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(t,fetcher){
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-voice-provider-')),store=openVoiceJournal({stateRoot});
  t.after(()=>{store.close();rmSync(stateRoot,{recursive:true,force:true});});
  const state={calls:[],leases:0,releases:0,usage:[]};
  const modules={
    './host':{assertVoiceDispatchAllowed:()=>{},getVoiceHost:()=>({voiceJournal:()=>store.journal,acquire:async input=>{input.signal.throwIfAborted();state.leases++;return {release:async()=>{state.releases++;}};}})},
    'node:crypto':crypto,
    '@/lib/pritha-paths':{resolvePrithaStateRoot:()=>stateRoot},
    '../../../../../scripts/neuraldeep/voice-runtime-config.mjs':{voiceRuntimeCredentials:()=>({origin:'https://fixture.invalid',key:'SYNTHETIC_VOICE_KEY',instanceId:'fixture'}),recordVoiceUsage:(_root,receipt)=>state.usage.push(receipt)},
    '../../../../../scripts/neuraldeep/voice-journal.mjs':journal,
    '../../../../../scripts/neuraldeep/voice-provider.mjs':{...http,voiceHttp:options=>http.voiceHttp({...options,fetcher:async(url,request)=>{state.calls.push({url,request});return fetcher(url,request);}})},
  };
  const module={exports:{}};
  new Function('module','exports','require',source)(module,module.exports,name=>{assert.ok(modules[name],name);return modules[name];});
  return {...module.exports,state,store,identity:{sessionId:'session',turnId:'turn',signal:new AbortController().signal},settings:{model:'qwen3.6-35b-a3b-noreason',sttModel:'whisper-1',voice:'serena',language:'ru'}};
}
const stream=(events,done=true)=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('')+(done?'data: [DONE]\n\n':''),{headers:{'content-type':'text/event-stream'}});

test('actual completion transport keeps tool fragments, usage and durable receipts within one admitted HTTP call',async t=>{
  const f=fixture(t,async()=>stream([
    {choices:[{delta:{tool_calls:[{index:0,id:'call-1',function:{name:'inspect_pritha_files',arguments:'{"operation":'}}]}}]},
    {choices:[{delta:{tool_calls:[{index:0,function:{arguments:'"status"}'}}]},finish_reason:'tool_calls'}]},
    {usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}},
  ]));
  const result=await f.voiceCompletion(f.identity,f.settings,[{role:'user',content:'PRIVATE_PROMPT_CANARY'}],[]);
  assert.equal(result.calls[0].function.arguments,'{"operation":"status"}');assert.equal(f.state.calls.length,1);
  assert.equal(f.state.calls[0].request.headers.Authorization,'Bearer SYNTHETIC_VOICE_KEY');assert.equal(f.state.calls[0].request.redirect,'error');
  assert.equal(f.state.leases,1);assert.equal(f.state.releases,1);assert.equal(f.state.usage[0].metadata.usageKnown,true);
  const rows=f.store.coordinator.db.prepare('SELECT * FROM voice_http_requests').all();assert.equal(rows[0].status,'completed');
  assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_PROMPT_CANARY|SYNTHETIC_VOICE_KEY/);
});
test('lost completion is failed and unknown, never retried or converted into zero observed usage',async t=>{
  const f=fixture(t,async()=>stream([{choices:[{delta:{content:'incomplete'}}]}],false));
  await assert.rejects(f.voiceCompletion(f.identity,f.settings,[],[]),/provider_stream_incomplete/);
  assert.equal(f.state.calls.length,1);assert.equal(f.state.releases,1);assert.equal(f.state.usage[0].status,'failed');assert.equal(f.state.usage[0].metadata.usageKnown,false);
});
test('malformed tool identity and excessive output do not escape to a tool handler',async t=>{
  for(const response of [
    stream([{choices:[{delta:{tool_calls:[{index:0,function:{name:'run_codex_task',arguments:'{}'}}]},finish_reason:'tool_calls'}]}]),
    stream([{choices:[{delta:{content:'x'.repeat(16001)},finish_reason:'stop'}]}]),
  ]){
    const f=fixture(t,async()=>response);await assert.rejects(f.voiceCompletion(f.identity,f.settings,[],[]),/provider_tool_identity|voice_output_limit/);assert.equal(f.state.releases,1);
  }
});
test('STT and TTS use bounded direct requests and never retain raw audio or spoken text in the journal',async t=>{
  const audio=new Uint8Array([1,2,3,4]);
  const f=fixture(t,async url=>url.pathname.endsWith('transcriptions')?Response.json({text:'  Привет  '}):new Response(audio,{headers:{'content-type':'audio/wav','x-tts-engine':'fixture'}}));
  assert.equal(await f.voiceTranscribe(f.identity,f.settings,audio),'Привет');
  assert.deepEqual(new Uint8Array(await f.voiceSynthesize(f.identity,f.settings,'PRIVATE_SPEECH_CANARY')),audio);
  assert.ok(f.state.calls[0].request.body instanceof FormData);assert.equal(f.state.calls[0].request.body.get('language'),'ru');
  assert.equal(JSON.parse(f.state.calls[1].request.body).language,'Russian');assert.equal(f.state.releases,2);
  const receipts=f.store.coordinator.db.prepare('SELECT * FROM voice_http_requests').all();assert.equal(receipts.length,2);
  assert.doesNotMatch(JSON.stringify(receipts),/PRIVATE_SPEECH_CANARY|SYNTHETIC_VOICE_KEY/);assert.equal(f.state.usage.length,0);
});
test('abort before dispatch prevents a provider request; a provider error never causes fallback',async t=>{
  const f=fixture(t,async()=>new Response('PRIVATE_UPSTREAM_ERROR',{status:401}));
  await assert.rejects(f.voiceCompletion({...f.identity,signal:AbortSignal.abort()},f.settings,[],[]));assert.equal(f.state.calls.length,0);
  await assert.rejects(f.voiceCompletion(f.identity,f.settings,[],[]),error=>error.code==='provider_auth'&&!error.message.includes('PRIVATE'));
  assert.equal(f.state.calls.length,1);assert.equal(f.state.releases,1);
});
