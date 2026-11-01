import {createServer} from 'node:http';
import {connect} from 'node:net';
import {lookup} from 'node:dns/promises';
import {publicAddress} from '../search/policy.mjs';

// Reviewed native CLI auth/inference destinations, 2026-11-01. No wildcard,
// browser login, plugins, remote MCP, telemetry or arbitrary HTTP forwarding.
export const CLAUDE_NATIVE_HOSTS=Object.freeze(['api.anthropic.com','claude.ai','platform.claude.com']);

/** CONNECT carries opaque TLS between the unmodified CLI and Anthropic.
 * This process never terminates TLS, parses model bodies or sees OAuth tokens. */
export async function listenClaudeNativeTunnel({lookupImpl=lookup,connectImpl=connect,signal}={}){
  const cancelled=()=>Object.assign(new Error('The native Claude task was cancelled.'),{code:'operator_cancel'});
  if(signal?.aborted)throw cancelled();
  const sockets=new Set();let closed=false,attempts=0,bytes=0;
  const server=createServer((_req,res)=>{res.writeHead(403,{'Connection':'close'});res.end();});
  server.headersTimeout=5000;server.requestTimeout=5000;server.maxConnections=16;
  server.on('clientError',(_error,socket)=>socket.destroy());
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(120000,()=>socket.destroy());});
  server.on('connect',(request,client,head)=>{
    client.pause();const reject=()=>{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');};
    const match=/^([a-z.]+):443$/.exec(request.url || '');
    if(closed || signal?.aborted || !match || !CLAUDE_NATIVE_HOSTS.includes(match[1]) || ++attempts>128)return reject();
    void(async()=>{
      let timer;const timeout=new Promise((_,rejectLookup)=>{timer=setTimeout(()=>rejectLookup(new Error()),5000);});
      let rows;try{rows=await Promise.race([lookupImpl(match[1],{all:true}),timeout]);}finally{clearTimeout(timer);}
      if(closed || signal?.aborted || client.destroyed || !Array.isArray(rows) || !rows.length || rows.length>32 || rows.some(row=>!publicAddress(row.address)))return reject();
      // Pin the validated address instead of performing another DNS lookup.
      const target=connectImpl({host:rows[0].address,port:443,family:rows[0].family});sockets.add(target);
      const destroy=()=>{client.destroy();target.destroy();};
      target.once('close',()=>{sockets.delete(target);client.destroy();});target.on('error',destroy);client.once('close',()=>target.destroy());
      target.setTimeout(120000,destroy);const connecting=setTimeout(destroy,10000);target.once('close',()=>clearTimeout(connecting));
      const count=chunk=>{bytes+=chunk.length;if(bytes>128*1024*1024)destroy();};
      target.once('connect',()=>{
        clearTimeout(connecting);if(closed || client.destroyed)return destroy();
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        client.on('data',count);target.on('data',count);
        if(head.length){count(head);target.write(head);}
        client.pipe(target);target.pipe(client);client.resume();
      });
    })().catch(reject);
  });
  const close=async()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',abort);for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));};
  const abort=()=>{void close();};
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){await close();throw cancelled();}
  return {port:server.address()?.port,close};
}
