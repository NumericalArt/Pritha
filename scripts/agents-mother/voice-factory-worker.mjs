import {verifiedFirstUse} from './factory-first-use.mjs';
import {FactoryBudget} from './factory-budget.mjs';
import {localApiResearchSources,researchPage,supportsLocalApiContinuation} from './factory-continuation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {atomicWriteFile,atomicCompareAndSwapFile} from '../lib/atomic-file.mjs';
import {parseFrontmatterData} from '../lib/frontmatter.mjs';
import {redactSensitiveText,quarantineUntrustedInstructionText} from '../lib/redaction.mjs';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {loadPrithaRuntimeEnv} from '../lib/env.mjs';
import {normalizeInterviewBrief,validateInterviewBrief} from './interview-brief.mjs';
import {scaffoldCapability,assertScaffoldCapability} from './scaffold/capabilities.mjs';
import {prepareProductTrial,reviewProductTrials} from './factory-product-trial.mjs';
import {voiceFactoryPaths,loadVoiceFactory,factoryArtifact,factoryRead,factoryHash,factoryFail,requireFactoryApprovals,assertFactoryTargetAvailable,validateFactoryBudgetProposal,validateFactoryDelivery,patchFactoryDraft,validateFactoryBuildEffort} from './voice-factory-state.mjs';

const executors={codex:'codex-app-server',neuraldeep:'neuraldeep',claude:'claude-code',openrouter:'openrouter',local:'local'};
function draftHasSensitiveText(text,kind){
  // These are canonical Outcome grammar, not credential assignments. Scan
  // their values and every other byte normally; never exempt arbitrary fields.
  const scanned=kind==='outcome'?text
    .replace(/^(- Then exit code):[ \t]*([0-9]{1,3})[ \t]*$/gm,'$1 $2')
    .replace(/^(#### Session):[ \t]+([a-z0-9][a-z0-9-]{0,79})[ \t]*$/gm,'$1 $2')
    // A valid declaration's separators are not IPv6 unspecified addresses.
    .replace(/^(- Verifier input: [A-Za-z0-9._/-]+) :: (sha256:[a-f0-9]{64}) :: ((?:host-reviewed|host-template):[a-z0-9][a-z0-9._/@ -]{2,511})$/gm,'$1 | $2 | $3'):text;
  return redactSensitiveText(scanned)!==scanned;
}
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

function deliveryVerification(result){
  const ref=result.state.last_trial_result;
  if(!ref)return null;
  try{
    if(!result.runRoot || !/^trial-results\/verification-\d+\.json$/.test(ref.path))throw Error('Invalid Trial reference');
    const value=JSON.parse(readBoundedRegularFile(path.join(result.runRoot,ref.path),{allowedRoots:[result.runRoot],maxBytes:2*1024*1024}).text);
    if(value.schema!=='pritha-trial-result-v1' || value.evidence_lock!==ref.evidence_lock || value.spec_id!==result.state.spec.id || value.document_lock!==result.state.spec.document_lock || !Array.isArray(value.trials))throw Error('Changed Trial evidence');
    const safe=text=>quarantineUntrustedInstructionText(redactSensitiveText(String(text || ''))).slice(0,1600);
    return {status:value.verification_status,evidenceLock:value.evidence_lock,counts:value.counts,recordedAt:value.finished_at,
      failedTrials:value.trials.filter(row=>row.kind==='automated' && row.status!=='passed').slice(0,12).map(row=>({id:safe(row.id),status:safe(row.status),exitCode:row.execution?.exitCode ?? null,
        assertions:(row.assertions || []).filter(check=>!check.passed).slice(0,8).map(check=>({type:safe(check.type),message:safe(check.message)})),
        diagnostics:{untrusted:true,stdout:safe(row.execution?.stdout),stderr:safe(row.execution?.stderr)}}))};
  }catch{return {status:'evidence-unavailable',hint:'Saved Trial evidence could not be read or matched; do not infer success.'};}
}

/** Trusted worker: action/paths come from the host, never an arbitrary shell or
 * model-selected program. The actual product executor still runs in its normal
 * sandbox with locked independent Trials and a host token ledger. */
export async function executeVoiceFactoryStep(request,dependencies={}){
  const p=voiceFactoryPaths(request),state=structuredClone(request.state),input=request.input,executor=executors[request.connectorId];
  if(!executor || state.chatId!==request.chatId || state.connectorId!==request.connectorId || state.target!==p.target || state.running?.operationId!==input.operation_id)throw factoryFail('factory_binding_changed');
  const saved=loadVoiceFactory(p,request);if(factoryHash(saved)!==factoryHash(state))throw factoryFail('factory_context_changed');
  const {contractData,validateContract}=await import('./contract.mjs');
  const {interview,researchContract,externalResearchContract:researchFromHost}=await import('./index.mjs');
  const externalResearchContract=dependencies.externalResearchContract || researchFromHost;
  const {createOutcomeSpec,approveOutcomeSpec,outcomeSpecFile,verifyOutcomeApproval}=await import('./outcome-spec.mjs');
  const {planScaffoldContract,scaffoldContract}=await import('./scaffold/index.mjs');
  const delivery=dependencies.delivery || await import('./delivery-loop.mjs');
  const options={root:p.root,stateRoot:p.stateRoot};
  let value={};
  const contract=()=>{const row=factoryArtifact(p,state,'contract'),data=contractData(row.file,{root:p.root});contractIdentity(data,p,state,executor);return data;};
  const approved=()=>{requireFactoryApprovals(p,state);contract();const valid=verifyOutcomeApproval(state.outcome,options);if(!valid.ok)throw factoryFail('factory_outcome_approval_required');
    if(state.buildConfiguration && (state.buildConfiguration.connectorId!==request.connectorId || state.buildConfiguration.modelId!==request.model && state.buildConfiguration.parentModelId!==request.model))throw factoryFail('factory_build_configuration_changed');
  };
  const observeDelivery=()=>{
    if(!state.runId)throw factoryFail('factory_delivery_missing');
    return validateFactoryDelivery(p,state,delivery.deliveryStatus(state.runId,options));
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
      value={artifact:'contract',sha256:factoryArtifact(p,state,'contract').sha256,scaffoldCapability:scaffoldCapability(data),next:'Read the contract and scaffold capability before requesting separate approve_contract with its exact hash.'};break;
    }
    case 'patch_draft':
    case 'write_draft':{
      const row=factoryArtifact(p,state,input.artifact);if(row.frontmatter.status!=='draft' || row.sha256!==input.expected_sha256)throw factoryFail('factory_draft_changed');
      const text=input.action==='patch_draft'?patchFactoryDraft(row.text,input):String(input.content),fm=draftMetadata(text,row.frontmatter);
      if(Buffer.byteLength(text)>48000 || draftHasSensitiveText(text,input.artifact))throw factoryFail('factory_draft_unsafe');
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
      const row=factoryArtifact(p,state,'contract');if(row.frontmatter.status!=='draft' || row.sha256!==input.expected_sha256)throw factoryFail('factory_draft_changed');
      const reviewed=contract();assertScaffoldCapability(reviewed);
      const next=row.text.replace(/^status: draft$/m,'status: accepted').replace(/^- Build token budget confirmation: pending$/m,'- Build token budget confirmation: user');
      const candidate=path.join(p.directory,'candidate.md');atomicWriteFile(candidate,next);
      try{const issues=validateContract(candidate,{root:p.root,print:false});if(issues.length)throw validationFailure(issues);}finally{fs.rmSync(candidate,{force:true});}
      atomicCompareAndSwapFile(row.file,row.text,next);
      if(request.automaticContinuation===true && supportsLocalApiContinuation(reviewed))state.continuationProfile='api-local-v1';
      else delete state.continuationProfile;
      state.contractApproval={sha256:factoryHash(next),reviewedSha256:row.sha256,operationId:input.operation_id,approvedAt:new Date().toISOString()};state.phase='contract-approved';value={approved:'contract',next:'create_outcome'};break;
    }
    case 'create_outcome':{
      requireFactoryApprovals(p,state,{outcome:false});contract();if(state.outcome)throw factoryFail('factory_artifact_exists');
      state.outcome=createOutcomeSpec(state.contract,options).path;state.phase='outcome-draft';value={artifact:'outcome',sha256:factoryArtifact(p,state,'outcome').sha256};break;
    }
    case 'prepare_product_trial':{
      requireFactoryApprovals(p,state,{outcome:false});const data=contract(),row=factoryArtifact(p,state,'outcome');
      if(row.frontmatter.status!=='draft' || row.sha256!==input.expected_sha256)throw factoryFail('factory_draft_changed');
      value=prepareProductTrial(p,row,data,input.trial);break;
    }
    case 'approve_outcome':{
      requireFactoryApprovals(p,state,{outcome:false});contract();const row=factoryArtifact(p,state,'outcome');
      if(row.frontmatter.status!=='draft' || row.sha256!==input.expected_sha256)throw factoryFail('factory_draft_changed');
      const checked=outcomeSpecFile(state.outcome,options),blocking=checked.issues.filter(issue=>!['OS015','OS016'].includes(issue.code));if(blocking.length)throw validationFailure(blocking);
      reviewProductTrials(p,row,contract());
      const inputRoot=path.join(p.directory,'trial-inputs');
      approveOutcomeSpec(state.outcome,{...options,approvedBy:'user',projectPath:fs.existsSync(p.target)?p.target:inputRoot});state.outcomeApproval={sha256:factoryArtifact(p,state,'outcome').sha256,reviewedSha256:row.sha256,operationId:input.operation_id,approvedAt:new Date().toISOString()};state.phase='outcome-approved';value={approved:'outcome',next:'research'};break;
    }
    case 'research':{
      approved();if(state.research || state.pattern)throw factoryFail('factory_research_already_started');const result=await researchContract(state.contract,{'github-mode':request.connectorId==='local'?'registry-only':'auto'});
      state.research=result.reportPath;state.pattern=result.patternPath;state.phase='research';state.researchStage='planned';value={artifacts:['research','pattern'],next:'Read research and pattern, collect current sources, then publish locked synthesis.'};break;
    }
    case 'research_status':case 'research_collect':case 'research_recover':case 'research_apply':{
      approved();const phase=input.action.split('_')[1];const args={backend:'host',connector:request.connectorId,phase};
      if(input.retry_failed===true)args['retry-failed']=true;
      let sources=input.sources;
      if(phase==='collect' && state.continuationProfile==='api-local-v1' && !sources){
        const {topics}=await externalResearchContract(state.contract,{...args,phase:'status'});
        sources=localApiResearchSources(topics);
      }
      if(sources){args.sources=path.join(p.directory,'sources.json');atomicWriteFile(args.sources,JSON.stringify(sources));}
      if(phase==='apply'){args.input=path.join(p.directory,'selection.json');atomicWriteFile(args.input,JSON.stringify(input.selection));}
      const research=await externalResearchContract(state.contract,args);
      if(research.status==='completed')state.researchStage='published';
      else if(research.status==='collected')state.researchStage='collected';
      value=researchPage(research,input.offset??0);break;
    }
    case 'scaffold_plan':contract();value=planScaffoldContract(state.contract);break;
    case 'scaffold':{
      approved();if(fs.existsSync(p.target))throw factoryFail('factory_target_exists');
      const inputRoot=path.join(p.directory,'trial-inputs');
      const result=scaffoldContract(state.contract,{output:p.target,...(fs.existsSync(inputRoot)?{preparedTrialInputRoot:inputRoot}:{})});
      if(!result.smokeResult.ok || !result.healthResult.ok || !result.deliveryGit.ok)throw factoryFail('factory_scaffold_failed');
      state.phase='scaffolded';state.scaffoldRevision=result.deliveryGit.revision;value={scaffolded:true,target:p.target,next:'deliver'};break;
    }
    case 'scaffold_refresh':{
      approved();observeDelivery();
      value=await delivery.refreshDeliveryScaffold(state.runId,options);break;
    }
    case 'configure_build':case 'configure_build_model':{
      approved();
      const model=input.action==='configure_build_model'?input.model:state.buildConfiguration?.modelId || request.model;
      if(input.action==='configure_build_model' && request.connectorId!=='neuraldeep')throw factoryFail('factory_build_model_unsupported');
      validateFactoryBuildEffort(request.connectorId,model,input.effort);
      if(state.runId){
        const result=observeDelivery();
        if(result.state.status!=='blocked' || !Array.isArray(result.state.budget?.unaccounted_attempts) || result.state.budget.unaccounted_attempts.length || result.state.budget.legacy_usage_unverified!==false)throw factoryFail('factory_build_configuration_locked');
      }
      if(input.action==='configure_build_model'){
        if(!state.runId)throw factoryFail('factory_build_configuration_locked');
        const preflight=dependencies.buildModelPreflight || (async()=>{const {NeuralDeepProviderService}=await import('../neuraldeep/provider-service.mjs');return new NeuralDeepProviderService(options).require(model);});
        const capabilities=await preflight(model);if(capabilities.tools!==true)throw factoryFail('factory_build_model_unsupported');
      }
      state.buildConfiguration={connectorId:request.connectorId,modelId:model,...(model!==request.model?{parentModelId:request.model}:{}),effort:input.effort,operationId:input.operation_id,approvedBy:'user',approvedAt:new Date().toISOString()};
      value={configured:true,buildConfiguration:state.buildConfiguration,runId:state.runId || null,modelRequests:0};break;
    }
    case 'deliver':case 'delivery_resume':case 'delivery_extend':case 'verify':case 'delivery_status':{
      approved();
      const buildOptions={...options,buildExecutor:executor,buildExecutorOptions:{model:state.buildConfiguration?.modelId || request.model,effort:state.buildConfiguration?.effort ?? request.effort,preset:request.preset,factoryParent:request.factoryParent,
        factoryBudget:{...options,agentParent:p.parent,slug:p.slug,target:p.target,chatId:state.chatId,connectorId:request.connectorId}}};
      let result;
      if(input.action==='deliver'){
        if(state.runId || state.phase!=='scaffolded')throw factoryFail('factory_delivery_already_started');
        reviewProductTrials(p,factoryArtifact(p,state,'outcome'),contract(),{includeInputs:false});
        state.runId='voice-'+p.slug+'-'+randomUUID().slice(0,8);
        // Persist the exact run before the first request; a crash cannot invent
        // another delivery identity or repeat charged work.
        atomicWriteFile(p.file,JSON.stringify(state));
        result=await delivery.deliverOutcome(state.outcome,p.target,{...buildOptions,runId:state.runId});
      }else{
        const current=observeDelivery();
        if(input.action==='delivery_extend' && (current.state.version!==input.expected_version || current.state.status!=='blocked'
          || current.state.blockers?.length!==1 || !['token_budget_exhausted','iteration_budget_exhausted','elapsed_budget_exhausted'].includes(current.state.blockers[0].code)
          || current.state.budget.legacy_usage_unverified!==false || current.state.budget.unaccounted_attempts?.length!==0))throw factoryFail('factory_budget_context_changed');
        if(input.action==='delivery_resume' && current.state.status==='blocked' && !(typeof input.answer==='string' && input.answer.trim())){
          const choices=(current.state.blockers?.[0]?.options || []).map(option=>option.id).filter(id=>/^[a-z][a-z0-9-]{0,79}$/.test(id)).slice(0,8);
          throw Object.assign(factoryFail('factory_delivery_answer_required'),{message:'Delivery is blocked. Call factory_delivery_resume with the required answer parameter from the saved blocker options'+(choices.length?': '+choices.join(', '):'')+'. No runtime probe or build request was started.'});
        }
        if(input.action==='delivery_extend')await new FactoryBudget(buildOptions.buildExecutorOptions.factoryBudget).extend(input.operation_id,{tokens:input.add_tokens || 0,activeMs:input.add_elapsed_ms || 0});
        result=input.action==='delivery_status'?current:await delivery.resumeDelivery(state.runId,{...buildOptions,hostOnly:input.action==='verify',...(input.answer?{answer:input.answer,answeredBy:'user'}:{}),...(input.action==='delivery_extend'?{answeredBy:'user',budgetRequestId:input.operation_id,expectedVersion:input.expected_version,addTokens:input.add_tokens || undefined,addIterations:input.add_iterations || undefined,addElapsedMs:input.add_elapsed_ms || undefined}:{})});
      }
      // resume/deliver return an execution result without runRoot. Re-observe
      // the durable, identity-checked run before reading its Trial evidence.
      result=observeDelivery();
      if(input.action==='verify')state.hostVerifiedIteration=result.state.iteration;
      state.phase='delivery-'+result.state.status;value={runId:state.runId,status:result.state.status,phase:result.state.phase,blockers:result.state.blockers,iteration:result.state.iteration,budget:result.state.budget,worktree:result.worktree?.worktree || null,verification:deliveryVerification(result),manualAcceptance:result.state.status==='accepted'?'accepted':'pending'};break;
    }
    case 'finish':{
      approved();const result=observeDelivery();if(!['verified','awaiting_acceptance','accepted'].includes(result.state.status))throw factoryFail('factory_delivery_not_verified');
      const {rebuildRegistry}=dependencies.registry || await import('./registry.mjs');const {checkCardReadiness}=dependencies.cards || await import('./card-readiness.mjs');rebuildRegistry();
      const card=await checkCardReadiness(state.agentId,{...options,baseUrl:false});
      const accepted=result.state.status==='accepted';
      value={firstUse:verifiedFirstUse(p,state,result),deliveryStatus:result.state.status,manualAcceptance:accepted?'accepted':'pending',card,next:card.status!=='ready'?'Resolve the reported card configuration blockers.':accepted?'Result accepted. Application and publication retain their separate approval boundaries.':'Manual demonstration, live card check and user acceptance; no automatic merge, deployment or publication.'};state.phase=card.status==='ready'?(accepted?'accepted':'awaiting-manual-acceptance'):'card-blocked';break;
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
