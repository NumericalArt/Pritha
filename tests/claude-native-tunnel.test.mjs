import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,connect} from 'node:net';
import {once} from 'node:events';
import {listenClaudeNativeTunnel} from '../scripts/claude/native-tunnel.mjs';

async function exchange(port,request,payload){
  const socket=connect({host:'127.0.0.1',port});socket.setTimeout(3000,()=>socket.destroy(new Error('timeout')));await once(socket,'connect');
  return await new Promise((resolve,reject)=>{let data=Buffer.alloc(0),sent=false;socket.on('error',reject);socket.on('data',chunk=>{
    data=Buffer.concat([data,chunk]);if(!data.includes('\r\n\r\n'))return;
    if(!payload || !data.toString().startsWith('HTTP/1.1 200')){socket.destroy();resolve(data);return;}
    if(!sent){sent=true;socket.write(payload);}const end=data.indexOf('\r\n\r\n')+4;
    if(data.length-end>=payload.length){socket.destroy();resolve(data.subarray(end));}
  });socket.write(request);});
}
test('native tunnel forwards opaque bytes only to exact TLS hosts at a pinned public address',async t=>{
  const echo=createServer(socket=>socket.pipe(socket));echo.listen(0,'127.0.0.1');await once(echo,'listening');t.after(()=>new Promise(resolve=>echo.close(resolve)));
  const calls=[];const tunnel=await listenClaudeNativeTunnel({lookupImpl:async host=>{calls.push(host);return [{address:'93.184.216.34',family:4}];},connectImpl:options=>{assert.deepEqual(options,{host:'93.184.216.34',port:443,family:4});return connect({host:'127.0.0.1',port:echo.address().port});}});t.after(()=>tunnel.close());
  const payload=Buffer.from([0x16,0x03,0x03,0,4,0xff,0,0x81,0x42]);const result=await exchange(tunnel.port,'CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n',payload);assert.deepEqual(result,payload);assert.deepEqual(calls,['api.anthropic.com']);
  for(const target of ['example.com:443','api.anthropic.com.evil.test:443','api.anthropic.com:80','127.0.0.1:443','user@api.anthropic.com:443','api.anthropic.com:443/path'])assert.match((await exchange(tunnel.port,`CONNECT ${target} HTTP/1.1\r\nHost: ignored\r\n\r\n`)).toString(),/403 Forbidden/);
  assert.match((await exchange(tunnel.port,'POST http://api.anthropic.com/v1/messages HTTP/1.1\r\nHost: api.anthropic.com\r\nContent-Length: 0\r\n\r\n')).toString(),/403 Forbidden/);assert.equal(calls.length,1);
});
test('mixed or private DNS answers fail before any connection and close tears down open tunnels',async t=>{
  let connects=0;const tunnel=await listenClaudeNativeTunnel({lookupImpl:async()=>[{address:'93.184.216.34',family:4},{address:'::ffff:127.0.0.1',family:6}],connectImpl:()=>{connects++;throw Error('must not connect');}});t.after(()=>tunnel.close());
  const result=await exchange(tunnel.port,'CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n');assert.match(result.toString(),/403 Forbidden/);assert.equal(connects,0);
  const socket=connect({host:'127.0.0.1',port:tunnel.port});await once(socket,'connect');socket.on('error',error=>assert.equal(error.code,'ECONNRESET'));const closed=new Promise(resolve=>socket.once('close',resolve));await tunnel.close();await closed;
});
