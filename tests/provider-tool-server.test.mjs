import test from 'node:test';
import assert from 'node:assert/strict';
import { listenProviderToolServer } from '../scripts/lib/provider-tool-server.mjs';

test('MCP serves fixed host tools with capability auth and bounded transport, not a network proxy',async t=>{
  const calls=[],server=await listenProviderToolServer({hostTools:{call:async(name,args)=>{calls.push({name,args});return {content:[{type:'text',text:'fixture'}]};}}});t.after(()=>server.close());
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+server.token};
  const post=(body,extra={})=>fetch(server.url,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  assert.equal((await post({}, {Authorization:'Bearer invalid'})).status,403);assert.equal((await post({}, {Origin:'http://evil.invalid'})).status,403);
  assert.equal((await fetch(server.url,{headers})).status,405);assert.equal((await post({huge:'x'.repeat(256001)})).status,413);
  let response=await post({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});assert.equal((await response.json()).result.protocolVersion,'2025-11-25');
  assert.equal((await post({jsonrpc:'2.0',method:'notifications/initialized'})).status,202);
  response=await post({jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal((await response.json()).result.tools.length,6);
  response=await post({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'read_file',arguments:{path:'README.md'}}});assert.equal((await response.json()).result.content[0].text,'fixture');assert.equal(calls.length,1);
  response=await post({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'foreign_tool',arguments:{}}});assert.equal((await response.json()).error.code,-32602);assert.equal(calls.length,1);
});
