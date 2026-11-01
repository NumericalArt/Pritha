import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,chmodSync,symlinkSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderHostTools } from '../scripts/lib/provider-host-tools.mjs';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { providerProcessTreesExited } from '../scripts/lib/provider-process-proof.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),hash=value=>createHash('sha256').update(value).digest('hex'),result=value=>JSON.parse(value.content[0].text);
function fixture(t,options={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-host-tools-')),cwd=path.join(directory,'workspace'),stateRoot=path.join(directory,'state');mkdirSync(cwd);mkdirSync(stateRoot);
  const coordinator=new ExecutionCoordinator({stateRoot}),lease=coordinator.claim(['fixture-resource'],'fixture-owner',{kind:'turn',capacity:4}),controller=new AbortController(),proofs=[];
  const tools=new ProviderHostTools({root,cwd,stateRoot,privateRoot:path.join(stateRoot,'claude'),connectorId:'claude',coordinator,lease,chatId:'chat_fixture',turnId:'turn_fixture',signal:controller.signal,sandbox:'workspace-write',approve:async()=>({decision:'accept'}),onProcessEvidence:(id,proof)=>proofs.push({id,proof}),...options});
  t.after(async()=>{controller.abort();await tools.close();lease.release();coordinator.close();rmSync(directory,{recursive:true,force:true});});return {tools,cwd,stateRoot,coordinator,controller,proofs};
}
test('host files require exact approval and version; receipt replays without rewriting or asking again',async t=>{
  let approvals=0;const f=fixture(t,{approve:async()=>{approvals++;return {decision:'accept'};}}),file=path.join(f.cwd,'code.sh');writeFileSync(file,'old');chmodSync(file,0o755);
  assert.equal(result(await f.tools.call('read_file',{path:'code.sh'})).sha256,hash('old'));
  const input={operation_id:'write_fixture_001',path:'code.sh',expected_sha256:hash('old'),content:'new'};
  const results=await Promise.all([f.tools.call('write_file',input),f.tools.call('write_file',input)]);assert.ok(results.every(row=>result(row).status==='completed'));
  assert.equal(approvals,1);assert.equal(readFileSync(file,'utf8'),'new');assert.equal(statSync(file).mode&0o777,0o755);
  writeFileSync(file,'changed later');await f.tools.call('write_file',input);assert.equal(readFileSync(file,'utf8'),'changed later');assert.equal(approvals,1);
  await assert.rejects(f.tools.call('write_file',{...input,content:'different'}),{code:'idempotency_conflict'});
  await assert.rejects(f.tools.call('write_file',{...input,operation_id:'write_fixture_002'}),{code:'provider_tool_file_changed'});
});
test('declined writes, read-only policy, secret paths, traversal and links have no side effect',async t=>{
  const f=fixture(t,{approve:async()=>({decision:'decline'})}),input={operation_id:'write_fixture_001',path:'new.txt',expected_sha256:null,content:'new'};
  assert.equal(result(await f.tools.call('write_file',input)).status,'declined');assert.throws(()=>readFileSync(path.join(f.cwd,'new.txt')),{code:'ENOENT'});
  writeFileSync(path.join(f.cwd,'.env'),'PRIVATE');symlinkSync(f.stateRoot,path.join(f.cwd,'escape'));
  for(const relative of ['.env','../state/file','escape/file','/etc/passwd'])await assert.rejects(f.tools.call('read_file',{path:relative}),{code:'provider_tool_path_denied'});
  const names=result(await f.tools.call('list_files',{path:'.'})).files;assert.deepEqual(names,[]);
  f.tools.options.sandbox='read-only';await assert.rejects(f.tools.call('write_file',{...input,operation_id:'write_fixture_002'}),{code:'provider_tool_write_denied'});
});
test('file changes during operator review invalidate that exact proposed write',async t=>{
  const f=fixture(t);const file=path.join(f.cwd,'file');writeFileSync(file,'old');f.tools.options.approve=async()=>{writeFileSync(file,'concurrent');return {decision:'accept'};};
  const response=result(await f.tools.call('write_file',{operation_id:'write_fixture_001',path:'file',expected_sha256:hash('old'),content:'new'}));
  assert.equal(response.status,'failed');assert.equal(response.text,'provider_tool_file_changed');assert.equal(readFileSync(file,'utf8'),'concurrent');
});
test('bounded exact edits support large files and refuse ambiguous matches and protected verifier writes',async t=>{
  const f=fixture(t),content='prefix\n'+'large content\n'.repeat(6000)+'unique END\n';writeFileSync(path.join(f.cwd,'large.txt'),content);writeFileSync(path.join(f.cwd,'verify.mjs'),'immutable');
  const protectedTools=new ProviderHostTools({...f.tools.options,protectedPaths:['verify.mjs']});t.after(()=>protectedTools.close());
  const edit={operation_id:'edit_fixture_001',path:'large.txt',expected_sha256:hash(content),old_text:'unique END',new_text:'changed END'};
  assert.equal(result(await protectedTools.call('edit_file',edit)).status,'completed');assert.equal(readFileSync(path.join(f.cwd,'large.txt'),'utf8'),content.replace('unique END','changed END'));
  await assert.rejects(protectedTools.call('edit_file',{...edit,operation_id:'edit_fixture_002',expected_sha256:hash(content.replace('unique END','changed END')),old_text:'large content'}),{code:'provider_tool_edit_ambiguous'});
  await assert.rejects(protectedTools.call('write_file',{operation_id:'write_fixture_001',path:'verify.mjs',expected_sha256:hash('immutable'),content:'weakened'}),{code:'provider_protected_trial_input'});
});
test('approved command runs in owned OS sandbox; Stop terminates its tree and long output stays retrievable',{skip:process.platform!=='darwin',timeout:30000},async t=>{
  const f=fixture(t);const out=await f.tools.call('run_command',{operation_id:'command_fixture_001',argv:[process.execPath,'-e','process.stdout.write("x".repeat(20000))']});
  assert.equal(result(out).status,'completed',JSON.stringify(out));assert.equal(result(out).nextOffset,16000);assert.equal(result(await f.tools.call('read_result',{operation_id:'command_fixture_001',offset:16000})).text.length,4000);assert.ok(f.proofs.length);
  const pending=f.tools.call('run_command',{operation_id:'command_fixture_002',argv:[process.execPath,'-e','setInterval(()=>{},1000)']});
  for(let i=0;i<100 && !f.proofs.some(row=>row.id==='command_fixture_002');i++)await new Promise(resolve=>setTimeout(resolve,20));
  f.controller.abort();assert.equal(result(await pending).status,'failed');assert.equal((await f.tools.close()).processTreeExited,true);
});
test('a composite process proof requires every tree and rejects missing CLI or unknown coverage',()=>{
  const cli={version:1,session:5,escaped:[],coverage:'observed'},tool={version:1,session:6,escaped:[],coverage:'observed'},proof={kind:'provider-process-set',version:1,trees:[{id:'cli',evidence:cli},{id:'tool_001',evidence:tool}]};
  assert.equal(providerProcessTreesExited(proof,[]),true);assert.equal(providerProcessTreesExited(proof,[{session:6,state:'S'}]),false);
  assert.equal(providerProcessTreesExited({...proof,trees:proof.trees.slice(1)},[]),false);assert.equal(providerProcessTreesExited({...proof,trees:[{id:'cli',evidence:{...cli,coverage:'unknown'}}]},[]),false);
});
