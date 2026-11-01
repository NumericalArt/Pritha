// Explicit opt-in protocol acceptance: installed CLI, real OS sandbox, synthetic
// Anthropic upstream. No account key, paid inference or remote model request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startClaudeCodeRun } from '../../scripts/claude-code-runner.mjs';
import { ClaudeCodeBuildExecutor } from '../../scripts/agents-mother/build-executors.mjs';
import { ExecutionCoordinator } from '../../scripts/lib/execution-coordinator.mjs';
import { providerProcessTreesExited } from '../../scripts/lib/provider-process-proof.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),model='claude-sonnet-5-5';
function reply(id,tool,finalText='FIXTURE_OK'){
  const events=[
    {type:'message_start',message:{id,role:'assistant',model,type:'message',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0}}},
    {type:'content_block_start',index:0,content_block:tool?{type:'tool_use',id:'tool_'+id,name:tool.name,input:{}}:{type:'text',text:''}},
    {type:'content_block_delta',index:0,delta:tool?{type:'input_json_delta',partial_json:JSON.stringify(tool.input)}:{type:'text_delta',text:finalText}},
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:3}},
    {type:'message_stop'},
  ];
  return new Response(events.map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
}
test('stock Claude API lane starts and resumes exactly under an enforced sandbox',{timeout:90000,skip:process.platform!=='darwin'},async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-stock-')),cwd=path.join(directory,'workspace'),stateRoot=path.join(directory,'state');mkdirSync(cwd);mkdirSync(stateRoot);
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  let requests=0;const events=[],diagnostics=[];
  const dependencies={readCredential:()=> 'SYNTHETIC_ONLY_NOT_A_REAL_KEY',fetchImpl:async(url,init)=>{
    assert.equal(url.startsWith('https://api.anthropic.com/v1/messages'),true);assert.equal(init.headers.authorization,'Bearer SYNTHETIC_ONLY_NOT_A_REAL_KEY');
    const body=JSON.parse(init.body);assert.equal(body.model,model);assert.equal(body.tools?.length || 0,0);requests++;
    if(url.includes('/count_tokens'))return Response.json({input_tokens:10});
    return reply('msg_fixture_'+requests);
  }};
  const options={root,cwd,stateRoot,privateRoot:path.join(stateRoot,'claude'),model,effort:'medium',authMode:'api-key',timeoutMs:40000,prompt:'Reply FIXTURE_OK.',maxTurns:2,
    onEvent:event=>events.push(event),onDiagnosticChunk:chunk=>diagnostics.push(String(chunk))};
  const first=await (await startClaudeCodeRun(options,dependencies)).completion;
  assert.equal(first.ok,true,JSON.stringify({first,diagnostics}));assert.equal(first.processTreeExited,true);assert.ok(first.sessionId);
  const second=await (await startClaudeCodeRun({...options,resume:first.sessionId,prompt:'Reply FIXTURE_OK again.'},dependencies)).completion;
  assert.equal(second.ok,true,JSON.stringify({second,diagnostics}));assert.equal(second.sessionId,first.sessionId);assert.equal(second.processTreeExited,true);
  assert.equal(events.filter(event=>event.item?.text==='FIXTURE_OK').length,2);assert.equal(requests,2);
  assert.doesNotMatch(JSON.stringify(events),/SYNTHETIC_ONLY_NOT_A_REAL_KEY/);
});

test('Claude BuildExecutor uses real isolated CLI tools, protects Trials and settles its host budget',{timeout:90000,skip:process.platform!=='darwin'},async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-delivery-')),source=path.join(directory,'source'),worktree=path.join(directory,'worktree'),stateRoot=path.join(directory,'state');mkdirSync(source);mkdirSync(stateRoot);
  const git=(...args)=>execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:directory,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});
  git('init','-q');const {writeFileSync}=await import('node:fs');writeFileSync(path.join(source,'verify.mjs'),'IMMUTABLE');git('add','verify.mjs');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture');git('worktree','add','--detach',worktree);
  let paid=0;const checkpoints=[];
  const dependencies={readCredential:()=> 'SYNTHETIC_ONLY_NOT_A_REAL_KEY',fetchImpl:async(url,init)=>{
    if(url.includes('/count_tokens'))return Response.json({input_tokens:10});paid++;
    const tool=paid===1?{name:'mcp__pritha__write_file',input:{operation_id:'protected_fixture_001',path:'verify.mjs',expected_sha256:null,content:'weakened'}}
      :paid===2?{name:'mcp__pritha__write_file',input:{operation_id:'product_fixture_001',path:'product.txt',expected_sha256:null,content:'IMPLEMENTED'}}
      :paid===3?{name:'mcp__pritha__run_command',input:{operation_id:'command_fixture_001',argv:[process.execPath,'-e',"const fs=require('fs');if(fs.readFileSync('product.txt','utf8')!=='IMPLEMENTED')process.exit(1);try{fs.writeFileSync('verify.mjs','weakened');process.exit(99)}catch{console.log('VERIFIED')}"]}}:null;
    return reply('msg_build_'+paid,tool,JSON.stringify({summary:'Implemented product; verifier preserved.',changed_files:['product.txt'],remaining_risks:[]}));
  }};
  const executor=new ClaudeCodeBuildExecutor({root,stateRoot,service:{require:async()=>({version:'2.1.296',model:{id:model}})},launch:options=>startClaudeCodeRun(options,dependencies)});
  t.after(()=>{executor.close();rmSync(directory,{recursive:true,force:true});});
  const result=await executor.execute({root,stateRoot,worktree,runId:'stock_fixture_run',iteration:1,remainingIterations:1,tokenBudget:30000,timeoutMs:60000,plan:{spec_id:'fixture',trials:[],demo:[]},protectedPaths:[{path:'verify.mjs'}],onCheckpoint:async value=>checkpoints.push(value)});
  assert.equal(result.status,'completed');assert.equal(result.process_exited,true);assert.equal(result.usage_status,'measured');assert.equal(result.tokens_used,32);assert.equal(paid,4);assert.equal(result.model_observed,model);
  assert.equal(readFileSync(path.join(worktree,'verify.mjs'),'utf8'),'IMMUTABLE');assert.equal(readFileSync(path.join(worktree,'product.txt'),'utf8'),'IMPLEMENTED');assert.equal(result.summary,'Implemented product; verifier preserved.');assert.ok(checkpoints.some(row=>row.usage_status==='unknown'));
});

test('stock Claude invokes only host MCP tools, waits for exact approval and joins command ownership',{timeout:90000,skip:process.platform!=='darwin'},async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-mcp-')),cwd=path.join(directory,'workspace'),stateRoot=path.join(directory,'state');mkdirSync(cwd);mkdirSync(stateRoot);
  const coordinator=new ExecutionCoordinator({stateRoot}),lease=coordinator.claim(['fixture-resource'],'fixture-owner',{kind:'turn',capacity:4});
  t.after(()=>{lease.release();coordinator.close();rmSync(directory,{recursive:true,force:true});});
  let requests=0,proof;const events=[],diagnostics=[],approvals=[];
  const dependencies={readCredential:()=> 'SYNTHETIC_ONLY_NOT_A_REAL_KEY',fetchImpl:async(url,init)=>{
    const body=JSON.parse(init.body);assert.equal(body.model,model);assert.equal(body.tools.length,7);assert.ok(body.tools.every(tool=>tool.name.startsWith('mcp__pritha__')));
    if(url.includes('/count_tokens'))return Response.json({input_tokens:10});
    requests++;return reply('msg_host_'+requests,requests===1?{name:'mcp__pritha__write_file',input:{operation_id:'write_fixture_001',path:'hello.txt',expected_sha256:null,content:'HOST_TOOL_OK'}}:requests===2?{name:'mcp__pritha__run_command',input:{operation_id:'command_fixture_001',argv:['/bin/cat','hello.txt']}}:null);
  }};
  const options={root,cwd,stateRoot,privateRoot:path.join(stateRoot,'claude'),model,effort:'medium',authMode:'api-key',sandbox:'workspace-write',tokenBudget:30000,timeoutMs:60000,prompt:'Perform the supplied fixture tool operations, then reply FIXTURE_OK.',maxTurns:4,
    hostExecutionContext:{coordinator,lease,chatId:'chat_fixture',turnId:'turn_fixture'},approve:async request=>{approvals.push(request);return {decision:'accept'};},
    beforeStart:event=>{proof=event.evidence;},onEvidence:event=>{proof=event;},onEvent:event=>events.push(event),onDiagnosticChunk:chunk=>diagnostics.push(String(chunk))};
  const result=await (await startClaudeCodeRun(options,dependencies)).completion;
  assert.equal(result.ok,true,JSON.stringify({result,diagnostics,events}));assert.equal(result.processTreeExited,true);assert.equal(requests,3);assert.equal(result.budget.tokensUsed,24);assert.equal(result.budget.requests.length,3);
  assert.equal(readFileSync(path.join(cwd,'hello.txt'),'utf8'),'HOST_TOOL_OK');assert.equal(approvals.length,2);assert.equal(proof.trees.length,2);assert.equal(providerProcessTreesExited(proof),true);
  assert.equal(events.filter(event=>event.type==='item.completed' && event.item?.type==='mcp_tool_call' && event.item.status==='completed').length,2);
});
