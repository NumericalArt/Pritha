import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PassThrough} from 'node:stream';
import {execFileSync} from 'node:child_process';
import {nativeClaudeAuthPaths,nativeClaudeEnvironment,probeClaudeNativeAuth,nativeClaudeLoginPlan,nativeClaudeSandboxRoots} from '../scripts/claude/native-auth.mjs';
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
  const result=await probeClaudeNativeAuth({...f,env:{PATH:process.env.PATH,HOME:'/wrong/HOME_CANARY',CLAUDE_SECURESTORAGE_CONFIG_DIR:'/wrong/STORE_CANARY',ANTHROPIC_API_KEY:'KEY_CANARY',CLAUDE_CODE_OAUTH_TOKEN:'TOKEN_CANARY',ANTHROPIC_BASE_URL:'http://wrong',NODE_OPTIONS:'HOOK_CANARY'}},fake({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',email:'synthetic@example.test',orgId:'synthetic-org',accessToken:'TOKEN_CANARY'},capture));
  assert.equal(result.authenticated,true);assert.match(result.identity,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(result),/CANARY|synthetic|example/);
  assert.doesNotMatch(JSON.stringify(capture.env),/CANARY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_BASE_URL|NODE_OPTIONS/);
  assert.equal(capture.env.ENABLE_CLAUDEAI_MCP_SERVERS,'false');assert.equal(capture.env.HOME,process.platform==='darwin'?os.userInfo().homedir:paths.home);assert.equal(capture.env.CLAUDE_CONFIG_DIR,paths.config);assert(!capture.args.includes('--bare'));
  assert.deepEqual(capture.plan.readRoots,nativeClaudeSandboxRoots(paths).readRoots);assert.deepEqual(capture.plan.writeRoots,nativeClaudeSandboxRoots(paths).writeRoots);
  assert(!capture.plan.readRoots.includes(os.userInfo().homedir));
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
  const plan=prepareProviderSandbox({...f,privateRoot:own.base,command:process.execPath,args:['-e',script],cwd:temporary,temporary,...nativeClaudeSandboxRoots(own)});
  const run=await spawnSupervisedCli(plan.command,plan.args,{cwd:temporary,env:nativeClaudeEnvironment(f,own,temporary)}),buffers=[];run.child.stdin.end();
  const drain=(async()=>{for await(const _ of run.child.stderr){}})();const read=(async()=>{for await(const chunk of run.child.stdout)buffers.push(chunk);})();
  const [done]=await Promise.all([run.completion,read,drain]);assert.equal(done.processTreeExited,true);assert.equal(done.code,0);
  assert.deepEqual(JSON.parse(Buffer.concat(buffers).toString()),{own:'read',foreign:'denied',workspace:'denied',refresh:'written'});
});
test('native macOS sandbox locates the user Keychain while model tool sandboxes cannot',{skip:process.platform!=='darwin'},async t=>{
  let expected;
  try{expected=execFileSync('/usr/bin/security',['default-keychain','-d','user'],{env:{...process.env,HOME:os.userInfo().homedir},encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim();}catch{t.skip('This OS account has no default Keychain');return;}
  const f=fixture(t),own=nativeClaudeAuthPaths(f,{prepare:true}),temporary=createProviderTemporaryDirectory({provider:'claude',stateRoot:f.stateRoot});t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const script=`const {execFileSync}=require('node:child_process');let same=false;try{same=execFileSync('/usr/bin/security',['default-keychain','-d','user'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim()===${JSON.stringify(expected)};}catch{}console.log(JSON.stringify({same}));`;
  for(const native of [true,false]){
    const plan=prepareProviderSandbox({...f,privateRoot:own.base,command:process.execPath,args:['-e',script],cwd:temporary,temporary,...(native?nativeClaudeSandboxRoots(own):{})});
    const run=await spawnSupervisedCli(plan.command,plan.args,{cwd:temporary,env:nativeClaudeEnvironment(f,own,temporary)}),buffers=[];run.child.stdin.end();
    const [done]=await Promise.all([run.completion,(async()=>{for await(const b of run.child.stdout)buffers.push(b);})(),(async()=>{for await(const _ of run.child.stderr){}})()]);
    assert.equal(done.processTreeExited,true);assert.equal(done.code,0);assert.deepEqual(JSON.parse(Buffer.concat(buffers).toString()),{same:native});
  }
});
test('native login plan pins both root aliases and state even from another checkout',t=>{
  const f=fixture(t);f.stateRoot=path.join(f.stateRoot,"one's state");fs.mkdirSync(f.stateRoot);
  const command=nativeClaudeLoginPlan(f).command;
  assert.match(command,/PRITHA_ROOT=/);assert.match(command,/TECHSCOPE_ROOT=/);assert.match(command,/PRITHA_STATE_ROOT=/);
  const plan=execFileSync('/bin/sh',['-c',command.replace(/ login$/,' plan')],{cwd:os.tmpdir(),encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(JSON.parse(plan).command,command);
});
test('native Keychain refresh works in a fresh isolated store without a broader network grant',{skip:process.platform!=='darwin'},async t=>{
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'pritha-auth-keychain-')),f={root:process.cwd(),stateRoot},own=nativeClaudeAuthPaths(f,{prepare:true});
  const temporary=path.join(stateRoot,'tmp');fs.mkdirSync(temporary);
  // This throwaway store contains only a synthetic value. No login Keychain,
  // account entry or credential is created, read, unlocked or modified here.
  const env={...nativeClaudeEnvironment(f,own,temporary),HOME:own.home},file=path.join(own.home,'fixture.keychain-db');let confirmed=true,created=false;
  t.after(()=>{if(confirmed){if(created)execFileSync('/usr/bin/security',['delete-keychain',file],{env,timeout:5000,stdio:'pipe'});fs.rmSync(stateRoot,{recursive:true,force:true});}});
  execFileSync('/usr/bin/security',['create-keychain','-p','SYNTHETIC_FIXTURE_ONLY',file],{env,timeout:5000,stdio:'pipe'});created=true;
  const script=`const {execFileSync}=require('node:child_process');try{execFileSync('/usr/bin/security',['add-generic-password','-a','fixture','-s','Pritha-synthetic-test','-w','CANARY','-A',${JSON.stringify(file)}],{timeout:5000,stdio:'pipe'});const v=execFileSync('/usr/bin/security',['find-generic-password','-a','fixture','-s','Pritha-synthetic-test','-w',${JSON.stringify(file)}],{encoding:'utf8',timeout:5000,stdio:'pipe'});console.log(JSON.stringify({saved:v.trim()==='CANARY'}));}catch{console.log(JSON.stringify({saved:false}));}`;
  for(const native of [false,true]){
    const plan=prepareProviderSandbox({...f,privateRoot:own.base,command:process.execPath,args:['-e',script],cwd:temporary,temporary,readRoots:[own.home],writeRoots:[own.home],...(native?{runtime:'claude-native'}:{})});
    const policy=JSON.parse(fs.readFileSync(plan.planPath,'utf8')).config;assert.equal(policy.enableWeakerNetworkIsolation,false);assert.deepEqual(policy.network.allowedDomains,[]);assert.equal(policy.allowMachLookup,undefined);
    const run=await spawnSupervisedCli(plan.command,plan.args,{cwd:temporary,env}),buffers=[];confirmed=false;run.child.stdin.end();
    const [done]=await Promise.all([run.completion,(async()=>{for await(const b of run.child.stdout)buffers.push(b);})(),(async()=>{for await(const _ of run.child.stderr){}})()]);confirmed=done.processTreeExited===true;
    assert.equal(confirmed,true);assert.equal(done.code,0);assert.deepEqual(JSON.parse(Buffer.concat(buffers).toString()),{saved:native});
  }
});
