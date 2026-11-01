import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import * as contexts from '../scripts/lib/voice-session-contexts.mjs';
import * as policy from '../scripts/lib/provider-profile.mjs';
const require=createRequire(import.meta.url);
class VoiceEngineError extends Error{constructor(code,message,status=409){super(message);Object.assign(this,{code,status});}}
class JsonResponse extends Response{
  cookies={set:(name,value)=>this.headers.append('set-cookie',`${name}=${value}; HttpOnly; SameSite=Strict; Path=/api`)};
  static json(body,init){return new JsonResponse(JSON.stringify(body),{...init,headers:{'Content-Type':'application/json'}});}
}
function load(file,modules,environment={env:{}}){
  const module={exports:{}};
  new Function('require','module','exports','process',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>Object.hasOwn(modules,name)?modules[name]:createRequire(path.resolve(file))(name),module,module.exports,environment);
  return module.exports;
}
function fixture(t){
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-voice-host-context-')),coordinator=new ExecutionCoordinator({stateRoot:root});
  t.after(()=>{coordinator.close();rmSync(root,{recursive:true,force:true});});
  const environment={env:{}},settings={activeConnectorId:'codex',voiceEngine:'auto',revision:1,providerPresets:Object.fromEntries(policy.PROVIDER_CONNECTOR_IDS.map(id=>[id,{...policy.defaultProviderPreset(id),modelId:id+'-fixture'}]))};
  const native={voiceModel:'gpt-realtime-2',prithaVoice:'marin',codexServiceTier:'standard'},calls=[];
  const engine={VoiceEngineError,requireVoiceEngine:wanted=>{
    if(settings.activeConnectorId==='local')throw new VoiceEngineError('voice_offline','Cloud voice is disabled.');
    const resolved=policy.resolveVoiceEngine({connectorId:settings.activeConnectorId,engine:settings.voiceEngine,configured:{openai:true,neuraldeep:true}});
    if(resolved.engine!==wanted)throw new VoiceEngineError('voice_engine_changed','Reconnect.');
    return {...resolved,connectorId:settings.activeConnectorId,revision:settings.revision,chained:{model:'voice-fixture',voice:'serena'}};
  }};
  const provider={getPrithaRuntimeSettings:()=>native,usesLiveVoice:()=>native.voiceModel==='gpt-live-1',
    VOICE_INTAKE_MAX_FILES:8,VOICE_INTAKE_MAX_FILE_BYTES:10*1024*1024,VOICE_INTAKE_MAX_TOTAL_BYTES:25*1024*1024,
    buildPrithaRealtimeTools:()=>[],
    async createPrithaVoiceIntakeCodexTask(input,host){calls.push(['intake',input,host]);return {ok:true,connector:host.taskSelection.connectorId,model:host.taskSelection.preset.modelId};},
    buildRealtimeSessionConfig:options=>({model:options.voiceModel || native.voiceModel,audio:{output:{voice:options.voice || native.prithaVoice}},tools:[]}),
    async createEphemeralRealtimeSession(options){calls.push(['ephemeral',options]);settings.activeConnectorId='claude';native.voiceModel='gpt-live-1';return {client_secret:{value:'synthetic-ephemeral'}};},
    async createRealtimeCall(){calls.push(['call']);return 'fixture-sdp';},
    async createLiveCall(_sdp,options){calls.push(['live',options]);return {answerSdp:'fixture-sdp'};},
    async handlePrithaRealtimeTool(name,args,host){calls.push(['tool',name,host]);return {ok:true,connector:host.taskSelection?.connectorId,model:host.taskSelection?.preset.modelId};},
    RealtimeProviderError:class extends Error{}};
  const api=load('interfaces/control-center/src/lib/voice/session-context.ts',{
    '../../../../../scripts/lib/voice-session-contexts.mjs':contexts,'../codex-chat/native-turn-coordinator':{nativeExecutionCoordinator:()=>coordinator},
    '../pritha-paths':{resolvePrithaStateRoot:()=>root},'../settings/provider-settings-server':{getProviderSettings:()=>settings},
    '../realtime/pritha-runtime':provider,'../realtime/voice-engine-server':engine,'../realtime/voice-settings':{isVoiceModel:value=>['gpt-realtime-2','gpt-live-1'].includes(value)},
  },environment);
  const routes=Object.fromEntries(['session','call','tool','intake'].map(name=>[name,load(`interfaces/control-center/src/app/api/realtime/${name}/route.ts`,{
    'next/server':{NextResponse:JsonResponse},'@/lib/voice/session-context':api,'@/lib/realtime/pritha-runtime':provider,
    '@/lib/realtime/voice-engine-server':engine,'../../../../../../../scripts/lib/voice-session-contexts.mjs':contexts,
  },environment)]));
  routes.neuraldeep=load('interfaces/control-center/src/app/api/voice/[...path]/route.ts',{
    'next/server':{NextResponse:JsonResponse},'@/lib/voice/session-context':api,'@/lib/realtime/pritha-runtime':provider,
    '@/lib/realtime/voice-engine-server':engine,'../../../../../../../scripts/lib/voice-session-contexts.mjs':contexts,
    '../../../../../../../scripts/neuraldeep/voice-runtime-config.mjs':{voiceRuntimeCredentials:()=>({key:'synthetic'})},
    '@/lib/voice/host':{assertVoiceDispatchAllowed:()=>engine.requireVoiceEngine('neuraldeep'),getVoiceHost:()=>({})},
    '@/lib/voice/sessions':{voiceOwner:()=> 'b'.repeat(64),createVoiceSession:(owner,musicControlEnabled,contextOwner)=>({id:'nd-fixture',owner,musicControlEnabled,hostContext:api.openVoiceSessionContext(contextOwner,'neuraldeep'),settings:{}})},
  },environment);
  const request=(data,cookie='',method='POST')=>new Request('http://fixture.invalid/api/realtime/session',{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
  const intakeRequest=(contextId,cookie,form=new FormData())=>new Request('http://fixture.invalid/api/realtime/intake',{method:'POST',headers:{cookie,'X-Pritha-Voice-Context':contextId},body:form});
  return {api,routes,settings,native,environment,calls,request,intakeRequest};
}
test('native session captures protocol and task selection before asynchronous provider setup',async t=>{
  const f=fixture(t),response=await f.routes.session.POST(f.request({musicControlEnabled:false})),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.voice_api,'realtime');assert.equal(body.model,'gpt-realtime-2');assert.equal(body.voiceContext.taskConnectorId,'codex');
  const cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  const call=await f.routes.call.POST(f.request({contextId:body.voiceContext.id,voiceApi:'realtime',offerSdp:'fixture',ephemeralKey:'synthetic'},cookie));
  assert.equal(call.status,200);assert.equal(f.calls.at(-1)[0],'call');
  const tool=await f.routes.tool.POST(f.request({contextId:body.voiceContext.id,name:'run_codex_task',arguments:{task:'fixture'}},cookie));
  assert.deepEqual(await tool.json(),{ok:true,connector:'codex',model:'codex-fixture'});
  assert.equal(f.settings.activeConnectorId,'claude');assert.equal(f.native.voiceModel,'gpt-live-1');
  const publicContext=JSON.stringify(body.voiceContext);assert.doesNotMatch(publicContext,/owner|instance|expires|private|cookie/);
  const closed=await f.routes.session.DELETE(f.request({contextId:body.voiceContext.id},cookie,'DELETE'));assert.equal(closed.status,200);
  const count=f.calls.length,stale=await f.routes.tool.POST(f.request({contextId:body.voiceContext.id,name:'run_codex_task',arguments:{task:'late'}},cookie));
  assert.equal(stale.status,409);assert.equal(f.calls.length,count);
});
test('a context cannot cross browser ownership or silently fall back from an unknown ID',async t=>{
  const f=fixture(t),response=await f.routes.session.POST(f.request({})),body=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  const count=f.calls.length;
  for(const [contextId,owner] of [[body.voiceContext.id,''],['vctx_'+'b'.repeat(32),cookie],[null,cookie]]){
    const output=await f.routes.tool.POST(f.request({contextId,name:'run_codex_task',arguments:{task:'fixture'}},owner));
    assert.equal(output.status,409);assert.equal(f.calls.length,count);
  }
});
test('every task connector retains its session snapshot while hard offline policy still blocks cloud',t=>{
  const f=fixture(t);
  const cookie='pritha-voice-owner=11111111-2222-4333-8444-555555555555',owner=f.api.voiceContextOwner(f.request({},cookie)).owner;
  for(const connector of policy.PROVIDER_CONNECTOR_IDS){
    f.settings.activeConnectorId=connector;f.settings.voiceEngine='neuraldeep';
    if(connector==='local'){assert.throws(()=>f.api.openVoiceSessionContext(owner,'neuraldeep'),{code:'voice_offline'});continue;}
    const saved=f.api.openVoiceSessionContext(owner,'neuraldeep');
    f.settings.activeConnectorId='codex';f.settings.voiceEngine='openai';
    const restored=f.api.getVoiceSessionContext(saved.id,owner,'neuraldeep');assert.equal(restored.connectorId,connector);
    assert.equal(f.api.voiceTaskSelection(restored).preset.modelId,connector+'-fixture');
    assert.throws(()=>f.api.getVoiceSessionContext(saved.id,owner,'openai'),{code:'voice_context_engine_mismatch'});
    assert.throws(()=>f.api.assertVoiceContextAllowed({...saved,engine:'openai'},'openai'),{code:'voice_context_engine_mismatch'});
  }
  f.settings.activeConnectorId='codex';f.settings.voiceEngine='openai';
  const saved=f.api.openVoiceSessionContext(owner,'openai');f.environment.env.PRITHA_VOICE_OFFLINE='1';
  assert.throws(()=>f.api.getVoiceSessionContext(saved.id,owner),{code:'voice_offline'});
  f.environment.env.PRITHA_VOICE_OFFLINE='0';assert.throws(()=>f.api.assertVoiceContextAllowed({...saved,connectorId:'local'}),{code:'voice_offline'});
});
test('Live startup uses its captured model and rejects a protocol mismatch before a provider call',async t=>{
  const f=fixture(t);f.native.voiceModel='gpt-live-1';
  const response=await f.routes.session.POST(f.request({})),body=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  f.native.voiceModel='gpt-realtime-2';f.settings.activeConnectorId='neuraldeep';
  const mismatch=await f.routes.call.POST(f.request({contextId:body.voiceContext.id,voiceApi:'realtime',offerSdp:'fixture'},cookie));
  assert.equal(mismatch.status,409);assert.equal(f.calls.length,0);
  const valid=await f.routes.call.POST(f.request({contextId:body.voiceContext.id,voiceApi:'live',offerSdp:'fixture'},cookie));
  assert.equal(valid.status,200);assert.equal(f.calls[0][0],'live');assert.equal(f.calls[0][1].voiceModel,'gpt-live-1');
});

for(const voice of ['openai','neuraldeep'])test(`${voice} intake uses its host context across all task connectors and default changes`,async t=>{
  const f=fixture(t);
  for(const connector of policy.PROVIDER_CONNECTOR_IDS){
    f.settings.activeConnectorId=connector;f.settings.voiceEngine=voice;
    const before=f.calls.length;
    const response=voice==='openai'?await f.routes.session.POST(f.request({})):await f.routes.neuraldeep.POST(f.request({}),{params:Promise.resolve({path:['sessions']})});
    if(connector==='local'){assert.equal(response.status,409);assert.equal(f.calls.length,before);continue;}
    assert.equal(response.status,200);
    const body=await response.json(),cookie=response.headers.getSetCookie().find(value=>value.startsWith('pritha-voice-owner=')).split(';')[0];
    f.settings.activeConnectorId='openrouter';f.settings.voiceEngine='openai';
    const form=new FormData();form.set('text','https://example.test/source');form.set('confirmed_instruction','Summarize source');form.set('connectorId','untrusted-form-value');
    const output=await f.routes.intake.POST(f.intakeRequest(body.voiceContext.id,cookie,form));
    assert.equal(output.status,200);assert.deepEqual(await output.json(),{ok:true,connector,model:connector+'-fixture'});
    const call=f.calls.at(-1);assert.equal(call[0],'intake');assert.equal(call[1].files.length,0);assert.equal(call[2].taskSelection.contextId,body.voiceContext.id);
  }
});

test('intake rejects missing or foreign context before consuming multipart bytes',async t=>{
  const f=fixture(t),created=await f.routes.session.POST(f.request({})),body=await created.json();
  for(const id of [body.voiceContext.id,'vctx_'+'c'.repeat(32)]){
    let reads=0;
    const stream=new ReadableStream({pull(controller){reads++;controller.close();}},{highWaterMark:0});
    const request=new Request('http://fixture.invalid/api/realtime/intake',{method:'POST',duplex:'half',headers:{'Content-Type':'multipart/form-data; boundary=fixture','X-Pritha-Voice-Context':id},body:stream});
    const response=await f.routes.intake.POST(request);assert.equal(response.status,409);assert.equal(reads,0);
  }
  assert.equal(f.calls.some(row=>row[0]==='intake'),false);
});

test('intake limits file count, per-file bytes and the total streamed body before dispatch',async t=>{
  const f=fixture(t),created=await f.routes.session.POST(f.request({})),body=await created.json(),cookie=created.headers.getSetCookie()[0].split(';')[0];
  for(const sizes of [Array(9).fill(1),[10*1024*1024+1],[9*1024*1024,9*1024*1024,8*1024*1024]]){
    const form=new FormData();for(const size of sizes)form.append('files',new Blob([new Uint8Array(size)]),'fixture.bin');
    const encoded=f.intakeRequest(body.voiceContext.id,cookie,form);
    const wire=new Request(encoded.url,{method:'POST',headers:encoded.headers,body:await encoded.arrayBuffer()});
    const result=await f.routes.intake.POST(wire);assert.equal(result.status,413);
  }
  const malformed=new Request('http://fixture.invalid/api/realtime/intake',{method:'POST',headers:{cookie,'Content-Type':'multipart/form-data; boundary=fixture','X-Pritha-Voice-Context':body.voiceContext.id},body:'invalid multipart'});
  assert.equal((await f.routes.intake.POST(malformed)).status,400);
  assert.equal(f.calls.some(row=>row[0]==='intake'),false);
});

test('an oversized streaming upload is cancelled and hard offline rejects before body consumption',async t=>{
  const f=fixture(t),created=await f.routes.session.POST(f.request({})),body=await created.json(),cookie=created.headers.getSetCookie()[0].split(';')[0];
  for(const offline of [false,true]){
    let reads=0,cancelled=false;
    const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}},{highWaterMark:0});
    f.environment.env.PRITHA_VOICE_OFFLINE=offline?'1':'0';
    const request=new Request('http://fixture.invalid/api/realtime/intake',{method:'POST',duplex:'half',headers:{cookie,'Content-Type':'multipart/form-data; boundary=fixture','X-Pritha-Voice-Context':body.voiceContext.id},body:stream});
    const response=await f.routes.intake.POST(request);
    assert.equal(response.status,offline?409:413);assert.equal(reads,offline?0:27);assert.equal(cancelled,!offline);
  }
  assert.equal(f.calls.some(row=>row[0]==='intake'),false);
});

test('closing a context during upload prevents the pending intake from starting a task',async t=>{
  const f=fixture(t),created=await f.routes.session.POST(f.request({})),body=await created.json(),cookie=created.headers.getSetCookie()[0].split(';')[0];
  const form=new FormData();form.set('text','Fixture');const encoded=f.intakeRequest(body.voiceContext.id,cookie,form),bytes=new Uint8Array(await encoded.arrayBuffer());
  const request=new Request(encoded.url,{method:'POST',duplex:'half',headers:encoded.headers,body:new ReadableStream({pull(controller){f.api.closeRequestVoiceSessionContext(encoded,body.voiceContext.id);controller.enqueue(bytes);controller.close();}},{highWaterMark:0})});
  assert.equal((await f.routes.intake.POST(request)).status,409);assert.equal(f.calls.some(row=>row[0]==='intake'),false);
});

test('voice search pins the observed user turn and ignores model-written permission fields',async t=>{
  const f=fixture(t);f.settings.activeConnectorId='neuraldeep';f.settings.voiceEngine='openai';
  const created=await f.routes.session.POST(f.request({})),body=await created.json(),cookie=created.headers.get('set-cookie').split(';')[0];
  for(const [text,explicit,denied] of [['Найди документацию',true,false],['Объясни этот термин',false,false],['Не ищи в интернете',false,true]]){
    const response=await f.routes.tool.POST(f.request({contextId:body.voiceContext.id,name:'web_search',arguments:{query:'public',explicit:true},searchTurn:{id:'turn_search',text}},cookie));
    assert.equal(response.status,200);const host=f.calls.at(-1)[2];assert.equal(host.taskSelection.connectorId,'neuraldeep');assert.equal(host.searchTurnId,'turn_search');assert.equal(host.explicitSearch,explicit);assert.equal(Boolean(host.searchDenied),denied);
  }
  const count=f.calls.length;
  const invalid=await f.routes.tool.POST(f.request({contextId:body.voiceContext.id,name:'web_search',searchTurn:{id:'bad/turn',text:'Search'}},cookie));
  assert.equal(invalid.status,400);assert.equal(f.calls.length,count);
});
