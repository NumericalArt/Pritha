import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync,existsSync,readFileSync,readdirSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { startClaudeCodeRun,buildClaudeExecArgs } from '../scripts/claude-code-runner.mjs';
import { probeClaudeCli } from '../scripts/claude/cli-probe.mjs';
import {nativeClaudeAuthPaths} from '../scripts/claude/native-auth.mjs';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {SearchService} from '../scripts/search/service.mjs';
import {SearchStore} from '../scripts/search/store.mjs';
const model='claude-sonnet-5-5';
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-run-'));for(const name of ['code','state'])mkdirSync(path.join(root,name));t.after(()=>rmSync(root,{recursive:true,force:true}));return {root:path.join(root,'code'),cwd:path.join(root,'code'),stateRoot:path.join(root,'state'),privateRoot:path.join(root,'state','private','claude'),model,prompt:'Fixture prompt',timeoutMs:10000,claudeBin:process.execPath};}
function dependencies(capture,{wait=false,exited=true,wrongModel=false}={}){
  return {readCredential:()=> 'REAL_KEY_CANARY',probeCli:async()=>({available:true,version:'2.1.296'}),
    prepareSandbox:options=>{capture.sandbox=options;return {command:options.command,args:options.args};},
    spawnSupervised:async(command,args,options)=>{
      Object.assign(capture,{command,args,env:options.env});await options.beforeStart({version:1,session:42,escaped:[]});
      const child={stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()};let finish;
      const completion=new Promise(resolve=>finish=resolve);
      const close=code=>{child.stdout.end();child.stderr.end();finish({code,processTreeExited:exited});};
      child.stdin.resume();child.stdin.once('finish',()=>{
        if(wait)return;const sessionId=args[args.indexOf(args.includes('--resume')?'--resume':'--session-id')+1];
        for(const event of [{type:'system',subtype:'init',session_id:sessionId,model:wrongModel?'claude-opus-5-5':model},
          {type:'assistant',session_id:sessionId,message:{id:'msg_one',model,content:[{type:'thinking',thinking:'PRIVATE_REASONING_CANARY'},{type:'text',text:'Done'}]}},
          {type:'result',subtype:'success',session_id:sessionId,usage:{input_tokens:4,output_tokens:2},total_cost_usd:0.1}])child.stdout.write(JSON.stringify(event)+'\n');close(0);
      });
      return {child,completion,stop:()=>{close(1);return true;}};
    }};
}
test('owned Claude runner isolates keys and configuration, pins resume and persists only visible events',async t=>{
  const options=fixture(t),capture={},records=[];
  const first=await (await startClaudeCodeRun({...options,env:{...process.env,OPENAI_API_KEY:'FOREIGN_KEY_CANARY',CLAUDE_CODE_OAUTH_TOKEN:'OAUTH_CANARY',NODE_OPTIONS:'FOREIGN_HOOK_CANARY'},onRawChunk:chunk=>records.push(String(chunk))},dependencies(capture))).completion;
  assert.equal(first.ok,true);assert.equal(first.usage.totalTokens,6);assert.doesNotMatch(JSON.stringify(capture.env)+JSON.stringify(capture.args),/REAL_KEY_CANARY|FOREIGN_KEY_CANARY|OAUTH_CANARY|FOREIGN_HOOK_CANARY/);
  assert.doesNotMatch(records.join(''),/PRIVATE_REASONING_CANARY/);assert.ok(capture.env.ANTHROPIC_API_KEY.length>=32);assert.equal(capture.env.CLAUDE_CODE_MAX_RETRIES,'0');assert.equal(existsSync(capture.env.TMPDIR),false);
  assert.equal(capture.sandbox.runtime,undefined);assert(!capture.sandbox.readRoots.some(dir=>dir.endsWith('/Library/Keychains')));
  const second=await (await startClaudeCodeRun({...options,resume:first.sessionId},dependencies(capture))).completion;
  assert.equal(second.ok,true);assert.equal(second.sessionId,first.sessionId);assert.equal(capture.args.includes('--resume'),true);assert.equal(capture.args.includes('--continue'),false);
  await assert.rejects(startClaudeCodeRun({...options,resume:'87654321-4321-4321-4321-210987654321'},dependencies({})),{code:'runtime_identity_mismatch'});
});
test('unknown exit retains scratch and wrong-model output cannot produce success',async t=>{
  const options=fixture(t),capture={};const run=await startClaudeCodeRun(options,dependencies(capture,{wait:true,exited:false}));run.stop();const result=await run.completion;
  assert.equal(result.ok,false);assert.equal(result.processTreeExited,false);assert.equal(existsSync(capture.env.TMPDIR),true);
  const wrong=await (await startClaudeCodeRun(options,dependencies({},{wrongModel:true}))).completion;assert.equal(wrong.ok,false);assert.equal(wrong.errorCode,'runtime_identity_mismatch');
});
test('auth and version failures stop before a CLI task, and no unrestricted permission mode is available',async t=>{
  const options=fixture(t);await assert.rejects(startClaudeCodeRun({...options,authMode:'invalid'},dependencies({})),{code:'provider_auth_mode_unverified'});
  await assert.rejects(startClaudeCodeRun(options,{...dependencies({}),probeCli:async()=>({available:false,code:'provider_runtime_unverified'})}),{code:'provider_runtime_unverified'});
  const probe=await probeClaudeCli({binary:process.execPath,root:options.root,stateRoot:options.stateRoot,executeImpl:async()=>({stdout:'2.1.200 (Claude Code)'})});assert.equal(probe.available,false);
  assert.throws(()=>buildClaudeExecArgs({model:'sonnet',sessionId:'12345678-1234-1234-1234-123456789012'}),{code:'provider_input_invalid'});
});
test('native Claude session never reads API keys, uses opaque transport, pins account/resume and refuses unaccounted build budgets',async t=>{
  const options={...fixture(t),authMode:'local-cli-session'},capture={};nativeClaudeAuthPaths(options,{prepare:true});let identity='1'.repeat(64),closed=0;
  const deps={...dependencies(capture),readCredential:()=>assert.fail('Native mode must not read an API key'),listenProxy:()=>assert.fail('Native mode must not use the API proxy'),probeNativeAuth:async()=>({authenticated:true,identity}),listenNativeTunnel:async()=>({port:45678,close:async()=>{closed++;}})};
  const first=await(await startClaudeCodeRun({...options,env:{...process.env,ANTHROPIC_API_KEY:'API_CANARY',CLAUDE_CODE_OAUTH_TOKEN:'OAUTH_CANARY',ANTHROPIC_BASE_URL:'https://wrong'}},deps)).completion;
  assert.equal(first.ok,true);assert(!capture.args.includes('--bare'));assert(!capture.args.includes('--dangerously-skip-permissions'));assert.equal(capture.args[capture.args.indexOf('--tools')+1],'');assert.doesNotMatch(JSON.stringify(capture.env),/CANARY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST/);assert.deepEqual(capture.sandbox.loopbackPorts,[45678]);assert.equal(closed,1);
  assert.equal(capture.sandbox.runtime,'claude-native');assert(!capture.sandbox.readRoots.includes(os.userInfo().homedir));
  if(process.platform==='darwin')assert.equal(capture.env.HOME,os.userInfo().homedir);
  assert.equal((await(await startClaudeCodeRun({...options,resume:first.sessionId},deps)).completion).ok,true);
  identity='2'.repeat(64);await assert.rejects(startClaudeCodeRun({...options,resume:first.sessionId},deps),{code:'runtime_identity_mismatch'});
  await assert.rejects(startClaudeCodeRun({...options,tokenBudget:10000},deps),{code:'provider_budget_mode_unavailable'});
  await assert.rejects(startClaudeCodeRun(options,{...deps,probeNativeAuth:async()=>({authenticated:false,code:'provider_native_login_required'})}),{code:'provider_native_login_required'});
});
test('file dispatch rechecks the installed Claude version after a cached capability decision',async t=>{
  const options=fixture(t),capture={};
  await assert.rejects(startClaudeCodeRun({...options,hostAttachments:{},hostExecutionContext:{}},{...dependencies(capture),probeCli:async()=>({available:true,version:'2.1.297'})}),{code:'provider_attachments_unverified'});
  assert.equal(capture.command,undefined);assert.equal(existsSync(path.join(options.privateRoot,'profiles')),false);
});

for(const [label,text,allowSearch,expectedCalls] of [['requested','Search public sources',true,1],['denied','Do not browse. Search public sources.',true,0],['disabled','Search public sources',false,0]])test(`Claude MCP search: ${label} intent uses bounded host tools without command network or credentials`,async t=>{
  const options=fixture(t),capture={},coordinator=new ExecutionCoordinator({stateRoot:options.stateRoot}),lease=coordinator.claim(['fixture'],'search-fixture',{kind:'turn',detail:{chatId:'chat_search',connectorId:'claude'}});
  const store=new SearchStore({databasePath:':memory:'});let calls=0;
  const service=new SearchService({store,environment:{},providers:{neuraldeep:{search:async()=>{calls++;return {items:[{url:'https://example.com/source',title:'Public source',content:'Bounded evidence'}]};}}},verifyUrl:async value=>value});
  service.configure({mode:'requested'},1);
  t.after(()=>{lease.release();coordinator.close();store.close();});
  const deps={...dependencies(capture),searchService:service},spawn=deps.spawnSupervised;
  let endpoint,headers;
  deps.spawnSupervised=async(command,args,spawnOptions)=>{
    const config=JSON.parse(readFileSync(args[args.indexOf('--mcp-config')+1],'utf8')).mcpServers.pritha;
    endpoint=config.url;headers={...config.headers,'Content-Type':'application/json'};
    const post=async(id,method,params)=>(await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params})})).json();
    const listing=await post(1,'tools/list');
    assert.equal(listing.result.tools.some(row=>row.name==='web_search'),allowSearch);
    assert.equal(listing.result.tools.some(row=>row.name==='read_page'),allowSearch);
    assert.match(listing.result.tools.find(row=>row.name==='run_command').description,/no network/);
    assert.doesNotMatch(JSON.stringify(listing),/REAL_KEY_CANARY/);
    const response=await post(2,'tools/call',{name:'web_search',arguments:{query:'public documentation'}});
    if(!allowSearch)assert.equal(response.error.code,-32602);
    else assert.equal(response.result.isError,expectedCalls===0);
    if(expectedCalls){
      const result=JSON.parse(response.result.content[0].text);assert.equal(result.ok,true);assert.equal(result.sources[0].url,'https://example.com/source');
      const privateQuery=await post(3,'tools/call',{name:'web_search',arguments:{query:`inspect ${path.join(os.homedir(),'pritha-private-search-fixture')}`}});
      assert.equal(privateQuery.result.isError,true);
    }
    return spawn(command,args,spawnOptions);
  };
  const result=await(await startClaudeCodeRun({...options,allowSearch,searchUserText:text,hostExecutionContext:{coordinator,lease,chatId:'chat_search',turnId:'turn_search'},sandbox:'read-only'},deps)).completion;
  assert.equal(result.ok,true);assert.equal(calls,expectedCalls);
  await assert.rejects(fetch(endpoint,{method:'POST',headers,body:'{}'}));
});

test('budget refusal survives a stock CLI synthetic error and persists measured usage without another model request',async t=>{
  const options={...fixture(t),tokenBudget:2300},capture={},deps=dependencies(capture);let paid=0,counted=0;
  deps.fetchImpl=async url=>{
    if(url.endsWith('/count_tokens')){counted++;return Response.json({input_tokens:1000});}
    paid++;return Response.json({id:'msg_paid',model,stop_reason:'end_turn',content:[{type:'text',text:'partial'}],usage:{input_tokens:1000,output_tokens:200}});
  };
  deps.spawnSupervised=async(_command,args,spawnOptions)=>{
    await spawnOptions.beforeStart({version:1,session:42,escaped:[]});
    const child={stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()};let finish;
    const completion=new Promise(resolve=>{finish=resolve;});
    const close=()=>{child.stdout.end();child.stderr.end();finish({code:1,processTreeExited:true});};
    child.stdin.resume();child.stdin.once('finish',()=>{void(async()=>{
      const sessionId=args[args.indexOf('--session-id')+1],emit=event=>child.stdout.write(JSON.stringify({...event,session_id:sessionId})+'\n');
      emit({type:'system',subtype:'init',model});
      const send=text=>fetch(spawnOptions.env.ANTHROPIC_BASE_URL+'/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':spawnOptions.env.ANTHROPIC_API_KEY,'anthropic-version':'2026-10-21'},body:JSON.stringify({model,messages:[{role:'user',content:text}],max_tokens:1000,stream:false})});
      const first=await send('first');assert.equal(first.status,200);emit({type:'assistant',message:await first.json()});
      const second=await send('second');assert.equal(second.status,502);await second.body.cancel();
      emit({type:'assistant',error:'server_error',message:{id:'cli_error_1',model:'<synthetic>',content:[{type:'text',text:'PRIVATE_PROXY_DIAGNOSTIC'}]}});
      emit({type:'result',subtype:'error_during_execution',is_error:true,usage:{input_tokens:1000,output_tokens:200},modelUsage:{[model]:{}}});
    })().catch(error=>{capture.fixtureError=error;}).finally(close);});
    return {child,completion,stop:()=>{close();return true;}};
  };
  const records=[],done=await(await startClaudeCodeRun({...options,onRawChunk:chunk=>records.push(String(chunk))},deps)).completion;
  assert.equal(capture.fixtureError,undefined);assert.equal(done.ok,false);assert.equal(done.errorCode,'provider_budget_exhausted');
  assert.equal(done.processTreeExited,true);assert.equal(done.budget.usageKnown,true);assert.equal(done.budget.tokensUsed,1200);
  assert.equal(paid,1);assert.equal(counted,2);assert.doesNotMatch(records.join(''),/PRIVATE_PROXY/);
  const directory=path.join(options.privateRoot,'budgets'),saved=JSON.parse(readFileSync(path.join(directory,readdirSync(directory)[0]),'utf8'));
  assert.equal(saved.errorCode,'provider_budget_exhausted');assert.equal(saved.tokensUsed,1200);assert.equal(saved.requests.length,1);
});
