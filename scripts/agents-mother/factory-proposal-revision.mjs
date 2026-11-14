import fs from 'node:fs';
import path from 'node:path';
import {normalizeInterviewBrief} from './interview-brief.mjs';
import {hasCreationAuthority,hasDelegatedContract} from './factory-creation-authority.mjs';
import {FACTORY_STABILITY_BUDGET} from './factory-budget.mjs';
import {factoryArtifact,factoryHash,factoryRead,factoryFail,requireFactoryApprovals} from './voice-factory-state.mjs';
import {atomicWriteFile} from '../lib/atomic-file.mjs';

// Host-owned values cannot make two equivalent model proposals differ.
export function boundFactoryBrief(input,paths,{modelLed=false}={}){
  const brief=normalizeInterviewBrief(input);
  if(brief.identity.slug && brief.identity.slug!==paths.slug)throw factoryFail('factory_subject_changed');
  brief.identity.slug=paths.slug;brief.technical.targetFolder=paths.target;
  if(modelLed && brief.technical.runtimeFamily==='api' && brief.technical.serviceMode==='process'
      && !brief.technical.repositoryResearchPolicy){
    brief.technical.repositoryResearchPolicy='not-applicable';
    brief.technical.repositoryResearchWaiverReason ||= 'Implement locally using Pritha memory and built-in adapters; consult sources for concrete uncertainties.';
  }
  // Normalize once more after binding/defaults so legacy JSON field ordering
  // cannot turn the same effective brief into a different request hash.
  return normalizeInterviewBrief(brief);
}
export function proposalRequestHash(brief,input){
  return factoryHash([brief,input.build_token_budget,input.build_iteration_budget??FACTORY_STABILITY_BUDGET.buildIterations,input.build_elapsed_budget_ms??FACTORY_STABILITY_BUDGET.buildElapsedMs]);
}
export function sameSavedProposal(paths,state,brief,input,data){
  if(state.preparation?.requestHash===proposalRequestHash(brief,input))return true;
  // Old releases hashed the model's ignored targetFolder before binding it.
  // Compare their saved, bound brief and actual limits without touching receipts.
  const saved=boundFactoryBrief(JSON.parse(factoryRead(path.join(paths.directory,'brief.json'),paths.directory)),paths,{modelLed:hasCreationAuthority(state)});
  return factoryHash(saved)===factoryHash(brief) && sameProposalBudget(input,data);
}
export function sameProposalBudget(input,data){
  return input.build_token_budget===data.buildTokenBudget
    && (input.build_iteration_budget??FACTORY_STABILITY_BUDGET.buildIterations)===data.buildIterationBudget
    && (input.build_elapsed_budget_ms??FACTORY_STABILITY_BUDGET.buildElapsedMs)===data.buildElapsedBudgetMs;
}
export function proposalRevisionAvailable(paths,state){
  return Boolean(state?.contract && hasCreationAuthority(state) && (!state.contractApproval || hasDelegatedContract(state))
    && (!state.outcomeApproval || state.outcomeApproval.approvedBy==='pritha' && state.outcomeApproval.authorization && factoryHash(state.outcomeApproval.authorization)===factoryHash(state.creationAuthority))
    && !state.runId && !state.scaffoldRevision && !fs.existsSync(paths.target)
    && ['contract-draft','contract-approved','outcome-draft','outcome-approved','research'].includes(state.phase)
    && (!state.continuationPause || ['propose','write_draft','patch_draft','approve_contract','create_outcome','prepare_product_trial','approve_outcome','research','research_collect','research_apply','research_recover','research_decide'].includes(state.continuationPause)));
}
export function saveProposalRevision(paths,state,input,data){
  if(!proposalRevisionAvailable(paths,state))throw factoryFail('factory_proposal_changed');
  if(!sameProposalBudget(input,data))throw factoryFail('factory_proposal_budget_changed');
  if(state.contractApproval)requireFactoryApprovals(paths,state,{outcome:Boolean(state.outcomeApproval)});
  const artifacts=Object.fromEntries(['contract','outcome','research','pattern'].filter(kind=>state[kind]).map(kind=>{
    const row=factoryArtifact(paths,state,kind);return [kind,{path:row.file,sha256:row.sha256}];
  }));
  const file=path.join(paths.directory,'proposal-history',input.operation_id+'.json');
  atomicWriteFile(file,JSON.stringify({version:1,reason:'model-corrected-proposal',actor:'pritha',recordedAt:new Date().toISOString(),artifacts,state,
    brief:JSON.parse(factoryRead(path.join(paths.directory,'brief.json'),paths.directory))}));
  return artifacts.contract;
}

// Each revised proposal gets independent verifier files. Previously approved
// Outcomes and their protected input bytes remain valid historical evidence.
export function factoryTrialInputRoot(paths,data){
  const raw=data?.fm?.factory_proposal_revision;
  if(raw===undefined)return path.join(paths.directory,'trial-inputs');
  const revision=Number(raw);
  if(!/^[1-9][0-9]*$/.test(String(raw)) || !Number.isSafeInteger(revision))throw factoryFail('factory_proposal_changed');
  return path.join(paths.directory,'proposal-'+revision,'trial-inputs');
}
