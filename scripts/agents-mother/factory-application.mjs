import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {atomicWriteFile} from '../lib/atomic-file.mjs';
import {factoryArtifact,factoryRead} from './voice-factory-state.mjs';
import {verifiedFirstUse} from './factory-first-use.mjs';
import {verifyTrialResultFreshness} from './trial-runner.mjs';
import {validateOutcomeSpecText} from './outcome-spec.mjs';
import {contractData} from './contract.mjs';
import {managedStopVerifier} from './factory-product-trial.mjs';
import {localApplicationAuthorized} from './factory-local-application-policy.mjs';
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();

// Called by the admitted factory worker holding the child workspace lease.
// Authorization is part of the exact approved Outcome, never inferred from
// passing tests or final user acceptance. Old Outcomes remain manual.
export function applyVerifiedFactoryResult(p,s,result){
  const outcome=factoryArtifact(p,s,'outcome');
  if(!localApplicationAuthorized(outcome))return {status:'manual',reason:'local_application_not_approved'};
  const fail=reason=>({status:'pending',reason});
  const first=verifiedFirstUse(p,s,result);
  if(!first || result.state.status!=='verified')return fail('verification_incomplete');
  const trial=validateOutcomeSpecText(outcome.text,{root:p.root}).parsed.trials.find(t=>t.id==='managed-stop');
  const expected='sha256:'+createHash('sha256').update(managedStopVerifier(contractData(s.contract,{root:p.root}))).digest('hex');
  if(!trial?.verifierInputs?.some(v=>v.path==='verification/managed-stop.mjs' && v.hash===expected))return fail('managed_stop_verification_missing');
  const evidence=JSON.parse(factoryRead(path.join(result.runRoot,result.state.last_trial_result.path),result.runRoot,2*1024*1024));
  if(!evidence.trials.some(t=>t.id==='managed-stop' && t.status==='passed'))return fail('managed_stop_verification_missing');
  const source=fs.realpathSync(p.target),candidate=first.directory;
  if(source!==result.worktree.source_project || git(source,['rev-parse','--show-toplevel'])!==source)return fail('source_identity_changed');
  if(git(source,['status','--porcelain=v1','--untracked-files=all']))return fail('source_has_changes');
  const current=git(source,['rev-parse','HEAD']);
  if(current!==result.worktree.base_revision && current!==first.commit)return fail('source_revision_changed');
  if(current!==first.commit && (fs.existsSync(path.join(source,'.state/service.pid.json')) || fs.existsSync(path.join(candidate,'.state/service.pid.json'))))return fail('service_record_present');
  const manifest=JSON.parse(factoryRead(path.join(candidate,'operations/manifest.json'),candidate,65536));
  if(manifest.outcome_status==='implementation-required' || manifest.control_center_contract?.status==='implementation-required')return fail('candidate_still_scaffold');
  const receipt={schema:'pritha-factory-local-application-v1',source,from:result.worktree.base_revision,to:first.commit,
    outcome:s.outcome,documentLock:result.state.spec.document_lock,runId:s.runId,at:new Date().toISOString(),status:'applying',servicesStarted:false};
  const file=path.join(result.runRoot,'local-application.json');
  atomicWriteFile(file,JSON.stringify(receipt,null,2)+'\n');
  if(current!==first.commit)git(source,['merge','--ff-only','--no-edit','--no-overwrite-ignore',first.commit]);
  const fresh=verifyTrialResultFreshness(evidence,source,{root:p.root,stateRoot:p.stateRoot,outcomeSpecPath:s.outcome});
  if(!fresh.ok)return fail('applied_revision_needs_verification');
  const applied={...receipt,status:'applied'};atomicWriteFile(file,JSON.stringify(applied,null,2)+'\n');
  return applied;
}
