import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeChatSubject} from '../lib/chat-subject.mjs';
import {resolvePrithaAgentMemoryRoot,resolvePrithaAgentParent} from '../lib/paths.mjs';
import {scopedAgentWorkspace} from '../lib/task-workspace.mjs';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {parseFrontmatterData} from '../lib/frontmatter.mjs';
import {contractData} from './contract.mjs';

export const factoryHash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const factoryFail=code=>Object.assign(new Error('Review the bound factory step and its saved evidence.'),{code});
export function validateFactoryBudgetProposal(input){
  if(!Number.isSafeInteger(input.build_token_budget) || input.build_token_budget<1 || input.build_token_budget>10000000)throw factoryFail('factory_budget_required');
  for(const [field,min,max] of [['build_iteration_budget',1,100],['build_elapsed_budget_ms',60000,86400000]]){
    if(input[field]!==undefined && (!Number.isSafeInteger(input[field]) || input[field]<min || input[field]>max))throw factoryFail('factory_budget_invalid');
  }
}
export function voiceFactoryPaths(options){
  const subject=normalizeChatSubject({kind:'child',slug:options.slug,phase:'interview'});
  const root=fs.realpathSync(options.root),stateRoot=fs.realpathSync(options.stateRoot),parent=fs.realpathSync(resolvePrithaAgentParent({...options,root}));
  const target=scopedAgentWorkspace(parent,subject.slug),memory=resolvePrithaAgentMemoryRoot({root,stateRoot});
  if(target===root || target.startsWith(root+path.sep) || target===stateRoot || target.startsWith(stateRoot+path.sep))throw factoryFail('factory_target_invalid');
  const directory=path.join(memory,'voice-factory',subject.slug),file=path.join(directory,'session.json');
  return {root,stateRoot,parent,target,memory,directory,file,slug:subject.slug};
}
/** Both typed and voice creation derive the same host-owned target. Replays
 * must resolve their saved chat before calling this new-session check. */
export function prepareFactoryBinding(options){
  const p=voiceFactoryPaths(options);
  assertFactoryTargetAvailable(p);
  if(fs.existsSync(p.file))throw factoryFail('factory_target_exists');
  return p;
}
export function assertFactoryTargetAvailable(p){
  if(fs.existsSync(p.target))throw factoryFail('factory_target_exists');
  const directory=path.join(p.memory,'contracts');
  if(!fs.existsSync(directory))return;
  for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.md'))){
    const file=path.join(directory,name),text=factoryRead(file,directory),fm=parseFrontmatterData(text);
    if(fm?.type!=='agent-contract')continue;
    const data=contractData(file,{root:p.root});
    if(data.technicalSlug===p.slug || path.resolve(p.root,data.targetFolder)===p.target)throw factoryFail('factory_target_exists');
  }
}
export function factoryRead(file,allowedRoot,maxBytes=100000){
  const stat=fs.lstatSync(file);
  if(stat.nlink!==1 || fs.realpathSync(file)!==path.resolve(file))throw factoryFail('factory_artifact_boundary');
  return readBoundedRegularFile(file,{allowedRoots:[allowedRoot],maxBytes}).text;
}
export function loadVoiceFactory(paths,{chatId,connectorId}){
  if(!fs.existsSync(paths.file))return null;
  const value=JSON.parse(factoryRead(paths.file,paths.directory));
  return validateVoiceFactory(paths,value,{chatId,connectorId});
}
/** Resolve an existing host-owned conversation before entering the same factory
 * from another interface. This is attribution only; actions still check their
 * ordinary workspace, approval, evidence and budget boundaries. */
export function readFactoryConversation(options){
  const p=voiceFactoryPaths(options);
  if(!fs.existsSync(p.file))return null;
  let value;
  try{value=JSON.parse(factoryRead(p.file,p.directory));}catch(error){throw error.code==='factory_artifact_boundary'?error:factoryFail('factory_binding_changed');}
  if(!/^chat_[A-Za-z0-9_-]{1,160}$/.test(value?.chatId || '') || !['codex','claude','neuraldeep','openrouter','local'].includes(value?.connectorId))throw factoryFail('factory_binding_changed');
  return validateVoiceFactory(p,value,{chatId:value.chatId,connectorId:value.connectorId});
}
export function validateVoiceFactory(paths,value,{chatId,connectorId}){
  if(value.schema!=='pritha-voice-factory-v1' || value.chatId!==chatId || value.connectorId!==connectorId || value.slug!==paths.slug
      || value.target!==paths.target || value.stateRoot!==paths.stateRoot || !Number.isSafeInteger(value.revision))throw factoryFail('factory_binding_changed');
  for(const field of ['contract','outcome','research','pattern'])if(value[field] && (path.dirname(value[field])!==path.join(paths.memory,['research','pattern'].includes(field)?'research':'contracts') || !value[field].endsWith('.md')))throw factoryFail('factory_artifact_boundary');
  return value;
}
export function factoryArtifact(paths,state,kind){
  const file=state?.[kind];if(!['contract','outcome','research','pattern'].includes(kind) || !file)throw factoryFail('factory_artifact_missing');
  const expected=path.join(paths.memory,['research','pattern'].includes(kind)?'research':'contracts');
  if(path.dirname(file)!==expected || !file.endsWith('.md'))throw factoryFail('factory_artifact_boundary');
  const text=factoryRead(file,expected,100000);return {file,text,sha256:factoryHash(text),frontmatter:parseFrontmatterData(text) || {}};
}
/** Capture at turn settlement, not on polling: a later successful retry must
 * never change the outcome of an earlier attempt with no draft. */
export function factoryDraftReceipt(options){
  try{
    const p=voiceFactoryPaths(options),state=loadVoiceFactory(p,options);
    if(!state)return {draftCreated:false,errorCode:'factory_not_started'};
    if(state.running)return {draftCreated:false,errorCode:'factory_step_unconfirmed'};
    const artifact=factoryArtifact(p,state,'contract');
    if(artifact.frontmatter.type!=='agent-contract' || !['draft','accepted'].includes(artifact.frontmatter.status))throw factoryFail('factory_artifact_invalid');
    return {draftCreated:true,errorCode:null};
  }catch{return {draftCreated:false,errorCode:'factory_draft_evidence_unavailable'};}
}
export function requireFactoryApprovals(paths,state,{outcome=true}={}){
  const contract=factoryArtifact(paths,state,'contract');
  if(contract.frontmatter.status!=='accepted' || contract.sha256!==state.contractApproval?.sha256)throw factoryFail('factory_contract_approval_required');
  if(outcome){const spec=factoryArtifact(paths,state,'outcome');if(spec.frontmatter.status!=='approved' || spec.sha256!==state.outcomeApproval?.sha256)throw factoryFail('factory_outcome_approval_required');}
  return contract;
}
