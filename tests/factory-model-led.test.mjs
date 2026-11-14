import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {productFactoryFixture,until} from './helpers/product-factory.mjs';
import {approveOutcomeSpec,verifyOutcomeApproval,validateOutcomeSpecText} from '../scripts/agents-mother/outcome-spec.mjs';
import {readDeliveryLedger} from '../scripts/agents-mother/delivery-ledger.mjs';
import {deliveryStatus} from '../scripts/agents-mother/delivery-loop.mjs';
import {hasCreationAuthority,hasDelegatedContract} from '../scripts/agents-mother/factory-creation-authority.mjs';
import {nextFactoryAction} from '../scripts/agents-mother/factory-continuation.mjs';
import {factoryMilestone} from '../scripts/agents-mother/factory-milestone.mjs';
import {contractData} from '../scripts/agents-mother/contract.mjs';
import {factoryHash} from '../scripts/agents-mother/voice-factory-state.mjs';
import {FactoryBudget} from '../scripts/agents-mother/factory-budget.mjs';
import {factoryTrialInputRoot} from '../scripts/agents-mother/factory-proposal-revision.mjs';

const providers=[['codex','gpt-6-astra','openai','gpt-4.1-mini'],['claude','claude-sonnet-5-5','claude','claude-haiku-4-5-20251001'],['neuraldeep','gpt-oss-120b','neuraldeep','gpt-oss-20b']];
async function fixture(t,provider,extra={}){
 const [connectorId,model,childProvider,childModel]=provider;
 const f=await productFactoryFixture({connectorId,model,childProvider,childModel,httpOnly:true,rawResearch:true,slug:'model-led-'+connectorId+'-pass',name:'Model led '+connectorId+' Pass',field:'text',route:'/run',portVariable:connectorId.toUpperCase()+'_PASS_PORT',cliInput:'first',httpInput:'second',result:text=>({answer:text}),...extra},()=>{},{automate:true,creationMode:'model-led'});
 t.after(()=>f.close());
 f.brief.coreFunctions.push('Explain unusual input in the user guide');
 const product={http:[{functions:[1],path:'/run',input_json:{text:'ship the crate'},model_output:{answer:'YES'},expected_json:{answer:'YES'}},
  {functions:[1],path:'/run',input_json:{text:'  '},expected_status:400,expected_json:{error:'invalid_text'}}]};
 return Object.assign(f,{input:{brief:f.brief,product,build_token_budget:10000,build_iteration_budget:6}});
}

for(const provider of providers)test(provider[0]+': model-led Task Chat reaches a checked local LLM agent without document questions',{timeout:120000},async t=>{
 const f=await fixture(t,provider);
 assert.equal((await f.call('status')).creationMode,'model-led');
 if(provider[0]==='neuraldeep')f.brief.technical.repositoryResearchPolicy='auto';
 const result=await f.call('propose',f.input);
 assert.equal(result.error,undefined,JSON.stringify(result));assert.equal(result.continuationFailed,false,JSON.stringify(result));
 assert.deepEqual(result.continued,['approve_contract','create_outcome','prepare_product_trial','approve_outcome','research']);
 assert.equal(f.pending().length,0);assert.equal(f.reviews.length,0);assert.equal(f.builds.length,0);
 assert.equal(f.state().contractApproval.approvedBy,'pritha');assert.equal(f.state().outcomeApproval.approvedBy,'pritha');
 const spec=f.artifact('outcome');assert.equal(spec.frontmatter.approved_by,'pritha');
 assert.equal(verifyOutcomeApproval(spec.file,f.paths).ok,true);
 const parsed=validateOutcomeSpecText(spec.text,{root:f.paths.root});assert.equal(parsed.ok,true);
 assert.ok(parsed.coverage.some(row=>!row.covered),'Uncovered statements must remain honest, not acquire fabricated coverage');
 const status=await f.call('status');assert.equal(status.nextStep.then,'research_decide');
 assert.equal(status.nextStep.owner,'model');assert.equal(f.state().researchStage,'planned');
 // The real host rejects an unrelated source before any network read. Its
 // failed operation is preserved; it never becomes a verified citation.
 const failed=await f.call('research_collect',{sources:{'node-http-runtime':'https://example.com/unrelated'}});
 assert.equal(failed.error,'research_primary_url_invalid',JSON.stringify(failed));
 assert.equal(f.state().continuationPause,'research_collect');
 assert.equal((await f.call('status')).nextStep.then,'research_decide');
 if(provider[0]==='codex'){
   assert.equal((await f.call('research_decide',{answer:' '})).error,'factory_research_decision_required');
  }
  const finished=await f.call('research_decide',{answer:'Memory and the built-in local API adapter are sufficient. The optional documentation page is unavailable; implement the simple enum response and verify the model connection and lifecycle through execution.'});
 assert.equal(finished.error,undefined,JSON.stringify(finished));assert.equal(finished.continuationFailed,false,JSON.stringify(finished));
 assert.equal(f.state().phase,'awaiting-manual-acceptance',JSON.stringify(finished));assert.equal(f.builds.length,1);
 assert.equal(f.reviews.length,0);assert.equal(f.progress().firstUse.disposition,'applied-local-project');
 assert.deepEqual(f.progress().firstUse.unverifiedRequirements,['Explain unusual input in the user guide']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.paths.target,'runtime/provider.json'))).connection,'pritha');
 const research=fs.readFileSync(f.state().research,'utf8');assert.match(research,/external_research_status: pending/);
 const again=await f.call('continue');assert.equal(again.error,undefined);assert.equal(f.builds.length,1);
 // Binding changes never inherit the original request's authority.
 const saved=f.state();fs.writeFileSync(f.paths.file,JSON.stringify({...saved,creationAuthority:{...saved.creationAuthority,requestId:'different_request'}}));
 assert.equal(verifyOutcomeApproval(spec.file,f.paths).ok,false);
 fs.writeFileSync(f.paths.file,JSON.stringify(saved));assert.equal(verifyOutcomeApproval(spec.file,f.paths).ok,true);
 assert.throws(()=>approveOutcomeSpec(spec.file,{...f.paths,approvedBy:'model'}),/approval/);
});

test('a custom profile still requires its real user decision after retaining the creation request',{timeout:30000},async t=>{
 const f=await fixture(t,providers[0]),{product,...input}=f.input;
 f.brief.technical.childModelConnection='child-owned';
 assert.equal((await f.call('init',input)).error,undefined);
 assert.equal(hasCreationAuthority(f.state()),true);assert.equal(hasDelegatedContract(f.state()),false);
 assert.equal(f.state().contractApproval,undefined);
 const approve=f.call('approve_contract',{expected_sha256:f.artifact('contract').sha256});
 await until(()=>f.pending().length===1);await f.answer();assert.equal((await approve).error,undefined);
 assert.equal(f.state().contractApproval.approvedBy,'user');assert.equal(hasDelegatedContract(f.state()),false);
 assert.equal((await f.call('status')).creationMode,'reviewed');
 assert.equal(f.reviews.length,1);assert.equal(f.builds.length,0);
 const correction=structuredClone(f.input);correction.brief.technical.childModelConnection='pritha';
 assert.equal((await f.call('status')).proposalRevision.available,false);
 assert.equal((await f.call('propose',correction)).error,'factory_target_exists');
 assert.equal(f.state().contractApproval.approvedBy,'user');
 assert.equal((await f.call('create_outcome')).error,undefined);
 assert.deepEqual((await f.call('status')).nextStep,{owner:'user',reason:'outcome_decision'});
 assert.equal(factoryMilestone(f.state(),null,null).kind,'proposal');
 const custom={...f.state(),running:null,phase:'research',outcome:'custom-outcome',outcomeApproval:{approvedBy:'user'},research:'memory',pattern:'pattern',researchStage:'planned'};
 assert.equal(nextFactoryAction(custom).action,'research_collect');
});

test('an omitted child model is corrected before a proposal can silently choose deterministic behavior',{timeout:15000},async t=>{
 const f=await fixture(t,providers[2]);
 delete f.brief.technical.childModelProvider;delete f.brief.technical.childModelId;
 const result=await f.call('propose',f.input);
 assert.equal(result.error,'factory_product_proposal_invalid');assert.equal(result.field,'brief.technical.childModelProvider');
 assert.match(result.hint,/Choose the child model explicitly/);
 assert.equal(fs.existsSync(f.paths.file),false);assert.equal(f.pending().length,0);assert.equal(f.builds.length,0);
});

test('repeated Stop failures stay repair feedback until the fourth build succeeds',{timeout:180000},async t=>{
 const f=await fixture(t,providers[0],{unsafeStopIterations:3});
 assert.equal((await f.call('propose',f.input)).continuationFailed,false);
 const result=await f.call('research_decide',{answer:'Use the existing memory and adapter. Implement and exercise the full Start/HTTP/Stop lifecycle, repairing the observed failures within the six iteration limit.'});
 assert.equal(result.continuationFailed,false,JSON.stringify(result));
 assert.equal(f.builds.length,4);assert.equal(f.reviews.length,0);assert.equal(f.state().phase,'awaiting-manual-acceptance');
 const delivery=deliveryStatus(f.state().runId,f.paths),ledger=readDeliveryLedger(delivery.runRoot);
 assert.equal(ledger.status,'verified');assert.ok(ledger.failure_history.length>=4);
 assert.ok(ledger.budget.tokens_used>0);assert.ok(ledger.budget.tokens_used<=ledger.budget.max_tokens);
});

test('the incremental init route also delegates local documents without manufacturing approval or research evidence',{timeout:60000},async t=>{
 const f=await fixture(t,providers[0]),{product,...input}=f.input;
 const started=await f.call('init',input);
 assert.equal(started.continuationFailed,false,JSON.stringify(started));
 assert.deepEqual(started.continued,['approve_contract','create_outcome']);
 assert.equal(f.reviews.length,0);assert.equal(f.state().phase,'outcome-draft');
 const before=f.artifact('outcome');
 assert.throws(()=>approveOutcomeSpec(before.file,{...f.paths,approvedBy:'pritha',creationAuthority:{...f.state().creationAuthority,target:f.paths.target+'-other'}}),/exact host-bound/);
 assert.equal(f.artifact('outcome').sha256,before.sha256);
 assert.equal((await f.call('status')).nextStep.owner,'model');
 const prepared=await f.call('prepare_product_trial',{expected_sha256:before.sha256,trial:f.trial});
 assert.equal(prepared.error,undefined,JSON.stringify(prepared));
 const approved=await f.call('approve_outcome',{expected_sha256:f.artifact('outcome').sha256});
 assert.equal(approved.continuationFailed,false,JSON.stringify(approved));assert.equal(f.reviews.length,0);
 assert.equal(f.state().researchStage,'planned');
 fs.writeFileSync(f.paths.file,JSON.stringify({...f.state(),continuationPause:'scaffold'}));
 const rejected=await f.call('research_decide',{answer:'Use the supported local adapter with memory and execute the behavioral examples.'});
 assert.equal(rejected.error,'factory_step_unconfirmed');assert.equal(fs.existsSync(f.paths.target),false);
 assert.equal(f.state().outcomeApproval.approvedBy,'pritha');
 fs.writeFileSync(f.paths.file,JSON.stringify({...f.state(),continuationPause:null}));
 const built=await f.call('scaffold');
 assert.equal(built.continuationFailed,false,JSON.stringify(built));
 assert.equal(f.state().phase,'awaiting-manual-acceptance');assert.equal(f.reviews.length,0);
 assert.equal(f.builds.length,1);
 assert.match(f.state().researchDecision.note,/model chose local implementation/);
});

test('a model repairs an unsupported draft without losing its creation request or product examples',{timeout:120000},async t=>{
 const f=await fixture(t,providers[2]);
 f.brief.technical.childModelConnection='child-owned';
 const rejected=await f.call('propose',f.input);
 assert.ok(rejected.error);
 const authority=f.state().creationAuthority,preparation=f.state().preparation;
 assert.ok(authority,'A draft configuration error cannot delete the host creation request');
 assert.ok(preparation);assert.equal(f.state().contractApproval,undefined);assert.equal(f.pending().length,0);
 const draft=f.artifact('contract');
 const repaired=await f.call('write_draft',{artifact:'contract',expected_sha256:draft.sha256,
   content:draft.text.replace('- Child model connection: child-owned','- Child model connection: pritha')});
 assert.equal(repaired.error,undefined,JSON.stringify(repaired));
 assert.equal(repaired.continuationFailed,false,JSON.stringify(repaired));
 assert.deepEqual(f.state().creationAuthority,authority);
 assert.equal(f.state().preparation.productHash,preparation.productHash);
 assert.equal(f.state().contractApproval.approvedBy,'pritha');
 assert.equal(f.state().outcomeApproval.approvedBy,'pritha');
 assert.equal(f.reviews.length,0);assert.equal(f.state().researchStage,'planned');
 const built=await f.call('research_decide',{answer:'Use the existing Pritha model connection and the local API adapter. Build and check the behavior from the retained examples.'});
 assert.equal(built.continuationFailed,false,JSON.stringify(built));assert.equal(f.builds.length,1);
 assert.equal(f.state().phase,'awaiting-manual-acceptance');
});

test('NeuralDeep corrects an accepted preparation proposal and builds the same child without another question',{timeout:120000},async t=>{
 const f=await fixture(t,providers[2]);
 const incomplete=structuredClone(f.input);
 delete incomplete.brief.technical.port;delete incomplete.brief.technical.childMaxOutputTokens;
 delete incomplete.brief.technical.repositoryResearchPolicy;delete incomplete.product.http[0].model_output;
 incomplete.brief.technical.targetFolder=f.paths.target+'/scripts/server.mjs?ignored-path';
 assert.equal((await f.call('propose',incomplete)).error,'factory_product_trial_model_proof_required');
 const firstDraft=f.artifact('contract');
 // Compatibility with receipts written before host-owned values were canonicalized.
 const legacy=f.state();legacy.preparation.requestHash=factoryHash([incomplete.brief,incomplete.build_token_budget,incomplete.build_iteration_budget,null]);fs.writeFileSync(f.paths.file,JSON.stringify(legacy));
 incomplete.brief.technical.targetFolder=f.paths.target;
 assert.equal((await f.call('propose',incomplete)).error,'factory_product_trial_model_proof_required','A corrected host-owned path is not a changed proposal');
 assert.equal(f.artifact('contract').sha256,firstDraft.sha256);
 await f.call('approve_contract',{expected_sha256:firstDraft.sha256});
 assert.equal(f.state().contractApproval.approvedBy,'pritha');
 await f.call('create_outcome');
 const originalContract=f.artifact('contract'),originalOutcome=f.artifact('outcome'),authority=f.state().creationAuthority;
 await new FactoryBudget({...f.paths,chatId:f.chatId,connectorId:'neuraldeep'}).observe('original-preparation','preparation',{observedTokens:12345,chargedTokens:16000,activeMs:5000,usageKnown:false});
 const budgetFile=path.join(f.paths.directory,'workflow-budget.json'),budget=JSON.parse(fs.readFileSync(budgetFile));
 f.input.brief.technical.port='3093';f.input.brief.technical.childMaxOutputTokens='1024';
 const result=await f.call('propose',f.input);
 assert.equal(result.error,undefined,JSON.stringify(result));assert.equal(result.continuationFailed,false,JSON.stringify(result));
 assert.equal(result.revised,true);assert.equal(f.state().phase,'research');assert.equal(f.state().agentId,originalContract.frontmatter.agent_id);
 assert.notEqual(f.artifact('contract').file,originalContract.file);assert.notEqual(f.artifact('outcome').file,originalOutcome.file);
 assert.equal(fs.readFileSync(originalContract.file,'utf8'),originalContract.text);assert.equal(fs.readFileSync(originalOutcome.file,'utf8'),originalOutcome.text);
 assert.deepEqual(f.state().creationAuthority,authority);const afterBudget=JSON.parse(fs.readFileSync(budgetFile));assert.deepEqual(afterBudget.attempts,budget.attempts);assert.deepEqual(afterBudget.limits,budget.limits);
 const status=await f.call('status');assert.equal(status.contractSettings.apiPort.port,3093);assert.equal(status.contractSettings.childMaxOutputTokens,1024);
 assert.equal(status.contractSettings.repositoryResearchPolicy,'not-applicable');assert.equal(f.reviews.length,0);
 const history=fs.readdirSync(path.join(f.paths.directory,'proposal-history')).filter(name=>!name.endsWith('-brief.json'));
 assert.equal(history.length,1);const receipt=JSON.parse(fs.readFileSync(path.join(f.paths.directory,'proposal-history',history[0])));
 assert.equal(receipt.artifacts.contract.sha256,originalContract.sha256);assert.equal(receipt.state.contractApproval.approvedBy,'pritha');
 const built=await f.call('research_decide',{answer:'The corrected port and response limit match the request. Implement the local API and verify model transport, validation and managed Start/Stop.'});
 assert.equal(built.continuationFailed,false,JSON.stringify(built));assert.equal(f.builds.length,1);assert.equal(f.state().phase,'awaiting-manual-acceptance');
 assert.equal((await f.call('status')).proposalRevision.available,false);assert.equal(f.reviews.length,0);
});

test('pre-scaffold corrections version approved verifiers while preserving prior evidence and budgets',{timeout:120000},async t=>{
 const f=await fixture(t,providers[0]);
 assert.equal((await f.call('propose',f.input)).continuationFailed,false);
 const originalState=f.state(),originalContract=f.artifact('contract'),originalOutcome=f.artifact('outcome');
 const originalInputs=factoryTrialInputRoot(f.paths,contractData(originalContract.file,{root:f.root}));
 const verifierFile=path.join(originalInputs,'verification/product.mjs'),verifier=fs.readFileSync(verifierFile,'utf8');
 const increase=structuredClone(f.input);increase.build_token_budget++;
 assert.equal((await f.call('propose',increase)).error,'factory_proposal_budget_changed');
 assert.equal(f.artifact('contract').sha256,originalContract.sha256);
 const corrected=structuredClone(f.input);corrected.product.http[0].expected_json={answer:'NO'};corrected.product.http[0].model_output={answer:'NO'};
 const revised=await f.call('propose',corrected);
 assert.equal(revised.error,undefined,JSON.stringify(revised));assert.equal(revised.continuationFailed,false,JSON.stringify(revised));
 assert.equal(fs.readFileSync(verifierFile,'utf8'),verifier);assert.equal(fs.readFileSync(originalContract.file,'utf8'),originalContract.text);
 assert.equal(fs.readFileSync(originalOutcome.file,'utf8'),originalOutcome.text);
 const nextInputs=factoryTrialInputRoot(f.paths,contractData(f.state().contract,{root:f.root}));assert.notEqual(nextInputs,originalInputs);
 assert.notEqual(factoryHash(fs.readFileSync(path.join(nextInputs,'verification/product.mjs'),'utf8')),factoryHash(verifier));
 assert.equal(f.state().agentId,originalState.agentId);assert.equal(f.state().outcomeApproval.approvedBy,'pritha');assert.equal(f.reviews.length,0);
 const stable=f.state().contract;assert.equal((await f.call('propose',corrected)).error,undefined);assert.equal(f.state().contract,stable);
 const built=await f.call('research_decide',{answer:'Use the corrected example and execute the protected verifiers from this proposal version.'});
 assert.equal(built.continuationFailed,false,JSON.stringify(built));assert.equal(f.state().phase,'awaiting-manual-acceptance');assert.equal(f.builds.length,1);
});

test('a modified accepted Contract cannot be legitimized through a new proposal',{timeout:30000},async t=>{
 const f=await fixture(t,providers[2]);assert.equal((await f.call('propose',f.input)).continuationFailed,false);
 const row=f.artifact('contract');fs.writeFileSync(row.file,row.text+'\nUnexpected external edit.\n');
 const changed=structuredClone(f.input);changed.brief.technical.port='3093';
 const rejected=await f.call('propose',changed);
 assert.equal(rejected.error,'factory_contract_approval_required');assert.equal(f.state().contract,row.file);assert.equal(f.builds.length,0);
});

test('incremental model-led preparation can switch to a corrected complete proposal before scaffold',{timeout:30000},async t=>{
 const f=await fixture(t,providers[1]),{product,...input}=f.input;
 assert.equal((await f.call('init',input)).continuationFailed,false);
 const previous=f.artifact('contract');assert.equal((await f.call('status')).proposalRevision.available,true);
 const corrected=structuredClone(f.input);corrected.brief.technical.port='3094';
 const result=await f.call('propose',corrected);
 assert.equal(result.error,undefined,JSON.stringify(result));assert.equal(result.continuationFailed,false,JSON.stringify(result));
 assert.equal(result.revised,true);assert.equal(f.state().phase,'research');assert.equal(f.reviews.length,0);
 assert.equal(fs.readFileSync(previous.file,'utf8'),previous.text);assert.equal(f.state().agentId,previous.frontmatter.agent_id);
});

test('a draft edit cannot manufacture host-owned proposal lineage or verifier storage',{timeout:15000},async t=>{
 const f=await fixture(t,providers[2]),incomplete=structuredClone(f.input);delete incomplete.product.http[0].model_output;
 assert.equal((await f.call('propose',incomplete)).error,'factory_product_trial_model_proof_required');
 const row=f.artifact('contract');
 for(const field of ['factory_revision_of: unrelated-contract','factory_proposal_revision: 7']){
   const result=await f.call('patch_draft',{artifact:'contract',expected_sha256:row.sha256,edits:[{from:'status: draft',to:field+'\nstatus: draft'}]});
   assert.equal(result.error,'factory_draft_identity_invalid');assert.equal(f.artifact('contract').sha256,row.sha256);
 }
});
