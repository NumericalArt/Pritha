import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { pathToFileURL } from "node:url";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import { resolveToolServerManifest, toolServerLaunchEnvironment, toolServerRuntimeBinding } from "../scripts/agents-mother/tool-server-runtime.mjs";
import { toolServerManifest } from "../scripts/agents-mother/scaffold/tool-server.mjs";

const manifest = () => toolServerManifest({agentName:"link-vault",agentId:"fixture-tool",autostart:"disabled",envExampleVariables:"LINK_VAULT_PORT=3432"});
test("tool-server launch environment is limited to declared nonsecret configuration and portable system variables",()=>{
  const m=manifest(),parent={PATH:"/fixture/bin",SystemRoot:"C:\\Windows",LINK_VAULT_PORT:"4567",LINK_VAULT_STATE:"state with spaces",PRITHA_STATE_ROOT:"parent",
    NODE_OPTIONS:"--no-warnings",HTTPS_PROXY:"https://proxy.invalid",OPENAI_API_KEY:"synthetic-only",PRITHA_TEST_SECRET_CANARY:"not-for-child",HOME:"private-home"};
  assert.deepEqual(toolServerLaunchEnvironment(m,m.start_command,parent),{PATH:parent.PATH,SystemRoot:parent.SystemRoot,LINK_VAULT_PORT:"4567",LINK_VAULT_STATE:"state with spaces",PRITHA_STATE_ROOT:"parent"});
  for(const name of ["NODE_OPTIONS","HTTPS_PROXY","OPENAI_API_KEY","AUTH_STATE"]){
    assert.throws(()=>toolServerLaunchEnvironment(m,{env_allowlist:[name]},parent),{code:"tool_server_runtime_invalid"});
  }
  assert.throws(()=>toolServerLaunchEnvironment(m,m.start_command,{LINK_VAULT_STATE:"bad\nstate"}));
  assert.deepEqual(toolServerLaunchEnvironment({agent_kind:"service"},{},parent),parent,"legacy behavior is unchanged");
});

test("port resolution is immutable, bounded and shared with operation bindings",()=>{
  const m=manifest(),before=JSON.stringify(m);
  const resolved=resolveToolServerManifest(m,{LINK_VAULT_PORT:"4567"});
  assert.equal(resolved.ui_port,4567);assert.equal(resolved.health_url,"http://127.0.0.1:4567/health");assert.equal(resolved.local_upstream_url,"http://127.0.0.1:4567");
  assert.equal(JSON.stringify(m),before);assert.equal(resolveToolServerManifest(m,{}).ui_port,3432);
  assert.equal(resolveToolServerManifest(resolved,{LINK_VAULT_PORT:"4567"}).ui_port,4567);
  for(const value of ["0","65536","-1","1.5","bad",""," 4567"]){assert.throws(()=>resolveToolServerManifest(m,{LINK_VAULT_PORT:value}),{code:"tool_server_runtime_invalid"});}
  for(const patch of [{local_upstream_url:"https://example.com"},{health_url:"http://127.0.0.1:3433/health"},{ui_port:80},{ui_port_env:"NODE_OPTIONS"}])assert.throws(()=>resolveToolServerManifest({...m,...patch},{}));
  const original=toolServerRuntimeBinding(m,{});
  assert.notEqual(toolServerRuntimeBinding(m,{LINK_VAULT_PORT:"4567"}),original);
  assert.notEqual(toolServerRuntimeBinding(m,{LINK_VAULT_STATE:"another-state"}),original);
  assert.equal(toolServerRuntimeBinding(m,{PRITHA_TEST_SECRET_CANARY:"irrelevant"}),original);
  const legacy={agent_kind:"service",health_url:"https://legacy.example/health"};assert.equal(resolveToolServerManifest(legacy,{LINK_VAULT_PORT:"bad"}),legacy);
});

const source=readFileSync("interfaces/control-center/src/lib/control-center/server.ts","utf8"),tree=ts.createSourceFile("server.ts",source,ts.ScriptTarget.Latest,true);
const names=["hasShellMetacharacter","safeExecutionText","processIsAlive","validateStructuredOperationsCommand","localHealthUrls","probeHealth","waitForRuntimeReadiness","executeStructuredAgentCommand","operatorActionPhrase"];
const declarations=names.map(name=>{const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node);return node.getText(tree);});
const url=pathToFileURL(path.resolve("scripts/agents-mother/tool-server-runtime.mjs")).href;
const compiled=ts.transpileModule(`import {spawn,spawnSync} from 'node:child_process';import{existsSync,readFileSync}from'node:fs';import path from'node:path';import{resolveToolServerManifest,toolServerLaunchEnvironment,toolServerRuntimeBinding}from ${JSON.stringify(url)};${declarations.join("\n")}\nexport {${names.join(",")}};`,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const production=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
async function fixtureServer(t,handler){const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));return server.address().port;}

test("actual host health probe never falls back to a foreign default-port listener",async t=>{
  let foreignHits=0,targetHits=0,identity="foreign";
  const defaultPort=await fixtureServer(t,(_,res)=>{foreignHits++;res.end('{}');});
  const targetPort=await fixtureServer(t,(_,res)=>{targetHits++;res.setHeader("content-type","application/json");res.end(JSON.stringify({agent_id:identity}));});
  const m=manifest();m.ui_port=defaultPort;m.health_url=`http://127.0.0.1:${defaultPort}/health`;m.local_upstream_url=`http://127.0.0.1:${defaultPort}`;
  const old=process.env.LINK_VAULT_PORT;process.env.LINK_VAULT_PORT=String(targetPort);t.after(()=>{if(old===undefined)delete process.env.LINK_VAULT_PORT;else process.env.LINK_VAULT_PORT=old;});
  const resolved=resolveToolServerManifest(m);
  assert.deepEqual(production.localHealthUrls(resolved),[`http://127.0.0.1:${targetPort}/health`]);
  assert.equal((await production.probeHealth(resolved)).status,"failed");
  identity="fixture-tool";assert.equal((await production.probeHealth(resolved)).status,"ok");
  assert.equal(foreignHits,0);assert.equal(targetHits,2);
});

test("actual managed executor uses the validated environment and rejects a stale plan",async t=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),"tool managed тест "));t.after(()=>rmSync(folder,{recursive:true,force:true}));mkdirSync(path.join(folder,"state"));
  writeFileSync(path.join(folder,"record-env.mjs"),'console.log(JSON.stringify({keys:Object.keys(process.env),state:process.env.LINK_VAULT_STATE,origin:process.env.LINK_VAULT_UI_ORIGIN}));\n',"utf8");
  const port=await fixtureServer(t,(_,res)=>res.end(JSON.stringify({agent_id:"fixture-tool"})));
  const keys=["LINK_VAULT_PORT","LINK_VAULT_STATE","LINK_VAULT_UI_ORIGIN","PRITHA_TEST_SECRET_CANARY"],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{LINK_VAULT_UI_ORIGIN:"https://fixture.example.ts.net:3432",LINK_VAULT_PORT:String(port),LINK_VAULT_STATE:path.join(folder,"state"),PRITHA_TEST_SECRET_CANARY:"synthetic-do-not-inherit"});
  t.after(()=>{for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}});
  const m=manifest();m.start_command.argv=["node","record-env.mjs"];for(const field of ["start_command","stop_command"])m[field].env_allowlist.push("LINK_VAULT_UI_ORIGIN");
  const resolved=resolveToolServerManifest(m),agent={id:"fixture-tool",control:{ownership:"managed",runtimeBinding:toolServerRuntimeBinding(resolved)}};
  const params={root:folder,folderPath:folder,manifest:resolved,agent,action:"start"};
  const valid=production.validateStructuredOperationsCommand(params);assert.equal(valid.ok,true,JSON.stringify(valid.errors));
  const result=await production.executeStructuredAgentCommand({action:"start",manifest:resolved,command:valid.command,cwd:valid.cwd,env:valid.env,timeoutMs:1000});
  assert.equal(result.status,"running");const child=JSON.parse(result.stdout);assert.equal(child.keys.includes("PRITHA_TEST_SECRET_CANARY"),false);assert.equal(child.keys.includes("NODE_OPTIONS"),false);assert.equal(child.state,path.join(folder,"state"));assert.equal(child.origin,process.env.LINK_VAULT_UI_ORIGIN);
  const phrase=production.operatorActionPhrase(agent,"start");
  process.env.LINK_VAULT_STATE=path.join(folder,"different");
  assert.equal(production.validateStructuredOperationsCommand(params).ok,false);
  const current={...agent,control:{...agent.control,runtimeBinding:toolServerRuntimeBinding(resolved)}};
  assert.notEqual(production.operatorActionPhrase(current,"start"),phrase);
});

test("only declared canonical HTTPS UI origins pass and changing one invalidates an operation plan",()=>{
  const m=manifest(),origin="https://fixture.example.ts.net:3432";
  const parent={LINK_VAULT_UI_ORIGIN:origin,OTHER_UI_ORIGIN:origin,NODE_OPTIONS:"--inspect"};
  assert.equal(toolServerLaunchEnvironment(m,m.start_command,parent).LINK_VAULT_UI_ORIGIN,undefined);
  for(const field of ["start_command","stop_command"])m[field].env_allowlist.push("LINK_VAULT_UI_ORIGIN");
  assert.deepEqual(toolServerLaunchEnvironment(m,m.start_command,parent),{LINK_VAULT_UI_ORIGIN:origin});
  assert.notEqual(toolServerRuntimeBinding(m,{}),toolServerRuntimeBinding(m,parent));
  assert.notEqual(toolServerRuntimeBinding(m,parent),toolServerRuntimeBinding(m,{LINK_VAULT_UI_ORIGIN:"https://second.example.ts.net:3432"}));
  for(const value of ["*","https://*.ts.net","https://example.com","http://fixture.example.ts.net:3432",origin+"/",origin+"?x",origin+"\n","https://user:pass@fixture.example.ts.net"]){
    assert.throws(()=>toolServerLaunchEnvironment(m,m.start_command,{LINK_VAULT_UI_ORIGIN:value}),{code:"tool_server_runtime_invalid"});
  }
  assert.equal(toolServerLaunchEnvironment(m,m.start_command,{LINK_VAULT_UI_ORIGIN:""}).LINK_VAULT_UI_ORIGIN,"");
  for(const name of ["LINK_VAULT_ORIGIN","PROXY_UI_ORIGIN","SECRET_UI_ORIGIN"]){
    assert.throws(()=>toolServerLaunchEnvironment(m,{env_allowlist:[name]},{}),{code:"tool_server_runtime_invalid"});
  }
});
