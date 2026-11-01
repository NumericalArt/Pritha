import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync,existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { startClaudeCodeRun,buildClaudeExecArgs } from '../scripts/claude-code-runner.mjs';
import { probeClaudeCli } from '../scripts/claude/cli-probe.mjs';
import {nativeClaudeAuthPaths} from '../scripts/claude/native-auth.mjs';
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
