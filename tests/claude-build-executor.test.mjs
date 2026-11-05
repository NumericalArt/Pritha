import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeBuildExecutor,ResponsesBuildExecutor,createBuildExecutor } from '../scripts/agents-mother/build-executors.mjs';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),session='12345678-1234-1234-1234-123456789012',identity='a'.repeat(64),model='claude-sonnet-5-5';
test('NeuralDeep refuses unsupported build effort and separate thinking controls before probing credentials',async()=>{
  const executor=new ResponsesBuildExecutor('neuraldeep'),service=executor.service({root,stateRoot:root});
  await assert.rejects(service.require({modelId:'gpt-oss-120b',reasoningEffort:'xhigh'}),{code:'provider_effort_invalid'});
  await assert.rejects(service.require({modelId:'qwen3.8-27b',reasoningEffort:'xhigh',thinkingBudget:1000}),{code:'provider_thinking_budget_unverified'});
  assert.equal(createBuildExecutor('local').connectorId,'local');
});
function fixture(t,{unknown=false,wait=false,report,connectorId='claude'}={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-build-')),source=path.join(directory,'source'),worktree=path.join(directory,'worktree'),stateRoot=path.join(directory,'state');mkdirSync(source);mkdirSync(stateRoot);
  const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:directory,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});
  git('init','-q');writeFileSync(path.join(source,'verify.mjs'),'immutable');git('add','verify.mjs');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture');git('worktree','add','--detach',worktree);
  const checkpoints=[],calls=[],service={require:async()=>({version:'2.1.296',model:{id:model},capabilities:{parallelLimit:1}})};
  const input={root,stateRoot,worktree,runId:'fixture_run_1',iteration:1,remainingIterations:2,tokenBudget:10000,timeoutMs:30000,plan:{spec_id:'fixture',trials:[],demo:[]},protectedPaths:[{path:'verify.mjs'}],onCheckpoint:async value=>checkpoints.push(structuredClone(value))};
  let finish,last;
  const accounting=known=>({version:1,tokenBudget:10000,tokensUsed:known?120:null,usageKnown:known,requests:[{status:known?'measured':'unknown',usage:known?{totalTokens:120}:null}]});
  const persist=known=>{mkdirSync(path.join(last.privateRoot,'budgets'),{recursive:true});writeFileSync(path.join(last.privateRoot,'budgets',last.budgetId+'.json'),JSON.stringify({identity,sessionId:session,model,budgetId:last.budgetId,...accounting(known)}));};
  const launch=async options=>{last=options;calls.push(options);await options.beforeStart({identity,evidence:{fixture:true},sessionId:session,budgetId:options.budgetId});persist(!unknown);await options.onBudgetCheckpoint(accounting(!unknown));await options.onEvent({type:'item.completed',item:{type:'agent_message',text:report ?? JSON.stringify({summary:'implemented',changed_files:['product.txt'],remaining_risks:[]})}});
    const value={ok:!unknown,model,sessionId:session,processTreeExited:!unknown,budget:accounting(!unknown)};const completion=wait?new Promise(resolve=>{finish=()=>resolve(value);}):Promise.resolve(value);return {completion,stop(){finish?.();return true;}};};
  const Executor=connectorId==='claude'?ClaudeCodeBuildExecutor:class extends ResponsesBuildExecutor {constructor(options){super(connectorId,options);}};
  const executor=new Executor({service,launch,root,stateRoot,...(connectorId==='local'?{baseUrl:'http://127.0.0.1:1234/v1'}:{})});
  const coordinator=()=>new ExecutionCoordinator({stateRoot,directory:path.join(stateRoot,'codex-chat','execution')});
  t.after(()=>{executor.close();rmSync(directory,{recursive:true,force:true});});return {input,executor,Executor,service,launch,checkpoints,calls,persist,coordinator,finish:()=>finish?.()};
}
test('a measured Claude host budget refusal raises the delivery budget blocker and keeps its original receipt',async t=>{
  const f=fixture(t);f.executor.options.launch=async options=>{
    const run=await f.launch(options);
    return {...run,completion:run.completion.then(result=>({...result,ok:false,errorCode:'provider_budget_exhausted',budget:{...result.budget,errorCode:'provider_budget_exhausted'}}))};
  };
  let receipt;
  await assert.rejects(f.executor.execute(f.input),error=>{receipt=error.details.executorResult;return error.code==='token_budget_exhausted';});
  assert.equal(receipt.error_code,'provider_budget_exhausted');assert.equal(receipt.process_exited,true);assert.equal(receipt.tokens_used,120);
  assert.equal(receipt.usage_status,'measured');assert.equal(f.calls.length,1);
  assert.equal((await f.executor.execute(f.input)).attempt_id,receipt.attempt_id);assert.equal(f.calls.length,1);
});
for(const connectorId of ['claude','neuraldeep','openrouter','local']){
if(connectorId!=='claude'){
test(connectorId+': a read-only factory chat can build only inside its isolated writable worktree',async t=>{
  const f=fixture(t,{connectorId});
  const saved={modelId:model,reasoningEffort:'medium',timeoutMs:1800000,sandbox:'read-only'};
  f.executor.options.preset=saved;
  const expected={modelId:model,reasoningEffort:'medium',timeoutMs:900000,...(connectorId==='local'?{baseUrl:'http://127.0.0.1:1234/v1'}:{})};
  const require=f.service.require;
  f.service.require=async preset=>{assert.deepEqual(preset,expected);return require(preset);};
  assert.equal((await f.executor.probe(f.input)).available,true);
  const result=await f.executor.execute(f.input);
  assert.equal(result.status,'completed');assert.equal(result.tokens_used,120);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].sandbox,'workspace-write');assert.equal(f.calls[0].cwd,realpathSync(f.input.worktree));
  assert.deepEqual(f.calls[0].hostExecutionContext.protectedPaths,['verify.mjs']);
  assert.deepEqual(saved,{modelId:model,reasoningEffort:'medium',timeoutMs:1800000,sandbox:'read-only'});
  f.executor.options.preset={...saved,unexpected:true};
  assert.equal((await f.executor.probe(f.input)).error,'provider_preset_field_invalid');
  f.executor.options.preset={...saved,sandbox:'danger-full-access'};
  assert.equal((await f.executor.probe(f.input)).error,'provider_sandbox_invalid');
  assert.equal(f.calls.length,1);
});
}
test(connectorId+': builds require isolated worktrees, pin model, account every request and replay without another launch',async t=>{
  const f=fixture(t,{connectorId});assert.ok(createBuildExecutor('claude-code') instanceof ClaudeCodeBuildExecutor);assert.equal((await f.executor.probe(f.input)).available,true);
  assert.equal((await f.executor.probe({...f.input,worktree:root})).available,false);
  const result=await f.executor.execute(f.input);assert.equal(result.status,'completed');assert.equal(result.tokens_used,120);assert.equal(result.usage_status,'measured');assert.equal(result.model_observed,model);assert.equal(result.budget_enforcement,'host-reservation-estimate');assert.equal(result.goal_enforcement,'not-applicable');assert.equal(result.summary,'implemented');
  if(connectorId==='local')assert.equal(f.calls[0].baseUrl,'http://127.0.0.1:1234/v1');
  assert.deepEqual(f.calls[0].hostExecutionContext.protectedPaths,['verify.mjs']);assert.equal((await f.executor.execute(f.input)).attempt_id,result.attempt_id);assert.equal(f.calls.length,1);
  const db=f.coordinator();assert.equal(db.claims().length,0);db.close();await assert.rejects(f.executor.execute({...f.input,tokenBudget:20000}),{code:'executor_recovery_mismatch'});
});
test(connectorId+': a concurrent worker cannot start a second build or replace the saved model',async t=>{
  const f=fixture(t,{wait:true,connectorId}),pending=f.executor.execute(f.input);for(let i=0;i<100 && !f.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  const second=new f.Executor({root,service:f.service,launch:f.launch,model:'claude-opus-5-5'});
  await assert.rejects(second.execute(f.input),{code:'executor_recovery_required'});assert.equal(f.calls.length,1);f.finish();await pending;
});
test(connectorId+': recovery never launches or trusts a previous measured checkpoint over an unknown budget receipt',async t=>{
  const f=fixture(t,{unknown:true,connectorId});let saved;await assert.rejects(f.executor.execute(f.input),error=>{saved=error.details.executorResult;return error.code==='goal_usage_unavailable';});
  let exited=false;const recover=new f.Executor({root,model:'claude-opus-5-5',service:{require:async()=>assert.fail('Recovery must not probe another model')},launch:async()=>assert.fail('Recovery must not launch'),proveExit:()=>exited});
  assert.equal((await recover.recover(f.input,saved)).process_exited,false);let db=f.coordinator();assert.ok(db.claims().length);db.close();
  exited=true;let result=await recover.recover(f.input,saved);assert.equal(result.usage_status,'unknown');assert.equal(result.tokens_used,null);assert.equal(result.model_pinned,model);
  f.persist(true);result=await recover.recover(f.input,saved);assert.equal(result.usage_status,'measured');assert.equal(result.tokens_used,120);assert.equal(result.model_observed,model);assert.equal(f.calls.length,1);
  db=f.coordinator();assert.equal(db.claims().length,0);db.close();
});
test(connectorId+': a failed pre-dispatch checkpoint launches nothing and leaves a recoverable not-started receipt',async t=>{
  const f=fixture(t,{connectorId});let saved;
  await assert.rejects(f.executor.execute({...f.input,onCheckpoint:async()=>{throw new Error('private failure');}}),error=>{saved=error.details.executorResult;return error.code==='executor_checkpoint_failed';});
  assert.equal(f.calls.length,0);assert.equal(saved.process_exited,true);assert.equal(saved.status,'not-started');assert.equal(saved.usage_status,'not-started');
  const db=f.coordinator();assert.equal(db.claims().length,0);db.close();
  const recovered=await f.executor.recover(f.input,saved);assert.equal(recovered.usage_status,'not-started');assert.equal(recovered.tokens_used,null);assert.equal(f.calls.length,0);
});
test(connectorId+': invalid structured output fails without discarding measured charges or launching a formatting request',async t=>{
  const f=fixture(t,{connectorId,report:JSON.stringify({summary:'done',changed_files:['../outside.txt'],remaining_risks:[]})});let saved;
  await assert.rejects(f.executor.execute(f.input),error=>{saved=error.details.executorResult;return error.code==='build_summary_invalid';});
  assert.equal(saved.process_exited,true);assert.equal(saved.status,'failed');assert.equal(saved.tokens_used,120);assert.equal(saved.usage_status,'measured');assert.equal(f.calls.length,1);
  assert.equal((await f.executor.execute(f.input)).status,'failed');assert.equal(f.calls.length,1);
});
test(connectorId+': Task Chat provider slot also blocks a factory build',async t=>{
  const f=fixture(t,{connectorId}),db=f.coordinator(),lease=db.claim(['provider-slot:'+connectorId+':0'],'occupied-task');assert.ok(lease);
  try{await assert.rejects(f.executor.execute(f.input),{code:'provider_rate_limited'});assert.equal(f.calls.length,0);assert.equal(db.claims().length,1);}
  finally{lease.release();db.close();}
});
test(connectorId+': a bound waiting voice factory lends one slot without releasing its parent on completion or recovery',async t=>{
  for(const unknown of [false,true]){
    const f=fixture(t,{connectorId,unknown}),db=f.coordinator();db.setAdmission(true,1);
    const target=realpathSync(path.join(path.dirname(f.input.worktree),'source')),chatId='chat_voice_factory',turnId='turn_voice_factory',operationId='factory_deliver_001';
    const parent=db.claim(['workspace:'+target,'provider-slot:'+connectorId+':0'],'voice-parent',{kind:'turn',capacity:1,detail:{chatId,connectorId}});assert.ok(parent);
    const factoryParent={owner:parent.owner,generation:parent.generation,chatId,turnId,operationId,target},key='provider-tool:'+turnId+':'+operationId;
    db.reserveIntent(key,'a'.repeat(64),{kind:'provider-tool',tool:'factory_step',state:'running',factoryAction:'deliver',factoryTarget:target,connectorId,...factoryParent});db.updateIntent(key,{state:'running'});
    f.executor.options.factoryParent=factoryParent;const parentCount=db.claims().length;
    if(unknown){let saved;await assert.rejects(f.executor.execute(f.input),error=>{saved=error.details.executorResult;return error.code==='goal_usage_unavailable';});assert.ok(db.claims().length>parentCount);
      const recovery=new f.Executor({root,service:f.service,launch:f.launch,proveExit:()=>true});await recovery.recover(f.input,saved);recovery.close();
    }else assert.equal((await f.executor.execute(f.input)).status,'completed');
    assert.equal(f.calls.length,1);assert.equal(db.claims().length,parentCount);parent.assertOwned();parent.release();db.close();
  }
});
test(connectorId+': a forged or stale factory parent cannot bypass occupied capacity',async t=>{
  const f=fixture(t,{connectorId}),db=f.coordinator();db.setAdmission(true,1);
  const target=realpathSync(path.join(path.dirname(f.input.worktree),'source')),chatId='chat_voice_factory',turnId='turn_voice_factory',operationId='factory_deliver_001';
  const parent=db.claim(['workspace:'+target,'provider-slot:'+connectorId+':0'],'voice-parent',{kind:'turn',capacity:1,detail:{chatId,connectorId}});
  f.executor.options.factoryParent={owner:parent.owner,generation:parent.generation,chatId,turnId,operationId,target};
  await assert.rejects(f.executor.execute(f.input),{code:'factory_delegation_invalid'});assert.equal(f.calls.length,0);parent.assertOwned();parent.release();db.close();
});
}
