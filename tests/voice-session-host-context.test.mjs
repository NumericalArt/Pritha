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
  new Function('require','module','exports','process',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>Object.hasOwn(modules,name)?modules[name]:require(name),module,module.exports,environment);
  return module.exports;
}
function fixture(t){
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-voice-host-context-')),coordinator=new ExecutionCoordinator({stateRoot:root});
  t.after(()=>{coordinator.close();rmSync(root,{recursive:true,force:true});});
  const environment={env:{}},settings={activeConnectorId:'codex',voiceEngine:'auto',revision:1,providerPresets:Object.fromEntries(policy.PROVIDER_CONNECTOR_IDS.map(id=>[id,{...policy.defaultProviderPreset(id),modelId:id+'-fixture'}]))};
  const native={voiceModel:'gpt-realtime-2',prithaVoice:'marin',codexServiceTier:'standard'},calls=[];
  const engine={VoiceEngineError,requireVoiceEngine:wanted=>{
    const resolved=policy.resolveVoiceEngine({connectorId:settings.activeConnectorId,engine:settings.voiceEngine,configured:{openai:true,neuraldeep:true}});
    if(resolved.engine!==wanted)throw new VoiceEngineError('voice_engine_changed','Reconnect.');
    return {...resolved,connectorId:settings.activeConnectorId,revision:settings.revision,chained:{model:'voice-fixture',voice:'serena'}};
  }};
  const provider={getPrithaRuntimeSettings:()=>native,usesLiveVoice:()=>native.voiceModel==='gpt-live-1',
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
  const routes=Object.fromEntries(['session','call','tool'].map(name=>[name,load(`interfaces/control-center/src/app/api/realtime/${name}/route.ts`,{
    'next/server':{NextResponse:JsonResponse},'@/lib/voice/session-context':api,'@/lib/realtime/pritha-runtime':provider,
    '@/lib/realtime/voice-engine-server':engine,'../../../../../../../scripts/lib/voice-session-contexts.mjs':contexts,
  },environment)]));
  const request=(data,cookie='',method='POST')=>new Request('http://fixture.invalid/api/realtime/session',{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});
  return {api,routes,settings,native,environment,calls,request};
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
    const saved=f.api.openVoiceSessionContext(owner,'neuraldeep');
    f.settings.activeConnectorId='codex';f.settings.voiceEngine='openai';
    const restored=f.api.getVoiceSessionContext(saved.id,owner,'neuraldeep');assert.equal(restored.connectorId,connector);
    assert.equal(f.api.voiceTaskSelection(restored).preset.modelId,connector+'-fixture');
    assert.throws(()=>f.api.getVoiceSessionContext(saved.id,owner,'openai'),{code:'voice_context_engine_mismatch'});
    assert.throws(()=>f.api.assertVoiceContextAllowed({...saved,engine:'openai'},'openai'),{code:'voice_context_engine_mismatch'});
  }
  const saved=f.api.openVoiceSessionContext(owner,'openai');f.environment.env.PRITHA_VOICE_OFFLINE='1';
  assert.throws(()=>f.api.getVoiceSessionContext(saved.id,owner),{code:'voice_offline'});
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
