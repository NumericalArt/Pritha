import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ExecutionConflict } from './execution-coordinator.mjs';

const execute = promisify(execFile);
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => realpathSync(path.resolve(value));
export function scopedAgentWorkspace(parent,name) {
  if(typeof name!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name) || /^(?:pritha|techscope)(?:$|[-_])/i.test(name))throw new ExecutionConflict('agent_workspace_target_required');
  const root=canonical(parent),target=path.join(root,name);
  if(existsSync(target) && (lstatSync(target).isSymbolicLink() || canonical(target)!==target || !lstatSync(target).isDirectory()))throw new ExecutionConflict('agent_workspace_target_invalid');
  if(existsSync(path.join(target,'package.json'))) {
    let name;try{name=JSON.parse(readFileSync(path.join(target,'package.json'),'utf8')).name;}catch{}
    if(name==='techscope' || name==='pritha')throw new ExecutionConflict('agent_workspace_target_invalid');
  }
  return target;
}
/** Reuse the logical workflow claim across admission/operator waits. */
export function prepareAgentWorkspaceTarget(coordinator,target,workflow) {
  const held=workflow && ['running','waiting_admission','waiting_for_operator'].includes(workflow.state)
    && coordinator.claims().some(row=>row.owner===workflow.owner && row.generation===workflow.generation && row.mode==='write' && row.detail.workspacePath===target);
  if(held) {
    if(!existsSync(target) || lstatSync(target).isSymbolicLink() || canonical(target)!==target)throw new ExecutionConflict('agent_workspace_target_invalid');
    if(!coordinator.extend(workflow.owner,workflow.generation,[`workspace:${target}`]))throw new ExecutionConflict('workspace_busy');
    return;
  }
  const lease=coordinator.claim([`workspace:${target}`],`agent-target:${target}`,{kind:'workspace-create'});
  if(!lease)throw new ExecutionConflict('workspace_busy');
  try {
    if(!existsSync(target))mkdirSync(target,{mode:0o700});
    if(lstatSync(target).isSymbolicLink() || canonical(target)!==target || !lstatSync(target).isDirectory())throw new ExecutionConflict('agent_workspace_target_invalid');
  }finally{lease.release();}
}
async function git(cwd, args) {
  const result = await execute('git', args, {cwd,encoding:'utf8',timeout:30_000,maxBuffer:16*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  return result.stdout.trim();
}

export async function inspectTaskWorkspace(source) {
  const root=canonical(source);
  let gitRoot;
  try { gitRoot=canonical(await git(root,['rev-parse','--show-toplevel'])); }
  catch { return {source:root,git:false,baseRevision:null,dirty:false}; }
  if (gitRoot!==root) throw new ExecutionConflict('workspace_not_project_root','The task workspace must be the project root.');
  return {source:root,git:true,baseRevision:await git(root,['rev-parse','HEAD']),dirty:Boolean(await git(root,['status','--porcelain=v1','--untracked-files=normal']))};
}

/** One durable binding per new conversation/task. Never copies dirty or private files. */
export async function prepareTaskWorkspace({coordinator,source,directory,id,mode='worktree',baseRevision}) {
  const root=canonical(source), key=`task-workspace:${id}`;
  const prior=coordinator.getIntent(key);
  if (prior?.workspace) {
    if(prior.workspace.source!==root)throw new ExecutionConflict('workspace_source_changed');
    await verifyTaskWorkspace(prior.workspace);
    if(prior.state==='ready' && prior.owner && prior.generation)coordinator.reconcileRelease(prior.owner,prior.generation);
    return prior.workspace;
  }
  const view=await inspectTaskWorkspace(root);
  if (mode==='read-only' || mode==='serialized' || !view.git) {
    const workspace={id,mode:mode==='read-only'?'read-only':'serialized',source:root,cwd:root,baseRevision:view.baseRevision,branch:null};
    const {intent}=coordinator.reserveIntent(key,digest(JSON.stringify({root,mode:workspace.mode})),{kind:'task-workspace',workspace});
    return intent.workspace;
  }
  if (mode!=='worktree') throw new ExecutionConflict('workspace_mode_invalid');
  if(view.dirty && !baseRevision)throw new ExecutionConflict('workspace_dirty',`The source has uncommitted changes. Choose a committed base explicitly before creating an isolated workspace (${view.baseRevision}).`);
  if(baseRevision && (!/^[a-f0-9]{40,64}$/.test(baseRevision) || await git(root,['rev-parse',`${baseRevision}^{commit}`])!==baseRevision))throw new ExecutionConflict('workspace_base_invalid');
  const base=baseRevision || view.baseRevision;
  mkdirSync(directory,{recursive:true,mode:0o700});
  if(lstatSync(directory).isSymbolicLink())throw new ExecutionConflict('workspace_directory_invalid');
  const container=path.join(canonical(directory),digest(id).slice(0,32));
  mkdirSync(container,{recursive:true,mode:0o700});
  if(lstatSync(container).isSymbolicLink())throw new ExecutionConflict('workspace_directory_invalid');
  const cwd=path.join(container,'worktree'), branch=`codex/task-${digest(id).slice(0,24)}`;
  const workspace={id,mode:'worktree',source:root,cwd,baseRevision:base,branch};
  const {intent}=coordinator.reserveIntent(key,digest(JSON.stringify({root,base})),{kind:'task-workspace',plannedWorkspace:workspace});
  if(!['reserved','creating'].includes(intent.state))throw new ExecutionConflict('workspace_creation_unconfirmed');
  // The intent fences an abandoned git child: a new worker only verifies its result.
  if(intent.state==='creating') {
    throw new ExecutionConflict('workspace_creation_unconfirmed','Workspace creation needs reconciliation; it will not run twice.');
  } else {
    const common=canonical(path.resolve(root,await git(root,['rev-parse','--git-common-dir'])));
    const lease=coordinator.claim([`git-worktree-management:${common}`],key,{kind:'workspace-create'});
    if(!lease)throw new ExecutionConflict('workspace_management_busy');
    try {
      coordinator.updateIntent(key,{state:'creating',owner:lease.owner,generation:lease.generation},intent.revision);
      if(existsSync(cwd))throw new ExecutionConflict('workspace_path_exists');
      await git(root,['-c','core.hooksPath=/dev/null','worktree','add','-b',branch,cwd,base]);
      await verifyTaskWorkspace(workspace);
    } catch(error) {
      // A timed-out or disconnected git child may still own the shared repository.
      throw new ExecutionConflict('workspace_creation_unconfirmed',error instanceof ExecutionConflict?error.message:'Workspace creation needs reconciliation.');
    }
  }
  const current=coordinator.getIntent(key);
  coordinator.updateIntent(key,{state:'ready',workspace},current.revision);
  if(current.owner && current.generation)coordinator.reconcileRelease(current.owner,current.generation);
  return workspace;
}

export async function verifyTaskWorkspace(workspace) {
  if(canonical(workspace.cwd)!==workspace.cwd)throw new ExecutionConflict('workspace_path_changed');
  if(workspace.mode!=='worktree')return workspace;
  if(lstatSync(workspace.cwd).isSymbolicLink() || await git(workspace.cwd,['branch','--show-current'])!==workspace.branch)throw new ExecutionConflict('workspace_branch_changed');
  const sourceCommon=canonical(path.resolve(workspace.source,await git(workspace.source,['rev-parse','--git-common-dir'])));
  const workCommon=canonical(path.resolve(workspace.cwd,await git(workspace.cwd,['rev-parse','--git-common-dir'])));
  if(sourceCommon!==workCommon)throw new ExecutionConflict('workspace_repository_changed');
  await git(workspace.cwd,['merge-base','--is-ancestor',workspace.baseRevision,'HEAD']);
  return workspace;
}

export function taskWorkspaceResources(workspace, sandbox) {
  const write=sandbox!=='read-only';
  return {resources:[`workspace:${canonical(workspace.cwd)}`],mode:write?'write':'read'};
}

/** Read-only review; no merge, ref update, removal or auto-cleanup. */
export async function reviewTaskWorkspace(workspace) {
  await verifyTaskWorkspace(workspace);
  if(workspace.mode!=='worktree')return {mode:workspace.mode,retained:true};
  return {
    mode:workspace.mode,branch:workspace.branch,baseRevision:workspace.baseRevision,
    sourceRevision:await git(workspace.source,['rev-parse','HEAD']),
    headRevision:await git(workspace.cwd,['rev-parse','HEAD']),
    status:await git(workspace.cwd,['status','--porcelain=v1','--untracked-files=all']),
    diff:await git(workspace.cwd,['diff','--no-ext-diff',workspace.baseRevision,'--']),
    retained:true,
  };
}

/** Explicit, checked fast-forward only. Never resets a checkout or resolves conflicts. */
export async function applyTaskWorkspace({coordinator,workspace,expectedSource,expectedHead,requestId,verify}) {
  if(workspace.mode!=='worktree' || typeof verify!=='function')throw new ExecutionConflict('workspace_apply_invalid');
  await verifyTaskWorkspace(workspace);
  const key=`workspace-apply:${workspace.id}:${requestId}`;
  const {intent}=coordinator.reserveIntent(key,digest(JSON.stringify({expectedSource,expectedHead})),{kind:'workspace-apply',workspaceId:workspace.id,expectedSource,expectedHead});
  if(intent.state==='applied')return intent;
  if(intent.state!=='reserved')throw new ExecutionConflict('workspace_apply_unconfirmed');
  const common=canonical(path.resolve(workspace.source,await git(workspace.source,['rev-parse','--git-common-dir'])));
  const lease=coordinator.claim([`workspace:${workspace.source}`,`workspace:${workspace.cwd}`,`git-worktree-management:${common}`,'execution-ambient-effects'],key,{kind:'workspace-apply'});
  if(!lease)throw new ExecutionConflict('workspace_busy');
  let dispatched=false;
  try {
    const review=await reviewTaskWorkspace(workspace);
    if(review.sourceRevision!==expectedSource || review.headRevision!==expectedHead || expectedSource!==workspace.baseRevision)throw new ExecutionConflict('workspace_apply_base_changed');
    if(review.status || (await inspectTaskWorkspace(workspace.source)).dirty)throw new ExecutionConflict('workspace_apply_dirty');
    lease.assertOwned();
    coordinator.updateIntent(key,{state:'applying',owner:lease.owner,generation:lease.generation},intent.revision);
    dispatched=true;
    await git(workspace.source,['-c','core.hooksPath=/dev/null','merge','--ff-only','--no-edit',expectedHead]);
    if(await git(workspace.source,['rev-parse','HEAD'])!==expectedHead)throw new ExecutionConflict('workspace_apply_head_changed');
    const verification=await verify(workspace.source,expectedHead);
    if(!verification || verification.passed!==true) {
      const result=coordinator.updateIntent(key,{state:'applied_checks_failed',verification});
      lease.release();return result;
    }
    if(await git(workspace.source,['rev-parse','HEAD'])!==expectedHead || (await inspectTaskWorkspace(workspace.source)).dirty)throw new ExecutionConflict('workspace_verification_changed_source');
    const result=coordinator.updateIntent(key,{state:'applied',verification});
    lease.release();return result;
  } catch(error) {
    if(dispatched)coordinator.updateIntent(key,{state:'unknown',reason:error instanceof ExecutionConflict?error.code:'workspace_apply_failed'});
    else lease.release();
    throw error;
  }
}

/** Cleanup is explicit and allowed only after verified integration, with no local files to lose. */
export async function cleanupTaskWorkspace({coordinator,workspace,expectedHead}) {
  if(workspace.mode!=='worktree')throw new ExecutionConflict('workspace_cleanup_invalid');
  const applied=coordinator.listIntents({kind:'workspace-apply',states:['applied'],limit:1000}).find(row=>row.workspaceId===workspace.id && row.expectedHead===expectedHead);
  if(!applied)throw new ExecutionConflict('workspace_result_not_integrated');
  await verifyTaskWorkspace(workspace);
  const common=canonical(path.resolve(workspace.source,await git(workspace.source,['rev-parse','--git-common-dir'])));
  const key=`workspace-cleanup:${workspace.id}:${expectedHead}`;
  const {intent}=coordinator.reserveIntent(key,expectedHead,{kind:'workspace-cleanup',workspaceId:workspace.id});
  if(intent.state!=='reserved')throw new ExecutionConflict('workspace_cleanup_unconfirmed');
  const lease=coordinator.claim([`workspace:${workspace.source}`,`workspace:${workspace.cwd}`,`git-worktree-management:${common}`],key,{kind:'workspace-cleanup'});
  if(!lease)throw new ExecutionConflict('workspace_busy');
  let dispatched=false;
  try {
    if(await git(workspace.cwd,['rev-parse','HEAD'])!==expectedHead)throw new ExecutionConflict('workspace_cleanup_head_changed');
    if(await git(workspace.cwd,['status','--porcelain=v1','--untracked-files=all','--ignored=matching']))throw new ExecutionConflict('workspace_cleanup_has_local_files');
    await git(workspace.source,['merge-base','--is-ancestor',expectedHead,'HEAD']);
    coordinator.updateIntent(key,{state:'removing',owner:lease.owner,generation:lease.generation},intent.revision);dispatched=true;
    await git(workspace.source,['-c','core.hooksPath=/dev/null','worktree','remove',workspace.cwd]);
    await git(workspace.source,['-c','core.hooksPath=/dev/null','branch','-d',workspace.branch]);
    const result=coordinator.updateIntent(key,{state:'removed',appliedReceipt:applied.id,expectedHead});
    lease.release();return result;
  } catch(error) {
    if(dispatched)coordinator.updateIntent(key,{state:'unknown'});else lease.release();
    throw error;
  }
}
