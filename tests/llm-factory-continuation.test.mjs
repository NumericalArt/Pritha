import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {productFactoryFixture,until} from './helpers/product-factory.mjs';
import {childInteractionDefinition} from '../scripts/lib/child-interaction.mjs';

for(const [connectorId,model,childProvider,childModel] of [
  ['codex','gpt-6-astra','openai','gpt-4.1-mini'],
  ['claude','claude-sonnet-5-5','claude','claude-haiku-4-5-20251001'],
  ['neuraldeep','kimi-k3.1-pro','neuraldeep','qwen3.8-flash'],
])test(connectorId+': two document approvals lead to a built LLM product with protected connection proof and a UI input definition',{timeout:120000},async t=>{
  const f=await productFactoryFixture({connectorId,model,childProvider,childModel,httpOnly:true,slug:'llm-'+connectorId,name:'LLM '+connectorId,entrypoint:'scripts/unused.mjs',flag:'--text',field:'text',route:'/run',portVariable:'FIXTURE_PORT',cliInput:'first',httpInput:'second',result:text=>({answer:text})},()=>{},{automate:true});
  t.after(()=>f.close());
  const call=async(action,args)=>{const result=await f.call(action,args);assert.equal(result.error,undefined,JSON.stringify(result));assert.notEqual(result.continuationFailed,true,JSON.stringify(result));return result;};
  await call('init',{brief:f.brief,build_token_budget:10000,build_iteration_budget:2});
  const approve=async kind=>{const operation=call('approve_'+kind,{expected_sha256:f.artifact(kind).sha256});await until(()=>f.pending().length===1);await f.answer();return operation;};
  assert.deepEqual((await approve('contract')).continued,['create_outcome']);
  await call('prepare_product_trial',{expected_sha256:f.artifact('outcome').sha256,trial:f.trial});
  assert.deepEqual((await approve('outcome')).continued,['research','research_collect']);
  const finished=await f.research();assert.equal(finished.continuationFailed,false,JSON.stringify(finished));
  assert.deepEqual(finished.continued,['scaffold','deliver','finish']);assert.equal(f.reviews.length,2);assert.equal(f.builds.length,1);
  assert.equal(f.state().phase,'awaiting-manual-acceptance',JSON.stringify(finished));assert.equal(f.state().localApplication.status,'applied');
  const config=JSON.parse(fs.readFileSync(path.join(f.paths.target,'runtime/provider.json')));assert.equal(config.connectorId,childProvider);assert.equal(config.modelId,childModel);assert.equal(config.connection,'pritha');
  assert.equal(fs.existsSync(path.join(f.paths.target,'.env.local')),false);
  const interaction=childInteractionDefinition(f.paths.target,f.artifact('outcome').text);assert.equal(interaction.path,'/run');assert.ok(interaction.examples.length>=2);
  const demo=f.progress().firstUse;assert.ok(demo);assert.ok(demo.observed.http.answer);assert.ok(!demo.observed.http.answer.includes('__PRITHA_MODEL_TEXT__'));
});

test('missing child API connection is diagnosed before Contract approval, without confusing builder subscription with child access',{timeout:30000},async t=>{
  const f=await productFactoryFixture({connectorId:'claude',model:'claude-sonnet-5-5',childProvider:'openai',childModel:'gpt-4.1-mini',httpOnly:true,slug:'missing-connection',name:'Missing Connection',portVariable:'FIXTURE_PORT'},()=>{},{childConnections:()=>[{provider:'openai',configured:false,status:'missing'}]});
  t.after(()=>f.close());
  assert.equal((await f.call('init',{brief:f.brief,build_token_budget:10000})).error,undefined);
  const result=await f.call('approve_contract',{expected_sha256:f.artifact('contract').sha256});
  assert.equal(result.error,'factory_child_connection_missing');assert.match(result.hint,/subscription is not a child API key/);
  assert.equal(f.pending().length,0);assert.equal(f.reviews.length,0);assert.equal(f.builds.length,0);assert.equal(f.state().phase,'contract-draft');
});
