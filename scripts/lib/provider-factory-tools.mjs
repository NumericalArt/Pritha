import {nextFactoryAction,factoryOperationId,supportsLocalApiContinuation} from '../agents-mother/factory-continuation.mjs';
import {deliveryExplanation} from '../agents-mother/delivery-explanation.mjs';
import {validateOutcomeSpecText} from '../agents-mother/outcome-spec.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {privateStateDirectory,privateStateFile} from './private-state-path.mjs';
import {atomicWriteFile,atomicCompareAndSwapFile} from './atomic-file.mjs';
import {providerProcessEnvironment,createProviderTemporaryDirectory} from './provider-process-environment.mjs';
import {resolvePrithaPython} from './python-runtime.mjs';
import {spawnSupervisedCli} from '../neuraldeep/process-supervisor.mjs';
import {normalizeInterviewBrief,validateInterviewBrief,INTERVIEW_BRIEF_TEXT_FIELDS} from '../agents-mother/interview-brief.mjs';
import {RUNTIME_FAMILIES,SERVICE_MODES,contractData} from '../agents-mother/contract.mjs';
import {scaffoldCapability,assertScaffoldCapability} from '../agents-mother/scaffold/capabilities.mjs';
import {productExamples,validateProductTrial,reviewProductTrials} from '../agents-mother/factory-product-trial.mjs';
import {voiceFactoryPaths,loadVoiceFactory,validateVoiceFactory,factoryArtifact,factoryRead,factoryHash,factoryFail,requireFactoryApprovals,validateFactoryBudgetProposal,validateFactoryDelivery,patchFactoryDraft,FACTORY_BUILD_EFFORTS,validateFactoryBuildEffort} from '../agents-mother/voice-factory-state.mjs';
import {deliveryStatus} from '../agents-mother/delivery-loop.mjs';
import {neuralDeepExecutionProfile} from '../neuraldeep/model-execution-profile.mjs';
import {FactoryBudget,readFactoryBudget,FACTORY_STABILITY_BUDGET} from '../agents-mother/factory-budget.mjs';

const actions=['status','read_artifact','init','write_draft','patch_draft','approve_contract','create_outcome','prepare_product_trial','approve_outcome','research','research_status','research_collect','research_recover','research_apply','scaffold_plan','scaffold','scaffold_refresh','configure_build','configure_build_model','deliver','delivery_status','delivery_resume','delivery_extend','verify','finish'];
const readonly=new Set(['status','read_artifact']);
const workflowSteps=new Set(['init','write_draft','patch_draft','create_outcome','prepare_product_trial','research','research_status','research_collect','research_recover','research_apply','scaffold_plan','scaffold','scaffold_refresh','deliver','delivery_status','verify','finish']);
const textFields=Object.entries(INTERVIEW_BRIEF_TEXT_FIELDS);
const briefTextPaths=new Set(textFields.flatMap(([group,keys])=>keys.map(key=>group+'.'+key)));
class FactoryBriefInputError extends Error {
  constructor(field){super('A factory brief field must be text.');this.code='factory_brief_text_required';this.field=field;}
}
class FactoryBriefValidationError extends Error {
  constructor(issues){super('The factory brief needs correction.');this.code='factory_brief_incomplete';this.issues=issues;}
}
class FactoryActionInputError extends Error {
  constructor(action,input){
    super('Use the fields for this factory action.');this.code='factory_input_invalid';this.action=actions.includes(action)?action:'status';
    if(input && typeof input==='object' && !Array.isArray(input)){
      const allowed=['operation_id','action',...(fields[this.action] || [])];
      this.correction={missingFields:['action',...(requiredFields[this.action] || [])].filter(key=>input[key]===undefined),
        unexpectedFieldCount:Object.keys(input).filter(key=>!allowed.includes(key)).length,
        operationIdValid:/^[A-Za-z0-9_-]{8,128}$/.test(input.operation_id || '')};
    }
  }
}
export function factoryBriefErrorDetail(error){
  if(error?.code==='scaffold_adapter_unavailable' && error.capability)return {error:error.code,capability:error.capability,hint:'The draft cannot be approved with this interface/runtime combination. Revise the draft and read scaffold_plan before requesting Contract approval.'};
  if(error?.code==='factory_product_trial_port_mismatch' && /^[A-Z][A-Z0-9_]{0,95}_PORT$/.test(error.expectedPortVariable || ''))return {error:error.code,field:'trial.http[].port_variable',expected:error.expectedPortVariable,hint:'Use this exact Contract port variable in every HTTP case. Keep argv as ["node","scripts/server.mjs"], all distinct inputs and their exact expected_json. The Outcome and verifier were not changed.'};
  if(/^factory_(?:product_trial|trial_inputs)_/.test(error?.code || ''))return {error:error.code,hint:'Use prepare_product_trial with the exact draft Outcome hash and declarative HTTP/CLI requests and expected_json. Read the resulting Outcome and verifier before its separate approval. Structural smoke alone cannot approve an API product.'};
  if(error?.code==='factory_build_effort_unsupported')return {error:error.code,supportedEfforts:(error.supportedEfforts || []).filter(effort=>FACTORY_BUILD_EFFORTS.includes(effort)),hint:'Read factory_status.buildExecution and choose a supported effort with factory_configure_build. The provider, model, documents and budgets remain unchanged; operator approval is required.'};
  // These messages come only from the host validator, never from provider text.
  const patchHints={factory_patch_invalid:'Use 1–8 literal from/to edits and the exact resulting SHA-256. No draft was written.',factory_patch_not_unique:'Each from text must occur exactly once at its step; read the current draft and use a larger literal match. No draft was written.',factory_patch_hash_mismatch:'The edits do not produce the required complete document hash. No draft was written.'};
  if(Object.hasOwn(patchHints,error?.code))return {error:error.code,hint:patchHints[error.code]};
  if(error instanceof FactoryActionInputError)return {error:error.code,action:error.action,allowedFields:['operation_id','action',...(fields[error.action] || [])],requiredFields:['action',...(requiredFields[error.action] || [])],...(error.correction || {}),suggestedTool:'factory_'+error.action,hint:'Prefer the dedicated factory_'+error.action+' tool: its schema requires exactly the fields for this action. Optional legacy operation_id: 8–128 letters, digits, _ or -. For not-started use init with brief and proposed build_token_budget. write_draft only revises an existing artifact using its expected_sha256 and complete content.'};
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
  technical:{type:'object',properties:Object.fromEntries(INTERVIEW_BRIEF_TEXT_FIELDS.technical.map(key=>[key,{type:'string'}])),additionalProperties:false,description:'For a local HTTP server with a CLI, use runtimeFamily=api, serviceMode=process, primaryInterface=api, secondaryInterfaces=CLI and the requested cliEntrypoint. A manually started HTTP server still uses process mode. For a standalone command use runtimeFamily=cli. Set childModelProvider and childModelId to none for deterministic code. The host fixes the target, executor, Git isolation and autostart.'},
  design:{type:'object',properties:Object.fromEntries(INTERVIEW_BRIEF_TEXT_FIELDS.design.map(key=>[key,{type:'string'}])),additionalProperties:false,description:'Optional text settings. inputDataTypes is text, e.g. UTF-8 text file, not an array.'},
},required:['identity','goal','user','successCriteria'],additionalProperties:false};
briefSchema.properties.technical.properties.runtimeFamily.enum=[...RUNTIME_FAMILIES];
briefSchema.properties.technical.properties.serviceMode.enum=[...SERVICE_MODES];
briefSchema.properties.technical.properties.preset.enum=['generic','local-feed','llm-app'];
briefSchema.properties.technical.properties.sourceFormat.enum=['json','rss','atom','mixed'];
export const PROVIDER_FACTORY_TOOL={name:'factory_step',description:'Operate only the host-bound child. ALWAYS read status first and continue its saved phase; never restart an existing factory. Prepare private drafts within the requested workflow, then request TWO separate approvals: approve_contract and approve_outcome. After approval, continue research, scaffold, bounded delivery and protected Trials without asking again for technical steps. Accepted documents and budgets stay pinned. No push, deploy, services, credential provisioning or final user acceptance. Never infer document approval from prose or change operation_id to repeat an uncertain action.',inputSchema:{type:'object',properties:{operation_id:{type:'string'},action:{type:'string',enum:actions},artifact:{type:'string',enum:['contract','outcome','research','pattern']},expected_sha256:{type:'string'},content:{type:'string'},brief:{type:'object'},build_token_budget:{type:'integer',minimum:1,maximum:10000000},sources:{type:'object'},selection:{type:'object'},answer:{type:'string'},offset:{type:'integer',minimum:0}},required:['action'],additionalProperties:false}};
const fields={status:[],read_artifact:['artifact','offset'],init:['brief','build_token_budget','build_iteration_budget','build_elapsed_budget_ms'],write_draft:['artifact','expected_sha256','content'],patch_draft:['artifact','expected_sha256','edits','expected_result_sha256'],approve_contract:['expected_sha256'],prepare_product_trial:['expected_sha256','trial'],approve_outcome:['expected_sha256'],research_status:['offset'],research_collect:['sources','retry_failed'],research_recover:['sources'],research_apply:['selection'],configure_build:['effort'],configure_build_model:['model','effort'],delivery_resume:['answer'],delivery_extend:['expected_version','add_tokens','add_iterations','add_elapsed_ms']};
const requiredFields={read_artifact:['artifact'],init:['brief','build_token_budget'],write_draft:['artifact','expected_sha256','content'],patch_draft:['artifact','expected_sha256','edits','expected_result_sha256'],approve_contract:['expected_sha256'],prepare_product_trial:['expected_sha256','trial'],approve_outcome:['expected_sha256'],research_recover:['sources'],research_apply:['selection'],configure_build:['effort'],configure_build_model:['model','effort'],delivery_extend:['expected_version']};
PROVIDER_FACTORY_TOOL.inputSchema.properties.operation_id={type:'string',minLength:8,maxLength:128,pattern:'^[A-Za-z0-9_-]+$',description:'Optional existing operation ID for an exact replay. When omitted, the host derives the ID from this bound task and request.'};
PROVIDER_FACTORY_TOOL.inputSchema.properties.action.description='status returns the saved next step. init creates the first draft from brief and proposed budgets. read_artifact reads it. write_draft revises an existing artifact using artifact, expected_sha256 and complete content. Do not put brief/content inside sources or selection. Those fields belong only to research actions. scaffold_refresh is optional host maintenance for an unchanged, host-generated CLI environment example in an idle existing build; it does not edit product code, approve documents or extend budgets. Use only when Trial diagnostics identify that template.';
PROVIDER_FACTORY_TOOL.inputSchema.properties.answer.description='delivery_resume only: exact operator-selected blocker option ID. A blocked run requires this answer; omitting it cannot resume execution. Leave it absent only for an already-unblocked compatibility continuation.';
PROVIDER_FACTORY_TOOL.inputSchema.properties.brief=briefSchema;
Object.assign(PROVIDER_FACTORY_TOOL.inputSchema.properties,{
  model:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:/+\\-]{0,199}$',description:'configure_build_model only: explicit NeuralDeep builder model. The parent chat and all prior usage remain pinned.'},
  expected_version:{type:'integer',minimum:1,description:'Exact observed delivery ledger version for an approved budget change.'},
  add_tokens:{type:'integer',minimum:0,maximum:10000000},
  add_iterations:{type:'integer',minimum:0,maximum:100},
  add_elapsed_ms:{type:'integer',minimum:0,maximum:86400000},
  trial:{type:'object',additionalProperties:false,properties:{
    cli:{type:'array',minItems:2,maxItems:8,items:{type:'object',additionalProperties:false,required:['argv','covers'],properties:{argv:{type:'array',minItems:2,maxItems:24,items:{type:'string'}},expected_json:{type:'object',additionalProperties:true},expected_exit:{type:'integer',minimum:0,maximum:125},covers:{type:'array',minItems:1,items:{type:'string'}}}}},
    http:{type:'array',minItems:2,maxItems:8,items:{type:'object',additionalProperties:false,required:['argv','port_variable','path','input_json','covers'],properties:{argv:{type:'array',minItems:2,maxItems:2,items:{type:'string'}},port_variable:{type:'string'},path:{type:'string'},input_json:{type:'object',additionalProperties:true},expected_json:{type:'object',additionalProperties:true},expected_status:{type:'integer',minimum:200,maximum:499},covers:{type:'array',minItems:1,items:{type:'string'}}}}},
  },description:'prepare_product_trial only: bounded Node CLI and POST HTTP cases. Include HTTP and every selected CLI surface. argv starts with node and a scripts/*.mjs entrypoint. Use arrays: {http:[{argv,port_variable,path,input_json,expected_json,covers}],cli:[{argv,expected_json,covers}]}. For each interface include at least two distinct successful inputs with different expected JSON plus specified edge cases. Each covers array names only the requiredCoverage IDs tested by that example (read_artifact outcome). expected_status (HTTP 4xx) or expected_exit (CLI nonzero) can test invalid input. Untested criteria retain separate Trials. The verifier also checks that README documents its first-use commands. No test or model runs during preparation.'},
  effort:{type:'string',enum:FACTORY_BUILD_EFFORTS,description:'configure_build only: request a supported build effort for the unchanged bound provider/model. Requires explicit operator approval. Does not change this chat, documents, budgets or recorded usage.'},
  edits:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['from','to'],properties:{from:{type:'string',minLength:1},to:{type:'string'}}},description:'patch_draft only: ordered literal replacements. Each from must occur exactly once at its step; no regex, paths or commands. Accepted artifacts cannot be edited.'},
  expected_result_sha256:{type:'string',pattern:'^[a-f0-9]{64}$',description:'patch_draft only: exact SHA-256 of the complete resulting UTF-8 draft. A mismatch performs no write.'},
  retry_failed:{type:'boolean',description:'research_collect only: retry a confirmed failed source once within its original deadline. Never resets an uncertain operation or its limits.'},
  sources:{type:'object',additionalProperties:{type:'string'},description:'research_collect/research_recover: map exact topic IDs from research_status to HTTPS primary-source URLs (strings). research_recover requires a different allowed URL for every confirmed failed topic; source choices for not-started topics may also be included. Recovery is once per research, with two additional attempts only for failed topics and a fresh five-minute window. History, collected evidence and approvals remain pinned; uncertain dispatches cannot recover.'},
  selection:{type:'object',additionalProperties:false,required:['facts','synthesis'],properties:{
    facts:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,required:['sourceId','topicId','passageId','versionContext','compatibility','compatibilityStatus'],properties:{
      sourceId:{type:'string'},topicId:{type:'string'},passageId:{type:'string',description:'Exact passage ID from research_status; do not supply or invent a quote.'},
      versionContext:{type:'string'},compatibility:{type:'string'},compatibilityStatus:{type:'string',description:'Temporal applicability of the fact, not a decision to adopt a library. Document non-adoption in synthesis.',enum:['compatible','incompatible','unknown']}}}},
    synthesis:{type:'object',additionalProperties:false,required:['relationship','memory_comparison','summary','architecture_decision','alternatives','tradeoffs'],properties:{
      relationship:{type:'string',enum:['confirms','refines','contradicts','makes-outdated']},memory_comparison:{type:'string',minLength:20},summary:{type:'string',minLength:20},architecture_decision:{type:'string',minLength:20},
      alternatives:{type:'array',minItems:1,items:{type:'string'}},tradeoffs:{type:'array',minItems:1,items:{type:'string'}},repository_adoption_recommendation:{type:'string',enum:['proceed','hold','reject']}}},
  },description:'research_apply only: select host-collected passages and explain their relationship to the saved research/pattern. Host computes and locks evidence hashes.'},
  build_iteration_budget:{type:'integer',minimum:1,maximum:100,description:'Proposed build iterations from the operator brief; init does not approve this budget.'},
  build_elapsed_budget_ms:{type:'integer',minimum:60000,maximum:86400000,description:'Proposed build time from delivery start, excluding interview/approval waiting. init does not approve this budget.'},
});
// Per-action tools make required fields visible to providers that struggle
// with the optional fields of the compatibility dispatcher. All routes retain
// the same canonical operation identity, approvals and worker implementation.
const actionTools=Object.fromEntries(actions.map(action=>['factory_'+action,action]));
const actionDescriptions={
  init:'Create the first private Contract draft for the bound child. brief and proposed build_token_budget are REQUIRED; this approves no document or budget.',
  write_draft:'Revise an existing private draft using its exact SHA-256 and complete content. Accepted documents cannot be changed.',
  approve_contract:'Request the separate operator approval for the exact current Contract hash. This accepts no Outcome.',
  approve_outcome:'Request the separate operator approval for the exact current Outcome hash. Contract must already be accepted.',
  create_outcome:'Create an unapproved Outcome draft after the accepted Contract; do not infer its approval.',
  prepare_product_trial:'Prepare a host-template HTTP/CLI product verifier before a child exists and update the exact draft Outcome. Supply its expected_sha256 and trial cases. Review the resulting Outcome and verifier in the separate approve_outcome card. The verifier checks real requests and rejects a scaffold stub; preparation executes nothing.',
  scaffold_plan:'Inspect the exact draft or accepted Contract capability before approval or research. Unsupported interface/runtime combinations cannot be approved. This creates no child or service.',
  patch_draft:'Make up to eight exact literal edits to a still-unapproved Contract or Outcome. Use this for a small correction instead of rewriting the whole document. Requires its current hash and exact resulting hash; ambiguous edits, hash mismatch and accepted artifacts are rejected without writing.',
  configure_build_model:'Request separate explicit approval for the NeuralDeep builder model and effort on the SAME idle, accounted run. Parent chat/provider, accepted documents, verifier and previous usage stay unchanged. This does not grant budget or execute a build.',
  delivery_extend:'Request explicit approval for exact additional budget, then immediately continue the SAME idle, accounted run under one delivery lease. expected_version is required. No previous usage is reset; documents and verifier remain protected.',
  configure_build:'Request explicit operator approval for a supported implementation effort on the SAME provider and model. Use this to repair an unsupported inherited effort without changing the immutable chat binding. No model request, document approval, budget extension or usage reset occurs. Saved uncertain or active builds must be resolved first.',
  delivery_resume:'Resolve the saved delivery blocker and continue the SAME run. answer is REQUIRED: send exactly the operator-selected blocker option ID, such as retry-after-upgrade after runtime repair. Missing or empty answers cannot resolve a blocked run. For an already-unblocked continuation, use compatibility factory_step with action delivery_resume and no answer. Documents and measured budgets remain pinned.',
  status:'Read the exact saved factory phase, identities and artifact statuses; continue existing work instead of restarting.',
  read_artifact:'Read one host-bound artifact and its exact SHA-256. Use this hash for its draft revision or separate approval.',
};
PROVIDER_FACTORY_TOOL.description='Compatibility dispatcher. Prefer the dedicated factory_<action> tool so its required arguments are explicit. Read scaffold_plan before Contract approval. Before approving an API Outcome, use prepare_product_trial with its exact draft hash and declarative HTTP/CLI expected_json cases to prepare its protected product verifier. '+PROVIDER_FACTORY_TOOL.description;
export const PROVIDER_FACTORY_TOOLS=[PROVIDER_FACTORY_TOOL,...Object.entries(actionTools).map(([name,action])=>({
  name,description:actionDescriptions[action] || 'Perform '+action+' only for the bound child. Read factory_status first; existing approval, evidence, identity and measured-budget gates remain mandatory. No acceptance, merge, publication or deployment is implied.',
  inputSchema:{type:'object',properties:Object.fromEntries(['operation_id',...(fields[action] || [])].map(key=>[key,action==='delivery_resume' && key==='answer'?{...PROVIDER_FACTORY_TOOL.inputSchema.properties[key],minLength:1,description:'Exact operator-selected blocker option ID. Required to resolve the saved blocker; do not omit or send an empty string.'}:PROVIDER_FACTORY_TOOL.inputSchema.properties[key]])),required:[...(action==='delivery_resume'?['answer']:requiredFields[action] || [])],additionalProperties:false},
  ...(readonly.has(action)?{annotations:{readOnlyHint:true}}:{}),
}))];
export function normalizeFactoryToolCall(name,input){
  const action=actionTools[name];
  if(action){
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.hasOwn(input,'action'))throw new FactoryActionInputError(action);
    name='factory_step';input={operation_id:input.operation_id,action,...input};
  }
  // These actions have no older receipts with serialized key-order identity.
  // Replay across dedicated/compatibility names; draft edit order is semantic.
  // Keep existing actions' serialized identity unchanged for old saved intents.
  if(name==='factory_step' && ['patch_draft','configure_build','configure_build_model','delivery_extend'].includes(input?.action)){
    const ordered=value=>Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]]));
    input=ordered(input);
    if(Array.isArray(input.edits))input.edits=input.edits.map(edit=>edit && typeof edit==='object' && !Array.isArray(edit)?ordered(edit):edit);
  }
  return {name,input};
}
export class ProviderFactoryTools {
  constructor(host){this.host=host;this.options=host.options;this.paths=voiceFactoryPaths({...this.options,...this.options.factory});if(this.options.factory.target!==this.paths.target)throw factoryFail('factory_binding_changed');}
  state(){return loadVoiceFactory(this.paths,this.options);}
  validate(input){
    if(!input || !actions.includes(input.action) || !/^[A-Za-z0-9_-]{8,128}$/.test(input.operation_id || '') || Object.keys(input).some(key=>!['operation_id','action',...(fields[input.action] || [])].includes(key)) || (requiredFields[input.action] || []).some(key=>input[key]===undefined) || Buffer.byteLength(JSON.stringify(input))>60000)throw new FactoryActionInputError(input?.action,input);
    if(input.retry_failed!==undefined && typeof input.retry_failed!=='boolean')throw factoryFail('factory_input_invalid');
    if(input.answer!==undefined && typeof input.answer!=='string')throw factoryFail('factory_input_invalid');
  }
  async read(input){
    this.validate(input);const state=this.state();
    if(input.action==='status'){
      let deliveryStatus=null,ledger=null;
      if(state?.runId){
        requireFactoryApprovals(this.paths,state);
        let result;
        try{const delivery=await import('../agents-mother/delivery-loop.mjs');result=delivery.deliveryStatus(state.runId,{root:this.paths.root,stateRoot:this.paths.stateRoot});}
        catch{throw factoryFail('factory_delivery_evidence_unavailable');}
        ledger=validateFactoryDelivery(this.paths,state,result).state;deliveryStatus=ledger.status;
      }
      const accepted=deliveryStatus==='accepted',phase=accepted && !state.running && ['awaiting-manual-acceptance','delivery-accepted'].includes(state.phase)?'accepted':state?.phase || 'not-started';
      const modelId=state?.buildConfiguration?.modelId || this.options.factory.model;
      const profile=this.options.connectorId==='neuraldeep'?neuralDeepExecutionProfile(modelId):null;
      return {continuation:nextFactoryAction(state,ledger),workflowBudget:readFactoryBudget({...this.paths,chatId:this.options.chatId,connectorId:this.options.connectorId}),recommendedBuildBudget:FACTORY_STABILITY_BUDGET,
        delivery:ledger?deliveryExplanation(ledger):null,slug:this.paths.slug,target:this.paths.target,revision:state?.revision || 0,phase,running:state?.running || null,
        ...(state?.contract?{scaffoldCapability:scaffoldCapability(contractData(state.contract,{root:this.paths.root}))}:{}),
        artifacts:Object.fromEntries(['contract','outcome','research','pattern'].filter(kind=>state?.[kind]).map(kind=>{const row=factoryArtifact(this.paths,state,kind);return [kind,{sha256:row.sha256,status:row.frontmatter.status}];})),runId:state?.runId || null,deliveryStatus,manualAcceptance:accepted?'accepted':'pending',buildConfiguration:state?.buildConfiguration || null,
        buildExecution:{connectorId:this.options.connectorId,modelId,requestedEffort:state?.buildConfiguration?.effort ?? this.options.factory.effort ?? null,effortControl:profile?.effortControl || 'runtime-defined',supportedEfforts:profile?.effortControl==='documented'?profile.supportedEfforts:null},
        ...(!state?.contract?{nextStep:{action:'init',requiredFields:['brief','build_token_budget'],optionalFields:['build_iteration_budget','build_elapsed_budget_ms'],hint:'Use the structured brief from this task. This creates only a private draft; document and budget approvals remain separate.'}}:{})};
    }
    if(input.action!=='read_artifact')throw factoryFail('factory_input_invalid');
    const row=factoryArtifact(this.paths,state,input.artifact),offset=input.offset ?? 0;
    if(!Number.isSafeInteger(offset) || offset<0)throw factoryFail('factory_input_invalid');
    return {artifact:input.artifact,sha256:row.sha256,...(input.artifact==='outcome'?{requiredCoverage:validateOutcomeSpecText(row.text,{root:this.paths.root}).coverage.map(({id,statement})=>({id,statement}))}:{}),...(input.artifact==='contract'?{scaffoldCapability:scaffoldCapability(contractData(row.file,{root:this.paths.root}))}:{}),...this.host.window(row.text,{offset,length:16000})};
  }
  isRead(input){return readonly.has(input?.action);}
  planContinuation({shadow=false}={}){
    const s=this.state();
    if(!s?.contract || (!shadow && s.continuationProfile!=='api-local-v1'))return null;
    const data=contractData(s.contract,{root:this.paths.root});
    if(!supportsLocalApiContinuation(data))return null;
    if(s.contractApproval){
      requireFactoryApprovals(this.paths,s,{outcome:Boolean(s.outcomeApproval)});
    }
    const ledger=s.runId?validateFactoryDelivery(this.paths,s,deliveryStatus(s.runId,this.paths)).state:null;
    const plan=nextFactoryAction(s,ledger);
    return {...plan,revision:s.revision,...(plan.kind==='step'?{operationId:factoryOperationId(s,plan.action)}:{})};
  }
  continuation(){
    const plan=this.planContinuation();
    return plan?.kind==='step'?{action:plan.action,operation_id:plan.operationId}:null;
  }
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
    if(['approve_contract','approve_outcome','prepare_product_trial','write_draft','patch_draft'].includes(input.action)){
      const kind=['write_draft','patch_draft'].includes(input.action)?input.artifact:input.action==='approve_contract'?'contract':'outcome';
      const row=factoryArtifact(p,state,kind);
      if(!['contract','outcome'].includes(kind) || row.frontmatter.status!=='draft' || input.expected_sha256!==row.sha256)throw factoryFail('factory_draft_changed');
      if(input.action==='write_draft' && (typeof input.content!=='string' || Buffer.byteLength(input.content)>48000))throw factoryFail('factory_input_invalid');
      if(input.action==='patch_draft')patchFactoryDraft(row.text,input);
    }
    if(['create_outcome','approve_outcome','prepare_product_trial'].includes(input.action))requireFactoryApprovals(p,state,{outcome:false});
    if(['research','research_status','research_collect','research_recover','research_apply','scaffold','scaffold_refresh','configure_build','configure_build_model','deliver','delivery_status','delivery_resume','delivery_extend','verify','finish'].includes(input.action))requireFactoryApprovals(p,state);
    const data=state?.contract?contractData(state.contract,{root:p.root}):null;
    if(input.action==='approve_contract')assertScaffoldCapability(data);
    if(input.action==='prepare_product_trial')validateProductTrial(input.trial,data);
    const trialInputs=input.action==='approve_outcome'?reviewProductTrials(p,factoryArtifact(p,state,'outcome'),data):null;
    if(input.action==='deliver')reviewProductTrials(p,factoryArtifact(p,state,'outcome'),data,{includeInputs:false});
    if(['configure_build','configure_build_model'].includes(input.action)){
      const model=input.action==='configure_build_model'?input.model:state.buildConfiguration?.modelId || this.options.factory.model;
      if(input.action==='configure_build_model' && this.options.connectorId!=='neuraldeep')throw factoryFail('factory_build_model_unsupported');
      if(typeof model!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(model))throw factoryFail('factory_input_invalid');
      validateFactoryBuildEffort(this.options.connectorId,model,input.effort);
    }
    let budgetReview;
    if(input.action==='delivery_extend'){
      const current=validateFactoryDelivery(p,state,deliveryStatus(state.runId,{root:p.root,stateRoot:p.stateRoot})).state;
      if(current.status!=='blocked' || current.blockers.length!==1 || !['token_budget_exhausted','iteration_budget_exhausted','elapsed_budget_exhausted'].includes(current.blockers[0].code) || current.version!==input.expected_version || current.budget.legacy_usage_unverified!==false || current.budget.unaccounted_attempts.length)throw factoryFail('factory_budget_context_changed');
      const additions={tokens:input.add_tokens ?? 0,iterations:input.add_iterations ?? 0,elapsed_ms:input.add_elapsed_ms ?? 0};
      const shared=readFactoryBudget({...p,chatId:this.options.chatId,connectorId:this.options.connectorId});
      for(const [key,max] of [['tokens',10000000],['iterations',100],['elapsed_ms',86400000]])if(!Number.isSafeInteger(additions[key]) || additions[key]<0 || additions[key]>max)throw factoryFail('factory_input_invalid');
      if(!Object.values(additions).some(Boolean))throw factoryFail('factory_input_invalid');
      if(current.budget.max_tokens+additions.tokens<=current.budget.tokens_used || current.budget.max_iterations+additions.iterations<=current.iteration
        || (!additions.elapsed_ms && Date.now()-Date.parse(current.created_at)>=current.budget.max_elapsed_ms))throw factoryFail('factory_budget_insufficient');
      budgetReview={sharedLimits:{tokens:shared.maxTokens+additions.tokens,activeMs:shared.maxActiveMs+additions.elapsed_ms},proposedLimits:{tokens:current.budget.max_tokens+additions.tokens,iterations:current.budget.max_iterations+additions.iterations,freshWindowMs:additions.elapsed_ms},runId:state.runId,expectedVersion:current.version,tokensUsed:current.budget.tokens_used,iterationsUsed:current.iteration,additions,previousLimits:{tokens:current.budget.max_tokens,iterations:current.budget.max_iterations,elapsedMs:current.budget.max_elapsed_ms},approvalScope:'exact additions to the build and shared workflow limits and immediate continuation only; previous usage and accepted artifacts remain unchanged'};
    }
    const reviewKind=input.action==='approve_contract'?'contract':input.action==='approve_outcome'?'outcome':null;
    const review=reviewKind?factoryArtifact(p,state,reviewKind):null;
    const automaticContinuation=reviewKind==='contract' && this.host.driveEnabled() && supportsLocalApiContinuation(data);
    const presentation=review?{path:reviewKind+' · '+p.slug,approvalScope:reviewKind+' only',
      ...(automaticContinuation?{automaticContinuation:true}:{}),
      overview:reviewKind==='contract'?{name:data.agentName,mission:data.primaryMission,interfaces:scaffoldCapability(data).interfaces,scope:data.targetFolder,
        budgetMode:this.options.connectorId==='codex'?'native-goal':'request-reservation',permissions:data.userAuthorizationModel || '',secrets:data.secretsRequired || '',tokens:data.buildTokenBudget,iterations:data.buildIterationBudget,elapsedMs:data.buildElapsedBudgetMs}
        :{name:data.agentName,criteria:data.successCriteria,examples:trialInputs?.[0]?.path==='verification/product.mjs'?productExamples(trialInputs[0].content):[]},

      ...(reviewKind==='contract'?{scaffoldCapability:scaffoldCapability(data),buildProvider:this.options.connectorId,buildModel:this.options.factory.model,childModelProvider:data.childModelProvider,childModelId:data.childModelId}:{}),
      ...(trialInputs?.length?{trialInputs}:{}),
      beforeSha256:review.sha256,proposedContent:review.text,
    }
      :{command:['Pritha factory',input.action,p.slug,...(input.action==='configure_build'?['--effort',input.effort]:[])],cwdLabel:'Bound child and instance-private factory artifacts',provider:this.options.connectorId,model:this.options.factory.model,...(this.options.connectorId==='claude' && input.action.startsWith('deliver')?{buildAuthentication:'separate Anthropic API key; host-reserved budget'}:{}),network:input.action==='configure_build_model'?'provider model metadata only; no model inference':['research','research_collect','research_recover'].includes(input.action)?this.options.connectorId==='local'?'disabled':'bounded primary-source research':input.action.startsWith('deliver')?'pinned build provider only':'disabled',
        ...(input.action==='configure_build_model'?{previousBuildModel:state.buildConfiguration?.modelId || this.options.factory.model,proposedBuildModel:input.model,proposedBuildEffort:input.effort,approvalScope:'builder model and effort only; same provider, parent chat, documents and budgets'}:{}),...(budgetReview?{budgetReview}:{}),...(input.action==='init'?{brief:input.brief,proposedBuildTokenBudget:input.build_token_budget,...(input.build_iteration_budget!==undefined?{proposedBuildIterationBudget:input.build_iteration_budget}:{}),...(input.build_elapsed_budget_ms!==undefined?{proposedBuildElapsedBudgetMs:input.build_elapsed_budget_ms}:{})}:{}),...(input.action==='configure_build'?{previousBuildEffort:state.buildConfiguration?.effort || this.options.factory.effort || null,proposedBuildEffort:input.effort,approvalScope:'build effort only; same provider/model, documents and budgets'}:{}),...(input.action==='write_draft'?{artifact:input.artifact,beforeSha256:input.expected_sha256,proposedContent:input.content}:{}),...(input.action==='patch_draft'?{artifact:input.artifact,beforeSha256:input.expected_sha256,expectedResultSha256:input.expected_result_sha256,edits:input.edits}:{}),...(input.sources?{sources:input.sources}:{}),...(input.selection?{selection:input.selection}:{}),...(input.answer?{answer:input.answer}:{})};
    if(Buffer.byteLength(JSON.stringify(presentation))>60000)throw factoryFail('factory_review_too_large');
    return {kind:review?'file_change_approval':'command_approval',presentation,perform:()=>this.execute(input,state,automaticContinuation)};
  }
  async execute(input,expected,automaticContinuation=false){
    this.host.check();const p=this.paths,o=this.options;
    // A decision is tied to the same complete context, not merely its slug.
    this.prepare(input);if(factoryHash(this.state())!==factoryHash(expected))throw factoryFail('factory_context_changed');
    privateStateDirectory(p.stateRoot,p.directory);
    const state=expected || {schema:'pritha-voice-factory-v1',slug:p.slug,chatId:o.chatId,connectorId:o.connectorId,stateRoot:p.stateRoot,target:p.target,phase:'draft',revision:0};
    const work=privateStateDirectory(p.stateRoot,path.join(p.directory,'operations',randomUUID()));
    const requestFile=privateStateFile(p.stateRoot,path.join(work,'request.json')),resultFile=path.join(work,'result.json');
    const previous=fs.existsSync(p.file)?factoryRead(p.file,p.directory):null;
    if(factoryHash(previous?JSON.parse(previous):null)!==factoryHash(expected))throw factoryFail('factory_context_changed');
    const next={...state,revision:state.revision+1,running:{operationId:input.operation_id,action:input.action,turnId:o.turnId}};
    atomicCompareAndSwapFile(p.file,previous,JSON.stringify(next));
    atomicWriteFile(requestFile,JSON.stringify({version:1,root:p.root,stateRoot:p.stateRoot,agentParent:p.parent,slug:p.slug,chatId:o.chatId,connectorId:o.connectorId,model:o.factory.model,effort:o.factory.effort,preset:o.factory.preset,factoryParent:{owner:o.lease.owner,generation:o.lease.generation,chatId:o.chatId,turnId:o.turnId,operationId:input.operation_id,target:p.target},state:next,input,resultFile,...(automaticContinuation?{automaticContinuation:true}:{})}));
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
      timer=setTimeout(()=>{reason='factory_step_timeout';owned.stop();},['deliver','delivery_resume','delivery_extend','verify'].includes(input.action)?3600000:600000);
      const drain=async stream=>{for await(const chunk of stream){bytes+=chunk.length;if(bytes>8*1024*1024){reason='factory_output_limit';owned.stop();break;}buffers.push(chunk);}};
      owned.child.stdin.end();const [done]=await Promise.all([owned.completion,drain(owned.child.stdout),drain(owned.child.stderr)]);exited=done.processTreeExited===true;
      if(!exited){this.host.exitConfirmed=false;throw factoryFail('factory_process_exit_unconfirmed');}
      if(reason)throw factoryFail(reason);
      const result=JSON.parse(factoryRead(resultFile,work,500000));
      if(result.version!==1 || result.operationId!==input.operation_id || !result.state || result.state.revision!==next.revision)throw factoryFail('factory_result_invalid');
      // The worker owns only this bound context; a lost result keeps running set.
      const saved=validateVoiceFactory(p,{...result.state,running:null,...(state.continuationProfile?{continuationPause:result.ok?(input.action==='research_status'||input.action==='delivery_status'?state.continuationPause:null):input.action}: {})},o);atomicWriteFile(p.file,JSON.stringify(saved));
      if(result.ok && !['research_status','delivery_status','scaffold_plan'].includes(input.action)){
        const budget=new FactoryBudget({...p,chatId:o.chatId,connectorId:o.connectorId});
        await budget.progress(JSON.stringify([saved.phase,...['contract','outcome','research','pattern'].filter(kind=>saved[kind]).map(kind=>factoryArtifact(p,saved,kind).sha256)]));
      }
      return {status:result.ok?'completed':'failed',exitCode:done.code,output:JSON.stringify({ok:result.ok,...result.value,diagnostic:result.diagnostic || undefined,phase:saved.phase,manualAcceptance:result.value?.manualAcceptance || 'pending'})};
    }catch(error){
      owned?.stop();if(owned)exited=(await owned.completion).processTreeExited===true;else exited=error.processTreeExited!==false;
      if(!exited)this.host.exitConfirmed=false;throw error;
    }finally{clearTimeout(timer);o.signal?.removeEventListener('abort',stop);if(owned)this.host.commands.delete(owned);if(exited)fs.rmSync(temporary,{recursive:true,force:true});}
  }
}
