import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {ProviderHostTools} from '../scripts/lib/provider-host-tools.mjs';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {voiceFactoryPaths,loadVoiceFactory,factoryArtifact,factoryHash} from '../scripts/agents-mother/voice-factory-state.mjs';
import {executeVoiceFactoryStep} from '../scripts/agents-mother/voice-factory-worker.mjs';
import {privateAgentArtifactReference} from '../scripts/lib/authored-agent-memory.mjs';
import {listenProviderToolServer} from '../scripts/lib/provider-tool-server.mjs';
import {contractData} from '../scripts/agents-mother/contract.mjs';
import {validateOutcomeSpecText} from '../scripts/agents-mother/outcome-spec.mjs';
import {preparedTrialInputFiles} from '../scripts/agents-mother/prepared-trial-inputs.mjs';

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
test('the actual MCP brief schema rejects a design array before approval and a corrected retry creates only a private draft',{timeout:60000},async t=>{
  const f=fixture(t),server=await listenProviderToolServer({hostTools:f.tools});t.after(()=>server.close());
  let id=0;const post=async(method,params)=>(await(await fetch(server.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+server.token},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})})).json()).result;
  const schema=(await post('tools/list')).tools.find(row=>row.name==='factory_step').inputSchema.properties.brief;
  assert.equal(schema.properties.design.properties.inputDataTypes.type,'string');
  assert.ok(schema.properties.technical.properties.runtimeFamily.enum.includes('cli'));assert.ok(!schema.properties.technical.properties.runtimeFamily.enum.includes('node'));
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
  assert.equal(f.approvals.length,1);assert.equal(f.artifact('contract').frontmatter.status,'draft');assert.equal(fs.existsSync(f.p.target),false);assert.equal(f.state().contractApproval,undefined);assert.equal(f.state().outcomeApproval,undefined);
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
  const gate=await f.call('scaffold');assert.equal(gate.status,'failed');assert.equal(fs.existsSync(f.p.target),false);
  const memory=path.join(f.p.stateRoot,'memory');fs.mkdirSync(memory,{recursive:true});execFileSync('sqlite3',[path.join(memory,'pritha.sqlite')],{input:fs.readFileSync(path.join(root,'.memory/schema.sql'),'utf8')});
  await f.ok('research');assert.ok(f.artifact('research').sha256);assert.ok(f.artifact('pattern').sha256);assert.equal((await f.ok('research_status')).ok,true);
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
  await f.tools.call('factory_step',input);assert.equal(f.approvals.length,1);
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
test('factory delivery binds executor, locked Outcome and durable run; verification never accepts or publishes',{timeout:60000},async t=>{
  const f=fixture(t);await f.ok('init',{brief,build_token_budget:10000});await f.ok('approve_contract',{expected_sha256:f.artifact('contract').sha256});await f.ok('create_outcome');await f.ok('approve_outcome',{expected_sha256:f.artifact('outcome').sha256});
  fs.writeFileSync(f.p.file,JSON.stringify({...f.state(),phase:'scaffolded'}));
  const spec=f.artifact('outcome').frontmatter,calls=[];let output={state:{source_project:f.p.target,spec:{id:spec.id,document_lock:spec.outcome_document_lock},status:'awaiting_acceptance',phase:'verify',blockers:[],iteration:1,budget:{remaining:5000}},worktree:{worktree:'/fixture/disposable-build'}},cardStatus='blocked',failAfterJournal=false;
  const dependencies={delivery:{deliverOutcome:async(outcome,target,options)=>{calls.push({outcome,target,options});assert.equal(f.state().runId,options.runId);if(failAfterJournal)throw Error('simulated disconnect');return output;},deliveryStatus:(runId)=>{assert.equal(runId,f.state().runId);return output;},resumeDelivery:async(runId,options)=>{calls.push({runId,options});return output;}},registry:{rebuildRegistry:()=>{}},cards:{checkCardReadiness:async(id,options)=>{assert.equal(id,f.state().agentId);assert.equal(options.baseUrl,false);return {status:cardStatus,controlCenterVisible:'unknown'};}}};
  let sequence=0;const step=async action=>{
    const operation_id='trusted_worker_'+(++sequence),state={...f.state(),revision:f.state().revision+1,running:{operationId:operation_id,action}};fs.writeFileSync(f.p.file,JSON.stringify(state));
    const result=await executeVoiceFactoryStep({version:1,root,stateRoot:f.p.stateRoot,agentParent:f.p.parent,slug:f.p.slug,chatId:f.options.chatId,connectorId:'claude',model:'claude-sonnet-5-5',effort:'low',preset:{authMode:'local-cli-session'},factoryParent:{fixture:true},state,input:{operation_id,action}},dependencies);
    fs.writeFileSync(f.p.file,JSON.stringify({...result.state,running:null}));return result;
  };
  const delivered=await step('deliver');assert.equal(delivered.value.status,'awaiting_acceptance');assert.equal(calls[0].target,f.p.target);assert.equal(calls[0].outcome,f.state().outcome);assert.equal(calls[0].options.buildExecutor,'claude-code');assert.equal(calls[0].options.trialBackend,'local');assert.equal(calls[0].options.buildExecutorOptions.model,'claude-sonnet-5-5');
  await step('verify');assert.equal(calls[1].options.hostOnly,true);
  assert.equal((await step('finish')).state.phase,'card-blocked');cardStatus='ready';assert.equal((await step('finish')).state.phase,'awaiting-manual-acceptance');assert.equal(calls.length,2);
  output={...output,state:{...output.state,source_project:'/different-child'}};await assert.rejects(step('delivery_status'),{code:'factory_delivery_identity_changed'});
  fs.writeFileSync(f.p.file,JSON.stringify({...f.state(),running:null,runId:undefined,phase:'scaffolded'}));failAfterJournal=true;await assert.rejects(step('deliver'),/simulated disconnect/);assert.match(f.state().runId,/^voice-voice-built-/);assert.equal(f.state().running.action,'deliver');
});
