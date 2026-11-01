import test from 'node:test';
import assert from 'node:assert/strict';
import {providerAttachmentVerificationRequest} from '../scripts/lib/provider-attachment-verification-api.mjs';
const post=(body={modelId:'fixture/model',expectedRevision:7},extra={})=>new Request('http://127.0.0.1/api/task-runtime/providers/neuraldeep/attachments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),...extra});
const success={verified:true,modelId:'fixture/model',imageFormats:['image/png'],paidCalls:0,processTreesExited:true,privatePath:'/PRIVATE_FIXTURE_PATH',proof:{private:'PRIVATE_PROOF'}};
function fixture(){const calls=[];return {calls,options:{current:()=>({revision:7,modelId:'fixture/model'}),verify:async(...args)=>{calls.push(args);return success;}}};}

test('image verification pins the saved model and revision and returns only a public receipt',async()=>{
  const f=fixture(),request=post(),response=await providerAttachmentVerificationRequest(request,'neuraldeep',f.options),body=await response.text();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(f.calls[0][0],'fixture/model');assert.equal(f.calls[0][1],request.signal);
  assert.doesNotMatch(body,/PRIVATE|privatePath|proof/);assert.deepEqual(JSON.parse(body),{ok:true,modelId:'fixture/model',verified:true,imageFormats:['image/png'],paidCalls:0});
});
test('foreign provider, stale preset and arbitrary paths or evidence never launch a probe',async()=>{
  for(const [connectorId,body] of [['local',{modelId:'fixture/model',expectedRevision:7}],['neuraldeep',{modelId:'different',expectedRevision:7}],['neuraldeep',{modelId:'fixture/model',expectedRevision:6}],['neuraldeep',{modelId:'fixture/model',expectedRevision:7,path:'PRIVATE_PATH'}],['neuraldeep',{modelId:'fixture/model',expectedRevision:7,evidence:{verified:true}}]]){
    const f=fixture(),response=await providerAttachmentVerificationRequest(post(body),connectorId,f.options);assert.ok(response.status>=400);assert.equal(f.calls.length,0);assert.doesNotMatch(await response.text(),/PRIVATE_PATH|different/);
  }
});
test('incomplete probe receipts, paid calls, unknown process exits and private errors cannot claim readiness',async()=>{
  for(const result of [{...success,verified:false},{...success,paidCalls:1},{...success,modelId:'another'},{...success,processTreesExited:false},{...success,imageFormats:[]}]){
    const f=fixture();f.options.verify=async()=>result;const response=await providerAttachmentVerificationRequest(post(),'neuraldeep',f.options);assert.equal(response.status,503);assert.equal((await response.json()).ok,false);
  }
  for(const error of [new Error('PRIVATE_ERROR'),null]){const f=fixture();f.options.verify=async()=>{throw error;};const response=await providerAttachmentVerificationRequest(post(),'neuraldeep',f.options);assert.doesNotMatch(await response.text(),/PRIVATE_ERROR/);}
});
test('aborted and oversized requests stop before verification',async()=>{
  const controller=new AbortController();controller.abort();
  for(const request of [post(undefined,{signal:controller.signal}),post({modelId:'x'.repeat(20000),expectedRevision:7})]){
    const f=fixture(),response=await providerAttachmentVerificationRequest(request,'neuraldeep',f.options);assert.ok(response.status>=400);assert.equal(f.calls.length,0);
  }
});
