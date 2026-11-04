import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {atomicWriteFile,atomicCompareAndSwapFile} from '../lib/atomic-file.mjs';
import {parseFrontmatterData} from '../lib/frontmatter.mjs';
import {redactSensitiveText} from '../lib/redaction.mjs';
import {loadPrithaRuntimeEnv} from '../lib/env.mjs';
import {normalizeInterviewBrief,validateInterviewBrief} from './interview-brief.mjs';
import {voiceFactoryPaths,loadVoiceFactory,factoryArtifact,factoryRead,factoryHash,factoryFail,requireFactoryApprovals,assertFactoryTargetAvailable,validateFactoryBudgetProposal} from './voice-factory-state.mjs';

const executors={neuraldeep:'neuraldeep',claude:'claude-code',openrouter:'openrouter',local:'local'};
function draftMetadata(text,previous){
  const fm=parseFrontmatterData(text),keys=text.startsWith('---\n')?text.slice(4,text.indexOf('\n---\n',4)).split('\n').map(line=>/^([A-Za-z0-9_-]+):/.exec(line)?.[1]).filter(Boolean):[];
  if(!fm || new Set(keys).size!==keys.length || fm.status!=='draft' || fm.type!==previous.type || fm.id!==previous.id
      || fm.approved_by && fm.approved_by!=='pending' || fm.outcome_spec_status && fm.outcome_spec_status!=='draft')throw factoryFail('factory_draft_identity_invalid');
  return fm;
}
function contractIdentity(data,p,state,executor){
  if(data.technicalSlug!==p.slug || path.resolve(p.root,data.targetFolder)!==p.target || data.agentId!==state.agentId || data.agentName!==state.agentName
      || data.buildExecutor!==executor || data.buildGitMode!=='disposable-worktree' || data.autostart!=='disabled'
      || !Number.isSafeInteger(data.buildTokenBudget) || data.buildTokenBudget<1 || data.buildTokenBudget>10000000)throw factoryFail('factory_contract_identity_invalid');
}
const validationFailure=issues=>Object.assign(factoryFail('factory_validation_failed'),{message:issues.map(row=>typeof row==='string'?row:row.code+' '+row.message).join('\n').slice(0,5000)});

/** Trusted worker: action/paths come from the host, never an arbitrary shell or
 * model-selected program. The actual product executor still runs in its normal
 * sandbox with locked independent Trials and a host token ledger. */
export async function executeVoiceFactoryStep(request,dependencies={}){
  const p=voiceFactoryPaths(request),state=structuredClone(request.state),input=request.input,executor=executors[request.connectorId];
  if(!executor || state.chatId!==request.chatId || state.connectorId!==request.connectorId || state.target!==p.target || state.running?.operationId!==input.operation_id)throw factoryFail('factory_binding_changed');
  const saved=loadVoiceFactory(p,request);if(factoryHash(saved)!==factoryHash(state))throw factoryFail('factory_context_changed');
  const {contractData,validateContract}=await import('./contract.mjs');
  const {interview,researchContract,externalResearchContract}=await import('./index.mjs');
  const {createOutcomeSpec,approveOutcomeSpec,outcomeSpecFile,verifyOutcomeApproval}=await import('./outcome-spec.mjs');
  const {planScaffoldContract,scaffoldContract}=await import('./scaffold/index.mjs');
  const delivery=dependencies.delivery || await import('./delivery-loop.mjs');
  const options={root:p.root,stateRoot:p.stateRoot};
  let value={};
  const contract=()=>{const row=factoryArtifact(p,state,'contract'),data=contractData(row.file,{root:p.root});contractIdentity(data,p,state,executor);return data;};
  const approved=()=>{requireFactoryApprovals(p,state);contract();const valid=verifyOutcomeApproval(state.outcome,options);if(!valid.ok)throw factoryFail('factory_outcome_approval_required');};
  const observeDelivery=()=>{
    if(!state.runId)throw factoryFail('factory_delivery_missing');
    const result=delivery.deliveryStatus(state.runId,options);
    const spec=factoryArtifact(p,state,'outcome');
    if(path.resolve(result.state.source_project)!==p.target || result.state.spec?.id!==spec.frontmatter.id || result.state.spec?.document_lock!==spec.frontmatter.outcome_document_lock)throw factoryFail('factory_delivery_identity_changed');
    return result;
  };
  switch(input.action){
    case 'init':{
      if(state.contract || fs.existsSync(p.target))throw factoryFail('factory_target_exists');
      validateFactoryBudgetProposal(input);
      const brief=normalizeInterviewBrief(input.brief);if(brief.identity.slug && brief.identity.slug!==p.slug)throw factoryFail('factory_subject_changed');
      brief.identity.slug=p.slug;brief.technical.targetFolder=p.target;
      const issues=validateInterviewBrief(brief,{requireComplete:true});if(issues.length)throw validationFailure(issues);
      // Recheck at the effect boundary; chat creation alone cannot reserve a path.
      assertFactoryTargetAvailable(p);
      const briefFile=path.join(p.directory,'brief.json');atomicWriteFile(briefFile,JSON.stringify(brief));
      const result=await interview({'from-brief':briefFile,'contract-only':true,'no-input':true,'build-executor':executor,'build-token-budget':String(input.build_token_budget),
        ...(input.build_iteration_budget!==undefined?{'build-iterations':String(input.build_iteration_budget),'repeated-failure-threshold':String(Math.max(2,Math.min(3,input.build_iteration_budget)))}:{}),
        ...(input.build_elapsed_budget_ms!==undefined?{'build-elapsed-ms':String(input.build_elapsed_budget_ms)}:{}),
        'build-git-mode':'disposable-worktree',autostart:'disabled','target-folder':p.target,slug:p.slug});
      state.contract=result.contractPath;const data=contractData(state.contract,{root:p.root});state.agentId=data.agentId;state.agentName=data.agentName;state.phase='contract-draft';
      value={artifact:'contract',sha256:factoryArtifact(p,state,'contract').sha256,next:'Read and refine the contract; request separate approve_contract with its exact hash.'};break;
    }
    case 'write_draft':{
      const row=factoryArtifact(p,state,input.artifact);if(row.frontmatter.status!=='draft' || row.sha256!==input.expected_sha256)throw factoryFail('factory_draft_changed');
      const text=String(input.content),fm=draftMetadata(text,row.frontmatter);
      if(Buffer.byteLength(text)>48000 || redactSensitiveText(text)!==text)throw factoryFail('factory_draft_unsafe');
      if(input.artifact==='contract'){
        if(state.outcome)throw factoryFail('factory_contract_revision_required');
        const candidate=path.join(p.directory,'candidate.md');atomicWriteFile(candidate,text);
        try{const data=contractData(candidate,{root:p.root});contractIdentity(data,p,state,executor);if(data.buildTokenBudgetConfirmation!=='pending')throw factoryFail('factory_approval_not_authorized');}
        finally{fs.rmSync(candidate,{force:true});}
      }else if(input.artifact==='outcome'){
        if(fm.contract_path!==row.frontmatter.contract_path || fm.contract_fingerprint!==contract().fingerprint || fm.agent_slug!==row.frontmatter.agent_slug)throw factoryFail('factory_draft_identity_invalid');
      }else throw factoryFail('factory_artifact_boundary');
      atomicCompareAndSwapFile(row.file,row.text,text);value={artifact:input.artifact,sha256:factoryHash(text)};break;
    }
    case 'approve_contract':{
      const row=factoryArtifact(p,state,'contract');if(row.frontmatter.status!=='draft' || row.sha256!==input.expected_sha256)throw factoryFail('factory_draft_changed');contract();
      const next=row.text.replace(/^status: draft$/m,'status: accepted').replace(/^- Build token budget confirmation: pending$/m,'- Build token budget confirmation: user');
      const candidate=path.join(p.directory,'candidate.md');atomicWriteFile(candidate,next);
      try{const issues=validateContract(candidate,{root:p.root,print:false});if(issues.length)throw validationFailure(issues);}finally{fs.rmSync(candidate,{force:true});}
      atomicCompareAndSwapFile(row.file,row.text,next);state.contractApproval={sha256:factoryHash(next),operationId:input.operation_id,approvedAt:new Date().toISOString()};state.phase='contract-approved';value={approved:'contract',next:'create_outcome'};break;
    }
    case 'create_outcome':{
      requireFactoryApprovals(p,state,{outcome:false});contract();if(state.outcome)throw factoryFail('factory_artifact_exists');
      state.outcome=createOutcomeSpec(state.contract,options).path;state.phase='outcome-draft';value={artifact:'outcome',sha256:factoryArtifact(p,state,'outcome').sha256};break;
    }
    case 'approve_outcome':{
      requireFactoryApprovals(p,state,{outcome:false});contract();const row=factoryArtifact(p,state,'outcome');
      if(row.frontmatter.status!=='draft' || row.sha256!==input.expected_sha256)throw factoryFail('factory_draft_changed');
      const checked=outcomeSpecFile(state.outcome,options),blocking=checked.issues.filter(issue=>!['OS015','OS016'].includes(issue.code));if(blocking.length)throw validationFailure(blocking);
      approveOutcomeSpec(state.outcome,{...options,approvedBy:'user',projectPath:p.target});state.outcomeApproval={sha256:factoryArtifact(p,state,'outcome').sha256,operationId:input.operation_id,approvedAt:new Date().toISOString()};state.phase='outcome-approved';value={approved:'outcome',next:'research'};break;
    }
    case 'research':{
      approved();const result=await researchContract(state.contract,{'github-mode':request.connectorId==='local'?'registry-only':'auto'});
      state.research=result.reportPath;state.pattern=result.patternPath;state.phase='research';value={artifacts:['research','pattern'],next:'Read research and pattern, collect current sources, then publish locked synthesis.'};break;
    }
    case 'research_status':case 'research_collect':case 'research_apply':{
      approved();const phase=input.action.split('_')[1];const args={backend:'host',connector:request.connectorId,phase};
      if(input.sources){args.sources=path.join(p.directory,'sources.json');atomicWriteFile(args.sources,JSON.stringify(input.sources));}
      if(phase==='apply'){args.input=path.join(p.directory,'selection.json');atomicWriteFile(args.input,JSON.stringify(input.selection));}
      value=await externalResearchContract(state.contract,args);break;
    }
    case 'scaffold_plan':approved();value=planScaffoldContract(state.contract);break;
    case 'scaffold':{
      approved();if(fs.existsSync(p.target))throw factoryFail('factory_target_exists');
      const result=scaffoldContract(state.contract,{output:p.target});
      if(!result.smokeResult.ok || !result.healthResult.ok || !result.deliveryGit.ok)throw factoryFail('factory_scaffold_failed');
      state.phase='scaffolded';state.scaffoldRevision=result.deliveryGit.revision;value={scaffolded:true,target:p.target,next:'deliver'};break;
    }
    case 'deliver':case 'delivery_resume':case 'verify':case 'delivery_status':{
      approved();
      const buildOptions={...options,buildExecutor:executor,buildExecutorOptions:{model:request.model,effort:request.effort,preset:request.preset,factoryParent:request.factoryParent},trialBackend:'local'};
      let result;
      if(input.action==='deliver'){
        if(state.runId || state.phase!=='scaffolded')throw factoryFail('factory_delivery_already_started');
        state.runId='voice-'+p.slug+'-'+randomUUID().slice(0,8);
        // Persist the exact run before the first request; a crash cannot invent
        // another delivery identity or repeat charged work.
        atomicWriteFile(p.file,JSON.stringify(state));
        result=await delivery.deliverOutcome(state.outcome,p.target,{...buildOptions,runId:state.runId});
      }else{
        observeDelivery();result=input.action==='delivery_status'?observeDelivery():await delivery.resumeDelivery(state.runId,{...buildOptions,hostOnly:input.action==='verify',...(input.answer?{answer:input.answer,answeredBy:'user'}:{})});
      }
      state.phase='delivery-'+result.state.status;value={runId:state.runId,status:result.state.status,phase:result.state.phase,blockers:result.state.blockers,iteration:result.state.iteration,budget:result.state.budget,worktree:result.worktree?.worktree || null};break;
    }
    case 'finish':{
      approved();const result=observeDelivery();if(!['verified','awaiting_acceptance','accepted'].includes(result.state.status))throw factoryFail('factory_delivery_not_verified');
      const {rebuildRegistry}=dependencies.registry || await import('./registry.mjs');const {checkCardReadiness}=dependencies.cards || await import('./card-readiness.mjs');rebuildRegistry();
      const card=await checkCardReadiness(state.agentId,{...options,baseUrl:false});
      value={deliveryStatus:result.state.status,card,next:card.status==='ready'?'Manual demonstration, live card check and user acceptance; no automatic merge, deployment or publication.':'Resolve the reported card configuration blockers before manual acceptance.'};state.phase=card.status==='ready'?'awaiting-manual-acceptance':'card-blocked';break;
    }
    default:throw factoryFail('factory_input_invalid');
  }
  return {state,value};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let request;
  try{
    if(process.argv.length!==3)throw factoryFail('factory_input_invalid');
    request=JSON.parse(factoryRead(process.argv[2],path.dirname(process.argv[2]),100000));
    if(request.version!==1 || path.dirname(request.resultFile)!==path.dirname(process.argv[2]))throw factoryFail('factory_input_invalid');
    loadPrithaRuntimeEnv({root:request.root});
    const result=await executeVoiceFactoryStep(request);atomicWriteFile(request.resultFile,JSON.stringify({version:1,operationId:request.input.operation_id,ok:true,...result}));
  }catch(error){
    if(request?.resultFile){
      let state=request.state;try{state=loadVoiceFactory(voiceFactoryPaths(request),request) || state;}catch{/* preserve original binding */}
      atomicWriteFile(request.resultFile,JSON.stringify({version:1,operationId:request.input.operation_id,ok:false,state,value:{error:/^[a-z_]{1,80}$/.test(error.code || '')?error.code:'factory_step_failed'},diagnostic:redactSensitiveText(String(error.message)).slice(0,5000)}));
    }
    process.exitCode=1;
  }
}
