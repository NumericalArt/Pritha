import test from 'node:test';
import assert from 'node:assert/strict';
import { listenProviderToolServer } from '../scripts/lib/provider-tool-server.mjs';

test('MCP advertises operation ID bounds and returns an actionable redacted correction',async t=>{
  const server=await listenProviderToolServer({hostTools:{call:async()=>{throw Object.assign(new Error('PRIVATE_ID_CANARY'),{code:'provider_operation_id_invalid',field:'PRIVATE_FIELD'});}}});t.after(()=>server.close());
  const post=async(method,params)=>(await(await fetch(server.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+server.token},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json()).result;
  const definitions=(await post('tools/list')).tools;
  for(const tool of definitions.filter(t=>t.inputSchema.properties.operation_id)){
    const schema=tool.inputSchema.properties.operation_id;assert.equal(schema.minLength,8);assert.equal(schema.maxLength,128);assert.ok(new RegExp(schema.pattern).test('write-cli-01'));
  }
  const result=await post('tools/call',{name:'write_file',arguments:{operation_id:'cli1'}}),detail=JSON.parse(result.content[0].text);
  assert.equal(result.isError,true);assert.equal(detail.field,'operation_id');assert.equal(detail.minLength,8);assert.match(detail.hint,/no changes/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
});

test('MCP error hints cannot echo arbitrary exception data or forged field details',async t=>{
  const server=await listenProviderToolServer({hostTools:{call:async()=>{throw Object.assign(new Error('PRIVATE_ERROR_CANARY'),{code:'factory_brief_text_required',field:'design.PRIVATE_FIELD_CANARY'});}}});t.after(()=>server.close());
  const result=await(await fetch(server.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+server.token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_file',arguments:{path:'README.md'}}})})).json();
  assert.equal(result.result.isError,true);assert.equal(result.result.content[0].text,'factory_brief_text_required');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
});

test('MCP serves fixed host tools with capability auth and bounded transport, not a network proxy',async t=>{
  const calls=[],server=await listenProviderToolServer({hostTools:{call:async(name,args)=>{calls.push({name,args});return {content:[{type:'text',text:'fixture'}]};}}});t.after(()=>server.close());
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+server.token};
  const post=(body,extra={})=>fetch(server.url,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  assert.equal((await post({}, {Authorization:'Bearer invalid'})).status,403);assert.equal((await post({}, {Origin:'http://evil.invalid'})).status,403);
  assert.equal((await fetch(server.url,{headers})).status,405);assert.equal((await post({huge:'x'.repeat(256001)})).status,413);
  let response=await post({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});assert.equal((await response.json()).result.protocolVersion,'2025-11-25');
  assert.equal((await post({jsonrpc:'2.0',method:'notifications/initialized'})).status,202);
  response=await post({jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal((await response.json()).result.tools.length,7);
  response=await post({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'read_file',arguments:{path:'README.md'}}});assert.equal((await response.json()).result.content[0].text,'fixture');assert.equal(calls.length,1);
  response=await post({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'foreign_tool',arguments:{}}});assert.equal((await response.json()).error.code,-32602);assert.equal(calls.length,1);
});
