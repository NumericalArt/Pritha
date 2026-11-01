import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import * as profile from "../scripts/lib/provider-profile.mjs";

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
  "./drivers/codex-app-server-driver":{},"./drivers/neuraldeep-driver":{},"../settings/provider-profile":profile,
  "../settings/provider-settings-server":{getProviderSettings:()=>({activeConnectorId:"codex",providerPresets:Object.fromEntries(profile.PROVIDER_CONNECTOR_IDS.map(id=>[id,{modelId:`${id}-model`}] ))})},
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
