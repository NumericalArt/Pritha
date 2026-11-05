import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {ProviderHostTools} from '../scripts/lib/provider-host-tools.mjs';
import {factoryBriefErrorDetail} from '../scripts/lib/provider-factory-tools.mjs';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {voiceFactoryPaths,loadVoiceFactory,factoryArtifact,factoryHash,readFactoryConversation,patchFactoryDraft,validateFactoryBuildEffort} from '../scripts/agents-mother/voice-factory-state.mjs';
import {executeVoiceFactoryStep} from '../scripts/agents-mother/voice-factory-worker.mjs';
import {privateAgentArtifactReference} from '../scripts/lib/authored-agent-memory.mjs';
import {listenProviderToolServer} from '../scripts/lib/provider-tool-server.mjs';
import {contractData} from '../scripts/agents-mother/contract.mjs';
import {validateOutcomeSpecText} from '../scripts/agents-mother/outcome-spec.mjs';
import {preparedTrialInputFiles} from '../scripts/agents-mother/prepared-trial-inputs.mjs';
import {createDeliveryLedger,updateDeliveryLedger} from '../scripts/agents-mother/delivery-ledger.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const brief={identity:{name:'Voice Built',slug:'voice-built'},goal:'Read a supplied text file and count its lines.',user:'The local operator',successCriteria:['The CLI returns the exact line count and handles a missing file with an error.'],coreFunctions:['Count lines in a supplied local file'],workflows:['Choose a file; run the CLI; inspect its count'],nonGoals:['No network, deployment or automatic services'],permissions:{network:['none'],filesystem:['Only the operator-selected file and child workspace']},technical:{runtimeFamily:'cli',primaryInterface:'CLI',serviceMode:'none',repositoryResearchPolicy:'not-applicable',repositoryAdoptionMode:'none',repositoryResearchWaiverReason:'A deterministic local line counter needs no third-party repository.'}};
function fixture(t){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-voice-factory-'))),stateRoot=path.join(directory,'state'),agentParent=path.join(directory,'children');fs.mkdirSync(stateRoot);fs.mkdirSync(agentParent);
  const coordinator=new ExecutionCoordinator({stateRoot,directory:path.join(stateRoot,'codex-chat','execution')}),lease=coordinator.claim(['fixture'],'factory-fixture',{kind:'turn',detail:{chatId:'chat_factory',connectorId:'claude'}}),controller=new AbortController(),approvals=[],proofs=[];
  const p=voiceFactoryPaths({root,stateRoot,agentParent,slug:'voice-built'});coordinator.extend(lease.owner,lease.generation,['workspace:'+p.target]);
  const options={root,cwd:root,stateRoot,privateRoot:path.join(stateRoot,'claude'),connectorId:'claude',coordinator,lease,chatId:'chat_factory',turnId:'turn_factory',signal:controller.signal,sandbox:'read-only',factory:{slug:p.slug,target:p.target,agentParent,model:'claude-sonnet-5-5',preset:{authMode:'api-key'}},approve:async value=>{approvals.push(value);return {decision:'accept'};},onProcessEvidence:(id,proof)=>proofs.push({id,proof})};
  const tools=new ProviderHostTools(options);let sequence=0;
  const call=async(action,extra={})=>{const response=await tools.call('factory_step',{operation_id:'factory_step_'+String(++sequence).padStart(4,'0'),action,...extra});return JSON.parse(response.content[0].text);};
  const ok=async(action,extra={})=>{const row=await call(action,extra);assert.equal(row.status,'completed',row.text);return JSON.parse(row.text);};
  t.after(async()=>{controller.abort();await tools.close();lease.release();coordinator.close();fs.rmSync(directory,{recursive:true,force:true});});
  return {tools,options,p,coordinator,lease,controller,approvals,proofs,call,ok,state:()=>loadVoiceFactory(p,options),artifact:kind=>factoryArtifact(p,loadVoiceFactory(p,options),kind)};
}
test('factory conversation lookup reads the exact host binding and rejects damaged or foreign state',async t=>{
  const f=fixture(t),options={root,stateRoot:f.p.stateRoot,agentParent:f.p.parent,slug:f.p.slug};
  assert.equal(readFactoryConversation(options),null);await f.ok('init',{brief,build_token_budget:10000});
  const original=fs.readFileSync(f.p.file,'utf8'),state=JSON.parse(original);
  assert.equal(readFactoryConversation(options).chatId,f.options.chatId);assert.equal(fs.readFileSync(f.p.file,'utf8'),original);
  for(const invalid of ['null','{',JSON.stringify({...state,stateRoot:path.dirname(f.p.stateRoot)}),JSON.stringify({...state,target:path.dirname(f.p.target)})]){
    fs.writeFileSync(f.p.file,invalid);assert.throws(()=>readFactoryConversation(options),{code:'factory_binding_changed'});
  }
  fs.writeFileSync(f.p.file,original);const regular=path.join(f.p.directory,'regular-state.json');fs.renameSync(f.p.file,regular);fs.symlinkSync(regular,f.p.file);
  assert.throws(()=>readFactoryConversation(options),{code:'factory_artifact_boundary'});assert.equal(fs.existsSync(f.p.target),false);
});
test('dedicated drafting tools require brief/content and retain the canonical operation and approval boundary',{timeout:60000},async t=>{
  const f=fixture(t),init=f.tools.definitions.find(t=>t.name==='factory_init'),write=f.tools.definitions.find(t=>t.name==='factory_write_draft');
  assert.deepEqual(init.inputSchema.required,['operation_id','brief','build_token_budget']);assert.equal(init.inputSchema.properties.sources,undefined);
  assert.deepEqual(write.inputSchema.required,['operation_id','artifact','expected_sha256','content']);
  await assert.rejects(f.tools.call('factory_init',{operation_id:'draft-init-01',action:'approve_contract',brief,build_token_budget:40000}),{code:'factory_input_invalid'});
  assert.equal(f.state(),null);
  const input={operation_id:'draft-init-01',brief,build_token_budget:40000};
  const first=await f.tools.call('factory_init',input);assert.equal(JSON.parse(first.content[0].text).status,'completed');
  const revision=f.state().revision;
  await f.tools.call('factory_step',{operation_id:input.operation_id,action:'init',brief,build_token_budget:40000});
  assert.equal(f.state().revision,revision);assert.equal(f.approvals.length,0);assert.equal(fs.existsSync(f.p.target),false);
  const contract=f.artifact('contract');const changed=await f.tools.call('factory_write_draft',{operation_id:'draft-write-01',artifact:'contract',expected_sha256:contract.sha256,content:contract.text+'\nReviewed draft.\n'});
  assert.equal(JSON.parse(changed.content[0].text).status,'completed');assert.equal(f.approvals.length,0);assert.equal(f.state().contractApproval,undefined);
});
test('the actual MCP brief schema rejects a design array before approval and a corrected retry creates only a private draft',{timeout:60000},async t=>{
  const f=fixture(t),server=await listenProviderToolServer({hostTools:f.tools});t.after(()=>server.close());
  let id=0;const post=async(method,params)=>(await(await fetch(server.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+server.token},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})})).json()).result;
  const schema=(await post('tools/list')).tools.find(row=>row.name==='factory_step').inputSchema.properties.brief;
  assert.equal(schema.properties.design.properties.inputDataTypes.type,'string');
  const tool=(await post('tools/list')).tools.find(row=>row.name==='factory_step').inputSchema;
  const status=JSON.parse((await post('tools/call',{name:'factory_step',arguments:{operation_id:'check-start-status',action:'status'}})).content[0].text);
  assert.equal(status.nextStep.action,'init');assert.deepEqual(status.nextStep.requiredFields,['brief','build_token_budget']);
  const wrongAction=await post('tools/call',{name:'factory_step',arguments:{operation_id:'incorrect-draft-call',action:'write_draft',sources:{brief:'synthetic'},selection:{}}});
  const guidance=JSON.parse(wrongAction.content[0].text);assert.equal(guidance.error,'factory_input_invalid');assert.deepEqual(guidance.requiredFields,['operation_id','action','artifact','expected_sha256','content']);assert.match(guidance.hint,/init with brief/);
  const shortId=await post('tools/call',{name:'factory_step',arguments:{operation_id:'draft1',action:'init',brief,build_token_budget:40000}});
  assert.match(JSON.parse(shortId.content[0].text).hint,/8–128/);assert.equal(f.state(),null);assert.equal(f.approvals.length,0);
  assert.equal(tool.properties.sources.additionalProperties.type,'string');
  assert.equal(tool.properties.selection.properties.facts.items.properties.passageId.type,'string');
  for(const malformed of [{retry_failed:'yes'},{sources:{'declared-dependencies':['https://nodejs.org/api/fs.html']}}]){
    const invalid=await post('tools/call',{name:'factory_step',arguments:{operation_id:'invalid_research_shape',action:'research_collect',...malformed}});
    assert.equal(invalid.isError,true);assert.equal(f.state(),null);assert.equal(f.approvals.length,0);
  }
  assert.ok(schema.properties.technical.properties.runtimeFamily.enum.includes('cli'));assert.ok(!schema.properties.technical.properties.runtimeFamily.enum.includes('node'));
  assert.deepEqual(schema.properties.technical.properties.preset.enum,['generic','local-feed','llm-app']);
  const incomplete=await post('tools/call',{name:'factory_step',arguments:{operation_id:'init-invalid-preset',action:'init',brief:{...brief,technical:{...brief.technical,preset:'PRIVATE_INVALID_PRESET'}},build_token_budget:40000}});
  assert.deepEqual(JSON.parse(incomplete.content[0].text),{error:'factory_brief_incomplete',issues:['Interview brief preset must be generic, local-feed, or llm-app']});
  assert.equal(f.state(),null);assert.equal(f.approvals.length,0);
  const input={operation_id:'init-design-retry',action:'init',brief:{...structuredClone(brief),design:{inputDataTypes:['UTF-8 text file']}},build_token_budget:40000,build_iteration_budget:2,build_elapsed_budget_ms:1800000};
  const rejected=await post('tools/call',{name:'factory_step',arguments:input});assert.equal(rejected.isError,true);
  assert.deepEqual(JSON.parse(rejected.content[0].text),{error:'factory_brief_text_required',field:'brief.design.inputDataTypes',expected:'string'});
  assert.equal(f.approvals.length,0);assert.equal(f.state(),null);assert.equal(f.coordinator.getIntent('provider-tool:turn_factory:init-design-retry'),null);
  input.brief.design.inputDataTypes='UTF-8 text file';
  const invalidRuntime=await post('tools/call',{name:'factory_step',arguments:{...input,brief:{...input.brief,technical:{...input.brief.technical,runtimeFamily:'node'}}}});
  assert.equal(invalidRuntime.content[0].text,'factory_runtime_family_invalid');assert.equal(f.approvals.length,0);assert.equal(f.state(),null);
  for(const change of [{build_iteration_budget:0},{build_elapsed_budget_ms:59999}]){
    const bad=await post('tools/call',{name:'factory_step',arguments:{...input,...change}});assert.equal(bad.content[0].text,'factory_budget_invalid');assert.equal(f.approvals.length,0);assert.equal(f.state(),null);
  }
  const corrected=await post('tools/call',{name:'factory_step',arguments:input});assert.equal(corrected.isError,false);
  const receipt=JSON.parse(corrected.content[0].text);assert.equal(receipt.status,'completed');assert.equal(JSON.parse(receipt.text).phase,'contract-draft');
  assert.equal(f.approvals.length,0);assert.equal(f.artifact('contract').frontmatter.status,'draft');assert.equal(fs.existsSync(f.p.target),false);assert.equal(f.state().contractApproval,undefined);assert.equal(f.state().outcomeApproval,undefined);
  const data=contractData(f.artifact('contract').file,{root});assert.equal(data.buildIterationBudget,2);assert.equal(data.buildElapsedBudgetMs,1800000);assert.equal(data.buildTokenBudget,40000);assert.equal(data.repeatedFailureThreshold,2);assert.equal(data.buildTokenBudgetConfirmation,'pending');
});
test('real factory worker writes only private drafts, keeps two approvals separate and detects stale review',{timeout:60000},async t=>{
  const f=fixture(t);assert.equal((await f.call('status')).phase,'not-started');
  await assert.rejects(f.call('init',{brief,build_token_budget:0}),{code:'factory_budget_required'});await assert.rejects(f.call('init',{brief:{},build_token_budget:10000}),{code:'factory_brief_incomplete'});assert.equal(f.state(),null);
  const init=await f.ok('init',{brief,build_token_budget:10000});assert.equal(init.phase,'contract-draft');assert.ok(f.proofs.length);assert.equal(fs.existsSync(f.p.target),false);
  const contract=f.artifact('contract');assert.ok(contract.file.startsWith(path.join(f.p.stateRoot,'agents','contracts')));assert.equal(contract.frontmatter.status,'draft');
  const references={root,memoryRoot:f.p.memory},relative=path.relative(root,contract.file);assert.equal(privateAgentArtifactReference(relative,references),relative);
  assert.equal(privateAgentArtifactReference(contract.file,references),null);assert.equal(privateAgentArtifactReference('AGENTS.md',references),null);assert.equal(privateAgentArtifactReference(relative+'-missing',references),null);
  const alias=path.join(f.p.memory,'contracts','alias.md');fs.symlinkSync(contract.file,alias);assert.equal(privateAgentArtifactReference(path.relative(root,alias),references),null);fs.rmSync(alias);
  await assert.rejects(f.call('create_outcome'),{code:'factory_contract_approval_required'});
  await assert.rejects(f.call('write_draft',{artifact:'contract',expected_sha256:'0'.repeat(64),content:contract.text}),{code:'factory_draft_changed'});
  const original=f.options.approve;f.options.approve=async review=>{assert.equal(review.presentation.proposedContent,contract.text);fs.appendFileSync(contract.file,'\nConcurrent edit\n');return {decision:'accept'};};
  assert.equal((await f.call('approve_contract',{expected_sha256:contract.sha256})).text,'factory_draft_changed');f.options.approve=original;
  const fresh=f.artifact('contract');await f.ok('approve_contract',{expected_sha256:fresh.sha256});
  assert.equal(f.state().outcomeApproval,undefined);assert.equal(f.artifact('contract').frontmatter.status,'accepted');
  await f.ok('create_outcome');const outcome=f.artifact('outcome');assert.equal(outcome.frontmatter.status,'draft');
  await assert.rejects(f.call('scaffold'),{code:'factory_outcome_approval_required'});
  await f.ok('approve_outcome',{expected_sha256:outcome.sha256});assert.equal(f.artifact('outcome').frontmatter.status,'approved');
  assert.equal(f.approvals.filter(row=>row.kind==='file_change_approval').length,2);assert.notEqual(f.state().contractApproval.operationId,f.state().outcomeApproval.operationId);
  assert.equal(fs.existsSync(f.p.target),false);
  const before=f.state().revision,approvedContract=f.artifact('contract'),approvedOutcome=f.artifact('outcome');
  // Different operation IDs and a resumed turn must reuse exact accepted reviews.
  f.options.approve=()=>{throw new Error('already-approved document was asked again');};
  await f.ok('approve_contract',{expected_sha256:fresh.sha256});
  await f.ok('approve_contract',{expected_sha256:approvedContract.sha256});
  await f.ok('approve_outcome',{expected_sha256:outcome.sha256});
  await f.ok('approve_outcome',{expected_sha256:approvedOutcome.sha256});
  assert.equal(f.state().revision,before);assert.equal(f.approvals.length,2);
  await assert.rejects(f.call('approve_contract',{expected_sha256:'0'.repeat(64)}),{code:'factory_draft_changed'});
  const gate=await f.call('scaffold');assert.equal(gate.status,'failed');assert.equal(fs.existsSync(f.p.target),false);
  const memory=path.join(f.p.stateRoot,'memory');fs.mkdirSync(memory,{recursive:true});execFileSync('sqlite3',[path.join(memory,'pritha.sqlite')],{input:fs.readFileSync(path.join(root,'.memory/schema.sql'),'utf8')});
  await f.ok('research');assert.ok(f.artifact('research').sha256);assert.ok(f.artifact('pattern').sha256);assert.equal((await f.ok('research_status')).ok,true);
  const recovery=await f.call('research_recover',{sources:{'declared-dependencies':'https://nodejs.org/docs/latest-v24.x/api/fs.html'}});
  assert.equal(recovery.status,'failed');assert.equal(JSON.parse(recovery.text).error,'research_checkpoint_missing');assert.equal(f.approvals.length,2);
});
test('factory approves prepared Trial inputs before a child exists and refuses changed or symlinked inputs',{timeout:60000},async t=>{
  const f=fixture(t);await f.ok('init',{brief,build_token_budget:10000});await f.ok('approve_contract',{expected_sha256:f.artifact('contract').sha256});await f.ok('create_outcome');
  const outcome=f.artifact('outcome'),coverage=validateOutcomeSpecText(outcome.text,{root}).coverage.map(row=>'- Covers: '+row.id).join('\n');
  const inputRoot=path.join(f.p.directory,'trial-inputs'),file='verification/check-result.mjs',content="import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const r=spawnSync(process.execPath,['scripts/agent-cli.mjs','--help'],{encoding:'utf8'});assert.equal(r.status,0);assert.match(r.stdout,/count/);\n";
  const hash='sha256:'+factoryHash(content),trial='## Trials\n\n### Trial: independent-result\n\n- Statement: The independent verifier checks the CLI result.\n- Kind: automated\n'+coverage+'\n- Isolation: none\n- When argv: ["node", "verification/check-result.mjs"]\n- When cwd: .\n- Then exit code: 0\n- Product target: scripts/agent-cli.mjs\n- Verifier input: '+file+' :: '+hash+' :: host-reviewed:factory-result-v1\n- Timeout ms: 10000\n\n';
  for(const unsafe of [outcome.text+'\npassword: synthetic-private-value\n',outcome.text.replace('- Then exit code: 0','- Then exit code: synthetic-private-value')]){
    assert.equal(JSON.parse((await f.call('write_draft',{artifact:'outcome',expected_sha256:outcome.sha256,content:unsafe})).text).error,'factory_draft_unsafe');
    assert.equal(f.artifact('outcome').sha256,outcome.sha256);
  }
  await f.ok('write_draft',{artifact:'outcome',expected_sha256:outcome.sha256,content:outcome.text.replace(/## Trials\n[\s\S]*?(?=## Demo script)/,trial)});
  const draft=f.artifact('outcome');
  assert.equal((await f.call('approve_outcome',{expected_sha256:draft.sha256})).status,'failed');assert.equal(f.state().outcomeApproval,undefined);assert.equal(fs.existsSync(f.p.target),false);
  fs.mkdirSync(path.dirname(path.join(inputRoot,file)),{recursive:true});fs.writeFileSync(path.join(inputRoot,file),content);
  await f.ok('approve_outcome',{expected_sha256:draft.sha256});assert.equal(f.state().phase,'outcome-approved');assert.equal(fs.existsSync(f.p.target),false);
  const plan={trials:validateOutcomeSpecText(f.artifact('outcome').text,{root}).parsed.trials};
  assert.equal(preparedTrialInputFiles(plan,inputRoot)[0].content.toString(),content);
  fs.writeFileSync(path.join(inputRoot,file),content+'// changed\n');assert.throws(()=>preparedTrialInputFiles(plan,inputRoot),{code:'trial_input_provenance_mismatch'});
  fs.unlinkSync(path.join(inputRoot,file));const other=path.join(f.p.directory,'other.mjs');fs.writeFileSync(other,content);fs.symlinkSync(other,path.join(inputRoot,file));
  assert.throws(()=>preparedTrialInputFiles(plan,inputRoot),{code:'trial_input_invalid'});
});
test('Stop during owned factory startup proves exit and preserves the uncertain step fence',{timeout:20000},async t=>{
  const f=fixture(t);f.options.onProcessEvidence=()=>f.controller.abort();const result=await f.call('init',{brief,build_token_budget:10000});
  assert.equal(result.status,'failed');assert.equal(result.text,'operator_cancel');assert.equal((await f.tools.close()).processTreeExited,true);assert.equal(f.state().running.action,'init');assert.equal(f.tools.commands.size,0);
});
test('factory refusal/replay, immutable identity, foreign artifacts and unknown steps never authorize another action',{timeout:60000},async t=>{
  const f=fixture(t),input={operation_id:'factory_init_once',action:'init',brief,build_token_budget:10000};
  const first=await f.tools.call('factory_step',input);assert.equal(JSON.parse(first.content[0].text).status,'completed');
  await f.tools.call('factory_step',input);assert.equal(f.approvals.length,0);
  const contract=f.artifact('contract');
  const changed=contract.text.replace('- Build executor: claude-code','- Build executor: manual');
  assert.notEqual(changed,contract.text);assert.equal((await f.call('write_draft',{artifact:'contract',expected_sha256:contract.sha256,content:changed})).status,'failed');assert.equal(f.artifact('contract').sha256,contract.sha256);
  f.options.approve=async()=>({decision:'decline'});assert.equal((await f.call('approve_contract',{expected_sha256:contract.sha256})).status,'declined');assert.equal(f.state().contractApproval,undefined);
  await assert.rejects(f.call('write_draft',{artifact:'contract',expected_sha256:contract.sha256,content:contract.text,target:'/tmp/escape'}),{code:'factory_input_invalid'});
  await assert.rejects(f.tools.call('write_file',{operation_id:'normal_write_nope',path:'new-agent.md',expected_sha256:null,content:'bypass'}),{code:'provider_tool_write_denied'});
  const saved=f.state();fs.writeFileSync(f.p.file,JSON.stringify({...saved,contract:'/tmp/foreign.md'}));assert.throws(()=>f.state(),{code:'factory_artifact_boundary'});
  fs.writeFileSync(f.p.file,JSON.stringify({...saved,running:{operationId:'lost-operation',action:'init'}}));await assert.rejects(f.call('approve_contract',{expected_sha256:contract.sha256}),{code:'factory_step_unconfirmed'});
  fs.writeFileSync(f.p.file,JSON.stringify({...saved,chatId:'another-chat'}));assert.throws(()=>f.state(),{code:'factory_binding_changed'});
});
test('build effort repair requires its own operator decision and preserves the immutable chat and approved documents',{timeout:60000},async t=>{
  const f=fixture(t);await assert.rejects(f.call('configure_build',{effort:'high'}),{code:'factory_not_started'});
  await f.ok('init',{brief,build_token_budget:10000});await f.ok('approve_contract',{expected_sha256:f.artifact('contract').sha256});await f.ok('create_outcome');await f.ok('approve_outcome',{expected_sha256:f.artifact('outcome').sha256});
  const contract=f.artifact('contract').sha256,outcome=f.artifact('outcome').sha256,binding=JSON.stringify(f.options.factory),approve=f.options.approve;
  let declined=0;f.options.approve=async request=>{declined++;assert.equal(request.kind,'command_approval');assert.equal(request.presentation.proposedBuildEffort,'high');return {decision:'decline'};};
  assert.equal((await f.call('configure_build',{effort:'high'})).status,'declined');assert.equal(declined,1);assert.equal(f.state().buildConfiguration,undefined);
  f.options.approve=approve;const approvals=f.approvals.length;
  await f.ok('configure_build',{effort:'high'});assert.equal(f.approvals.length,approvals+1);
  const config=f.state().buildConfiguration;assert.equal(config.effort,'high');assert.equal(config.modelId,f.options.factory.model);assert.equal(config.approvedBy,'user');
  const observed=await f.call('status');assert.deepEqual(observed.buildConfiguration,config);assert.equal(observed.buildExecution.requestedEffort,'high');assert.equal(observed.buildExecution.modelId,f.options.factory.model);assert.equal(JSON.stringify(f.options.factory),binding);
  const state=fs.readFileSync(f.p.file,'utf8');
  await f.tools.call('factory_configure_build',{effort:'high',operation_id:config.operationId});
  assert.equal(f.approvals.length,approvals+1);assert.equal(fs.readFileSync(f.p.file,'utf8'),state);
  await assert.rejects(f.call('configure_build',{effort:'turbo'}),{code:'factory_input_invalid'});
  await assert.rejects(f.call('configure_build',{effort:'high',model:'different-model'}),{code:'factory_input_invalid'});
  assert.equal(f.artifact('contract').sha256,contract);assert.equal(f.artifact('outcome').sha256,outcome);
});
test('NeuralDeep build effort repair validates support before any provider request',()=>{
  assert.doesNotThrow(()=>validateFactoryBuildEffort('neuraldeep','gpt-oss-120b','high'));
  assert.throws(()=>validateFactoryBuildEffort('neuraldeep','gpt-oss-120b','xhigh'),error=>{assert.deepEqual(factoryBriefErrorDetail(error).supportedEfforts,['low','medium','high']);return error.code==='factory_build_effort_unsupported';});
  assert.throws(()=>validateFactoryBuildEffort('neuraldeep','gpt-oss-120b',{}),{code:'factory_input_invalid'});
});
test('approved build effort persists into the same resumed run and cannot replace active or uncertain execution',{timeout:60000},async t=>{
  const f=fixture(t);await f.ok('init',{brief,build_token_budget:10000});await f.ok('approve_contract',{expected_sha256:f.artifact('contract').sha256});await f.ok('create_outcome');await f.ok('approve_outcome',{expected_sha256:f.artifact('outcome').sha256});
  const runId='voice-fixture-build-repair',spec=f.artifact('outcome').frontmatter,contract=f.artifact('contract').sha256,outcome=f.artifact('outcome').sha256;
  fs.writeFileSync(f.p.file,JSON.stringify({...f.state(),phase:'delivery-blocked',runId}));
  const budget={max_tokens:10000,max_iterations:2,tokens_used:120,unaccounted_attempts:[],legacy_usage_unverified:false};
  let status='blocked';const calls=[];
  const output=()=>({state:{run_id:runId,source_project:f.p.target,spec:{id:spec.id,document_lock:spec.outcome_document_lock},status,phase:'implementation',blockers:[],iteration:1,budget},worktree:{worktree:'/fixture/build'}});
  const dependencies={delivery:{deliveryStatus:()=>output(),resumeDelivery:async(id,options)=>{calls.push({id,options});return output();}}};
  let sequence=0;const step=async(action,extra={})=>{
    const operation_id='build_repair_'+(++sequence),state={...f.state(),revision:f.state().revision+1,running:{operationId:operation_id,action}};
    fs.writeFileSync(f.p.file,JSON.stringify(state));
    const result=await executeVoiceFactoryStep({version:1,root,stateRoot:f.p.stateRoot,agentParent:f.p.parent,slug:f.p.slug,chatId:f.options.chatId,connectorId:'claude',model:f.options.factory.model,effort:'low',preset:f.options.factory.preset,state,input:{operation_id,action,...extra}},dependencies);
    fs.writeFileSync(f.p.file,JSON.stringify({...result.state,running:null}));return result;
  };
  await step('configure_build',{effort:'high'});assert.equal(calls.length,0);
  await step('delivery_resume',{answer:'retry-after-upgrade'});
  assert.equal(calls.length,1);assert.equal(calls[0].id,runId);assert.equal(calls[0].options.buildExecutorOptions.effort,'high');assert.equal(calls[0].options.buildExecutorOptions.model,f.options.factory.model);
  assert.equal(f.state().runId,runId);assert.equal(f.artifact('contract').sha256,contract);assert.equal(f.artifact('outcome').sha256,outcome);assert.equal(budget.tokens_used,120);assert.equal(budget.max_tokens,10000);assert.equal(budget.max_iterations,2);
  for(const invalid of ['building','verified','accepted']){status=invalid;await assert.rejects(step('configure_build',{effort:'medium'}),{code:'factory_build_configuration_locked'});}
  status='blocked';budget.unaccounted_attempts.push({reason:'usage_unavailable'});
  await assert.rejects(step('configure_build',{effort:'medium'}),{code:'factory_build_configuration_locked'});
});
test('factory delivery binds executor, locked Outcome and durable run; verification never accepts or publishes',{timeout:60000},async t=>{
  const f=fixture(t);await f.ok('init',{brief,build_token_budget:10000});await f.ok('approve_contract',{expected_sha256:f.artifact('contract').sha256});await f.ok('create_outcome');await f.ok('approve_outcome',{expected_sha256:f.artifact('outcome').sha256});
  fs.writeFileSync(f.p.file,JSON.stringify({...f.state(),phase:'scaffolded'}));
  const spec=f.artifact('outcome').frontmatter,calls=[];let output={state:{source_project:f.p.target,spec:{id:spec.id,document_lock:spec.outcome_document_lock},status:'awaiting_acceptance',phase:'verify',blockers:[],iteration:1,budget:{remaining:5000}},worktree:{worktree:'/fixture/disposable-build'}},cardStatus='blocked',failAfterJournal=false;
  const executionResult=()=>{const {runRoot,...result}=output;return result;};
  const dependencies={delivery:{deliverOutcome:async(outcome,target,options)=>{calls.push({outcome,target,options});assert.equal(f.state().runId,options.runId);if(failAfterJournal)throw Error('simulated disconnect');return executionResult();},deliveryStatus:(runId)=>{assert.equal(runId,f.state().runId);return {...output,state:{...output.state,run_id:runId}};},resumeDelivery:async(runId,options)=>{calls.push({runId,options});return executionResult();}},registry:{rebuildRegistry:()=>{}},cards:{checkCardReadiness:async(id,options)=>{assert.equal(id,f.state().agentId);assert.equal(options.baseUrl,false);return {status:cardStatus,controlCenterVisible:'unknown'};}}};
  let sequence=0;const step=async action=>{
    const operation_id='trusted_worker_'+(++sequence),state={...f.state(),revision:f.state().revision+1,running:{operationId:operation_id,action}};fs.writeFileSync(f.p.file,JSON.stringify(state));
    const result=await executeVoiceFactoryStep({version:1,root,stateRoot:f.p.stateRoot,agentParent:f.p.parent,slug:f.p.slug,chatId:f.options.chatId,connectorId:'claude',model:'claude-sonnet-5-5',effort:'low',preset:{authMode:'local-cli-session'},factoryParent:{fixture:true},state,input:{operation_id,action}},dependencies);
    fs.writeFileSync(f.p.file,JSON.stringify({...result.state,running:null}));return result;
  };
  const delivered=await step('deliver');assert.equal(delivered.value.status,'awaiting_acceptance');assert.equal(calls[0].target,f.p.target);assert.equal(calls[0].outcome,f.state().outcome);assert.equal(calls[0].options.buildExecutor,'claude-code');assert.equal(calls[0].options.trialBackend,'local');assert.equal(calls[0].options.buildExecutorOptions.model,'claude-sonnet-5-5');
  await step('verify');assert.equal(calls[1].options.hostOnly,true);
  const success=output,runRoot=path.join(f.p.stateRoot,'builds','fixture-run'),ref={path:'trial-results/verification-001.json',evidence_lock:'sha256:fixture-evidence'};
  fs.mkdirSync(path.join(runRoot,'trial-results'),{recursive:true});
  const trial={schema:'pritha-trial-result-v1',spec_id:spec.id,document_lock:spec.outcome_document_lock,evidence_lock:ref.evidence_lock,verification_status:'failed',counts:{failed:1},finished_at:'2026-11-01T00:00:00Z',trials:[{id:'cli-result',kind:'automated',status:'failed',assertions:[{type:'exit_code',passed:false,message:'received 64'}],execution:{exitCode:64,stdout:'',stderr:'CLI command is missing. api_key: synthetic-sensitive-value'}}]};
  fs.writeFileSync(path.join(runRoot,ref.path),JSON.stringify(trial));
  output={...output,runRoot,state:{...output.state,status:'blocked',last_trial_result:ref,blockers:[{code:'iteration_budget_exhausted'}]}};
  const observed=(await step('delivery_status')).value;
  assert.equal(observed.status,'blocked');assert.equal(observed.verification.status,'failed');assert.equal(observed.verification.failedTrials[0].exitCode,64);assert.equal(observed.verification.failedTrials[0].diagnostics.untrusted,true);
  assert.match(observed.verification.failedTrials[0].diagnostics.stderr,/CLI command is missing/);assert.doesNotMatch(JSON.stringify(observed),/synthetic-sensitive-value/);
  for(const action of ['verify','delivery_resume'])assert.equal((await step(action)).value.verification.status,'failed',action+' must use durable evidence even when the execution result has no runRoot');
  fs.writeFileSync(path.join(runRoot,ref.path),JSON.stringify({...trial,evidence_lock:'changed'}));
  assert.equal((await step('delivery_status')).value.verification.status,'evidence-unavailable');
  output={...output,state:{...output.state,last_trial_result:{...ref,path:'../../foreign.json'}}};assert.equal((await step('delivery_status')).value.verification.status,'evidence-unavailable');
  output=success;
  assert.equal((await step('finish')).state.phase,'card-blocked');cardStatus='ready';assert.equal((await step('finish')).state.phase,'awaiting-manual-acceptance');assert.equal(calls.length,4);
  output={...output,state:{...output.state,status:'accepted'}};
  const accepted=await step('finish');assert.equal(accepted.state.phase,'accepted');assert.equal(accepted.value.manualAcceptance,'accepted');assert.doesNotMatch(accepted.value.next,/manual|user acceptance/i);
  assert.equal((await step('delivery_status')).value.manualAcceptance,'accepted');assert.equal(calls.length,4,'Observing acceptance must not start a builder');
  output={...output,state:{...output.state,source_project:'/different-child'}};await assert.rejects(step('delivery_status'),{code:'factory_delivery_identity_changed'});
  fs.writeFileSync(f.p.file,JSON.stringify({...f.state(),running:null,runId:undefined,phase:'scaffolded'}));failAfterJournal=true;await assert.rejects(step('deliver'),/simulated disconnect/);assert.match(f.state().runId,/^voice-voice-built-/);assert.equal(f.state().running.action,'deliver');
});

test('factory status observes actual acceptance without rewriting state or borrowing another run',{timeout:60000},async t=>{
  const f=fixture(t);await f.ok('init',{brief,build_token_budget:10000});await f.ok('approve_contract',{expected_sha256:f.artifact('contract').sha256});await f.ok('create_outcome');await f.ok('approve_outcome',{expected_sha256:f.artifact('outcome').sha256});
  const spec=f.artifact('outcome').frontmatter,runId='run-factory-status',runRoot=path.join(f.p.stateRoot,'builds',f.p.slug,runId);
  createDeliveryLedger(runRoot,{runId,agentSlug:f.p.slug,targetKey:'fixture-target',sourceProject:f.p.target,spec:{id:spec.id,semanticLock:spec.outcome_semantic_lock,documentLock:spec.outcome_document_lock,contractFingerprint:spec.contract_fingerprint,approvalId:spec.approval_id || 'fixture-approval'}});
  fs.writeFileSync(f.p.file,JSON.stringify({...f.state(),runId,phase:'awaiting-manual-acceptance'}));
  const stateBytes=fs.readFileSync(f.p.file,'utf8'),approvalCount=f.approvals.length,ledgerFile=path.join(runRoot,'build-state.json');
  for(const status of ['verified','awaiting_acceptance','accepted']){
    updateDeliveryLedger(runRoot,current=>({...current,status,next_action:'',accepted_by:status==='accepted'?'user':null,accepted_at:status==='accepted'?'2026-11-05T00:00:00.000Z':null}));
    const ledgerBytes=fs.readFileSync(ledgerFile,'utf8'),observed=await f.call('status');
    assert.equal(observed.deliveryStatus,status);assert.equal(observed.manualAcceptance,status==='accepted'?'accepted':'pending');assert.equal(observed.phase,status==='accepted'?'accepted':'awaiting-manual-acceptance');
    assert.equal(fs.readFileSync(f.p.file,'utf8'),stateBytes);assert.equal(fs.readFileSync(ledgerFile,'utf8'),ledgerBytes);assert.equal(f.approvals.length,approvalCount);
  }
  updateDeliveryLedger(runRoot,current=>({...current,source_project:path.join(f.p.parent,'foreign-child')}));
  await assert.rejects(f.call('status'),{code:'factory_delivery_identity_changed'});
  updateDeliveryLedger(runRoot,current=>({...current,source_project:f.p.target,spec:{...current.spec,document_lock:'sha256:foreign-outcome'}}));
  await assert.rejects(f.call('status'),{code:'factory_delivery_identity_changed'});
  const outcomeBytes=fs.readFileSync(f.state().outcome,'utf8');fs.appendFileSync(f.state().outcome,'\nUnapproved change.\n');
  await assert.rejects(f.call('status'),{code:'factory_outcome_approval_required'});fs.writeFileSync(f.state().outcome,outcomeBytes);
  fs.writeFileSync(ledgerFile,'{');await assert.rejects(f.call('status'),{code:'factory_delivery_evidence_unavailable'});
  assert.equal(fs.readFileSync(f.p.file,'utf8'),stateBytes);assert.equal(f.approvals.length,approvalCount);
});

test('literal draft corrections preserve Unicode and exact trailing bytes and reject ambiguous edits',()=>{
  const text='А $1 .*\n\n',expected='Б $1 .*\n',input={edits:[{from:'А',to:'Б'},{from:'\n\n',to:'\n'}],expected_result_sha256:factoryHash(expected)};
  assert.equal(patchFactoryDraft(text,input),expected);
  for(const edits of [[],Array(9).fill({from:'А',to:'Б'}),[{from:'',to:'x'}],[{from:'absent',to:'x'}],[{from:'А',to:'x',path:'foreign'}],[{from:'А',to:'x'.repeat(48001)}]])assert.throws(()=>patchFactoryDraft(text,{...input,edits}));
  assert.throws(()=>patchFactoryDraft('aaa',{edits:[{from:'aa',to:'x'}],expected_result_sha256:factoryHash('xa')}),{code:'factory_patch_not_unique'});
  assert.throws(()=>patchFactoryDraft(text,{...input,expected_result_sha256:'0'.repeat(64)}),{code:'factory_patch_hash_mismatch'});
  const correction=factoryBriefErrorDetail({code:'factory_patch_hash_mismatch',message:'do not echo synthetic-private-value'});assert.equal(correction.error,'factory_patch_hash_mismatch');assert.match(correction.hint,/No draft was written/);assert.doesNotMatch(JSON.stringify(correction),/synthetic-private-value/);
});

test('normal factory patch tool is exact, replayable and cannot edit accepted documents or bypass draft safety',{timeout:60000},async t=>{
  const f=fixture(t);await f.ok('init',{brief,build_token_budget:10000});await f.ok('approve_contract',{expected_sha256:f.artifact('contract').sha256});await f.ok('create_outcome');
  const row=f.artifact('outcome'),from='## Demo script\n\n',to=from+'Review the exact CLI output before final acceptance.\n\n',content=row.text.replace(from,to);
  assert.notEqual(content,row.text);
  const input={operation_id:'patch-outcome-exact-01',artifact:'outcome',expected_sha256:row.sha256,edits:[{from,to}],expected_result_sha256:factoryHash(content)},before=f.state().revision;
  const definition=f.tools.definitions.find(tool=>tool.name==='factory_patch_draft');assert.deepEqual(definition.inputSchema.required,['operation_id','artifact','expected_sha256','edits','expected_result_sha256']);assert.equal(definition.inputSchema.properties.content,undefined);
  await assert.rejects(f.tools.call('factory_patch_draft',{...input,operation_id:'patch-outcome-wrong-hash',expected_result_sha256:'0'.repeat(64)}),{code:'factory_patch_hash_mismatch'});
  assert.equal(f.state().revision,before);assert.equal(f.artifact('outcome').text,row.text);
  const first=await f.tools.call('factory_patch_draft',input);assert.equal(JSON.parse(first.content[0].text).status,'completed');assert.equal(f.artifact('outcome').text,content);
  const revised=f.state().revision;await f.tools.call('factory_step',{...input,edits:[{to,from}],action:'patch_draft'});assert.equal(f.state().revision,revised);assert.equal(f.approvals.length,1);
  await assert.rejects(f.call('patch_draft',{artifact:'outcome',expected_sha256:row.sha256,edits:input.edits,expected_result_sha256:input.expected_result_sha256}),{code:'factory_draft_changed'});
  const fresh=f.artifact('outcome'),unsafe=fresh.text+'\npassword: synthetic-private-value\n';
  const failed=await f.call('patch_draft',{artifact:'outcome',expected_sha256:fresh.sha256,edits:[{from:fresh.text,to:unsafe}],expected_result_sha256:factoryHash(unsafe)});
  assert.equal(failed.status,'failed');assert.equal(JSON.parse(failed.text).error,'factory_draft_unsafe');assert.equal(f.artifact('outcome').text,content);
  await f.ok('approve_outcome',{expected_sha256:fresh.sha256});assert.equal(f.approvals.length,2);
  for(const artifact of ['contract','outcome']){
    const approved=f.artifact(artifact);await assert.rejects(f.call('patch_draft',{artifact,expected_sha256:approved.sha256,edits:[{from:approved.text,to:row.text}],expected_result_sha256:row.sha256}),{code:'factory_draft_changed'});assert.equal(f.artifact(artifact).sha256,approved.sha256);
  }
  assert.equal(fs.existsSync(f.p.target),false);assert.equal(f.state().runId,undefined);assert.equal(f.approvals.length,2);
});

test('each factory action has an exact schema; narrow approvals keep two distinct decisions and canonical replay',{timeout:60000},async t=>{
  const f=fixture(t),dispatch=f.tools.definitions.find(tool=>tool.name==='factory_step');
  for(const action of dispatch.inputSchema.properties.action.enum){
    const tool=f.tools.definitions.find(tool=>tool.name==='factory_'+action);assert.ok(tool,action);
    assert.equal(tool.inputSchema.properties.action,undefined);assert.equal(tool.inputSchema.additionalProperties,false);
    assert.equal(tool.inputSchema.required.includes('operation_id'),true);
  }
  assert.deepEqual(f.tools.definitions.find(tool=>tool.name==='factory_approve_contract').inputSchema.required,['operation_id','expected_sha256']);
  assert.deepEqual(f.tools.definitions.find(tool=>tool.name==='factory_approve_outcome').inputSchema.required,['operation_id','expected_sha256']);
  assert.equal(f.tools.definitions.find(tool=>tool.name==='factory_status').annotations.readOnlyHint,true);
  const server=await listenProviderToolServer({hostTools:f.tools});t.after(()=>server.close());let id=0;
  const call=async(name,args)=>(await(await fetch(server.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+server.token},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}})})).json()).result;
  const status=JSON.parse((await call('factory_status',{operation_id:'narrow-status-01'})).content[0].text);assert.equal(status.phase,'not-started');
  await f.ok('init',{brief,build_token_budget:40000});const hash=f.artifact('contract').sha256;
  const missing=await call('factory_approve_contract',{operation_id:'narrow-approve-01'});assert.equal(missing.isError,true);assert.equal(f.approvals.length,0);assert.equal(f.state().contractApproval,undefined);
  await assert.rejects(f.tools.call('factory_approve_contract',{operation_id:'narrow-approve-01',action:'approve_outcome',expected_sha256:hash}),{code:'factory_input_invalid'});
  const accepted=await call('factory_approve_contract',{operation_id:'narrow-approve-01',expected_sha256:hash});assert.equal(JSON.parse(accepted.content[0].text).status,'completed');assert.equal(f.approvals.length,1);
  const revision=f.state().revision;
  await f.tools.call('factory_step',{operation_id:'narrow-approve-01',action:'approve_contract',expected_sha256:hash});assert.equal(f.state().revision,revision);assert.equal(f.approvals.length,1);
  assert.equal(JSON.parse((await call('factory_create_outcome',{operation_id:'narrow-outcome-01'})).content[0].text).status,'completed');assert.equal(f.approvals.length,1);assert.equal(f.state().outcomeApproval,undefined);
  assert.equal(JSON.parse((await call('factory_approve_outcome',{operation_id:'narrow-outcome-approve',expected_sha256:f.artifact('outcome').sha256})).content[0].text).status,'completed');
  assert.equal(f.approvals.length,2);assert.equal(fs.existsSync(f.p.target),false);
});
test('compatibility input corrections identify missing required fields without echoing unknown names or values',t=>{
  const f=fixture(t);let detail;
  assert.throws(()=>f.tools.factory.validate({operation_id:'valid-correction-01',action:'approve_contract','PRIVATE_UNKNOWN_FIELD':'private-value'}),error=>{
    detail=factoryBriefErrorDetail(error);return error.code==='factory_input_invalid';
  });
  assert.deepEqual(detail.missingFields,['expected_sha256']);assert.equal(detail.unexpectedFieldCount,1);assert.equal(detail.operationIdValid,true);assert.equal(detail.suggestedTool,'factory_approve_contract');
  assert.doesNotMatch(JSON.stringify(detail),/PRIVATE_UNKNOWN_FIELD|private-value/);assert.equal(f.approvals.length,0);assert.equal(f.state(),null);
});
