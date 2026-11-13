import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ProviderHostTools} from '../scripts/lib/provider-host-tools.mjs';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {ProviderApprovalBroker,answerProviderRequest,pendingProviderRequests} from '../scripts/lib/provider-approvals.mjs';
import {voiceFactoryPaths,loadVoiceFactory,factoryArtifact} from '../scripts/agents-mother/voice-factory-state.mjs';
import {productFactoryFixture,until} from './helpers/product-factory.mjs';
import {PROVIDER_FACTORY_TOOLS,factoryBriefErrorDetail} from '../scripts/lib/provider-factory-tools.mjs';
import {validateProductProposal} from '../scripts/agents-mother/factory-product-proposal.mjs';

const providers=[['codex','gpt-6-astra','openai','gpt-4.1-mini'],['claude','claude-sonnet-5-5','claude','claude-haiku-4-5-20251001'],['neuraldeep','gpt-oss-20b','neuraldeep','gpt-oss-20b']];
test('proposal tools require product functions and distinguish missing functions from incorrect mappings',()=>{
  const schema=PROVIDER_FACTORY_TOOLS.find(tool=>tool.name==='factory_propose').inputSchema.properties.brief;
  assert.ok(schema.required.includes('coreFunctions'));assert.equal(schema.properties.coreFunctions.minItems,1);
  assert.ok(!PROVIDER_FACTORY_TOOLS.find(tool=>tool.name==='factory_init').inputSchema.properties.brief.required.includes('coreFunctions'),'custom draft creation stays unchanged');
  const product={http:[{functions:[1],path:'/run',input_json:{text:'hello'},expected_json:{answer:'hello'}}]};
  for(const [coreFunctions,expectedField,pattern] of [[[],'brief.coreFunctions',/List one to 32 product functions/],[['Echo text'],'product.http.0.functions',/one-based indexes/]]){
    const example=structuredClone(product);if(coreFunctions.length)example.http[0].functions=[0];
    try{validateProductProposal(example,coreFunctions);assert.fail('expected a correction');}catch(error){
      const detail=factoryBriefErrorDetail(error);assert.equal(detail.field,expectedField);assert.match(detail.hint,pattern);
      if(!coreFunctions.length)assert.doesNotMatch(detail.hint,/one-based/);
    }
  }
  assert.doesNotThrow(()=>validateProductProposal(product,['Echo text']));
});
async function fixture(t,provider=providers[0]){
  const [connectorId,model,childProvider,childModel]=provider;
  const f=await productFactoryFixture({connectorId,model,childProvider,childModel,httpOnly:true,slug:'proposal-'+connectorId,name:'Proposal '+connectorId,field:'text',route:'/run',portVariable:'FIXTURE_PORT',cliInput:'first',httpInput:'second',result:text=>({answer:text})},()=>{},{automate:true});
  t.after(()=>f.close());
  const brief=f.brief;
  brief.coreFunctions.push('Health and Stop work without a model connection.','A missing model connection produces an explicit service error.','Managed Start preserves the model URL, token and port without logging the connection.');
  const product={http:['first','second'].map(text=>({functions:[1],path:'/run',input_json:{text},expected_json:{answer:text+' __PRITHA_MODEL_TEXT__'},model_output:{answer:text+' __PRITHA_MODEL_TEXT__'}}))};
  product.http.push({functions:[1],path:'/run',input_json:{text:'   '},expected_status:400,expected_json:{error:'invalid_text'}});
  return Object.assign(f,{input:{brief,product,build_token_budget:10000,build_iteration_budget:2}});
}
async function approve(f,operation,kind){
  await Promise.race([until(()=>f.pending().length===1),operation.then(result=>assert.fail('Stopped before '+kind+': '+JSON.stringify(result)))]);
  const request=f.pending()[0];assert.equal(request.presentation.approvalScope,kind+' only');
  await f.answer();
}

for(const provider of providers)test(provider[0]+': one product proposal reaches two host-owned approvals and an automatic working build',{timeout:120000},async t=>{
  const f=await fixture(t,provider),operation=f.call('propose',f.input);
  await approve(f,operation,'contract');
  await approve(f,operation,'outcome');
  const result=await operation;assert.equal(result.error,undefined,JSON.stringify(result));assert.equal(result.continuationFailed,false,JSON.stringify(result));
  assert.deepEqual(result.continued,['approve_contract','create_outcome','prepare_product_trial','approve_outcome','research','research_collect']);
  const hashes=[f.artifact('contract').sha256,f.artifact('outcome').sha256];
  const status=await f.call('status');assert.equal(status.nextStep.owner,'model');assert.equal(status.nextStep.then,'research_apply');
  assert.equal(f.reviews.length,2);assert.equal(f.builds.length,0);
  // A generic continuation must not erase an unresolved evidence checkpoint.
  const collected=f.state();fs.writeFileSync(f.paths.file,JSON.stringify({...collected,continuationPause:'research_collect'}));
  const paused=await f.call('continue');assert.equal(paused.continued,undefined);assert.equal(f.state().continuationPause,'research_collect');
  const unchanged=await f.call('propose',f.input);assert.equal(unchanged.continued,undefined);assert.equal(f.state().continuationPause,'research_collect');
  fs.writeFileSync(f.paths.file,JSON.stringify({...f.state(),continuationPause:null}));
  const finished=await f.research();assert.equal(finished.continuationFailed,false,JSON.stringify(finished));
  assert.equal(f.state().phase,'awaiting-manual-acceptance',JSON.stringify(finished));assert.equal(f.builds.length,1);assert.equal(f.progress().firstUse.disposition,'applied-local-project');
  const again=await f.call('continue');assert.equal(again.error,undefined,JSON.stringify(again));
  assert.deepEqual([f.artifact('contract').sha256,f.artifact('outcome').sha256],hashes);assert.equal(f.reviews.length,2);assert.equal(f.builds.length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.paths.target,'runtime/provider.json'))).connection,'pritha');
  const changed=structuredClone(f.input);changed.build_token_budget++;
  assert.equal((await f.call('propose',changed)).error,'factory_proposal_changed');
  changed.build_token_budget--;changed.product.http[0].expected_json={answer:'different'};
  assert.equal((await f.call('propose',changed)).error,'factory_proposal_changed');
  assert.equal(f.reviews.length,2);assert.equal(f.builds.length,1);
});

test('an incomplete product proposal is corrected in the same draft before any approval or child creation',{timeout:30000},async t=>{
  const f=await fixture(t),invalid=structuredClone(f.input);delete invalid.product.http[0].model_output;
  const rejected=await f.call('propose',invalid);assert.equal(rejected.error,'factory_product_trial_model_proof_required');
  assert.equal(f.pending().length,0);assert.equal(f.reviews.length,0);assert.equal(fs.existsSync(f.paths.target),false);
  const original=f.artifact('contract'),result=f.call('propose',f.input);
  await approve(f,result,'contract');assert.equal(f.state().contract,original.file);
  await approve(f,result,'outcome');assert.equal((await result).continuationFailed,false);
  assert.equal(f.state().contractApproval.reviewedSha256,original.sha256);assert.equal(f.reviews.length,2);
});

function recoveryFixture(t){
  const root=fs.realpathSync(fileURLToPath(new URL('../',import.meta.url)));
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-proposal-recovery-')));
  const stateRoot=path.join(directory,'state'),agentParent=path.join(directory,'children');fs.mkdirSync(stateRoot);fs.mkdirSync(agentParent);
  const chatId='chat_proposal_recovery',connectorId='claude',paths=voiceFactoryPaths({root,stateRoot,agentParent,slug:'proposal-recovery'});
  const coordinator=new ExecutionCoordinator({stateRoot});let sequence=0,current;
  const state=()=>loadVoiceFactory(paths,{chatId,connectorId});
  const pending=()=>pendingProviderRequests(coordinator,chatId);
  async function closeTurn(){if(!current)return;current.broker.close();current.controller.abort();await current.host.close();current.lease.release();current=null;}
  function start(timeoutMs=10000){
    assert.ok(!current,'Close the previous turn first');
    const turnId='recovery_turn_'+(++sequence),lease=coordinator.claim(['workspace:'+paths.target],'proposal_recovery_'+sequence,{kind:'turn',detail:{chatId,connectorId}}),controller=new AbortController();
    const broker=new ProviderApprovalBroker({coordinator,chatId,turnId,lease,signal:controller.signal});
    const host=new ProviderHostTools({root,cwd:root,stateRoot,privateRoot:path.join(stateRoot,'private'),connectorId,coordinator,lease,chatId,turnId,signal:controller.signal,sandbox:'read-only',factoryContinuation:'execute',
      factory:{slug:paths.slug,target:paths.target,agentParent,model:'claude-sonnet-5-5',effort:'low'},approve:request=>broker.ask({...request,timeoutMs})});
    current={broker,host,lease,controller};return host;
  }
  const input={brief:{identity:{name:'Proposal recovery',slug:paths.slug},goal:'Echo supplied text.',user:'Local operator',successCriteria:['Return the supplied text as JSON.'],coreFunctions:['Echo supplied text'],technical:{runtimeFamily:'api',serviceMode:'process',primaryInterface:'api',secondaryInterfaces:'none',childModelProvider:'none',childModelId:'none',port:'3021',portVariable:'RECOVERY_PORT',repositoryResearchPolicy:'not-applicable',repositoryAdoptionMode:'none',repositoryResearchWaiverReason:'Only built-in Node modules are needed.'}},product:{http:['first','second'].map(text=>({functions:[1],path:'/echo',input_json:{text},expected_json:{text}}))},build_token_budget:10000};
  const call=async(host,action,extra={})=>JSON.parse((await host.call('factory_step',{action,...extra})).content[0].text);
  const answer=async(decision='accept')=>{const row=pending()[0];return answerProviderRequest(coordinator,chatId,{requestId:row.requestId,revision:row.presentation.revision,clientMessageId:'recovery_answer_'+(++sequence),decision});};
  t.after(async()=>{await closeTurn();coordinator.close();fs.rmSync(directory,{recursive:true,force:true});});
  return {input,paths,coordinator,state,pending,start,closeTurn,call,answer,artifact:kind=>factoryArtifact(paths,state(),kind)};
}

test('a late Contract decision resumes the controller in a new turn without asking again',{timeout:30000},async t=>{
  const f=recoveryFixture(t),first=f.call(f.start(40),'propose',f.input);
  await until(()=>f.pending().length===1);
  assert.equal((await first).continuationFailed,true);
  const draft=f.artifact('contract');await f.closeTurn();
  assert.equal((await f.answer()).resumeRequired,true);
  const resumed=f.call(f.start(),'continue');await until(()=>f.pending().length===1);
  assert.equal(f.pending()[0].presentation.approvalScope,'outcome only');
  assert.equal(f.state().contractApproval.reviewedSha256,draft.sha256);
  await f.answer('decline');assert.equal((await resumed).continuationFailed,true);
  const requests=f.coordinator.listIntents({kind:'provider-request'});
  assert.equal(requests.length,2);assert.equal(f.state().outcomeApproval,undefined);assert.equal(fs.existsSync(f.paths.target),false);
});

test('decline and Stop do not start technical work or create a second document request',{timeout:30000},async t=>{
  const f=recoveryFixture(t),host=f.start(),first=f.call(host,'propose',f.input);
  await until(()=>f.pending().length===1);await f.answer('decline');assert.equal((await first).continuationFailed,true);
  const repeated=await f.call(host,'continue');assert.equal(repeated.continuationFailed,true);
  assert.equal(f.coordinator.listIntents({kind:'provider-request'}).length,1);
  assert.equal(f.state().contractApproval,undefined);assert.equal(f.state().outcome,undefined);assert.equal(fs.existsSync(f.paths.target),false);
  await f.closeTurn();await assert.rejects(f.call(host,'continue'),{code:'operator_cancel'});
});

test('shadow mode supplies an actionable saved step and an explicit draft edit transfers control',{timeout:30000},async t=>{
  const f=recoveryFixture(t),host=f.start();host.options.factoryContinuation='shadow';
  assert.equal((await f.call(host,'propose',f.input)).status,'completed');
  const draft=f.artifact('contract'),status=await f.call(host,'status');
  assert.equal(status.nextStep.owner,'model');assert.equal(status.nextStep.action,'approve_contract');assert.equal(status.nextStep.expected_sha256,draft.sha256);
  assert.equal(f.pending().length,0);
  const edited=draft.text+'\n<!-- Operator clarification in the unapproved draft. -->\n';
  assert.equal((await f.call(host,'write_draft',{artifact:'contract',expected_sha256:draft.sha256,content:edited})).status,'completed');
  assert.equal(f.state().preparation,undefined);await f.call(host,'continue');
  assert.equal(f.artifact('contract').text,edited);assert.equal(f.pending().length,0);assert.equal(fs.existsSync(f.paths.target),false);
});

test('uncovered behavior is rejected before Contract review and corrected without losing the draft',{timeout:30000},async t=>{
  const f=recoveryFixture(t),host=f.start();host.options.factoryContinuation='shadow';
  f.input.brief.coreFunctions.push('Return the input length');
  const rejected=await f.call(host,'propose',f.input);assert.equal(JSON.parse(rejected.text).error,'factory_product_proposal_invalid');
  const draft=f.artifact('contract'),status=await f.call(host,'status');assert.equal(status.nextStep.action,'propose');assert.equal(status.nextStep.field,'product.functions');
  assert.equal(f.pending().length,0);assert.equal(f.state().contractApproval,undefined);
  for(const c of f.input.product.http){c.functions.push(2);c.expected_json.length=c.input_json.text.length;}
  assert.equal((await f.call(host,'propose',f.input)).status,'completed');
  assert.equal(f.artifact('contract').sha256,draft.sha256);assert.equal((await f.call(host,'status')).nextStep.action,'approve_contract');
});
