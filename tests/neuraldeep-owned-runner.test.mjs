import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync,existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { startNeuralDeepRun,buildCodexExecArgs } from '../scripts/neuraldeep-codex.mjs';

const session='12345678-1234-1234-1234-123456789012';
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'pritha-nd-run-'));mkdirSync(path.join(root,'code'));mkdirSync(path.join(root,'state'));t.after(()=>rmSync(root,{recursive:true,force:true}));return {root:path.join(root,'code'),cwd:path.join(root,'code'),stateRoot:path.join(root,'state'),privateRoot:path.join(root,'state','private','neuraldeep'),temporaryRoot:root,model:'qwen3.8-27b',effort:'xhigh',prompt:'Fixture task',timeoutMs:10000,sandbox:'read-only'};}
const providerResponse=()=>new Response(`data: ${JSON.stringify({type:'response.completed',response:{id:'response',status:'completed',output:[{type:'message',id:'message',role:'assistant',content:[{type:'output_text',text:'Fixture answer'}]}],usage:{input_tokens:4,output_tokens:2}}})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
function fakeSupervisor(capture,{resumeId=session,wrongModel=false,wait=false,treeExited=true}={}){
  return async(command,args,options)=>{
    Object.assign(capture,{command,args,options});
    await options.beforeStart?.({version:1,session:42,escaped:[],coverage:'observed'});
    const child={stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()};let finish;
    const completion=new Promise(resolve=>finish=resolve);let stopped=false;
    const close=code=>{child.stdout.end();child.stderr.end();finish({code,signal:stopped?'SIGTERM':null,processTreeExited:treeExited,error:null});};
    child.stdin.resume();child.stdin.on('finish',()=>{void(async()=>{
      if(wait)return;
      const base=JSON.parse(args.find(value=>value.startsWith('model_providers.neuraldeep.base_url=')).split('=').slice(1).join('='));
      const response=await fetch(base+'/responses',{method:'POST',headers:{authorization:`Bearer ${options.env.PRITHA_PROVIDER_CAPABILITY}`},body:JSON.stringify({model:wrongModel?'foreign-model':'qwen3.8-27b',stream:true})});
      capture.response=await response.text();
      child.stdout.write(JSON.stringify({type:'thread.started',thread_id:resumeId})+'\n');
      if(!response.ok)child.stdout.write(JSON.stringify({type:'turn.failed'})+'\n');
      else child.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:4,output_tokens:2}})+'\n');
      close(response.ok?0:1);
    })().catch(error=>{capture.fixtureError=error;close(1);});});
    return {child,completion,stop:()=>{if(stopped)return false;stopped=true;close(1);return true;},evidence:{version:1,session:42,escaped:[]}};
  };
}

test('owned runner pins model, isolates credentials, records request usage and preserves exact resume',async t=>{
  const options=fixture(t),capture={},events=[],requests=[];let authorized=false;
  const run=await startNeuralDeepRun({...options,resume:session,env:{...process.env,OPENAI_API_KEY:'FOREIGN_SECRET_CANARY',ANTHROPIC_API_KEY:'FOREIGN_SECRET_CANARY'},beforeStart:receipt=>{assert.equal(receipt.model,options.model);authorized=true;},onEvent:event=>events.push(event),onProviderRequest:event=>requests.push(event)},
    {inspectSession:()=>({available:true}),readCredential:()=> 'UPSTREAM_SECRET_CANARY',fetchImpl:async(_url,init)=>{assert.equal(authorized,true);assert.equal(init.headers.get('authorization'),'Bearer UPSTREAM_SECRET_CANARY');return providerResponse();},spawnSupervised:fakeSupervisor(capture)});
  const result=await run.completion;assert.equal(result.ok,true);assert.equal(result.sessionId,session);assert.equal(result.model,options.model);
  assert.deepEqual(result.usage,{input_tokens:4,output_tokens:2});assert.equal(requests.length,1);assert.equal(requests[0].usage.totalTokens,6);
  assert.doesNotMatch(JSON.stringify(capture.options.env)+JSON.stringify(capture.args),/UPSTREAM_SECRET_CANARY|FOREIGN_SECRET_CANARY/);
  assert.equal(capture.args.includes('--last'),false);assert.deepEqual(capture.args.slice(0,2),['exec','resume']);
  assert.equal(capture.args.some(value=>value.startsWith('model_reasoning_effort=')),false,'ignored Qwen effort is not misrepresented as an effective runtime control');
  assert.equal(existsSync(capture.options.env.TMPDIR),false);assert.equal(run.stop(),false);assert.equal(events.length,2);
});

test('wrong session and provider-side model drift fail without changing provider',async t=>{
  for(const mode of ['session','model']){
    const options=fixture(t),capture={};let calls=0;
    const run=await startNeuralDeepRun({...options,resume:session},{inspectSession:()=>({available:true}),readCredential:()=> 'KEY_CANARY',fetchImpl:async()=>{calls++;return providerResponse();},spawnSupervised:fakeSupervisor(capture,{resumeId:mode==='session'?'87654321-4321-4321-4321-210987654321':session,wrongModel:mode==='model'})});
    const result=await run.completion;assert.equal(result.ok,false);
    if(mode==='session')assert.equal(result.errorCode,'runtime_identity_mismatch');else{assert.equal(calls,0);assert.equal(result.providerError.code,'neuraldeep_model_identity_mismatch');}
  }
});

test('Stop controls only its owned run and unknown process exit preserves scratch for recovery',async t=>{
  const options=fixture(t),capture={};
  const run=await startNeuralDeepRun(options,{readCredential:()=> 'KEY_CANARY',fetchImpl:async()=>providerResponse(),spawnSupervised:fakeSupervisor(capture,{wait:true,treeExited:false})});
  assert.equal(run.stop(),true);const result=await run.completion;
  assert.equal(result.ok,false);assert.equal(result.errorCode,'operator_cancel');assert.equal(result.processTreeExited,false);assert.equal(existsSync(capture.options.env.TMPDIR),true);
});

test('credentials, unsafe sandbox and unverified images fail without stock CLI execution',async t=>{
  const options=fixture(t);let starts=0;
  await assert.rejects(startNeuralDeepRun(options,{readCredential:()=>'',spawnSupervised:()=>{starts++;}}),{code:'provider_pending_auth'});
  assert.equal(starts,0);
  assert.throws(()=>buildCodexExecArgs({...options,baseUrl:'http://127.0.0.1:12345/v1',sandbox:'danger-full-access'}),{code:'provider_sandbox_invalid'});
  assert.throws(()=>buildCodexExecArgs({...options,baseUrl:'http://127.0.0.1:12345/v1',images:['/fixture/image.png']}),{code:'model_image_unverified'});
});

test('a missing resume proof prevents execution and an unconfirmed supervisor failure retains scratch',async t=>{
  const options=fixture(t);let starts=0,temporary;
  await assert.rejects(startNeuralDeepRun({...options,resume:session},{readCredential:()=> 'KEY',spawnSupervised:()=>{starts++;}}),{code:'provider_session_missing'});
  assert.equal(starts,0);
  await assert.rejects(startNeuralDeepRun(options,{readCredential:()=> 'KEY',fetchImpl:async()=>providerResponse(),spawnSupervised:async(_command,_args,options)=>{
    temporary=options.env.TMPDIR;throw Object.assign(new Error('unconfirmed supervisor'),{processTreeExited:false});
  }}),error=>error.processTreeExited===false);
  assert.equal(existsSync(temporary),true);
});
