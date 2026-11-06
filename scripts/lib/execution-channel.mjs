import { createServer, createConnection } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExecutionConflict } from './execution-coordinator.mjs';

// A private Unix socket carries transient operator answers. Payloads and secrets
// never enter SQLite, logs, argv, or a disk queue. No standalone service is started.
const bridges=new Map();
const LIMIT=192*1024;
const recordKey=key=>`execution-channel:${key}`;
function readPacket(socket, consume) {
  let text='',received=false;
  socket.setEncoding('utf8');
  socket.setTimeout(10_000,()=>socket.destroy());
  socket.on('data',chunk=>{
    if(received)return socket.destroy();
    text+=chunk.toString('utf8');
    if(Buffer.byteLength(text)>LIMIT)return socket.destroy();
    const end=text.indexOf('\n');
    if(end<0)return;
    received=true;
    try {Promise.resolve(consume(JSON.parse(text.slice(0,end)))).catch(()=>socket.destroy());} catch {socket.destroy();}
    text='';
  });
}
function bridgeFor(coordinator) {
  let bridge=bridges.get(coordinator.file);
  if(bridge)return bridge;
  // sockaddr_un.sun_path on Darwin has 104 bytes including its NUL. A long
  // TMPDIR may fail to bind, or Node may silently truncate it. /tmp is the
  // system temp directory; mkdtemp creates a fresh, private child in either.
  const suffix='pritha-ipc-XXXXXX/control.sock';
  const parent=Buffer.byteLength(path.join(os.tmpdir(),suffix))<=100 ? os.tmpdir() : '/tmp';
  const directory=mkdtempSync(path.join(parent,'pritha-ipc-'));
  chmodSync(directory,0o700);
  const socketPath=path.join(directory,'control.sock'),token=randomBytes(32).toString('hex');
  const handlers=new Map(),sockets=new Set();
  const server=createServer(socket=>{
    if(sockets.size>=16){socket.destroy();return;}
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    readPacket(socket,async packet=>{
      const supplied=Buffer.from(typeof packet?.token==='string'?packet.token:'');
      if(supplied.length!==token.length || !timingSafeEqual(supplied,Buffer.from(token))){socket.destroy();return;}
      const handler=handlers.get(packet.key);
      if(!handler || !handler.view()){socket.end(JSON.stringify({error:'control_connection_expired'})+'\n');return;}
      try {
        const result=await handler.call(packet.input);
        const reply=JSON.stringify({result});
        socket.end(Buffer.byteLength(reply)<=LIMIT?reply+'\n':JSON.stringify({error:'control_response_unavailable'})+'\n');
      } catch(error) {
        const code=String(error?.code || 'control_delivery_unknown');
        socket.end(JSON.stringify({error:/^[a-z_]{1,80}$/.test(code)?code:'control_delivery_unknown'})+'\n');
      }
    });
  });
  const ready=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(socketPath,()=>{
      try {chmodSync(socketPath,0o600);if(!privateEndpoint(socketPath))throw Error();resolve();}
      catch {reject(new ExecutionConflict('control_channel_unavailable'));}
    });
  });
  ready.catch(()=>{});server.unref();
  bridge={directory,socketPath,token,handlers,server,sockets,ready};
  bridges.set(coordinator.file,bridge);
  return bridge;
}

export function registerExecutionChannel(coordinator,key,{view,call}) {
  const bridge=bridgeFor(coordinator), handler={view,call};
  bridge.handlers.set(key,handler);
  let stopped=false,listening=false,previous='';
  const publish=()=>{
    if(stopped || !listening)return;
    const detail=view();
    if(!detail)return;
    const value={...detail,socketPath:bridge.socketPath,token:bridge.token};
    const fingerprint=JSON.stringify(value);
    if(fingerprint===previous)return;
    const name=recordKey(key);
    coordinator.reserveIntent(name,'channel-v1',{kind:'execution-channel'});
    coordinator.updateIntent(name,{state:'available',channel:value});
    previous=fingerprint;
  };
  const timer=setInterval(()=>{try{publish();}catch{/* Loss of coordination disables discovery. */}},100);
  timer.unref();
  const ready=bridge.ready.then(()=>{listening=true;publish();});
  ready.catch(()=>{}); // Callers that offer an approval also await readiness.
  const close=()=>{
    stopped=true;clearInterval(timer);
    if(bridge.handlers.get(key)!==handler)return;
    bridge.handlers.delete(key);
    try {
      const row=coordinator.getIntent(recordKey(key));
      if(row?.channel?.token===bridge.token)coordinator.updateIntent(recordKey(key),{state:'closed',channel:null},row.revision);
    } catch {/* Original execution claims remain authoritative. */}
    if(!bridge.handlers.size){
      bridges.delete(coordinator.file);
      void bridge.ready.catch(()=>{}).then(()=>bridge.server.close(()=>rmSync(bridge.directory,{recursive:true,force:true})));
    }
  };
  return Object.assign(close,{ready});
}

function privateEndpoint(socketPath) {
  try {
    const directory=lstatSync(path.dirname(socketPath)),socket=lstatSync(socketPath);
    return directory.isDirectory() && !(directory.mode&0o077) && socket.isSocket() && !(socket.mode&0o077)
      && (!process.getuid || (socket.uid===process.getuid() && directory.uid===process.getuid()));
  } catch {return false;}
}
export function executionChannelView(coordinator,key) {
  const row=coordinator.getIntent(recordKey(key));
  return row?.state==='available' && privateEndpoint(row.channel?.socketPath)?row.channel:null;
}

export async function callExecutionChannel(coordinator,key,input) {
  const channel=executionChannelView(coordinator,key);
  if(!channel)throw new ExecutionConflict('control_connection_expired');
  const body=JSON.stringify({key,input,token:channel.token});
  if(Buffer.byteLength(body)>LIMIT)throw new ExecutionConflict('control_payload_too_large');
  return new Promise((resolve,reject)=>{
    let sent=false,settled=false;
    const socket=createConnection(channel.socketPath);
    const fail=()=>{if(!settled){settled=true;reject(new ExecutionConflict(sent?'control_delivery_unknown':'control_connection_expired'));}socket.destroy();};
    socket.on('error',fail);socket.on('close',()=>{if(!settled)fail();});
    socket.on('timeout',fail);
    socket.on('connect',()=>{sent=true;socket.write(body+'\n');});
    readPacket(socket,packet=>{
      if(settled)return;settled=true;
      if(packet.error)reject(new ExecutionConflict(packet.error));else resolve(packet.result);
      socket.destroy();
    });
  });
}
