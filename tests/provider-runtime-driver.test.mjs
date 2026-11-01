import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import * as profile from "../scripts/lib/provider-profile.mjs";
import * as subject from '../scripts/lib/chat-subject.mjs';

const require = createRequire(import.meta.url);
class GatewayError extends Error {
  constructor(code, message, status, retryable = false) { super(message); Object.assign(this, {code,status,retryable}); }
}
function load(name, dependencies = {}) {
  const source=readFileSync(`interfaces/control-center/src/lib/codex-chat/${name}.ts`,"utf8");
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function("require","module","exports",output)(id=>{
    if(id.startsWith("node:"))return require(id);
    if(id==="./native-gateway")return {CodexChatGatewayError:GatewayError};
    if(Object.hasOwn(dependencies,id))return dependencies[id];
    throw new Error(`Unexpected driver test dependency: ${id}`);
  },module,module.exports);
  return module.exports;
}
const pages=load("provider-thread-pages"),activity=load("provider-activity");
class FakeRoutes {
  constructor(){this.rows=new Map();}
  resolve(input,choose){if(!this.rows.has(input.clientThreadId))this.rows.set(input.clientThreadId,choose());return this.rows.get(input.clientThreadId);}
  close(){}
}
const {CodexChatGateway}=load("gateway",{
  '../../../../../scripts/lib/chat-subject.mjs':subject,
  "./drivers/codex-app-server-driver":{},"./drivers/neuraldeep-driver":{},"./drivers/claude-driver":{},"./drivers/compatible-driver":{},"../settings/provider-profile":profile,
  "../settings/provider-settings-server":{getProviderSettings:()=>({activeConnectorId:"codex",providerPresets:Object.fromEntries(profile.PROVIDER_CONNECTOR_IDS.map(id=>[id,{...profile.defaultProviderPreset(id),modelId:`${id}-model`}] ))})},
  "./provider-thread-pages":pages,"./provider-activity":activity,
  "../../../../../scripts/lib/provider-thread-routing.mjs":{ProviderThreadRouting:FakeRoutes,ProviderRouteError:class extends Error{}},
  "../pritha-paths":{resolvePrithaStateRoot:()=>"fixture",resolvePrithaStatePath:()=>"fixture"},
});
function driver(connectorId) {
  const calls=[];
  const backend={attachments:{identity:"shared-uploads"}};
  for(const method of ["startTurn","controlTurn","historyPage","answerRequest","createThread","createThreadWithFirstTurn","threadDetail","enqueueMessage","cancelQueued","subscribe","eventsAfter","runtimeStatus","dispose"])
    backend[method]=(...args)=>{calls.push({method,args});return {connectorId,method,args};};
  return {connectorId,backend,calls,listThreads:(...args)=>backend.listThreads(...args),getRuntimeHealth:async()=>({connectorId,status:"ready"})};
}

test("all five drivers route existing threads independently of the current default", () => {
  const drivers=profile.PROVIDER_CONNECTOR_IDS.map(driver);let selected="neuraldeep";
  const gateway=new CodexChatGateway(drivers,()=>selected);
  assert.equal(gateway.createThread({clientThreadId:"first",source:"chat"}).connectorId,"neuraldeep");
  selected="claude";
  assert.equal(gateway.startTurn("chat_legacy",{clientMessageId:"one"}).connectorId,"codex");
  for(const connectorId of profile.PROVIDER_CONNECTOR_IDS) {
    const chatId=`chat_${connectorId}_pinned`;
    for(const method of ["startTurn","enqueueMessage","cancelQueued","historyPage","controlTurn","answerRequest","subscribe","eventsAfter"])
      assert.equal(gateway[method](chatId,{original:true}).connectorId,connectorId);
  }
  assert.equal(gateway.createThread({clientThreadId:"explicit",source:"chat",connectorId:"openrouter"}).connectorId,"openrouter");
  assert.equal(gateway.attachments,drivers[0].backend.attachments);
  assert.throws(()=>gateway.createThread({source:"chat",connectorId:null}),{code:"provider_profile_invalid"});
});

test('voice backend dispatch uses the pinned connector and leaves the native workflow explicit', () => {
  const drivers=profile.PROVIDER_CONNECTOR_IDS.map(driver);
  for(const item of drivers.slice(1))item.backend.voiceTaskBackend=()=>({connectorId:item.connectorId});
  const gateway=new CodexChatGateway(drivers,()=>"codex");
  for(const connectorId of profile.PROVIDER_CONNECTOR_IDS.slice(1))assert.equal(gateway.voiceTaskBackend(connectorId).connectorId,connectorId);
  assert.throws(()=>gateway.voiceTaskBackend('codex'),{code:'provider_capability_unavailable'});
});

test("missing and failed providers never dispatch through an available native provider", async () => {
  const native=driver("codex"),claude=driver("claude");
  const gateway=new CodexChatGateway([native,claude],()=>"neuraldeep");
  assert.throws(()=>gateway.createThread({source:"chat"}),{code:"provider_runtime_unavailable"});
  assert.throws(()=>gateway.startTurn("chat_neuraldeep_saved",{}),{code:"provider_runtime_unavailable"});
  claude.backend.startTurn=()=>{throw new GatewayError("provider_pending_auth","Connect Claude in Settings.",503);};
  assert.throws(()=>gateway.startTurn("chat_claude_saved",{}),{code:"provider_pending_auth"});
  assert.equal(native.calls.length,0);
  const health=await gateway.providerHealth();
  assert.equal(health.length,5);assert.equal(health.find(row=>row.connectorId==="neuraldeep").status,"unavailable");
  assert.throws(()=>new CodexChatGateway([native,native]),{code:"provider_registry_invalid"});
});
test('an unavailable provider probe cannot hide the health of its siblings',async()=>{
  const native=driver('codex'),external=driver('openrouter');external.getRuntimeHealth=async()=>{throw new Error('PRIVATE_PROVIDER_ERROR');};
  const gateway=new CodexChatGateway([native,external],()=> 'codex'),health=await gateway.providerHealth();
  assert.equal(health.find(row=>row.connectorId==='codex').status,'ready');assert.equal(health.find(row=>row.connectorId==='openrouter').status,'unavailable');assert.doesNotMatch(JSON.stringify(health),/PRIVATE_PROVIDER_ERROR/);
});
test('new-chat runtime previews stay read-only, validate exact capabilities and cannot override an existing thread',async()=>{
  const native=driver('codex'),external=driver('openrouter'),routes=new FakeRoutes(),seen=[];
  native.backend.runtimeStatus=async()=>({availability:'ready',providers:[],models:[{id:'codex-model',effortIds:['low','medium'],serviceTierIds:['standard']}],selected:{modelId:'codex-model',effortId:'medium',serviceTierId:'standard'}});
  external.previewRuntime=async preset=>{seen.push(preset);return {connectorId:'openrouter',selected:{modelId:preset.modelId,effortId:preset.reasoningEffort}};};
  const gateway=new CodexChatGateway([native,external],()=> 'codex',routes);
  const before=await gateway.runtimeStatus();assert.equal(before.connectorId,'codex');
  assert.equal((await gateway.runtimeStatus(undefined,{connectorId:'openrouter',modelId:'vendor/chosen',effortId:'high'})).selected.modelId,'vendor/chosen');
  assert.deepEqual(seen,[{...profile.defaultProviderPreset('openrouter'),modelId:'vendor/chosen',reasoningEffort:'high'}]);assert.equal(routes.rows.size,0);
  const invalid=await gateway.runtimeStatus(undefined,{connectorId:'codex',modelId:'codex-model',effortId:'xhigh'});assert.equal(invalid.availability,'degraded');assert.equal(invalid.selected.effortId,'xhigh');
  assert.equal((await gateway.runtimeStatus(undefined,{connectorId:'codex',effortId:'low'})).availability,'ready');
  await assert.rejects(gateway.runtimeStatus('chat_existing',{connectorId:'openrouter'}),{code:'runtime_identity_mismatch'});
  await assert.rejects(gateway.runtimeStatus(undefined,{connectorId:'openrouter',serviceTierId:'fast'}),{code:'provider_tier_unavailable'});
  await assert.rejects(gateway.runtimeStatus(undefined,{connectorId:'not-a-provider'}),{code:'provider_profile_invalid'});
});
test('first-turn model effort and tier are captured by creation instead of falling back to global defaults',()=>{
  const native=driver('codex'),external=driver('openrouter'),gateway=new CodexChatGateway([native,external],()=> 'codex');
  const input={clientThreadId:'exact-first-settings',source:'chat',connectorId:'openrouter',initialTurn:{clientMessageId:'exact-first-message',input:[{type:'text',text:'test'}],settings:{modelId:'openrouter-model',effortId:'high'}}};
  gateway.createThreadWithFirstTurn(input);assert.deepEqual(external.calls[0].args[0].settings,{modelId:'openrouter-model',effortId:'high'});assert.equal(native.calls.length,0);
  assert.throws(()=>gateway.createThreadWithFirstTurn({...input,settings:{effortId:'low'}}),{code:'runtime_identity_mismatch'});
  assert.equal(external.calls.length,1);
});
test('subject metadata reaches each explicit driver and malformed approval fields fail before any driver call',()=>{
  const drivers=profile.PROVIDER_CONNECTOR_IDS.map(driver),gateway=new CodexChatGateway(drivers),subject={kind:'child',slug:'paper-radar',phase:'contract'};
  for(const connectorId of profile.PROVIDER_CONNECTOR_IDS){gateway.createThread({clientThreadId:'factory_'+connectorId,source:'chat',connectorId,subject});assert.deepEqual(drivers.find(row=>row.connectorId===connectorId).calls.at(-1).args[0].subject,subject);}
  const before=drivers.reduce((sum,row)=>sum+row.calls.length,0);
  assert.throws(()=>gateway.createThread({clientThreadId:'factory_invalid',source:'chat',connectorId:'codex',subject:{...subject,approved:true}}),{code:'chat_subject_invalid'});
  assert.equal(drivers.reduce((sum,row)=>sum+row.calls.length,0),before);
});

test("merged pagination returns every provider thread once without putting previews in cursors", async () => {
  const drivers=["codex","claude"].map((connectorId,index)=>({
    connectorId,
    listThreads:async({cursor,limit})=>{
      const offset=Number(cursor || 0);
      const all=Array.from({length:121},(_,n)=>({chatId:`chat_${connectorId}_${n}`,pinned:n===0,updatedAt:new Date(1_000_000-(n*2+index)*1000).toISOString(),preview:"PRIVATE_PREVIEW_CANARY"}));
      return {data:all.slice(offset,offset+limit),nextCursor:offset+limit<all.length?String(offset+limit):null};
    },
  }));
  let cursor;const ids=[];
  do {
    const result=await pages.providerThreadPage(drivers,{limit:17,cursor,group:"all"});
    ids.push(...result.data.map(row=>row.chatId));cursor=result.nextCursor;
    if(cursor)assert.ok(!Buffer.from(cursor.slice(10),"base64url").toString().includes("PRIVATE_PREVIEW_CANARY"));
  } while(cursor);
  assert.equal(ids.length,242);assert.equal(new Set(ids).size,242);
  assert.deepEqual(ids.slice(0,4),["chat_codex_0","chat_claude_0","chat_codex_1","chat_claude_1"]);
  const first=await pages.providerThreadPage(drivers,{limit:1});
  await assert.rejects(pages.providerThreadPage(drivers,{cursor:first.nextCursor,search:"changed"}),{code:"invalid_cursor"});
});

test("activity keeps independent cursors and retries unobserved changes after a sibling fails", async () => {
  const states=[{id:"codex",sequence:100,fail:false},{id:"claude",sequence:1,fail:false}];
  const seen=[];
  const drivers=states.map(state=>({connectorId:state.id,backend:{activity:async after=>{
    seen.push([state.id,after]);if(state.fail)throw new Error("synthetic provider unavailable");
    return {cursor:state.sequence,reset:after===0,changed:after<state.sequence?[`chat_${state.id}`]:[],active:[],admissionEnabled:true,capacity:1,counts:{active:0,queued:0,waitingForOperator:0,unknown:0}};
  }}}));
  const mux=new activity.ProviderActivity(drivers);
  let snapshot=await mux.read(0);assert.deepEqual(snapshot.changed.sort(),["chat_claude","chat_codex"]);
  states[1].sequence=2;
  snapshot=await mux.read(snapshot.cursor);assert.deepEqual(snapshot.changed,["chat_claude"]);
  states[0].sequence=101;states[1].fail=true;
  await assert.rejects(mux.read(snapshot.cursor));
  states[1].fail=false;seen.length=0;
  const recovered=await mux.read(snapshot.cursor);
  assert.deepEqual(recovered.changed,["chat_codex"]);
  assert.deepEqual(seen,[['codex',100],['claude',2]]);
});
