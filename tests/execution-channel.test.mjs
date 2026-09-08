import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { callExecutionChannel, executionChannelView } from '../scripts/lib/execution-channel.mjs';
const moduleUrl=name=>pathToFileURL(path.resolve(`scripts/lib/${name}.mjs`)).href;

async function worker(stateRoot,key) {
  const script=`import {ExecutionCoordinator} from ${JSON.stringify(moduleUrl('execution-coordinator'))};
  import {registerExecutionChannel,executionChannelView} from ${JSON.stringify(moduleUrl('execution-channel'))};
  const db=new ExecutionCoordinator({stateRoot:${JSON.stringify(stateRoot)}}),key=${JSON.stringify(key)};
  const lease=db.claim([key],key);let calls=0;
  const close=registerExecutionChannel(db,key,{view:()=>({owner:lease.owner,generation:lease.generation}),call:async input=>{lease.assertOwned();calls++;if(input.crash)process.exit(0);return {text:input.text,calls,key};}});
  const timer=setInterval(()=>{if(executionChannelView(db,key)){clearInterval(timer);process.send('ready');}},10);
  process.on('message',message=>{if(message==='release'){lease.release();process.send('released');}else {close();lease.release();db.close();process.disconnect();}});`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','ignore','pipe','ipc']});
  let error='';child.stderr.on('data',data=>error+=data);
  await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error(error);})]);
  return {child,async close(){if(child.exitCode!==null)return;const done=once(child,'exit');if(child.connected)child.send('close',()=>{});await done;}};
}

test('private channels route across independent workers and never persist operator text',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-channel-test-')),db=new ExecutionCoordinator({stateRoot:root});
  const a=await worker(root,'thread-a'),b=await worker(root,'thread-b');
  try {
    const secret='Секретный ответ 🪷 unique-answer-84937';
    assert.deepEqual(await callExecutionChannel(db,'thread-a',{text:secret}),{text:secret,calls:1,key:'thread-a'});
    assert.deepEqual(await callExecutionChannel(db,'thread-b',{text:'B'}),{text:'B',calls:1,key:'thread-b'});
    for(const file of [db.file,`${db.file}-wal`])assert.equal(readFileSync(file).includes(Buffer.from(secret)),false);
    const released=once(a.child,'message');a.child.send('release');await released;
    await assert.rejects(callExecutionChannel(db,'thread-a',{text:'stale'}),{code:'execution_owner_changed'});
    assert.equal((await callExecutionChannel(db,'thread-b',{text:'still B'})).calls,2);
  } finally {await a.close();await b.close();db.close();rmSync(root,{recursive:true,force:true});}
});

test('loss after IPC write is unknown and never reconnects or resends automatically',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-channel-test-')),db=new ExecutionCoordinator({stateRoot:root});
  const a=await worker(root,'thread-a');
  try {
    const endpoint=executionChannelView(db,'thread-a');
    await assert.rejects(callExecutionChannel(db,'thread-a',{crash:true}),{code:'control_delivery_unknown'});
    await assert.rejects(callExecutionChannel(db,'thread-a',{text:'again'}),{code:'control_connection_expired'});
    rmSync(path.dirname(endpoint.socketPath),{recursive:true,force:true});
  } finally {await a.close();db.close();rmSync(root,{recursive:true,force:true});}
});
