import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { prepareProviderSandbox } from '../scripts/lib/provider-sandbox.mjs';
import { providerProcessEnvironment } from '../scripts/lib/provider-process-environment.mjs';

const execute=promisify(execFile);
function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-sandbox-')),workspace=path.join(directory,'workspace'),scratch=path.join(directory,'scratch'),state=path.join(directory,'state');for(const d of [workspace,scratch,state])mkdirSync(d);t.after(()=>rmSync(directory,{recursive:true,force:true}));return {directory,workspace,scratch,state};}
async function run(f,command,args,options={}){
  const plan=prepareProviderSandbox({root:process.cwd(),stateRoot:f.state,privateRoot:f.state,command,args,cwd:f.workspace,temporary:f.scratch,writeRoots:options.write?[f.workspace]:[],denyWriteRoots:options.protected || [],loopbackPorts:options.ports || []});
  const env=providerProcessEnvironment({provider:'claude',root:process.cwd(),stateRoot:f.state,temporary:f.scratch,env:{PATH:process.env.PATH,HOME:f.scratch}});
  return execute(plan.command,plan.args,{env,timeout:15000,maxBuffer:100000,encoding:'utf8'});
}

test('real OS sandbox permits workspace access and blocks outside files, secrets, symlinks and guard writes',{skip:process.platform!=='darwin'},async t=>{
  const f=fixture(t),outside=path.join(f.directory,'outside.txt');writeFileSync(outside,'PRIVATE_CANARY');writeFileSync(path.join(f.workspace,'read.txt'),'public');writeFileSync(path.join(f.workspace,'.env'),'SECRET_CANARY');
  symlinkSync(outside,path.join(f.workspace,'link.txt'));mkdirSync(path.join(f.workspace,'.git'));writeFileSync(path.join(f.workspace,'.git','config'),'REMOTE_CREDENTIAL_CANARY');
  const script=`const fs=require('fs');const result={read:fs.readFileSync('read.txt','utf8')};for(const [name,file] of Object.entries(${JSON.stringify({outside,secret:'.env',link:'link.txt',git:'.git/config'})})){try{fs.readFileSync(file);result[name]='ESCAPED';}catch{result[name]='denied';}}fs.writeFileSync('output.txt','done');try{fs.writeFileSync(${JSON.stringify(outside)},'changed');result.outsideWrite='ESCAPED';}catch{result.outsideWrite='denied';}try{fs.writeFileSync('.env','changed');result.secretWrite='ESCAPED';}catch{result.secretWrite='denied';}console.log(JSON.stringify(result));`;
  const output=await run(f,process.execPath,['-e',script],{write:true});const result=JSON.parse(output.stdout);
  assert.deepEqual(result,{read:'public',outside:'denied',secret:'denied',link:'denied',git:'denied',outsideWrite:'denied',secretWrite:'denied'});
  assert.equal(readFileSync(path.join(f.workspace,'output.txt'),'utf8'),'done');assert.equal(readFileSync(outside,'utf8'),'PRIVATE_CANARY');
});

test('readonly sandbox and arbitrary quoted arguments cannot widen the filesystem policy',{skip:process.platform!=='darwin'},async t=>{
  const f=fixture(t),payload="'; touch injected; $(touch injected2) `touch injected3`";
  const script="const fs=require('fs');try{fs.writeFileSync('forbidden','bad');console.log('ESCAPED')}catch{console.log(JSON.stringify(process.argv[1]))}";
  assert.equal((await run(f,process.execPath,['-e',script,payload])).stdout.trim(),JSON.stringify(payload));
});

test('network closure includes loopback; only an exact host capability port is reachable',{skip:process.platform!=='darwin'},async t=>{
  const f=fixture(t);let hits=0;const server=createServer((_req,res)=>{hits++;res.end('CAPABILITY_OK');});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port,url='http://127.0.0.1:'+port;
  await assert.rejects(run(f,'/usr/bin/curl',['--noproxy','*','--max-time','2','-sf',url]));assert.equal(hits,0);
  assert.equal((await run(f,'/usr/bin/curl',['--noproxy','*','--max-time','2','-sf',url],{ports:[port]})).stdout,'CAPABILITY_OK');assert.equal(hits,1);
});
test('host protected Trial files survive direct writes, deletion, hardlink and ancestor-rename attacks',{skip:process.platform!=='darwin'},async t=>{
  const f=fixture(t),directory=path.join(f.workspace,'trials');mkdirSync(directory);const verifier=path.join(directory,'verify.mjs');writeFileSync(verifier,'IMMUTABLE_VERIFIER');
  const script=`const fs=require('fs');const result={};for(const [name,attempt] of Object.entries({write:()=>fs.writeFileSync('trials/verify.mjs','weakened'),unlink:()=>fs.unlinkSync('trials/verify.mjs'),rename:()=>fs.renameSync('trials','moved'),link:()=>{fs.linkSync('trials/verify.mjs','alias');fs.writeFileSync('alias','weakened');}})){try{attempt();result[name]='ESCAPED';}catch{result[name]='denied';}}fs.writeFileSync('product.mjs','implemented');console.log(JSON.stringify(result));`;
  const output=await run(f,process.execPath,['-e',script],{write:true,protected:[verifier]});assert.deepEqual(JSON.parse(output.stdout),{write:'denied',unlink:'denied',rename:'denied',link:'denied'});assert.equal(readFileSync(verifier,'utf8'),'IMMUTABLE_VERIFIER');assert.equal(readFileSync(path.join(f.workspace,'product.mjs'),'utf8'),'implemented');
});
