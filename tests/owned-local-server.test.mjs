import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,chmodSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {saveLocalServerConfiguration,readLocalServerConfiguration,startOwnedLocalServer,inspectOwnedLocalServer} from '../scripts/openai-compatible/owned-local-server.mjs';
import {CompatibleProviderService} from '../scripts/openai-compatible/provider-service.mjs';

function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-owned-local-')),stateRoot=path.join(directory,'state'),assets=path.join(directory,'assets');mkdirSync(stateRoot);mkdirSync(assets);t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const options={root:process.cwd(),stateRoot},preset={baseUrl:'http://127.0.0.1:1234/v1',modelId:'fixture-local'},value={schema:1,endpoint:preset.baseUrl,command:process.execPath,args:[path.join(assets,'server.mjs'),'{port}'],readRoots:[assets],model:{id:preset.modelId,tools:true,responses:true,contextTokens:32768,outputTokens:4096,efforts:['default']}};
  return {directory,assets,options,preset,value,save:()=>saveLocalServerConfiguration(options,value),read:()=>readLocalServerConfiguration(options,preset)};
}
test('Local configuration pins a private binary/model/endpoint and rejects secrets, aliases and symlinks',t=>{
  const f=fixture(t);f.save();assert.match(f.read().identity,/^[a-f0-9]{64}$/);
  assert.throws(()=>readLocalServerConfiguration(f.options,{...f.preset,modelId:'other'}),{code:'provider_local_configuration_mismatch'});
  for(const bad of [{...f.value,environment:{OPENAI_API_KEY:'canary'}},{...f.value,endpoint:'https://example.org/v1'},{...f.value,readRoots:['/']},{...f.value,model:{...f.value.model,id:'model:cloud'}},{...f.value,commandSha256:'0'.repeat(64)}])assert.throws(()=>saveLocalServerConfiguration(f.options,bad));
  const file=path.join(f.options.stateRoot,'local-runtime','server.json');chmodSync(file,0o644);assert.throws(f.read);rmSync(file);symlinkSync(path.join(f.assets,'missing'),file);assert.throws(f.read);
});

test('Local configure CLI writes only the instance state selected in checkout configuration',t=>{
  const f=fixture(t),source=path.join(f.directory,'source');mkdirSync(source);
  writeFileSync(path.join(source,'.env.local'),`PRITHA_STATE_ROOT=${f.options.stateRoot}\n`);
  const manifest=path.join(f.directory,'manifest.json');writeFileSync(manifest,JSON.stringify(f.value));
  const result=spawnSync(process.execPath,[path.resolve('scripts/local-provider.mjs'),'configure','--file',manifest],{cwd:source,env:{PATH:process.env.PATH,HOME:os.tmpdir(),PRITHA_ROOT:source},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).configured,true);
  assert.equal(readLocalServerConfiguration({...f.options,root:source},f.preset).model.id,'fixture-local');
  assert.throws(()=>readFileSync(path.join(source,'local-runtime/server.json')),{code:'ENOENT'});
});
test('owned model server has one exact port, no remote/foreign-loopback access or parent credentials and dies with its lease',{skip:process.platform!=='darwin'},async t=>{
  const f=fixture(t);let forbiddenHits=0;const forbidden=createServer((_req,res)=>{forbiddenHits++;res.end('ESCAPED');});forbidden.listen(0,'127.0.0.1');await once(forbidden,'listening');t.after(()=>new Promise(resolve=>forbidden.close(resolve)));
  const secret=path.join(f.directory,'private-canary');writeFileSync(secret,'PRIVATE_CANARY');
  writeFileSync(f.value.args[0],`import {createServer} from 'node:http';import fs from 'node:fs';
const status={};for(const [name,url] of Object.entries({foreign:'http://127.0.0.1:${forbidden.address().port}',remote:'http://192.0.2.1:80'})){try{await fetch(url,{signal:AbortSignal.timeout(700)});status[name]='ESCAPED';}catch{status[name]='denied';}}
try{fs.readFileSync(${JSON.stringify(secret)});status.file='ESCAPED';}catch{status.file='denied';}
status.credentials=Object.keys(process.env).filter(key=>/API_KEY|TOKEN|AUTH|NODE_OPTIONS/i.test(key));status.offline=process.env.HF_HUB_OFFLINE;
const server=createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/v1/models')res.end(JSON.stringify({data:[{id:'fixture-local'}]}));else if(req.url==='/proof')res.end(JSON.stringify(status));else{res.statusCode=404;res.end('{}');}});server.listen(Number(process.argv[2]),'127.0.0.1');`);
  f.save();let diagnostic='';const config=f.read(),server=await startOwnedLocalServer({...f.options,timeoutMs:20000,onDiagnosticChunk:chunk=>diagnostic+=chunk},config).catch(error=>{assert.fail(error.code+': '+diagnostic.slice(-1800));});t.after(()=>server.close());
  const proof=await(await fetch(server.baseUrl.replace('/v1','')+'/proof')).json();assert.deepEqual(proof,{foreign:'denied',remote:'denied',file:'denied',credentials:[],offline:'1'});assert.equal(forbiddenHits,0);
  assert.equal((await inspectOwnedLocalServer(f.options,config)).id,'fixture-local');
  const service=new CompatibleProviderService({...f.options,connectorId:'local',privateRoot:path.join(f.options.stateRoot,'task-chat'),probeCli:async()=>({available:true,version:'0.153.0'}),probeSandbox:()=>true,readCredential:()=>{assert.fail('Local must not inspect credentials');}});
  const ready=await service.snapshot({...f.preset,reasoningEffort:'default'});assert.equal(ready.status,'ready');assert.equal(ready.capabilities.offline,true);assert.equal(ready.models[0].id,'fixture-local');
  await assert.rejects(startOwnedLocalServer(f.options,config),{code:'provider_local_process_unverified'});
  const receipt=JSON.parse(readFileSync(path.join(f.options.stateRoot,'local-runtime','active.json'),'utf8'));assert.equal(receipt.model.id,'fixture-local');assert(receipt.evidence.session>0);
  const exited=await server.close();assert.equal(exited.processTreeExited,true);assert.equal(await inspectOwnedLocalServer(f.options,config),null);
  await assert.rejects(fetch(server.baseUrl+'/models'));assert.equal(forbiddenHits,0);
  writeFileSync(path.join(f.options.stateRoot,'local-runtime','active.json'),JSON.stringify({identity:config.identity,ownerPid:999999,evidence:{coverage:'unknown'}}),{mode:0o600});
  await assert.rejects(startOwnedLocalServer(f.options,config),{code:'provider_local_process_unverified'});
});
test('an unconfirmed supervisor start retains its receipt and never reports a confirmed exit',async t=>{
  const f=fixture(t);writeFileSync(f.value.args[0],'// fixture');f.save();const config=f.read();
  await assert.rejects(startOwnedLocalServer(f.options,config,{prepareSandbox:()=>({command:process.execPath,args:[]}),spawnSupervised:async(_command,_args,options)=>{
    await options.beforeStart({version:1,session:999999,coverage:'unknown',escaped:[]});throw Object.assign(new Error('fixture'),{processTreeExited:false});
  }}),error=>error.processTreeExited===false);
  const receipt=JSON.parse(readFileSync(path.join(f.options.stateRoot,'local-runtime','active.json'),'utf8'));assert.equal(receipt.evidence.coverage,'unknown');
  await assert.rejects(startOwnedLocalServer(f.options,config),{code:'provider_local_process_unverified'});
});

function delayedModel(f,delay){
  writeFileSync(f.value.args[0],`import {createServer} from 'node:http';
const readyAt=Date.now()+${delay};
createServer((req,res)=>{res.setHeader('content-type','application/json');
if(req.url!=='/v1/models'){res.statusCode=404;res.end('{}');return;}
if(Date.now()<readyAt){res.statusCode=503;res.end('{"error":"Loading model"}');return;}
res.end(JSON.stringify({data:[{id:'fixture-local'}]}));}).listen(Number(process.argv[2]),'127.0.0.1');`);
  f.save();return f.read();
}

test('a slow owned model can finish loading after ten seconds without losing its isolation lease',{skip:process.platform!=='darwin',timeout:45000},async t=>{
  const f=fixture(t),config=delayedModel(f,11000);
  const server=await startOwnedLocalServer({...f.options,timeoutMs:30000},config);t.after(()=>server.close());
  assert.equal(server.model.id,'fixture-local');
  assert.equal((await inspectOwnedLocalServer(f.options,config)).id,'fixture-local');
  assert.equal((await server.close()).processTreeExited,true);
  assert.equal(await inspectOwnedLocalServer(f.options,config),null);
});

test('a shorter attempt deadline still stops a loading model and removes only its confirmed lease',{skip:process.platform!=='darwin',timeout:15000},async t=>{
  const f=fixture(t),config=delayedModel(f,11000);
  await assert.rejects(startOwnedLocalServer({...f.options,timeoutMs:1000},config),error=>error.code==='provider_local_startup_timeout' && error.processTreeExited===true);
  assert.equal(await inspectOwnedLocalServer(f.options,config),null);
});
