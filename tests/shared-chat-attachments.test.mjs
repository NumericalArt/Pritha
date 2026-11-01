import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, renameSync, rmSync, linkSync, symlinkSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import { NeuralDeepAttachmentStore } from '../scripts/neuraldeep/attachment-store.mjs';

const coreUrl = pathToFileURL(path.resolve('scripts/lib/chat-attachment-store.mjs')).href;
const request = bytes => new Request('http://fixture/upload', {method:'PUT', body:bytes});
const transpile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;

async function fixture(t, options={}) {
  const stateRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pritha-shared-attachments-'))), privateRoot = path.join(stateRoot,'chat');
  const wrapperPath = path.join(stateRoot,'wrapper.mjs');
  writeFileSync(wrapperPath, transpile(readFileSync('interfaces/control-center/src/lib/codex-chat/attachment-store.ts','utf8')).replaceAll('"../../../../../scripts/lib/chat-attachment-store.mjs"',JSON.stringify(coreUrl)));
  const {ChatAttachmentStore}=await import(pathToFileURL(wrapperPath).href);
  const store=new ChatAttachmentStore(stateRoot,privateRoot,options), stores=[store];
  t.after(async()=>{for(const value of stores)await value.close();rmSync(stateRoot,{recursive:true,force:true});});
  return {stateRoot,privateRoot,wrapperPath,store,stores,ChatAttachmentStore};
}

test('canonical legacy metadata is read without migration and becomes versioned only on reference update',async t=>{
  const f=await fixture(t),id=randomUUID();await f.store.upload(id,'../note.txt',request('original'));
  const metadata=path.join(f.store.root,id,'metadata.json'),record=JSON.parse(readFileSync(metadata));
  delete record.version;record.href='/api/codex-chat/v1/attachments/'+id;writeFileSync(metadata,JSON.stringify(record));
  const before=readFileSync(metadata);
  const reopened=new f.ChatAttachmentStore(f.stateRoot,f.privateRoot);f.stores.push(reopened);
  const resolved=await reopened.resolve(id);
  assert.equal(resolved.view.name,'note.txt');assert.equal(readFileSync(resolved.filePath,'utf8'),'original');
  assert.deepEqual((await reopened.prepare([id]))[0].view,resolved.view);assert.deepEqual(readFileSync(metadata),before);
  const strict=new NeuralDeepAttachmentStore({stateRoot:f.stateRoot,privateRoot:f.privateRoot});f.stores.push(strict);
  await assert.rejects(strict.resolve(id),error=>error.code==='attachment_storage_unavailable');
  await reopened.retain([id]);
  assert.equal(JSON.parse(readFileSync(metadata)).version,1);assert.equal(JSON.parse(readFileSync(metadata)).referenced,true);
  assert.deepEqual((await strict.resolve(id)).view,resolved.view);
  assert.equal(readFileSync(resolved.filePath,'utf8'),'original');
});

test('unknown schemas, hardlinks and root aliases are rejected without deleting private originals',async t=>{
  const f=await fixture(t),id=randomUUID();await f.store.upload(id,'file.bin',request('original'));
  const metadata=path.join(f.store.root,id,'metadata.json'),original=path.join(f.store.root,id,'original.bin'),valid=readFileSync(metadata);
  for(const version of [0,2,null,'1']) {
    writeFileSync(metadata,JSON.stringify({...JSON.parse(valid),version}));const before=readFileSync(metadata);
    await assert.rejects(f.store.resolve(id),e=>e.code==='attachment_storage_unavailable');
    await assert.rejects(f.store.upload(randomUUID(),'new.bin',request('new')),e=>e.code==='attachment_storage_unavailable');
    assert.deepEqual(readFileSync(metadata),before);assert.equal(readFileSync(original,'utf8'),'original');
  }
  writeFileSync(metadata,valid);linkSync(original,path.join(f.stateRoot,'alias.bin'));
  await assert.rejects(f.store.resolve(id),e=>e.code==='attachment_storage_unavailable');
  rmSync(path.join(f.stateRoot,'alias.bin'));assert.equal((await f.store.resolve(id)).view.size,8);
  const alias=path.join(f.stateRoot,'linked-chat');symlinkSync(f.privateRoot,alias);
  const linked=new f.ChatAttachmentStore(f.stateRoot,alias);f.stores.push(linked);
  await assert.rejects(linked.resolve(id),e=>e.code==='attachment_storage_unavailable');
  assert.equal(readFileSync(original,'utf8'),'original');
});

test('explicit state-root aliases and legacy uppercase upload IDs preserve the same private originals',async t=>{
  const f=await fixture(t),id=randomUUID(),upper=id.toUpperCase();await f.store.upload(id,'legacy.txt',request('original'));
  const previous=path.join(f.store.root,id),next=path.join(f.store.root,upper);
  renameSync(previous,next);
  const metadata=path.join(next,'metadata.json'),record=JSON.parse(readFileSync(metadata));delete record.version;record.id=upper;writeFileSync(metadata,JSON.stringify(record));
  const alias=path.join(path.dirname(f.stateRoot),'pritha-alias-'+randomUUID());symlinkSync(f.stateRoot,alias);t.after(()=>rmSync(alias,{force:true}));
  const aliased=new f.ChatAttachmentStore(alias,path.join(alias,'chat'));f.stores.push(aliased);
  const before=readFileSync(metadata),resolved=await aliased.resolve(upper);
  assert.equal(resolved.view.id,upper);assert.equal(readFileSync(resolved.filePath,'utf8'),'original');assert.deepEqual(readFileSync(metadata),before);
  assert.deepEqual(await aliased.upload(upper,'legacy.txt',request('original')),resolved.view);
  assert.deepEqual((await f.store.resolve(id)).view,resolved.view);
  assert.equal(aliased.root,f.store.root);
});

test('canonical and NeuralDeep callers in separate processes share quota and exact replay works when full',async t=>{
  const f=await fixture(t,{limits:{storageBytes:22000}}),children=[];
  t.after(()=>{for(const child of children)if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');});
  const run=async canonical=>new Promise((resolve,reject)=>{
    const id=randomUUID(),module=canonical?pathToFileURL(f.wrapperPath).href:pathToFileURL(path.resolve('scripts/neuraldeep/attachment-store.mjs')).href;
    const script=`import * as m from ${JSON.stringify(module)}; const s=${canonical?'new m.ChatAttachmentStore('+JSON.stringify(f.stateRoot)+','+JSON.stringify(f.privateRoot)+',{limits:{storageBytes:22000}})':'new m.NeuralDeepAttachmentStore('+JSON.stringify({stateRoot:f.stateRoot,privateRoot:f.privateRoot,limits:{storageBytes:22000}})+')'};try{await s.upload(${JSON.stringify(id)},'data.bin',new Request('http://fixture',{method:'PUT',body:Buffer.alloc(10000,7)}));console.log('ok:'+${JSON.stringify(id)});}catch(e){console.log(e.code);}finally{await s.close();}`;
    const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});children.push(child);
    let output='';child.stdout.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('close',code=>code===0?resolve(output.trim()):reject(new Error('fixture child failed')));
  });
  const results=await Promise.all([run(true),run(false)]);
  assert.equal(results.filter(row=>row.startsWith('ok:')).length,1);assert.ok(results.includes('attachment_storage_full'));
  const id=results.find(row=>row.startsWith('ok:')).slice(3);
  // New uploads lack headroom, but an exact retry only hashes incoming bytes.
  assert.equal((await f.store.upload(id,'data.bin',request(Buffer.alloc(10000,7)))).id,id);
  await assert.rejects(f.store.upload(id,'data.bin',request(Buffer.alloc(10000,8))),e=>e.code==='attachment_conflict');
  assert.equal((await f.store.resolve(id)).view.size,10000);
});

test('aborting a stalled upload releases its mutex and preserves a retryable identity',async t=>{
  const f=await fixture(t),id=randomUUID(),controller=new AbortController();let began,cancelled=false;
  const started=new Promise(resolve=>{began=resolve;});
  const pending=f.store.upload(id,'retry.bin',new Request('http://fixture',{method:'PUT',duplex:'half',signal:controller.signal,body:new ReadableStream({pull(){began();},cancel(){cancelled=true;}})}));
  await started;controller.abort();await assert.rejects(pending,e=>e.code==='attachment_upload_interrupted');assert.equal(cancelled,true);
  await f.store.upload(id,'retry.bin',request('recovered'));assert.equal(readFileSync((await f.store.resolve(id)).filePath,'utf8'),'recovered');
});

test('dispatch snapshots replay exact copies, reject changed copies and cannot write outside private state',async t=>{
  const f=await fixture(t),id=randomUUID();await f.store.upload(id,'input.bin',request('original'));
  const directory=path.join(f.stateRoot,'attempts','one');
  const [first]=await f.store.snapshotForDispatch([id],directory);
  assert.deepEqual(await f.store.snapshotForDispatch([id],directory),[first]);
  writeFileSync(first.filePath,'modified');
  await assert.rejects(f.store.snapshotForDispatch([id],directory),e=>e.code==='attachment_snapshot_conflict');
  assert.equal(readFileSync(first.filePath,'utf8'),'modified');assert.equal(readFileSync((await f.store.resolve(id)).filePath,'utf8'),'original');
  const outside=path.join(path.dirname(f.stateRoot),randomUUID());
  await assert.rejects(f.store.snapshotForDispatch([id],outside),e=>e.code==='attachment_storage_unavailable');assert.equal(existsSync(outside),false);
  await assert.rejects(f.store.snapshotForDispatch([id],path.join(f.store.root,id)),e=>e.code==='attachment_storage_unavailable');
  assert.equal(readFileSync((await f.store.resolve(id)).filePath,'utf8'),'original');
});

test('download serves the verified descriptor and closes it without reopening a substituted path',async t=>{
  const f=await fixture(t),id=randomUUID();await f.store.upload(id,'download.txt',request('original'));
  const modulePath=path.join(f.stateRoot,'download.mjs');
  const source=transpile(readFileSync('interfaces/control-center/src/app/api/codex-chat/v1/attachments/[attachmentId]/route.ts','utf8'))
    .replaceAll('"@/lib/codex-chat/gateway"','"./gateway.mjs"').replaceAll('"@/lib/codex-chat/attachment-store"',JSON.stringify(coreUrl)).replaceAll('"@/lib/codex-chat/http"','"./http.mjs"');
  writeFileSync(modulePath,source);writeFileSync(path.join(f.stateRoot,'gateway.mjs'),'export let attachments;export function set(value){attachments=value;}export function getCodexChatGateway(){return {attachments};}');
  writeFileSync(path.join(f.stateRoot,'http.mjs'),'export const apiSuccess=(data,options)=>Response.json(data,options);export const apiError=e=>Response.json({error:e.code},{status:e.status || 500});');
  const bridge=await import(pathToFileURL(path.join(f.stateRoot,'gateway.mjs')).href);bridge.set(f.store);
  const api=await import(pathToFileURL(modulePath).href),openOriginal=f.store.openOriginal.bind(f.store);let held;
  f.store.openOriginal=async target=>{const record=await openOriginal(target);held=record.handle;renameSync(record.filePath,record.filePath+'.saved');writeFileSync(record.filePath,'replaced');return record;};
  const response=await api.GET(new Request('http://fixture'),{params:Promise.resolve({attachmentId:id})});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/sandbox/);
  assert.equal(await response.text(),'original');await new Promise(resolve=>setImmediate(resolve));assert.equal(held.fd,-1);
  f.store.openOriginal=openOriginal;
  const corrupt=await api.GET(new Request('http://fixture'),{params:Promise.resolve({attachmentId:id})});
  assert.equal(corrupt.status,409);assert.deepEqual(await corrupt.json(),{error:'attachment_corrupt'});
});
