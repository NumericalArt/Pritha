import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PassThrough} from 'node:stream';
import {nativeClaudeAuthPaths,nativeClaudeEnvironment,probeClaudeNativeAuth,nativeClaudeLoginPlan} from '../scripts/claude/native-auth.mjs';
import {resolveClaudeBinary} from '../scripts/claude-code-runner.mjs';
import {prepareProviderSandbox} from '../scripts/lib/provider-sandbox.mjs';
import {spawnSupervisedCli} from '../scripts/neuraldeep/process-supervisor.mjs';
import {createProviderTemporaryDirectory} from '../scripts/lib/provider-process-environment.mjs';

function fixture(t){const base=fs.mkdtempSync(path.join(os.tmpdir(),'pritha-native-auth-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));return {root:process.cwd(),stateRoot:base,binary:process.execPath};}
function fake(value,capture,{exited=true}={}){return {
  prepareSandbox:plan=>{capture.plan=plan;return {command:plan.command,args:plan.args};},
  spawnSupervised:async(_command,args,options)=>{
    capture.args=args;capture.env=options.env;await options.beforeStart?.({version:1,session:42,coverage:'observed',escaped:[]});
    const child={stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()};let finish;
    const completion=new Promise(resolve=>finish=resolve),close=()=>{child.stdout.end();child.stderr.end();finish({processTreeExited:exited,code:0});};
    child.stdin.resume();child.stdin.once('finish',()=>{child.stdout.write(JSON.stringify(value));close();});return {child,completion,stop:close};
  },
};}
test('native auth is instance-private, read-only before setup and never imports ambient keys',async t=>{
  const f=fixture(t),capture={};const absent=await probeClaudeNativeAuth(f,fake({},capture));assert.equal(absent.status,'not-configured');assert.equal(capture.args,undefined);
  const paths=nativeClaudeAuthPaths(f,{prepare:true});for(const dir of [paths.base,paths.home,paths.config])assert.equal(fs.statSync(dir).mode&0o777,0o700);
  const result=await probeClaudeNativeAuth({...f,env:{PATH:process.env.PATH,ANTHROPIC_API_KEY:'KEY_CANARY',CLAUDE_CODE_OAUTH_TOKEN:'TOKEN_CANARY',ANTHROPIC_BASE_URL:'http://wrong',NODE_OPTIONS:'HOOK_CANARY'}},fake({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'synthetic@example.test',orgId:'synthetic-org',accessToken:'TOKEN_CANARY'},capture));
  assert.equal(result.authenticated,true);assert.match(result.identity,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(result),/CANARY|synthetic|example/);
  assert.doesNotMatch(JSON.stringify(capture.env),/CANARY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_BASE_URL|NODE_OPTIONS/);
  assert.equal(capture.env.ENABLE_CLAUDEAI_MCP_SERVERS,'false');assert.equal(capture.env.HOME,paths.home);assert.equal(capture.env.CLAUDE_CONFIG_DIR,paths.config);assert(!capture.args.includes('--bare'));
  assert.equal(fs.existsSync(path.join(paths.base,'auth-probe.json')),false);
  const changed=await probeClaudeNativeAuth(f,fake({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'other@example.test'},{}));assert.notEqual(changed.identity,result.identity);
  const another=fixture(t);assert.notEqual(nativeClaudeAuthPaths(another,{prepare:true}).config,paths.config);
  assert.match(nativeClaudeLoginPlan(f).command,/claude-auth\.mjs' login$/);
});
test('native status refuses alternate auth, malformed metadata, linked stores and an unconfirmed process exit',async t=>{
  const f=fixture(t),paths=nativeClaudeAuthPaths(f,{prepare:true});
  assert.equal((await probeClaudeNativeAuth(f,fake({loggedIn:false,authMethod:'none'},{}))).status,'pending-auth');
  await assert.rejects(probeClaudeNativeAuth(f,fake({loggedIn:true,authMethod:'api_key',apiProvider:'firstParty',email:'x@example.test'},{})),{code:'provider_native_auth_unsupported'});
  await assert.rejects(probeClaudeNativeAuth(f,fake({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty'},{})),{code:'provider_native_auth_unavailable'});
  await assert.rejects(probeClaudeNativeAuth(f,fake({loggedIn:false},{},{exited:false})),{code:'provider_native_auth_unavailable'});
  assert.equal(fs.existsSync(path.join(paths.base,'auth-probe.json')),true);
  let started=false;await assert.rejects(probeClaudeNativeAuth(f,{spawnSupervised:()=>{started=true;}}),{code:'provider_native_auth_unavailable'});assert.equal(started,false);
  const g=fixture(t),other=nativeClaudeAuthPaths(g,{prepare:true});fs.rmSync(other.config,{recursive:true});fs.symlinkSync(paths.config,other.config);
  assert.throws(()=>nativeClaudeAuthPaths(g),{code:'provider_native_auth_unsafe'});
});
test('an unconfirmed native auth supervisor start retains its evidence and scratch',async t=>{
  const f=fixture(t),paths=nativeClaudeAuthPaths(f,{prepare:true});let scratch;
  await assert.rejects(probeClaudeNativeAuth(f,{prepareSandbox:plan=>{scratch=plan.temporary;return {command:plan.command,args:plan.args};},spawnSupervised:async(_c,_a,o)=>{await o.beforeStart({version:1,session:999999,coverage:'unknown'});throw Object.assign(new Error('fixture'),{processTreeExited:false});}}));
  assert(fs.existsSync(scratch));assert(fs.existsSync(path.join(paths.base,'auth-probe.json')));fs.rmSync(scratch,{recursive:true,force:true});
});
test('installed unmodified Claude checks an empty private session inside the real OS sandbox',{skip:process.platform!=='darwin'},async t=>{
  const f=fixture(t);nativeClaudeAuthPaths(f,{prepare:true});f.binary=resolveClaudeBinary();
  const result=await probeClaudeNativeAuth(f);assert.equal(result.authenticated,false);assert.equal(result.status,'pending-auth');assert.equal(result.identity,undefined);
});
test('native sandbox can read only its dedicated credential fallback, never a workspace or foreign session secret',{skip:process.platform!=='darwin'},async t=>{
  const f=fixture(t),own=nativeClaudeAuthPaths(f,{prepare:true}),other=fixture(t),foreign=nativeClaudeAuthPaths(other,{prepare:true});
  const temporary=createProviderTemporaryDirectory({provider:'claude',stateRoot:f.stateRoot});t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const files={own:path.join(own.config,'.credentials.json'),foreign:path.join(foreign.config,'.credentials.json'),workspace:path.join(temporary,'.env')};
  for(const file of Object.values(files))fs.writeFileSync(file,'SYNTHETIC_ONLY',{mode:0o600});
  const script=`const fs=require('fs'),result={};for(const [key,file] of Object.entries(${JSON.stringify(files)})){try{result[key]=fs.readFileSync(file,'utf8')==='SYNTHETIC_ONLY'?'read':'wrong';}catch{result[key]='denied';}}try{fs.writeFileSync(${JSON.stringify(files.own)},'REFRESHED');result.refresh='written';}catch{result.refresh='denied';}console.log(JSON.stringify(result));`;
  const plan=prepareProviderSandbox({...f,privateRoot:own.base,command:process.execPath,args:['-e',script],cwd:temporary,temporary,readRoots:[own.home,own.config],writeRoots:[own.home,own.config]});
  const run=await spawnSupervisedCli(plan.command,plan.args,{cwd:temporary,env:nativeClaudeEnvironment(f,own,temporary)}),buffers=[];run.child.stdin.end();
  const drain=(async()=>{for await(const _ of run.child.stderr){}})();const read=(async()=>{for await(const chunk of run.child.stdout)buffers.push(chunk);})();
  const [done]=await Promise.all([run.completion,read,drain]);assert.equal(done.processTreeExited,true);assert.equal(done.code,0);
  assert.deepEqual(JSON.parse(Buffer.concat(buffers).toString()),{own:'read',foreign:'denied',workspace:'denied',refresh:'written'});
});
