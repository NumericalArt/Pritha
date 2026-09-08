import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { prepareAgentWorkspaceTarget, scopedAgentWorkspace, inspectTaskWorkspace, prepareTaskWorkspace, reviewTaskWorkspace, taskWorkspaceResources, applyTaskWorkspace, cleanupTaskWorkspace } from '../scripts/lib/task-workspace.mjs';

function fixture() {
  const tmp=realpathSync(mkdtempSync(path.join(os.tmpdir(),'pritha-workspace-test-')));
  const source=path.join(tmp,'project'),state=path.join(tmp,'state');
  mkdirSync(source);mkdirSync(state);
  const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init');git('config','user.name','Workspace test');git('config','user.email','test@example.invalid');
  writeFileSync(path.join(source,'file.txt'),'base\n');writeFileSync(path.join(source,'.gitignore'),'.private/\n.env\n');
  git('add','.');git('commit','-m','base');
  const coordinator=new ExecutionCoordinator({stateRoot:state});
  return {source,state,git,coordinator,prepare:id=>prepareTaskWorkspace({coordinator,source,directory:path.join(state,'workspaces'),id}),close(){coordinator.close();rmSync(tmp,{recursive:true,force:true});}};
}

test('agent target resumes its own logical workflow during drain and rejects another owner',()=>{
  const f=fixture();
  try {
    const target=scopedAgentWorkspace(f.state,'NewAgent');
    prepareAgentWorkspaceTarget(f.coordinator,target,null);
    const lease=f.coordinator.claim([`workspace:${target}`],'voice',{kind:'voice-workflow'});
    assert.throws(()=>prepareAgentWorkspaceTarget(f.coordinator,target,null),{code:'workspace_busy'});
    f.coordinator.setAdmission(false);
    for(const state of ['waiting_admission','waiting_for_operator'])prepareAgentWorkspaceTarget(f.coordinator,target,{owner:lease.owner,generation:lease.generation,state});
    lease.assertOwned();
    rmSync(target,{recursive:true});
    assert.throws(()=>prepareAgentWorkspaceTarget(f.coordinator,target,{...lease,state:'waiting_admission'}),{code:'agent_workspace_target_invalid'});
    lease.release();
  }finally{f.close();}
});

test('parallel conversations edit isolated worktrees without changing source or copying secrets',async()=>{
  const f=fixture();
  try {
    writeFileSync(path.join(f.source,'.env'),'DO_NOT_COPY_TEST_SENTINEL');
    mkdirSync(path.join(f.source,'.private'));writeFileSync(path.join(f.source,'.private','state'),'private');
    const a=await f.prepare('chat-a'),b=await f.prepare('chat-b');
    assert.notEqual(a.cwd,b.cwd);assert.notEqual(a.branch,b.branch);
    writeFileSync(path.join(a.cwd,'file.txt'),'A\n');writeFileSync(path.join(b.cwd,'file.txt'),'B\n');
    assert.equal(readFileSync(path.join(f.source,'file.txt'),'utf8'),'base\n');
    assert.throws(()=>readFileSync(path.join(a.cwd,'.env')),{code:'ENOENT'});
    assert.equal((await reviewTaskWorkspace(a)).diff.includes('+A'),true);
    assert.equal((await reviewTaskWorkspace(b)).diff.includes('+B'),true);
    assert.equal((await f.prepare('chat-a')).cwd,a.cwd);
    assert.equal(f.coordinator.claims().length,0);
  } finally {f.close();}
});

test('dirty source requires an exact committed base; local changes and source movement remain intact',async()=>{
  const f=fixture();
  try {
    const base=f.git('rev-parse','HEAD');writeFileSync(path.join(f.source,'file.txt'),'operator edit\n');
    await assert.rejects(f.prepare('dirty'),{code:'workspace_dirty'});
    const view=await inspectTaskWorkspace(f.source);assert.equal(view.dirty,true);
    const a=await prepareTaskWorkspace({coordinator:f.coordinator,source:f.source,directory:path.join(f.state,'workspaces'),id:'dirty',baseRevision:base});
    assert.equal(readFileSync(path.join(a.cwd,'file.txt'),'utf8'),'base\n');
    assert.equal(readFileSync(path.join(f.source,'file.txt'),'utf8'),'operator edit\n');
    f.git('add','file.txt');f.git('commit','-m','operator change');
    assert.notEqual((await reviewTaskWorkspace(a)).sourceRevision,a.baseRevision);
  } finally {f.close();}
});

test('non-Git work remains serialized; read-only claims coexist and cannot upgrade past another reader',async()=>{
  const f=fixture();
  try {
    const nonGit=path.join(f.state,'plain');mkdirSync(nonGit);
    const workspace=await prepareTaskWorkspace({coordinator:f.coordinator,source:nonGit,directory:path.join(f.state,'workspaces'),id:'non-git'});
    assert.equal(workspace.mode,'serialized');
    const policy=taskWorkspaceResources(workspace,'workspace-write');
    const a=f.coordinator.claim(policy.resources,'a',{mode:policy.mode});
    assert.equal(f.coordinator.claim(policy.resources,'b'),null);a.release();
    const r=f.coordinator.claim(policy.resources,'r',{mode:'read'}),s=f.coordinator.claim(policy.resources,'s',{mode:'read'});
    assert.equal(f.coordinator.extend(r.owner,r.generation,policy.resources),false);
    s.release();assert.equal(f.coordinator.extend(r.owner,r.generation,policy.resources),true);
    assert.equal(f.coordinator.claim(policy.resources,'new-reader',{mode:'read'}),null);
    r.release();
  } finally {f.close();}
});

function commitWorkspace(workspace,text) {
  writeFileSync(path.join(workspace.cwd,'file.txt'),text);
  const git=args=>execFileSync('git',args,{cwd:workspace.cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['add','file.txt']);git(['commit','-m','task change']);return git(['rev-parse','HEAD']);
}
test('apply serializes writers and rejects changed source without losing either result',async()=>{
  const f=fixture();
  try {
    const a=await f.prepare('apply-a'),b=await f.prepare('apply-b');
    const aHead=commitWorkspace(a,'A\n'),bHead=commitWorkspace(b,'B\n');
    let release,entered;const started=new Promise(resolve=>entered=resolve),waiting=new Promise(resolve=>release=resolve);
    const first=applyTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedSource:a.baseRevision,expectedHead:aHead,requestId:'a',verify:async()=>{entered();await waiting;return {passed:true};}});
    await started;
    await assert.rejects(applyTaskWorkspace({coordinator:f.coordinator,workspace:b,expectedSource:b.baseRevision,expectedHead:bHead,requestId:'b',verify:async()=>({passed:true})}),{code:'workspace_busy'});
    release();assert.equal((await first).state,'applied');
    await assert.rejects(applyTaskWorkspace({coordinator:f.coordinator,workspace:b,expectedSource:b.baseRevision,expectedHead:bHead,requestId:'b',verify:async()=>({passed:true})}),{code:'workspace_apply_base_changed'});
    assert.equal(readFileSync(path.join(f.source,'file.txt'),'utf8'),'A\n');
    assert.equal(readFileSync(path.join(b.cwd,'file.txt'),'utf8'),'B\n');
    assert.equal(f.coordinator.claims().length,0);
  }finally{f.close();}
});
test('cleanup retains unintegrated, active, dirty and ignored files; verified clean result can be retired',async()=>{
  const f=fixture();
  try {
    const a=await f.prepare('cleanup'),head=commitWorkspace(a,'Done\n');
    await assert.rejects(cleanupTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedHead:head}),{code:'workspace_result_not_integrated'});
    await applyTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedSource:a.baseRevision,expectedHead:head,requestId:'apply',verify:async()=>({passed:true})});
    const owner=f.coordinator.claim(taskWorkspaceResources(a,'workspace-write').resources,'active-task');
    await assert.rejects(cleanupTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedHead:head}),{code:'workspace_busy'});owner.release();
    writeFileSync(path.join(a.cwd,'.env'),'private');
    await assert.rejects(cleanupTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedHead:head}),{code:'workspace_cleanup_has_local_files'});
    assert.equal(readFileSync(path.join(a.cwd,'.env'),'utf8'),'private');rmSync(path.join(a.cwd,'.env'));
    assert.equal((await cleanupTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedHead:head})).state,'removed');
    assert.equal(f.git('rev-parse','HEAD'),head);
  }finally{f.close();}
});
test('failed post-apply verification keeps the result and prevents cleanup',async()=>{
  const f=fixture();
  try {
    const a=await f.prepare('failed-check'),head=commitWorkspace(a,'Inspect me\n');
    const result=await applyTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedSource:a.baseRevision,expectedHead:head,requestId:'apply',verify:async()=>({passed:false})});
    assert.equal(result.state,'applied_checks_failed');assert.equal(f.git('rev-parse','HEAD'),head);
    await assert.rejects(cleanupTaskWorkspace({coordinator:f.coordinator,workspace:a,expectedHead:head}),{code:'workspace_result_not_integrated'});
  }finally{f.close();}
});

test('agent writable targets reject parents, sibling clones, traversal and symlink substitution',()=>{
  const f=fixture();
  try {
    assert.equal(scopedAgentWorkspace(f.state,'new-agent'),path.join(f.state,'new-agent'));
    for(const name of ['', '../project','a/b','Pritha','Pritha_Dasha','Techscope-old'])assert.throws(()=>scopedAgentWorkspace(f.state,name),{code:'agent_workspace_target_required'});
    symlinkSync(f.source,path.join(f.state,'alias'));assert.throws(()=>scopedAgentWorkspace(f.state,'alias'),{code:'agent_workspace_target_invalid'});
    mkdirSync(path.join(f.state,'custom-clone'));writeFileSync(path.join(f.state,'custom-clone','package.json'),JSON.stringify({name:'techscope'}));
    assert.throws(()=>scopedAgentWorkspace(f.state,'custom-clone'),{code:'agent_workspace_target_invalid'});
  }finally{f.close();}
});
