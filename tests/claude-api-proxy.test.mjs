import test from 'node:test';
import assert from 'node:assert/strict';
import { listenClaudeApiProxy } from '../scripts/claude/api-proxy.mjs';
const model='claude-sonnet-5-5',token='LOCAL_CAPABILITY_CANARY_0123456789abc';
const body={model,messages:[{role:'user',content:'test'}],stream:false,max_tokens:20000};
const send=(server,payload=body,options={})=>fetch(server.baseUrl+'/v1/messages',{method:'POST',headers:{'x-api-key':token,'anthropic-version':'2023-06-01',authorization:'Bearer FOREIGN_CANARY','cookie':'COOKIE_CANARY',...options.headers},body:JSON.stringify(payload)});
test('proxy keeps the real key on the host, caps output and refuses foreign tools and origins',async t=>{
  let calls=0;const server=await listenClaudeApiProxy({localToken:token,apiKey:'REAL_KEY_CANARY',model,timeoutMs:5000,maxOutputTokens:1024,fetchImpl:async(url,init)=>{
    calls++;assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init.headers.authorization,'Bearer REAL_KEY_CANARY');assert.doesNotMatch(JSON.stringify(init.headers),/COOKIE_CANARY|FOREIGN_CANARY|LOCAL_CAPABILITY/);assert.equal(init.redirect,'error');assert.equal(JSON.parse(init.body).max_tokens,1024);return Response.json({ok:true});
  }});t.after(()=>server.close());
  assert.equal((await send(server)).status,200);assert.equal((await send(server,{...body,model:'foreign'})).status,400);
  assert.equal((await send(server,{...body,tools:[{name:'Bash',input_schema:{}}]})).status,400);
  assert.equal((await send(server,body,{headers:{origin:'https://foreign.invalid'}})).status,401);assert.equal(calls,1);
});
test('an uncertain dispatch fences all retries and sanitized errors never disclose raw provider output',async t=>{
  let calls=0;const server=await listenClaudeApiProxy({localToken:token,apiKey:'key',model,timeoutMs:5000,fetchImpl:async()=>{calls++;throw new Error('UPSTREAM_SECRET_CANARY');}});t.after(()=>server.close());
  const failed=await send(server);assert.equal(failed.status,502);assert.doesNotMatch(await failed.text(),/UPSTREAM_SECRET/);
  assert.equal((await send(server)).status,409);assert.equal((await send(server,{...body,max_tokens:9})).status,409);assert.equal(calls,1);
});
test('the same accepted prompt cannot be retransmitted as a non-streaming fallback',async t=>{
  let calls=0;const server=await listenClaudeApiProxy({localToken:token,apiKey:'key',model,timeoutMs:5000,fetchImpl:async()=>{calls++;return Response.json({ok:true});}});t.after(()=>server.close());
  assert.equal((await send(server)).status,200);assert.equal((await send(server,{...body,stream:true})).status,409);assert.equal(calls,1);
});
