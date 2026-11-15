import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {improving,improvementAvailability,improvementGuidance} from '../scripts/agents-mother/factory-improvement.mjs';
import {factoryMilestone,factoryVoiceDisplay} from '../scripts/agents-mother/factory-milestone.mjs';
import {factoryTrialInputRoot} from '../scripts/agents-mother/factory-proposal-revision.mjs';
import {approveOutcomeSpec,createOutcomeSpec,latestOutcomeSpecForContract,outcomeSpecsForContract,retireOutcomeSpec,verifyOutcomeApproval} from '../scripts/agents-mother/outcome-spec.mjs';
import {discardDeliveryIteration,installPreparedTrialInputs,prepareDeliveryWorktree,readDeliveryWorktree} from '../scripts/agents-mother/delivery-worktree.mjs';

// Revision of an agent that is already built: the rules that decide when it may
// start, how its documents and verifier files are kept apart from the applied
// version, and what the build panel says at each stage. The complete flow runs
// in factory-model-led.test.mjs.

const applied={outcome:'/outcome-1.md',outcomeApproval:{},runId:'run-1',localApplication:{status:'applied',runId:'run-1'},preparation:{productHash:'a'.repeat(64)}};
const built={contract:'/contract.md',contractApproval:{},preparation:{productHash:'a'.repeat(64)},outcome:'/outcome-1.md',outcomeApproval:{},runId:'run-1',phase:'awaiting-manual-acceptance',localApplication:{status:'applied',runId:'run-1'}};
const ledger=(status,extra={})=>({run_id:'run-1',status,...extra});

test('a revision starts only from a built, applied and not yet accepted agent created from a structured proposal',()=>{
  assert.deepEqual(improvementAvailability(built,ledger('verified')),{available:true});
  assert.deepEqual(improvementAvailability(built,ledger('awaiting_acceptance')),{available:true});
  const refused=(state,row)=>improvementAvailability(state,row).reason;
  assert.equal(refused({...built,preparation:undefined},ledger('verified')),'custom_workflow');
  assert.equal(refused({...built,running:{action:'finish'}},ledger('verified')),'step_unconfirmed');
  assert.equal(refused({...built,runId:undefined},null),'not_built');
  assert.equal(refused(built,{...ledger('verified'),run_id:'another'}),'not_built');
  assert.equal(refused(built,ledger('accepted')),'accepted');
  assert.equal(refused(built,ledger('verified',{accepted_by:'user'})),'accepted');
  assert.equal(refused(built,ledger('building')),'build_in_progress');
  assert.equal(refused(built,ledger('blocked')),'build_in_progress');
  assert.equal(refused(built,ledger('abandoned')),'build_ended');
  assert.equal(refused({...built,localApplication:{status:'pending',reason:'source_has_changes'}},ledger('verified')),'not_applied');
  assert.equal(refused({...built,localApplication:{status:'applied',runId:'run-0'}},ledger('verified')),'not_applied');
  // While a revision is prepared or built, another starts only after that one ended without a result.
  const revising={...built,outcome:'/outcome-2.md',runId:'run-2',localApplication:undefined,improvement:{number:1,applied}};
  assert.equal(improving(revising),true);assert.equal(improving(built),false);assert.equal(improving({...built,improvement:{number:1,appliedAt:'now'}}),false);
  for(const status of ['building','verifying','blocked','verified','awaiting_acceptance'])assert.equal(refused(revising,{run_id:'run-2',status}),'improvement_in_progress',status);
  for(const status of ['abandoned','cancelled','failed'])assert.deepEqual(improvementAvailability(revising,{run_id:'run-2',status}),{available:true,retry:true},status);
  // Its documents are still being prepared: there is no run yet, and it is in progress all the same.
  assert.equal(refused({...revising,outcome:undefined,runId:undefined},null),'improvement_in_progress');
  assert.match(improvementGuidance({improvement:{note:'Answer in upper case.'}}),/already works.*Requested change: Answer in upper case\.$/);
  assert.doesNotMatch(improvementGuidance({improvement:{}}),/Requested change/);
});

test('each stage of a revision says that the applied version stays in use until the revision replaces it',()=>{
  const revising={...built,outcome:undefined,outcomeApproval:undefined,runId:undefined,localApplication:undefined,phase:'contract-approved',scaffoldRevision:'base',improvement:{number:2,applied}};
  const run=(status,extra={})=>({status,phase:'implementation',iteration:1,blockers:[],lastFailureKind:null,acceptance:'pending',budget:{},...extra});
  const show=(state,delivery=null,firstUse=null)=>factoryMilestone(state,delivery,firstUse);
  assert.deepEqual([show(revising).label,show(revising).kind],['Preparing revision','building']);assert.match(show(revising).summary,/revision 2.*applied version stays available/);
  const building={...revising,outcome:'/outcome-3.md',outcomeApproval:{},runId:'run-3',phase:'scaffolded',running:{action:'deliver'}};
  assert.equal(show(building,run('building')).label,'Improving');assert.match(show(building,run('building')).summary,/replaces that version only after it passes the revised examples/);
  assert.equal(show(building,run('verifying')).label,'Verifying revision');
  assert.match(show(building,run('verifying',{iteration:0})).summary,/applied version against the revised examples/);
  const ended=show({...building,running:null},run('abandoned'));
  assert.deepEqual([ended.label,ended.kind],['Revision stopped','stopped']);assert.match(ended.summary,/applied version is unchanged/);
  assert.equal(factoryVoiceDisplay('complete',true,ended).status,'waiting_for_operator');
  // Verified but not applied: the agent is running the earlier version.
  const waiting={...building,running:null,phase:'card-blocked',localApplication:{status:'pending',reason:'service_record_present'}};
  assert.equal(show(waiting,run('verified')).label,'Stop the agent to apply');assert.match(show(waiting,run('verified')).summary,/stop it from its card/);
  assert.equal(show({...waiting,localApplication:{status:'pending',reason:'source_revision_changed'}},run('verified')).label,'Revision not applied');
  assert.equal(show({...waiting,localApplication:{status:'pending',reason:'source_has_changes'}},run('verified')).label,'Your changes are preserved');
  // Applied: the revision is the agent now, and it can be revised again.
  const done={...building,running:null,phase:'awaiting-manual-acceptance',localApplication:{status:'applied',runId:'run-3'},improvement:{number:2,appliedAt:'2026-11-15T07:00:00.000Z'}};
  const ready=show(done,run('verified'),{disposition:'applied-local-project'});
  assert.equal(ready.label,'Ready to launch');assert.match(ready.summary,/revision 2 is in the project folder and replaced the earlier version.*describe the change in this chat/);
  // An ordinary first build is described as before.
  assert.equal(show({...built,running:{action:'deliver'},scaffoldRevision:'base',improvement:undefined},run('building')).label,'Implementing');
});

function documents(t){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-improvement-docs-'))),root=path.join(directory,'mother'),stateRoot=path.join(directory,'state');
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const contracts=path.join(stateRoot,'agents/contracts'),project=path.join(directory,'children/fixture');
  for(const dir of [root,contracts,project])fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(project,'AGENTS.md'),'# Fixture agent\n');
  const contract=path.join(contracts,'contract.md');
  fs.writeFileSync(contract,fs.readFileSync('tests/fixtures/contracts/valid-agent-contract.md','utf8').replace('type: agent-contract','type: agent-contract\nagent_id: revised-agent').replace(/^- Target folder:.*$/m,'- Target folder: '+project));
  return {root,stateRoot,contract,options:{root,stateRoot}};
}

test('a successor Outcome precedes the one it replaces while both are approved, and retiring either keeps one current',t=>{
  const f=documents(t);
  const first=createOutcomeSpec(f.contract,f.options).path;
  approveOutcomeSpec(first,{...f.options,approvedBy:'user'});
  assert.equal(latestOutcomeSpecForContract(f.contract,f.options).path,first);
  // The revision is a draft at first: the approved Outcome stays current.
  const second=createOutcomeSpec(f.contract,{...f.options,supersedes:first,factoryOutcomeRevision:1}).path;
  const draft=fs.readFileSync(second,'utf8');
  assert.match(draft,/^factory_outcome_revision: 1$/m);assert.match(draft,/^supersedes: \n {2}- ".*agent-outcome-spec\.md"$/m);assert.match(draft,/^status: draft$/m);
  assert.equal(latestOutcomeSpecForContract(f.contract,f.options).path,first);
  // Once approved, the successor comes first whatever the file names are; the first one is untouched.
  const before=fs.readFileSync(first,'utf8');
  approveOutcomeSpec(second,{...f.options,approvedBy:'user'});
  assert.deepEqual(outcomeSpecsForContract(f.contract,f.options).map(row=>[row.path,row.status]),[[second,'approved'],[first,'approved']]);
  assert.equal(fs.readFileSync(first,'utf8'),before);assert.equal(verifyOutcomeApproval(first,f.options).ok,true);
  // A chain is ordered by lineage as well.
  const third=createOutcomeSpec(f.contract,{...f.options,supersedes:second,factoryOutcomeRevision:2}).path;
  approveOutcomeSpec(third,{...f.options,approvedBy:'user'});
  assert.deepEqual(outcomeSpecsForContract(f.contract,f.options).map(row=>row.path),[third,second,first]);
  // The revision was applied: the Outcome it replaced leaves use and says what replaced it.
  assert.deepEqual(retireOutcomeSpec(second,{...f.options,supersededBy:third}),{path:second,changed:true});
  assert.match(fs.readFileSync(second,'utf8'),/^status: superseded$/m);assert.match(fs.readFileSync(second,'utf8'),/^superseded_by: \n {2}- ".*"$/m);
  assert.equal(retireOutcomeSpec(second,{...f.options,supersededBy:third}).changed,false);
  // A revision that ended without a result is withdrawn with no successor.
  retireOutcomeSpec(third,f.options);
  assert.match(fs.readFileSync(third,'utf8'),/^superseded_by: \[\]$/m);
  assert.deepEqual(outcomeSpecsForContract(f.contract,f.options).map(row=>[row.path,row.status])[0],[first,'approved']);
  assert.throws(()=>retireOutcomeSpec(f.contract,f.options),/agent-outcome-spec/);
});

test('each revised Outcome keeps its own prepared verifier files',()=>{
  const paths={directory:'/state/voice-factory/agent'};
  assert.equal(factoryTrialInputRoot(paths,{fm:{}}),'/state/voice-factory/agent/trial-inputs');
  assert.equal(factoryTrialInputRoot(paths,{fm:{}},{frontmatter:{}}),'/state/voice-factory/agent/trial-inputs');
  assert.equal(factoryTrialInputRoot(paths,{fm:{}},{frontmatter:{factory_outcome_revision:'2'}}),'/state/voice-factory/agent/outcome-2/trial-inputs');
  assert.equal(factoryTrialInputRoot(paths,{fm:{factory_proposal_revision:'3'}},{frontmatter:{factory_outcome_revision:'1'}}),'/state/voice-factory/agent/proposal-3/outcome-1/trial-inputs');
  for(const value of ['0','-1','1.5','../x',''])assert.throws(()=>factoryTrialInputRoot(paths,{fm:{}},{frontmatter:{factory_outcome_revision:value}}),{code:'factory_proposal_changed'});
});

function repository(t){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-improvement-worktree-'))),project=path.join(directory,'project'),runRoot=path.join(directory,'builds/agent/run-revision');
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  fs.mkdirSync(path.join(project,'verification'),{recursive:true});
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(project,'init','-q');git(project,'config','user.email','tests@pritha.local');git(project,'config','user.name','Pritha Tests');
  fs.writeFileSync(path.join(project,'verification/product.mjs'),'applied verifier\n');fs.writeFileSync(path.join(project,'server.mjs'),'applied code\n');
  git(project,'add','-A');git(project,'commit','-qm','applied version');
  return {project,runRoot,git,head:git(project,'rev-parse','HEAD')};
}
const verifier=text=>[{path:'verification/product.mjs',content:Buffer.from(text)},{path:'verification/managed-stop.mjs',content:Buffer.from('stop '+text)}];

test('the revised verifier is installed in the build worktree before anything is built there, never in the project',t=>{
  const f=repository(t);
  const worktree=prepareDeliveryWorktree(f.project,f.runRoot,'run-revision');
  const prepared=installPreparedTrialInputs(f.runRoot,verifier('revised verifier\n'));
  assert.notEqual(prepared.prepared_revision,f.head);assert.equal(prepared.base_revision,f.head);
  assert.equal(f.git(worktree.worktree,'rev-parse','HEAD'),prepared.prepared_revision);
  assert.equal(f.git(worktree.worktree,'status','--porcelain'),'');
  assert.equal(f.git(worktree.worktree,'log','--format=%s','-1'),'Pritha verifier for revised outcome: run-revision');
  assert.equal(fs.readFileSync(path.join(worktree.worktree,'verification/product.mjs'),'utf8'),'revised verifier\n');
  assert.equal(fs.readFileSync(path.join(worktree.worktree,'verification/managed-stop.mjs'),'utf8'),'stop revised verifier\n');
  // The project keeps its applied version and its own verifier.
  assert.equal(f.git(f.project,'rev-parse','HEAD'),f.head);assert.equal(f.git(f.project,'status','--porcelain'),'');
  assert.equal(fs.readFileSync(path.join(f.project,'verification/product.mjs'),'utf8'),'applied verifier\n');
  // Resuming the run repeats nothing, even with other bytes offered.
  assert.equal(installPreparedTrialInputs(f.runRoot,verifier('other\n')).prepared_revision,prepared.prepared_revision);
  assert.equal(fs.readFileSync(path.join(worktree.worktree,'verification/product.mjs'),'utf8'),'revised verifier\n');
  // Discarding a build attempt returns to the installed verifier, not to the applied one.
  fs.writeFileSync(path.join(worktree.worktree,'server.mjs'),'attempt\n');fs.writeFileSync(path.join(worktree.worktree,'verification/product.mjs'),'tampered\n');
  assert.equal(discardDeliveryIteration(f.runRoot).restored_checkpoint,prepared.prepared_revision);
  assert.equal(fs.readFileSync(path.join(worktree.worktree,'verification/product.mjs'),'utf8'),'revised verifier\n');
  assert.equal(fs.readFileSync(path.join(worktree.worktree,'server.mjs'),'utf8'),'applied code\n');
  assert.equal(readDeliveryWorktree(f.runRoot).prepared_revision,prepared.prepared_revision);
});

test('verifier installation is refused once a build has touched the worktree and for anything but verifier files',t=>{
  const f=repository(t);
  const worktree=prepareDeliveryWorktree(f.project,f.runRoot,'run-revision');
  for(const files of [[],[{path:'server.mjs',content:Buffer.from('x')}],[{path:'verification/../server.mjs',content:Buffer.from('x')}],[{path:'verification/product.mjs',content:'text'}],null])
    assert.throws(()=>installPreparedTrialInputs(f.runRoot,files),{code:'trial_input_path_invalid'});
  // An interrupted installation left only verifier files behind: it is completed.
  fs.writeFileSync(path.join(worktree.worktree,'verification/product.mjs'),'half written\n');
  assert.equal(fs.readFileSync(path.join(worktree.worktree,'verification/product.mjs'),'utf8'),'half written\n');
  fs.writeFileSync(path.join(worktree.worktree,'server.mjs'),'builder change\n');
  assert.throws(()=>installPreparedTrialInputs(f.runRoot,verifier('revised\n')),{code:'worktree_preparation_late'});
  f.git(worktree.worktree,'checkout','--','server.mjs');
  assert.notEqual(installPreparedTrialInputs(f.runRoot,verifier('revised\n')).prepared_revision,f.head);
  assert.equal(fs.readFileSync(path.join(worktree.worktree,'verification/product.mjs'),'utf8'),'revised\n');
  // Identical files need no commit; the run is still marked as prepared.
  const same=repository(t),other=prepareDeliveryWorktree(same.project,same.runRoot,'run-revision');
  assert.equal(installPreparedTrialInputs(same.runRoot,[{path:'verification/product.mjs',content:Buffer.from('applied verifier\n')}]).prepared_revision,same.head);
  assert.equal(same.git(other.worktree,'rev-parse','HEAD'),same.head);
});
