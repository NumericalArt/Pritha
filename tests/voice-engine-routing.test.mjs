import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as policy from '../scripts/lib/provider-profile.mjs';
import {VoiceContextError} from '../scripts/lib/voice-session-contexts.mjs';
const source=readFileSync('interfaces/control-center/src/lib/realtime/voice-engine-server.ts','utf8');
const chained={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync('interfaces/control-center/src/lib/voice/settings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(chained,chained.exports);
function fixture({connectorId='codex',engine='auto',openai=false,neuraldeep=false,offline=false}={}){
  const module={exports:{}};
  const settings={activeConnectorId:connectorId,voiceEngine:engine,revision:7};
  const modules={
    '../settings/provider-profile':policy,
    '../settings/provider-settings-server':{getProviderSettingsDocument:()=>({settings,document:{}})},
    '../voice/settings':chained.exports,
    '../settings/env-store':{findEnvSecret:()=>({value:openai?'fixture-secret':''})},
    '../pritha-paths':{resolvePrithaStateRoot:()=>'/synthetic-state'},
    '../../../../../scripts/lib/provider-credential.mjs':{providerCredentialStatus:()=>({configured:neuraldeep})},
  };
  new Function('module','exports','require','process',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,name=>{assert.ok(modules[name],name);return modules[name];},{env:{PRITHA_VOICE_OFFLINE:offline?'1':'0'}});
  return {...module.exports,settings};
}
test('all five connectors and all voice choices resolve deterministically for each credential combination',()=>{
  for(const connectorId of policy.PROVIDER_CONNECTOR_IDS)for(const engine of policy.VOICE_ENGINES)for(const openai of [false,true])for(const neuraldeep of [false,true]){
    const host=fixture({connectorId,engine,openai,neuraldeep}),status=host.getVoiceEngineStatus();
    const expected=policy.resolveVoiceEngine({connectorId,engine,configured:{openai,neuraldeep}});
    assert.equal(status.engine,expected.engine);assert.equal(status.reason,expected.reason);assert.equal(status.revision,7);
    assert.doesNotMatch(JSON.stringify(status),/fixture-secret|synthetic-state/);
    if(expected.engine)assert.equal(host.requireVoiceEngine(expected.engine).engine,expected.engine);
    else for(const target of ['openai','neuraldeep'])assert.throws(()=>host.requireVoiceEngine(target),{code:expected.reason==='offline'?'voice_offline':'voice_pending_auth'});
    if(expected.engine)assert.throws(()=>host.requireVoiceEngine(expected.engine==='openai'?'neuraldeep':'openai'),{code:'voice_engine_changed'});
  }
});
test('offline host policy blocks cloud even with saved explicit choices, and a pinned connector overrides the current default',()=>{
  for(const engine of policy.VOICE_ENGINES){const host=fixture({engine,openai:true,neuraldeep:true,offline:true});assert.equal(host.getVoiceEngineStatus().preference,engine);assert.throws(()=>host.requireVoiceEngine('openai'),{code:'voice_offline'});}
  const host=fixture({connectorId:'codex',openai:true,neuraldeep:true});
  assert.equal(host.getVoiceEngineStatus('neuraldeep').engine,'neuraldeep');
  assert.equal(host.settings.activeConnectorId,'codex');
});
test('chained voice settings preserve explicit values and reject coercion or unknown fields',()=>{
  assert.equal(chained.exports.validChainedVoicePatch({language:['ru']}),false);
  assert.equal(chained.exports.validChainedVoicePatch({voice:'unknown'}),false);
  assert.equal(chained.exports.validChainedVoicePatch({apiKey:'synthetic'}),false);
  assert.deepEqual(chained.exports.normalizeChainedVoiceSettings({voice:'vivian',language:'en'}),{...chained.exports.DEFAULT_CHAINED_VOICE_SETTINGS,voice:'vivian',language:'en'});
});
test('OpenAI session and call routes reject another engine before any provider I/O',async()=>{
  for(const file of ['session','call']){
    let io=0;
    const module={exports:{}},host=fixture({connectorId:'neuraldeep',openai:true,neuraldeep:true});
    const provider={usesLiveVoice:()=>false,buildRealtimeSessionConfig:()=>{io++;},createEphemeralRealtimeSession:()=>{io++;},createRealtimeCall:()=>{io++;},createLiveCall:()=>{io++;},RealtimeProviderError:class extends Error{}};
    const modules={'next/server':{NextResponse:Response},'@/lib/realtime/voice-engine-server':host,'@/lib/realtime/pritha-runtime':provider,
      '../../../../../../../scripts/lib/voice-session-contexts.mjs':{VoiceContextError},
      '@/lib/voice/session-context':{voiceContextOwner:()=>({owner:'fixture'}),openVoiceSessionContext:()=>host.requireVoiceEngine('openai')}};
    new Function('module','exports','require',ts.transpileModule(readFileSync(`interfaces/control-center/src/app/api/realtime/${file}/route.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,name=>{assert.ok(modules[name]);return modules[name];});
    const response=await module.exports.POST(new Request('http://fixture.invalid',{method:'POST',body:JSON.stringify({offerSdp:'synthetic',voiceApi:'realtime'})}));
    assert.equal(response.status,409);assert.equal((await response.json()).code,'voice_engine_changed');assert.equal(io,0);
  }
});
