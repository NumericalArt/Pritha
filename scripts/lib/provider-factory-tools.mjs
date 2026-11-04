import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {privateStateDirectory,privateStateFile} from './private-state-path.mjs';
import {atomicWriteFile} from './atomic-file.mjs';
import {providerProcessEnvironment,createProviderTemporaryDirectory} from './provider-process-environment.mjs';
import {resolvePrithaPython} from './python-runtime.mjs';
import {spawnSupervisedCli} from '../neuraldeep/process-supervisor.mjs';
import {normalizeInterviewBrief,validateInterviewBrief,INTERVIEW_BRIEF_TEXT_FIELDS} from '../agents-mother/interview-brief.mjs';
import {RUNTIME_FAMILIES,SERVICE_MODES} from '../agents-mother/contract.mjs';
import {voiceFactoryPaths,loadVoiceFactory,validateVoiceFactory,factoryArtifact,factoryRead,factoryHash,factoryFail,requireFactoryApprovals,validateFactoryBudgetProposal} from '../agents-mother/voice-factory-state.mjs';

const actions=['status','read_artifact','init','write_draft','approve_contract','create_outcome','approve_outcome','research','research_status','research_collect','research_recover','research_apply','scaffold_plan','scaffold','deliver','delivery_status','delivery_resume','verify','finish'];
const readonly=new Set(['status','read_artifact']);
const workflowSteps=new Set(['init','write_draft','create_outcome','research','research_status','research_collect','research_recover','research_apply','scaffold_plan','scaffold','deliver','delivery_status','verify','finish']);
const textFields=Object.entries(INTERVIEW_BRIEF_TEXT_FIELDS);
const briefTextPaths=new Set(textFields.flatMap(([group,keys])=>keys.map(key=>group+'.'+key)));
class FactoryBriefInputError extends Error {
  constructor(field){super('A factory brief field must be text.');this.code='factory_brief_text_required';this.field=field;}
}
class FactoryBriefValidationError extends Error {
  constructor(issues){super('The factory brief needs correction.');this.code='factory_brief_incomplete';this.issues=issues;}
}
class FactoryActionInputError extends Error {
  constructor(action){super('Use the fields for this factory action.');this.code='factory_input_invalid';this.action=actions.includes(action)?action:'status';}
}
export function factoryBriefErrorDetail(error){
  // These messages come only from the host validator, never from provider text.
  if(error instanceof FactoryActionInputError)return {error:error.code,action:error.action,allowedFields:['operation_id','action',...(fields[error.action] || [])],requiredFields:['operation_id','action',...(requiredFields[error.action] || [])],hint:'operation_id: 8–128 letters, digits, _ or -. For not-started use init with brief and proposed build_token_budget. write_draft only revises an existing artifact using its expected_sha256 and complete content.'};
  if(error instanceof FactoryBriefValidationError)return {error:error.code,issues:error.issues};
  return error instanceof FactoryBriefInputError && briefTextPaths.has(error.field)
    ? {error:error.code,field:'brief.'+error.field,expected:'string'} : null;
}
function normalizeFactoryBrief(value){
  for(const [group,keys] of textFields)for(const key of keys){
    if(value?.[group]?.[key]!==undefined && typeof value[group][key]!=='string')throw new FactoryBriefInputError(group+'.'+key);
  }
  try{return normalizeInterviewBrief(value);}catch{throw factoryFail('factory_brief_invalid');}
}
const briefSchema={type:'object',properties:{
  identity:{type:'object',properties:{name:{type:'string'},slug:{type:'string'}},required:['name'],additionalProperties:false},
  goal:{type:'string'},user:{type:'string'},
  ...Object.fromEntries(['successCriteria','coreFunctions','workflows','sources','constraints','nonGoals'].map(key=>[key,{type:'array',items:{type:'string'}}])),
  permissions:{type:'object',properties:{network:{type:'array',items:{type:'string'}},filesystem:{type:'array',items:{type:'string'}},authorization:{type:'string'}},additionalProperties:false},
  technical:{type:'object',properties:Object.fromEntries(INTERVIEW_BRIEF_TEXT_FIELDS.technical.map(key=>[key,{type:'string'}])),additionalProperties:false,description:'Optional text settings. Use runtimeFamily=cli for a deterministic Node.js command; node is a language, not a runtime family. The host fixes the target, executor, Git isolation and autostart.'},
  design:{type:'object',properties:Object.fromEntries(INTERVIEW_BRIEF_TEXT_FIELDS.design.map(key=>[key,{type:'string'}])),additionalProperties:false,description:'Optional text settings. inputDataTypes is text, e.g. UTF-8 text file, not an array.'},
},required:['identity','goal','user','successCriteria'],additionalProperties:false};
briefSchema.properties.technical.properties.runtimeFamily.enum=[...RUNTIME_FAMILIES];
briefSchema.properties.technical.properties.serviceMode.enum=[...SERVICE_MODES];
briefSchema.properties.technical.properties.preset.enum=['generic','local-feed','llm-app'];
briefSchema.properties.technical.properties.sourceFormat.enum=['json','rss','atom','mixed'];
export const PROVIDER_FACTORY_TOOL={name:'factory_step',description:'Operate only the host-bound child. ALWAYS read status first and continue its saved phase; never restart an existing factory. Prepare private drafts within the requested workflow, then request TWO separate approvals: approve_contract and approve_outcome. After approval, continue research, scaffold, bounded delivery and protected Trials without asking again for technical steps. Accepted documents and budgets stay pinned. No push, deploy, services, credential provisioning or final user acceptance. Never infer document approval from prose or change operation_id to repeat an uncertain action.',inputSchema:{type:'object',properties:{operation_id:{type:'string'},action:{type:'string',enum:actions},artifact:{type:'string',enum:['contract','outcome','research','pattern']},expected_sha256:{type:'string'},content:{type:'string'},brief:{type:'object'},build_token_budget:{type:'integer',minimum:1,maximum:10000000},sources:{type:'object'},selection:{type:'object'},answer:{type:'string'},offset:{type:'integer',minimum:0}},required:['operation_id','action'],additionalProperties:false}};
const fields={status:[],read_artifact:['artifact','offset'],init:['brief','build_token_budget','build_iteration_budget','build_elapsed_budget_ms'],write_draft:['artifact','expected_sha256','content'],approve_contract:['expected_sha256'],approve_outcome:['expected_sha256'],research_collect:['sources','retry_failed'],research_recover:['sources'],research_apply:['selection'],delivery_resume:['answer']};
const requiredFields={read_artifact:['artifact'],init:['brief','build_token_budget'],write_draft:['artifact','expected_sha256','content'],approve_contract:['expected_sha256'],approve_outcome:['expected_sha256'],research_recover:['sources'],research_apply:['selection']};
PROVIDER_FACTORY_TOOL.inputSchema.properties.operation_id={type:'string',minLength:8,maxLength:128,pattern:'^[A-Za-z0-9_-]+$',description:'Stable operation identifier. Keep it for an identical retry; never repeat uncertain effects.'};
PROVIDER_FACTORY_TOOL.inputSchema.properties.action.description='status returns the saved next step. init creates the first draft from brief and proposed budgets. read_artifact reads it. write_draft revises an existing artifact using artifact, expected_sha256 and complete content. Do not put brief/content inside sources or selection. Those fields belong only to research actions.';
PROVIDER_FACTORY_TOOL.inputSchema.properties.brief=briefSchema;
Object.assign(PROVIDER_FACTORY_TOOL.inputSchema.properties,{
  retry_failed:{type:'boolean',description:'research_collect only: retry a confirmed failed source once within its original deadline. Never resets an uncertain operation or its limits.'},
  sources:{type:'object',additionalProperties:{type:'string'},description:'research_collect/research_recover: map exact topic IDs from research_status to HTTPS primary-source URLs (strings). research_recover requires a different allowed URL for every confirmed failed topic; once per research, with two bounded attempts and a fresh five-minute window. History, collected evidence and approvals remain pinned; uncertain dispatches cannot recover.'},
  selection:{type:'object',additionalProperties:false,required:['facts','synthesis'],properties:{
    facts:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,required:['sourceId','topicId','passageId','versionContext','compatibility','compatibilityStatus'],properties:{
      sourceId:{type:'string'},topicId:{type:'string'},passageId:{type:'string',description:'Exact passage ID from research_status; do not supply or invent a quote.'},
      versionContext:{type:'string'},compatibility:{type:'string'},compatibilityStatus:{type:'string',enum:['compatible','incompatible','unknown']}}}},
    synthesis:{type:'object',additionalProperties:false,required:['relationship','memory_comparison','summary','architecture_decision','alternatives','tradeoffs'],properties:{
      relationship:{type:'string',enum:['confirms','refines','contradicts','makes-outdated']},memory_comparison:{type:'string',minLength:20},summary:{type:'string',minLength:20},architecture_decision:{type:'string',minLength:20},
      alternatives:{type:'array',minItems:1,items:{type:'string'}},tradeoffs:{type:'array',minItems:1,items:{type:'string'}},repository_adoption_recommendation:{type:'string',enum:['proceed','hold','reject']}}},
  },description:'research_apply only: select host-collected passages and explain their relationship to the saved research/pattern. Host computes and locks evidence hashes.'},
  build_iteration_budget:{type:'integer',minimum:1,maximum:100,description:'Proposed build iterations from the operator brief; init does not approve this budget.'},
  build_elapsed_budget_ms:{type:'integer',minimum:60000,maximum:86400000,description:'Proposed build time from delivery start, excluding interview/approval waiting. init does not approve this budget.'},
});
export class ProviderFactoryTools {
  constructor(host){this.host=host;this.options=host.options;this.paths=voiceFactoryPaths({...this.options,...this.options.factory});if(this.options.factory.target!==this.paths.target)throw factoryFail('factory_binding_changed');}
  state(){return loadVoiceFactory(this.paths,this.options);}
  validate(input){
    if(!input || !actions.includes(input.action) || !/^[A-Za-z0-9_-]{8,128}$/.test(input.operation_id || '') || Object.keys(input).some(key=>!['operation_id','action',...(fields[input.action] || [])].includes(key)) || (requiredFields[input.action] || []).some(key=>input[key]===undefined) || Buffer.byteLength(JSON.stringify(input))>60000)throw new FactoryActionInputError(input?.action);
    if(input.retry_failed!==undefined && typeof input.retry_failed!=='boolean')throw factoryFail('factory_input_invalid');
  }
  read(input){
    this.validate(input);const state=this.state();
    if(input.action==='status')return {slug:this.paths.slug,target:this.paths.target,revision:state?.revision || 0,phase:state?.phase || 'not-started',running:state?.running || null,
      artifacts:Object.fromEntries(['contract','outcome','research','pattern'].filter(kind=>state?.[kind]).map(kind=>{const row=factoryArtifact(this.paths,state,kind);return [kind,{sha256:row.sha256,status:row.frontmatter.status}];})),runId:state?.runId || null,manualAcceptance:'pending',
      ...(!state?.contract?{nextStep:{action:'init',requiredFields:['brief','build_token_budget'],optionalFields:['build_iteration_budget','build_elapsed_budget_ms'],hint:'Use the structured brief from this task. This creates only a private draft; document and budget approvals remain separate.'}}:{})};
    if(input.action!=='read_artifact')throw factoryFail('factory_input_invalid');
    const row=factoryArtifact(this.paths,state,input.artifact),offset=input.offset ?? 0;
    if(!Number.isSafeInteger(offset) || offset<0)throw factoryFail('factory_input_invalid');
    return {artifact:input.artifact,sha256:row.sha256,...this.host.window(row.text,{offset,length:24000})};
  }
  isRead(input){return readonly.has(input?.action);}
  workflowAuthorized(input){
    // The host-bound creation request authorizes private draft preparation.
    // prepare/worker still enforce accepted document locks before execution,
    // research gates, target ownership and measured build budgets. Arbitrary
    // shell/file tools and operator answers receive no authority from this.
    return workflowSteps.has(input.action) || input.action==='delivery_resume' && !input.answer;
  }
  prepare(input){
    this.validate(input);const state=this.state(),p=this.paths;
    if(state?.running)throw factoryFail('factory_step_unconfirmed');
    const acceptedKind=input.action==='approve_contract'?'contract':input.action==='approve_outcome'?'outcome':null;
    if(acceptedKind && state?.[acceptedKind+'Approval']){
      const approval=state[acceptedKind+'Approval'],row=factoryArtifact(p,state,acceptedKind);
      if(row.sha256!==approval.sha256 || ![approval.sha256,approval.reviewedSha256].filter(Boolean).includes(input.expected_sha256))throw factoryFail('factory_draft_changed');
      requireFactoryApprovals(p,state,{outcome:acceptedKind==='outcome'});
      return {kind:'file_change_approval',presentation:{approvalScope:acceptedKind+' already accepted'},alreadyApproved:true,
        perform:async()=>({status:'completed',output:JSON.stringify({ok:true,approved:acceptedKind,replayed:true,phase:state.phase})})};
    }
    if(input.action==='init' ? Boolean(state?.contract) || fs.existsSync(p.target) : !state)throw factoryFail(input.action==='init'?'factory_target_exists':'factory_not_started');
    if(input.action==='init'){
      validateFactoryBudgetProposal(input);
      const brief=normalizeFactoryBrief(input.brief);
      if(brief.technical.runtimeFamily!==undefined && !RUNTIME_FAMILIES.has(brief.technical.runtimeFamily))throw factoryFail('factory_runtime_family_invalid');
      if(brief.technical.serviceMode!==undefined && !SERVICE_MODES.has(brief.technical.serviceMode))throw factoryFail('factory_service_mode_invalid');
      if(brief.identity.slug && brief.identity.slug!==p.slug)throw factoryFail('factory_subject_changed');
      const issues=validateInterviewBrief(brief,{requireComplete:true});
      if(issues.length)throw new FactoryBriefValidationError(issues);
    }
    if(['approve_contract','approve_outcome','write_draft'].includes(input.action)){
      const kind=input.action==='write_draft'?input.artifact:input.action==='approve_contract'?'contract':'outcome';
      const row=factoryArtifact(p,state,kind);
      if(!['contract','outcome'].includes(kind) || row.frontmatter.status!=='draft' || input.expected_sha256!==row.sha256)throw factoryFail('factory_draft_changed');
      if(input.action==='write_draft' && (typeof input.content!=='string' || Buffer.byteLength(input.content)>48000))throw factoryFail('factory_input_invalid');
    }
    if(input.action==='create_outcome' || input.action==='approve_outcome')requireFactoryApprovals(p,state,{outcome:false});
    if(['research','research_status','research_collect','research_recover','research_apply','scaffold_plan','scaffold','deliver','delivery_status','delivery_resume','verify','finish'].includes(input.action))requireFactoryApprovals(p,state);
    const reviewKind=input.action==='approve_contract'?'contract':input.action==='approve_outcome'?'outcome':null;
    const review=reviewKind?factoryArtifact(p,state,reviewKind):null;
    const presentation=review?{path:reviewKind+' · '+p.slug,beforeSha256:review.sha256,proposedContent:review.text,approvalScope:reviewKind+' only'}
      :{command:['Pritha factory',input.action,p.slug],cwdLabel:'Bound child and instance-private factory artifacts',provider:this.options.connectorId,model:this.options.factory.model,...(this.options.connectorId==='claude' && input.action.startsWith('deliver')?{buildAuthentication:'separate Anthropic API key; host-reserved budget'}:{}),network:['research','research_collect','research_recover'].includes(input.action)?this.options.connectorId==='local'?'disabled':'bounded primary-source research':input.action.startsWith('deliver')?'pinned build provider only':'disabled',
        ...(input.action==='init'?{brief:input.brief,proposedBuildTokenBudget:input.build_token_budget,...(input.build_iteration_budget!==undefined?{proposedBuildIterationBudget:input.build_iteration_budget}:{}),...(input.build_elapsed_budget_ms!==undefined?{proposedBuildElapsedBudgetMs:input.build_elapsed_budget_ms}:{})}:{}),...(input.action==='write_draft'?{artifact:input.artifact,beforeSha256:input.expected_sha256,proposedContent:input.content}:{}),...(input.sources?{sources:input.sources}:{}),...(input.selection?{selection:input.selection}:{}),...(input.answer?{answer:input.answer}:{})};
    if(Buffer.byteLength(JSON.stringify(presentation))>60000)throw factoryFail('factory_review_too_large');
    return {kind:review?'file_change_approval':'command_approval',presentation,perform:()=>this.execute(input,state)};
  }
  async execute(input,expected){
    this.host.check();const p=this.paths,o=this.options;
    // A decision is tied to the same complete context, not merely its slug.
    this.prepare(input);if(factoryHash(this.state())!==factoryHash(expected))throw factoryFail('factory_context_changed');
    privateStateDirectory(p.stateRoot,p.directory);
    const state=expected || {schema:'pritha-voice-factory-v1',slug:p.slug,chatId:o.chatId,connectorId:o.connectorId,stateRoot:p.stateRoot,target:p.target,phase:'draft',revision:0};
    const work=privateStateDirectory(p.stateRoot,path.join(p.directory,'operations',randomUUID()));
    const requestFile=privateStateFile(p.stateRoot,path.join(work,'request.json')),resultFile=path.join(work,'result.json');
    const next={...state,revision:state.revision+1,running:{operationId:input.operation_id,action:input.action,turnId:o.turnId}};
    atomicWriteFile(p.file,JSON.stringify(next));
    atomicWriteFile(requestFile,JSON.stringify({version:1,root:p.root,stateRoot:p.stateRoot,agentParent:p.parent,slug:p.slug,chatId:o.chatId,connectorId:o.connectorId,model:o.factory.model,effort:o.factory.effort,preset:o.factory.preset,factoryParent:{owner:o.lease.owner,generation:o.lease.generation,chatId:o.chatId,turnId:o.turnId,operationId:input.operation_id,target:p.target},state:next,input,resultFile}));
    const temporary=createProviderTemporaryDirectory({provider:o.connectorId,stateRoot:p.stateRoot});
    const env=providerProcessEnvironment({provider:o.connectorId,root:p.root,stateRoot:p.stateRoot,temporary,env:process.env});
    env.PRITHA_AGENT_PARENT=p.parent;env.PRITHA_PYTHON=resolvePrithaPython({root:p.root});
    let owned,timer,exited=false,reason=null;const buffers=[];let bytes=0;
    const stop=()=>{reason ||= 'operator_cancel';owned?.stop();};
    const recordProof=evidence=>{o.coordinator.updateIntent('provider-tool:'+o.turnId+':'+input.operation_id,{processProof:evidence,factoryWorkDirectory:work});o.onProcessEvidence?.('factory-'+input.operation_id,evidence);};
    try{
      owned=await spawnSupervisedCli(process.execPath,[path.join(p.root,'scripts','agents-mother','voice-factory-worker.mjs'),requestFile],{cwd:p.root,env,
        beforeStart:evidence=>{this.host.check();recordProof(evidence);},onEvidence:recordProof});
      this.host.commands.add(owned);o.signal?.addEventListener('abort',stop,{once:true});if(o.signal?.aborted)stop();
      timer=setTimeout(()=>{reason='factory_step_timeout';owned.stop();},['deliver','delivery_resume','verify'].includes(input.action)?3600000:600000);
      const drain=async stream=>{for await(const chunk of stream){bytes+=chunk.length;if(bytes>8*1024*1024){reason='factory_output_limit';owned.stop();break;}buffers.push(chunk);}};
      owned.child.stdin.end();const [done]=await Promise.all([owned.completion,drain(owned.child.stdout),drain(owned.child.stderr)]);exited=done.processTreeExited===true;
      if(!exited){this.host.exitConfirmed=false;throw factoryFail('factory_process_exit_unconfirmed');}
      if(reason)throw factoryFail(reason);
      const result=JSON.parse(factoryRead(resultFile,work,500000));
      if(result.version!==1 || result.operationId!==input.operation_id || !result.state || result.state.revision!==next.revision)throw factoryFail('factory_result_invalid');
      // The worker owns only this bound context; a lost result keeps running set.
      const saved=validateVoiceFactory(p,{...result.state,running:null},o);atomicWriteFile(p.file,JSON.stringify(saved));
      return {status:result.ok?'completed':'failed',exitCode:done.code,output:JSON.stringify({ok:result.ok,...result.value,diagnostic:result.diagnostic || undefined,phase:saved.phase,manualAcceptance:'pending'})};
    }catch(error){
      owned?.stop();if(owned)exited=(await owned.completion).processTreeExited===true;else exited=error.processTreeExited!==false;
      if(!exited)this.host.exitConfirmed=false;throw error;
    }finally{clearTimeout(timer);o.signal?.removeEventListener('abort',stop);if(owned)this.host.commands.delete(owned);if(exited)fs.rmSync(temporary,{recursive:true,force:true});}
  }
}
