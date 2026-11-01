import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {PassThrough} from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import {startCompatibleRun,buildCompatibleCodexArgs} from '../scripts/openai-compatible-codex.mjs';
const session='12345678-1234-1234-1234-123456789012';
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'pritha-compatible-owned-'));for(const name of ['code','state'])mkdirSync(path.join(root,name));t.after(()=>rmSync(root,{recursive:true,force:true}));return {connectorId:'openrouter',root:path.join(root,'code'),cwd:path.join(root,'code'),stateRoot:path.join(root,'state'),privateRoot:path.join(root,'state','openrouter'),codexBin:process.execPath,model:'vendor/model',prompt:'Fixture',timeoutMs:10000};}
function deps(capture,{wait=false,exited=true}={}){return {
  readCredential:()=> 'UPSTREAM_KEY_CANARY',probeCli:async()=>({available:true,version:'0.153.0'}),
  inspectSession:input=>{capture.resume=input;return {available:input.sessionId===session,code:'runtime_identity_mismatch'};},
  listenAdapter:async options=>{capture.adapter=options;return {baseUrl:'http://127.0.0.1:8765/v1',port:8765,abort(){capture.aborted=true;},async close(){capture.closed=true;}};},
  prepareSandbox:options=>{capture.sandbox=options;return {command:options.command,args:options.args};},
  spawnSupervised:async(command,args,options)=>{
    Object.assign(capture,{command,args,env:options.env});await options.beforeStart({version:1,session:42,escaped:[]});
    const child={stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()};let finish;const completion=new Promise(resolve=>finish=resolve);
    const close=code=>{child.stdout.end();child.stderr.end();finish({code,processTreeExited:exited});};child.stdin.resume();child.stdin.once('finish',()=>{
      if(wait)return;for(const event of [{type:'thread.started',thread_id:session},{type:'turn.completed',usage:{input_tokens:4,output_tokens:2}}])child.stdout.write(JSON.stringify(event)+'\n');close(0);
    });return {child,completion,stop(){close(1);return true;}};
  },
};}
test('OpenRouter harness isolates credentials and workspace writes, pins resume and cleans only confirmed exits',async t=>{
  const options=fixture(t),capture={},first=await(await startCompatibleRun({...options,env:{...process.env,OPENAI_API_KEY:'FOREIGN_KEY_CANARY',NODE_OPTIONS:'FOREIGN_HOOK_CANARY'}},deps(capture))).completion;
  assert.equal(first.ok,true);assert.equal(first.sessionId,session);assert.equal(capture.adapter.apiKey,'UPSTREAM_KEY_CANARY');assert.doesNotMatch(JSON.stringify(capture.args)+JSON.stringify(capture.env),/UPSTREAM_KEY_CANARY|FOREIGN_KEY_CANARY|FOREIGN_HOOK_CANARY/);
  assert.equal(capture.sandbox.writeRoots.includes(options.cwd),false);assert.equal(capture.sandbox.runtime,'codex');assert.equal(existsSync(capture.env.TMPDIR),false);assert.equal(capture.closed,true);
  assert(capture.args.includes('shell_tool'));assert.deepEqual(capture.adapter.allowedTools,[]);
  const second=await(await startCompatibleRun({...options,resume:session},deps(capture))).completion;assert.equal(second.ok,true);assert.equal(capture.resume.provider,'openrouter');assert.equal(capture.resume.model,options.model);
  await assert.rejects(startCompatibleRun({...options,resume:'00000000-0000-0000-0000-000000000000'},deps({})),{code:'runtime_identity_mismatch'});
});
test('Stop leaves unknown process state and scratch recoverable; it never produces success',async t=>{
  const options=fixture(t),capture={},run=await startCompatibleRun(options,deps(capture,{wait:true,exited:false}));assert.equal(run.stop(),true);const result=await run.completion;
  assert.equal(result.ok,false);assert.equal(result.processTreeExited,false);assert.equal(result.errorCode,'operator_cancel');assert.equal(existsSync(capture.env.TMPDIR),true);assert.equal(capture.aborted,true);assert.equal(run.stop(),false);
});
test('unverified Local, missing auth, invalid isolation and mismatched provider fail without a task',async t=>{
  const options=fixture(t),capture={};await assert.rejects(startCompatibleRun({...options,connectorId:'local'},deps(capture)),{code:'provider_offline_unverified'});assert.equal(capture.command,undefined);
  await assert.rejects(startCompatibleRun(options,{...deps(capture),readCredential:()=>''}),{code:'provider_pending_auth'});assert.equal(capture.command,undefined);
  assert.throws(()=>buildCompatibleCodexArgs({...options,adapterBaseUrl:'http://127.0.0.1:8765/v1',sandbox:'danger-full-access'}),{code:'provider_sandbox_invalid'});
  assert.throws(()=>buildCompatibleCodexArgs({...options,adapterBaseUrl:'https://remote.invalid/v1'}),{code:'provider_adapter_endpoint_invalid'});
});
