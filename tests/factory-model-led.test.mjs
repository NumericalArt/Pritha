import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {productFactoryFixture} from './helpers/product-factory.mjs';
import {approveOutcomeSpec,verifyOutcomeApproval,validateOutcomeSpecText} from '../scripts/agents-mother/outcome-spec.mjs';
import {readDeliveryLedger} from '../scripts/agents-mother/delivery-ledger.mjs';
import {deliveryStatus} from '../scripts/agents-mother/delivery-loop.mjs';

const providers=[['codex','gpt-6-astra','openai','gpt-4.1-mini'],['claude','claude-sonnet-5-5','claude','claude-haiku-4-5-20251001'],['neuraldeep','gpt-oss-20b','neuraldeep','gpt-oss-20b']];
async function fixture(t,provider,extra={}){
 const [connectorId,model,childProvider,childModel]=provider;
 const f=await productFactoryFixture({connectorId,model,childProvider,childModel,httpOnly:true,slug:'model-led-'+connectorId,name:'Model led '+connectorId,field:'text',route:'/run',portVariable:'FIXTURE_PORT',cliInput:'first',httpInput:'second',result:text=>({answer:text}),...extra},()=>{},{automate:true,creationMode:'model-led'});
 t.after(()=>f.close());
 f.brief.coreFunctions.push('Explain unusual input in the user guide');
 const product={http:[{functions:[1],path:'/run',input_json:{text:'ship the crate'},model_output:{answer:'YES'},expected_json:{answer:'YES'}},
  {functions:[1],path:'/run',input_json:{text:'  '},expected_status:400,expected_json:{error:'invalid_text'}}]};
 return Object.assign(f,{input:{brief:f.brief,product,build_token_budget:10000,build_iteration_budget:6}});
}

for(const provider of providers)test(provider[0]+': model-led Task Chat reaches a checked local LLM agent without document questions',{timeout:120000},async t=>{
 const f=await fixture(t,provider),result=await f.call('propose',f.input);
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
 // An unavailable optional source is preserved as evidence. The model can
 // choose local implementation; it cannot turn the source into a passed check.
 fs.writeFileSync(f.paths.file,JSON.stringify({...f.state(),continuationPause:'research_collect'}));
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
