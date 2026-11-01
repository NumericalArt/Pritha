// Installed Codex + real OS sandbox, synthetic Responses only; no provider key/account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync,readFileSync,existsSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {startCompatibleRun} from '../../scripts/openai-compatible-codex.mjs';
import {ExecutionCoordinator} from '../../scripts/lib/execution-coordinator.mjs';
import {providerProcessTreesExited} from '../../scripts/lib/provider-process-proof.mjs';
test('stock Codex starts and resumes an isolated OpenRouter session inside the host sandbox',{timeout:90000},async t=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-compatible-stock-')),code=path.join(root,'code'),state=path.join(root,'state');mkdirSync(code);mkdirSync(state);
  let exited=true,session,requests=0;t.after(()=>{if(exited)rmSync(root,{recursive:true,force:true});});
  for(const iteration of [0,1]){
    const events=[],run=await startCompatibleRun({connectorId:'openrouter',root:fileURLToPath(new URL('../../',import.meta.url)),cwd:code,stateRoot:state,privateRoot:path.join(state,'openrouter'),model:'vendor/model',effort:'none',timeoutMs:35000,sandbox:'read-only',resume:session,
      prompt:'Reply exactly FIXTURE_OK. Do not run tools.',onEvent:event=>events.push(event),onDiagnosticChunk:chunk=>appendFileSync(path.join(state,'diagnostic.log'),chunk,{mode:0o600}),
    },{readCredential:()=> 'SYNTHETIC_KEY',fetchImpl:async(url,options)=>{
      requests++;assert.equal(url,'https://openrouter.ai/api/v1/responses');const payload=JSON.parse(options.body);assert.equal(payload.model,'vendor/model');
      const response={id:'fixture_'+iteration,object:'response',created_at:Math.floor(Date.now()/1000),model:payload.model,status:'completed',output:[{type:'message',id:'message_'+iteration,status:'completed',role:'assistant',content:[{type:'output_text',text:'FIXTURE_OK',annotations:[]}]}],usage:{input_tokens:4,output_tokens:2,total_tokens:6}};
      return new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
    }});
    const result=await run.completion;exited=result.processTreeExited;assert.equal(result.ok,true,JSON.stringify({code:result.errorCode,root,requests,events,diagnostic:existsSync(path.join(state,'diagnostic.log'))?readFileSync(path.join(state,'diagnostic.log'),'utf8').slice(-8000):null}));assert.equal(result.processTreeExited,true);
    if(session)assert.equal(result.sessionId,session);session=result.sessionId;assert.ok(events.some(event=>event.type==='item.completed' && event.item?.text==='FIXTURE_OK'));
  }
  assert.equal(requests,2);
});

test('stock CLI invokes guarded host tools, with secrets and all command networking blocked',{timeout:60000},async t=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-compatible-tools-')),code=path.join(root,'code'),state=path.join(root,'state');mkdirSync(code);mkdirSync(state);writeFileSync(path.join(code,'.env'),'SECRET_CANARY');
  const coordinator=new ExecutionCoordinator({stateRoot:state}),lease=coordinator.claim(['fixture-resource'],'fixture-owner',{kind:'turn',capacity:4});
  let exited=true,hits=0,requests=0,fixtureFailure=null,proof;const approvals=[];t.after(()=>{lease.release();coordinator.close();if(exited)rmSync(root,{recursive:true,force:true});});
  const server=createServer((_request,response)=>{hits++;response.end('EGRESS_ESCAPE');});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const probe=`const fs=require('fs');const net=require('net');const result={};try{fs.readFileSync('.env');result.secret='ESCAPED'}catch{result.secret='denied'}try{fs.writeFileSync('created.txt','okay');result.write='allowed'}catch{result.write='denied'}const s=net.connect({host:'127.0.0.1',port:${server.address().port}});s.on('connect',()=>{result.network='ESCAPED';s.destroy();console.log(JSON.stringify(result))});s.on('error',()=>{result.network='denied';console.log(JSON.stringify(result))});s.setTimeout(1000,()=>{result.network='denied';s.destroy();console.log(JSON.stringify(result))});`;
  const events=[];
  const run=await startCompatibleRun({connectorId:'openrouter',root:fileURLToPath(new URL('../../',import.meta.url)),cwd:code,stateRoot:state,privateRoot:path.join(state,'openrouter'),model:'vendor/model',effort:'none',timeoutMs:30000,sandbox:'workspace-write',prompt:'Execute the provided fixture command, then report FIXTURE_OK.',onEvent:event=>events.push(event),
      hostExecutionContext:{coordinator,lease,chatId:'chat_fixture',turnId:'turn_fixture'},approve:async request=>{approvals.push(request);return {decision:'accept'};},beforeStart:event=>{proof=event.evidence;},onEvidence:event=>{proof=event;}},
    {readCredential:()=> 'SYNTHETIC_KEY',fetchImpl:async(_url,options)=>{try{
      const payload=JSON.parse(options.body);requests++;
      assert(payload.tools.every(tool=>tool.type==='function' && tool.name.startsWith('mcp__pritha__')));assert.equal(payload.tools.length,7);
      const output=requests===1?[{type:'function_call',id:'fixture_call',call_id:'fixture_call',name:'mcp__pritha__run_command',arguments:JSON.stringify({operation_id:'fixture_command_001',argv:[process.execPath,'-e',probe]}),status:'completed'}]:[{type:'message',id:'fixture_message',role:'assistant',status:'completed',content:[{type:'output_text',text:'FIXTURE_OK',annotations:[]}]}];
      if(requests>1){const result=payload.input.find(item=>item.type==='function_call_output' && item.call_id==='fixture_call');assert.ok(result);assert.match(JSON.stringify(result),/denied/);assert.doesNotMatch(JSON.stringify(result),/SECRET_CANARY|EGRESS_ESCAPE/);}
      const response={id:'response_'+requests,model:payload.model,status:'completed',output,usage:{input_tokens:4,output_tokens:2,total_tokens:6}};
      return new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
    }catch(error){fixtureFailure=String(error);throw error;}}});
  const result=await run.completion;exited=result.processTreeExited;assert.equal(result.ok,true,JSON.stringify({code:result.errorCode,requests,fixtureFailure,events}));assert.equal(requests,2);assert.equal(hits,0);assert.equal(readFileSync(path.join(code,'created.txt'),'utf8'),'okay');assert.equal(readFileSync(path.join(code,'.env'),'utf8'),'SECRET_CANARY');
  assert.equal(approvals.length,1);assert.equal(proof.trees.length,2);assert.equal(providerProcessTreesExited(proof),true);
  const item=events.find(event=>event.item?.type==='mcp_tool_call' && event.item.status==='completed')?.item;assert.ok(item);assert.match(JSON.stringify(item),/denied/);
});
