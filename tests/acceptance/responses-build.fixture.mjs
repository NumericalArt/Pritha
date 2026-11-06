// Paid inference is replaced; installed Codex, tools, private budget journal and
// disposable worktree sandbox are real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {ResponsesBuildExecutor} from '../../scripts/agents-mother/build-executors.mjs';
import {startNeuralDeepRun} from '../../scripts/neuraldeep-codex.mjs';
import {startCompatibleRun} from '../../scripts/openai-compatible-codex.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));

for(const connectorId of ['neuraldeep','openrouter'])test(`${connectorId}: installed CLI build preserves Trials, accounts requests and recovers without dispatch`,{timeout:90000},async()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-responses-build-')),source=path.join(directory,'source'),worktree=path.join(directory,'worktree'),stateRoot=path.join(directory,'state');mkdirSync(source);mkdirSync(stateRoot);
  const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:directory,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});
  git('init','-q');writeFileSync(path.join(source,'verify.mjs'),'immutable');git('add','verify.mjs');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture');git('worktree','add','--detach',worktree);
  const model=connectorId==='neuraldeep'?'qwen3.8-27b':'vendor/model',checkpoints=[];let requests=0,fixtureError,exited=false;
  const fetchImpl=async(url,init)=>{
    try{
      assert.ok(String(url).startsWith(connectorId==='neuraldeep'?'https://api.neuraldeep.ru/v1/responses':'https://openrouter.ai/api/v1/responses'));
      const payload=JSON.parse(init.body);requests++;assert.equal(payload.model,model);assert.equal(payload.tools.length,7);assert.ok(payload.max_output_tokens<=16384);
      const serialized=JSON.stringify(payload);if(requests===2)assert.match(serialized,/provider_protected_trial_input/);if(requests===3)assert.match(serialized,/completed/);
      const input=requests===1?{operation_id:'protected_trial_attempt',path:'verify.mjs',expected_sha256:createHash('sha256').update('immutable').digest('hex'),content:'weakened'}:requests===2?{operation_id:'product_write_attempt',path:'product.txt',expected_sha256:null,content:'implemented'}:null;
      const id='build_response_'+requests;assert.ok(requests<=3);
      const output=input?[{type:'function_call',id,call_id:id,name:'mcp__pritha__write_file',arguments:JSON.stringify(input),status:'completed'}]:[{type:'message',id,role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({summary:'Implemented the approved product.',changed_files:['product.txt'],remaining_risks:[]}),annotations:[]}]}];
      return new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'response_'+id,model,status:'completed',output,usage:{input_tokens:100,output_tokens:20,total_tokens:120}}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
    }catch(error){fixtureError=error.message;throw error;}
  };
  const service={require:async()=>({version:'fixture',model:{id:model},capabilities:{contextTokens:262144,outputTokens:16384,parallelLimit:1}})};
  const executor=new ResponsesBuildExecutor(connectorId,{model,effort:'none',service,launch:(options)=>(connectorId==='neuraldeep'?startNeuralDeepRun:startCompatibleRun)(options,{readCredential:()=> 'SYNTHETIC_BUILD_KEY',fetchImpl})});
  const input={root,stateRoot,worktree,runId:'responses_build_fixture',iteration:1,remainingIterations:1,tokenBudget:100000,timeoutMs:40000,plan:{spec_id:'fixture',trials:[],demo:[]},protectedPaths:[{path:'verify.mjs'}],onCheckpoint:async value=>checkpoints.push(structuredClone(value))};
  try{
    let result;try{result=await executor.execute(input);}catch(error){exited=error.details?.executorResult?.process_exited===true;assert.fail(JSON.stringify({code:error.code,receipt:error.details?.executorResult,fixtureError,requests}));}
    exited=result.process_exited;assert.equal(result.status,'completed');assert.equal(result.tokens_used,360);assert.equal(result.model_observed,model);assert.equal(result.provider_observed,connectorId);
    assert.equal(readFileSync(path.join(worktree,'verify.mjs'),'utf8'),'immutable');assert.equal(readFileSync(path.join(worktree,'product.txt'),'utf8'),'implemented');assert.ok(checkpoints.some(value=>value.usage_status==='measured'));
    const replay=await executor.execute(input);assert.equal(replay.attempt_id,result.attempt_id);
    const recovered=await executor.recover(input,result);assert.equal(recovered.tokens_used,360);assert.equal(recovered.model_pinned,model);assert.equal(requests,3);
  }finally{executor.close();if(exited)rmSync(directory,{recursive:true,force:true});}
});

for(const mode of ['empty','invalid-arguments'])test(`neuraldeep: installed CLI preserves the precise ${mode} refusal and measured usage without retry`,{timeout:90000},async()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-nd-refusal-')),source=path.join(directory,'source'),worktree=path.join(directory,'worktree'),stateRoot=path.join(directory,'state');mkdirSync(source);mkdirSync(stateRoot);
  const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:directory,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});
  git('init','-q');writeFileSync(path.join(source,'verify.mjs'),'immutable');git('add','verify.mjs');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture');git('worktree','add','--detach',worktree);
  const model='gpt-oss-120b',expected=mode==='empty'?'neuraldeep_empty_response':'neuraldeep_tool_arguments';let requests=0,exited=false;
  const fetchImpl=async(_url,init)=>{
    const payload=JSON.parse(init.body);requests++;assert.equal(payload.model,model);assert.equal(payload.reasoning.effort,'high');assert.equal(requests,1);
    const output=mode==='empty'?[{type:'reasoning',id:'private_reasoning_fixture',summary:[]}]:[{type:'function_call',id:'invalid_call_fixture',call_id:'invalid_call_fixture',name:'mcp__pritha__read_file',arguments:'{',status:'completed'}];
    return new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'refused_response_fixture',model:'openai/'+model,status:'completed',output,usage:{input_tokens:100,output_tokens:20,total_tokens:120}}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  };
  const service={require:async()=>({version:'fixture',model:{id:model},capabilities:{contextTokens:131072,outputTokens:16384,parallelLimit:1}})};
  const executor=new ResponsesBuildExecutor('neuraldeep',{model,effort:'high',service,launch:options=>startNeuralDeepRun(options,{readCredential:()=> 'SYNTHETIC_REFUSAL_KEY',fetchImpl})});
  const input={root,stateRoot,worktree,runId:'refusal_fixture',iteration:1,remainingIterations:1,tokenBudget:80000,timeoutMs:20000,plan:{spec_id:'fixture',trials:[],demo:[]},protectedPaths:[{path:'verify.mjs'}]};
  try{
    let receipt;await assert.rejects(executor.execute(input),error=>{receipt=error.details?.executorResult;exited=receipt?.process_exited===true;return error.code===expected;});
    assert.equal(receipt.error_code,expected);assert.equal(receipt.tokens_used,120);assert.equal(receipt.usage_status,'measured');assert.equal(receipt.process_exited,true);
    assert.equal(receipt.model_observed,model);assert.equal(receipt.effort_effective,'high');assert.equal(receipt.thread_cleanup,'closed');
    assert.equal(readFileSync(path.join(worktree,'verify.mjs'),'utf8'),'immutable');assert.equal(execFileSync('git',['status','--short'],{cwd:worktree,encoding:'utf8'}),'');
    assert.doesNotMatch(JSON.stringify(receipt),/SYNTHETIC_REFUSAL_KEY|private_reasoning_fixture|provider_input/);
    const replay=await executor.execute(input);assert.equal(replay.attempt_id,receipt.attempt_id);assert.equal(replay.error_code,expected);assert.equal(requests,1);
  }finally{executor.close();if(exited)rmSync(directory,{recursive:true,force:true});}
});
