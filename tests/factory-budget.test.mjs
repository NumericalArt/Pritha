import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FactoryBudget,readFactoryBudget,FACTORY_STABILITY_BUDGET} from '../scripts/agents-mother/factory-budget.mjs';
import {scaffoldCapability} from '../scripts/agents-mother/scaffold/capabilities.mjs';

function fixture(t){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-factory-budget-')));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  for(const name of ['root','state','children'])fs.mkdirSync(path.join(base,name));
  const options={root:path.join(base,'root'),stateRoot:path.join(base,'state'),agentParent:path.join(base,'children'),slug:'budget-child',chatId:'chat_budget_fixture',connectorId:'neuraldeep'};
  return {options,budget:new FactoryBudget(options)};
}
const row=(tokens,status='measured',reserve=tokens,seconds=1)=>({status,reservedTokens:reserve,usage:status==='measured'?{totalTokens:tokens}:null,
  createdAt:'2026-11-09T10:00:00.000Z',finishedAt:new Date(Date.parse('2026-11-09T10:00:00.000Z')+seconds*1000).toISOString()});

test('one durable budget includes preparation, build and resumed work without double charges',async t=>{
  const {options,budget}=fixture(t);await budget.ensure();
  await budget.checkpoint('parent-1','preparation',{requests:[row(2_000_000)]});
  await budget.checkpoint('build-1','build',{requests:[row(3_000_000)]});
  const resumed=new FactoryBudget(options);
  await resumed.checkpoint('parent-1','preparation',{requests:[row(2_000_000)]});
  await resumed.checkpoint('parent-2','preparation',{requests:[row(1_000_000)]});
  const value=readFactoryBudget(options);
  assert.equal(value.observedTokens,6_000_000);assert.equal(value.preparationTokens,3_000_000);assert.equal(value.buildTokens,3_000_000);
  assert.equal(value.remainingTokens,4_000_000);assert.equal(value.activeMs,3000);assert.equal(value.usageKnown,true);
});
test('parent and child reservations compete for the same limit before either dispatches',async t=>{
  const {options,budget}=fixture(t);await budget.ensure();
  const second=new FactoryBudget(options);
  const outcomes=await Promise.allSettled([budget.checkpoint('parent','preparation',{requests:[row(0,'reserved',6_000_000)]}),second.checkpoint('child','build',{requests:[row(0,'reserved',6_000_000)]})]);
  assert.equal(outcomes.filter(value=>value.status==='fulfilled').length,1);
  assert.equal(outcomes.find(value=>value.status==='rejected').reason.code,'factory_token_budget_exhausted');
  assert.equal(budget.view().chargedTokens,6_000_000);
});
test('unknown usage retains its conservative charge and measured settlement releases only that reservation',async t=>{
  const {budget}=fixture(t);await budget.checkpoint('old','preparation',{requests:[row(0,'unknown',500_000)]});
  assert.equal(budget.view().usageKnown,false);assert.equal(budget.check().remainingTokens,9_500_000);
  await budget.checkpoint('new','build',{requests:[row(0,'reserved',300_000)]});
  await budget.checkpoint('new','build',{requests:[row(80_000,'measured',300_000)]});
  assert.equal(budget.view().chargedTokens,580_000);assert.equal(budget.view().observedTokens,80_000);
  assert.equal(budget.view().uncertainAttempts,1);
});
test('time is active request time, excludes approval gaps, and cannot be reset with a new object',async t=>{
  const {options,budget}=fixture(t);
  const first=row(40),second={...row(50),createdAt:'2026-11-09T18:00:00.000Z',finishedAt:'2026-11-09T18:00:02.000Z'};
  await budget.checkpoint('parent','preparation',{requests:[first,second]});
  assert.equal(new FactoryBudget(options).view().activeMs,3000);
  await assert.rejects(budget.checkpoint('parent','preparation',{requests:[first]}),{code:'factory_budget_receipt_conflict'});
  await budget.native('native-parent','preparation',100,1000);await budget.native('native-parent','preparation',100,0);
  await budget.native('native-parent','preparation',120,500);
  assert.equal(budget.view().observedTokens,210);assert.equal(budget.view().activeMs,4500);
});
test('existing uncertainty and identities are preserved; status has no write side effects',async t=>{
  const {options,budget}=fixture(t);assert.equal(readFactoryBudget(options).maxTokens,10_000_000);
  assert.equal(fs.existsSync(path.join(options.stateRoot,'agents')),false);
  await budget.observe('legacy','preparation',{observedTokens:476526,chargedTokens:476526,activeMs:0,usageKnown:false,source:'legacy-observation'});
  assert.equal(budget.view().observedTokens,476526);assert.equal(budget.view().usageKnown,false);
  assert.throws(()=>readFactoryBudget({...options,chatId:'chat_other'}),{code:'factory_budget_identity'});
});
test('generous stability limits and progress review do not turn useful iterations into a token-economy stop',async t=>{
  const {budget}=fixture(t);assert.ok(FACTORY_STABILITY_BUDGET.buildIterations>=20);
  await budget.checkpoint('p1','preparation',{requests:[row(2_000_000,'measured',2_000_000,650)]});
  assert.equal(budget.view().progressReview,true);assert.ok(budget.check().remainingTokens>0);
  await budget.progress('contract-hash-1');assert.equal(budget.view().progressReview,false);
  await budget.checkpoint('b1','build',{requests:[row(2_000_000,'measured',2_000_000,650)]});
  await budget.progress('contract-hash-1');assert.equal(budget.view().progressReview,true);
  await budget.progress('outcome-hash-2');assert.equal(budget.view().progressReview,false);
});
test('HTTP and API name the same supported process adapter; unsupported surfaces still fail',()=>{
  const data={runtimeFamily:'api',serviceMode:'process',secondaryInterfaces:'CLI',cliEntrypoint:'scripts/counsel.mjs'};
  for(const primaryInterface of ['HTTP','HTTP API','api'])assert.equal(scaffoldCapability({...data,primaryInterface}).supported,true);
  assert.equal(scaffoldCapability({...data,primaryInterface:'custom-device'}).supported,false);
});
test('an approved extension changes both limits once and never clears recorded usage',async t=>{
  const {budget}=fixture(t);await budget.checkpoint('parent','preparation',{requests:[row(450000)]});
  await budget.extend('approved-extension-1',{tokens:2_000_000,activeMs:600000});
  await budget.extend('approved-extension-1',{tokens:2_000_000,activeMs:600000});
  assert.equal(budget.view().maxTokens,12_000_000);assert.equal(budget.view().observedTokens,450000);
  assert.equal(budget.view().maxActiveMs,7_800_000);
  await assert.rejects(budget.extend('approved-extension-1',{tokens:3_000_000}),{code:'factory_budget_receipt_conflict'});
});
