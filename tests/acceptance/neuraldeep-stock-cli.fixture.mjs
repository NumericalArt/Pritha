// Explicit offline provider-transport acceptance: installed CLI, synthetic HTTP upstream, no account key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync,mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startNeuralDeepRun } from '../../scripts/neuraldeep-codex.mjs';

test('installed stock Codex CLI starts and resumes through the protected NeuralDeep adapter with synthetic responses',{timeout:60000},async t=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-nd-stock-fixture-'));
  const code=path.join(root,'code'),state=path.join(root,'state');mkdirSync(code);mkdirSync(state);
  let verifiedExit=true,requestCount=0,sessionId;
  t.after(()=>{if(verifiedExit)rmSync(root,{recursive:true,force:true});});
  for(const iteration of [0,1]){
    const events=[];
    const run=await startNeuralDeepRun({root:fileURLToPath(new URL('../../',import.meta.url)),cwd:code,stateRoot:state,privateRoot:path.join(state,'private','neuraldeep'),temporaryRoot:root,
      model:'qwen3.8-27b',effort:'xhigh',timeoutMs:25000,sandbox:'read-only',resume:sessionId,
      prompt:'Reply exactly FIXTURE_OK. Do not run tools.',onEvent:event=>events.push(event),
      onDiagnosticChunk:chunk=>appendFileSync(path.join(state,'fixture-diagnostics.log'),chunk,{mode:0o600}),
      beforeStart:receipt=>assert.equal(receipt.model,'qwen3.8-27b'),
    },{readCredential:()=> 'synthetic_provider_key',fetchImpl:async(url,options)=>{
      requestCount++;assert.equal(String(url),'https://api.neuraldeep.ru/v1/responses');
      assert.equal(options.headers.get('authorization'),'Bearer synthetic_provider_key');
      const request=JSON.parse(options.body.toString());assert.equal(request.model,'qwen3.8-27b');
      const response={id:`response_${iteration}`,object:'response',created_at:Math.floor(Date.now()/1000),model:request.model,status:'completed',output:[{type:'message',id:`message_${iteration}`,status:'completed',role:'assistant',content:[{type:'output_text',text:'FIXTURE_OK',annotations:[]}]}],usage:{input_tokens:10,output_tokens:2,total_tokens:12}};
      return new Response(`data: ${JSON.stringify({type:'response.created',response:{...response,status:'in_progress',output:[]}})}\n\ndata: ${JSON.stringify({type:'response.completed',response})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
    }});
    const result=await run.completion;verifiedExit=result.processTreeExited;
    assert.equal(result.ok,true,`Stock CLI transport result: ${result.errorCode}; fixture diagnostics remain private during this check.`);
    assert.equal(result.processTreeExited,true);assert.ok(result.sessionId);
    if(sessionId)assert.equal(result.sessionId,sessionId);sessionId=result.sessionId;
    assert.ok(events.some(event=>event.type==='item.completed' && event.item?.type==='agent_message' && event.item.text==='FIXTURE_OK'));
  }
  assert.equal(requestCount,2);
});
