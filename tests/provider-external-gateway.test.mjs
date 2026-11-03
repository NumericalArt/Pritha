import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync,mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as core from '../scripts/lib/provider-task-runtime.mjs';
import * as channel from '../scripts/lib/execution-channel.mjs';
import * as voiceBackend from '../scripts/lib/provider-voice-task-backend.mjs';
import { randomUUID } from 'node:crypto';
import { ImmutableAttachmentStore } from '../scripts/lib/chat-attachment-store.mjs';

const require=createRequire(import.meta.url);
class GatewayError extends Error{constructor(code,message,status){super(message);Object.assign(this,{code,status});}}
const source=readFileSync('interfaces/control-center/src/lib/codex-chat/external-gateway.ts','utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('require','module','exports',output)(id=>id.endsWith('/provider-task-runtime.mjs')?core:id.endsWith('/execution-channel.mjs')?channel:id.endsWith('/provider-voice-task-backend.mjs')?voiceBackend:id==='./native-gateway'?{CodexChatGatewayError:GatewayError}:require(id),module,module.exports);
const {ExternalChatGateway}=module.exports;

test('a Claude alias preview selects its resolved catalog row so image admission matches the selected model',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'pritha-provider-alias-')),root=path.join(dir,'code'),stateRoot=path.join(dir,'state');mkdirSync(root);mkdirSync(stateRoot);
  const attachments=new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(stateRoot,'private','task-chat')});
  const preset={modelId:'sonnet',reasoningEffort:'medium',timeoutMs:30000,sandbox:'read-only'},model='claude-sonnet-5-5';
  const backend=new ExternalChatGateway(attachments,{connectorId:'claude',root,stateRoot,privateRoot:path.join(stateRoot,'private','task-chat'),executionDirectory:path.join(stateRoot,'execution'),configuration:()=>preset,preflight:async()=>({}),launch:async()=>assert.fail('Preview must not launch inference')},async()=>({connectorId:'claude',status:'ready',version:'2.1.296',checkedAt:new Date().toISOString(),error:null,model:{id:model},models:[{id:model,efforts:['low','medium','high']}],capabilities:{steer:false,interrupt:true,approvals:true,tools:true,attachments:{files:true,images:true},usage:'observed',resume:true,sandbox:'host-enforced',offline:false}}));
  t.after(async()=>{await backend.dispose();await attachments.close();rmSync(dir,{recursive:true,force:true});});
  const runtime=await backend.previewRuntime(preset);
  assert.equal(runtime.selected.modelId,model);
  assert.ok(runtime.models.find(row=>row.id===runtime.selected.modelId)?.inputModalities.includes('image'),'The actual composer lookup must find the selected model image capability.');
  assert.equal(preset.modelId,'sonnet','A read-only preview must not rewrite the saved preset.');
  assert.equal((await backend.listThreads()).data.length,0);
});

test('external gateway preserves the existing HTTP/SSE envelope and probes the pinned model after defaults change',async t=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'pritha-provider-api-')),root=path.join(dir,'code'),stateRoot=path.join(dir,'state');mkdirSync(root);mkdirSync(stateRoot);
  let finish,defaultModel='original-model';const probed=[];
  const attachments=new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(stateRoot,'private','task-chat')});
  const backend=new ExternalChatGateway(attachments, {connectorId:'neuraldeep',root,stateRoot,privateRoot:path.join(stateRoot,'private','task-chat'),executionDirectory:path.join(stateRoot,'codex-chat','execution'),
    attachmentTransport:{validate:async()=>{},prepare:async()=>{throw new Error('Queued files must not dispatch during this fixture');}},
    configuration:()=>({modelId:defaultModel,reasoningEffort:'low',timeoutMs:30000,sandbox:'read-only'}),preflight:async()=>({steer:false}),
    launch:async options=>{await options.beforeStart({identity:'b'.repeat(64),evidence:{fixture:true}});await options.onEvent({type:'thread.started',thread_id:'11111111-2222-4333-8444-555555555555'});const completion=new Promise(resolve=>{finish=resolve;});return {completion,stop(){finish({ok:false,errorCode:'operator_cancel',processTreeExited:true});return true;}};},
  },async modelId=>{probed.push(modelId);return {status:'ready',version:'fixture',checkedAt:new Date().toISOString(),error:null,capabilities:{steer:false,interrupt:true,approvals:false,tools:true,attachments:{files:false,images:false},usage:'observed',resume:true,sandbox:'runtime-enforced',offline:false}};});
  t.after(async()=>{await backend.dispose();await attachments.close();rmSync(dir,{recursive:true,force:true});});
  const input={clientThreadId:'provider_api_thread',source:'chat',initialTurn:{clientMessageId:'provider_api_message',input:[{type:'text',text:'hello'}]}};
  const first=await backend.createThreadWithFirstTurn(input);assert.equal(first.replayed,false);assert.equal(first.data.detail.activeTurnId,first.data.accepted.turn.turnId);
  const chat=first.data.detail.thread.chatId;assert.match(chat,/^chat_neuraldeep_/);assert.equal(first.data.detail.thread.runtime.connectorId,'neuraldeep');
  assert.equal((await backend.createThreadWithFirstTurn(input)).replayed,true);
  defaultModel='changed-default';const runtime=await backend.runtimeStatus(chat);assert.equal(runtime.selected.modelId,'original-model');assert.equal(probed.at(-1),'original-model');assert.equal(runtime.fallbackEnabled,false);
  const preview=await backend.previewRuntime({modelId:'preview-model',reasoningEffort:'high',timeoutMs:60000});assert.equal(preview.selected.modelId,'preview-model');assert.equal(probed.at(-1),'preview-model');assert.equal(preview.selected.effortId,'high');assert.equal((await backend.listThreads({group:'all'})).data.length,1);assert.equal((await backend.runtimeStatus(chat)).selected.modelId,'original-model');
  const queue=await backend.enqueueMessage(chat,{clientMessageId:'provider_api_queue',input:[{type:'text',text:'next'}]});assert.deepEqual(queue[0].attachments,[]);assert.equal(queue[0].attachmentsUnavailable,false);
  await backend.cancelQueued(chat,queue[0].id,queue[0].revision);
  const id=randomUUID();const view=await attachments.upload(id,'draft.txt',new Request('http://fixture',{method:'PUT',body:'original'}));
  const fileQueue=await backend.enqueueMessage(chat,{clientMessageId:'provider_api_file_queue',input:[{type:'text',text:'Keep files'}],attachments:[id]});
  const detail=JSON.parse(JSON.stringify(await backend.threadDetail(chat)));
  assert.deepEqual(detail.queued[0].attachments,[view]);assert.equal(detail.queued[0].attachmentsUnavailable,false);assert.equal(detail.queued[0].id,fileQueue[0].id);
  await backend.cancelQueued(chat,fileQueue[0].id,fileQueue[0].revision);assert.deepEqual((await backend.threadDetail(chat)).queued,[]);
  finish({ok:true,processTreeExited:true});await new Promise(resolve=>setTimeout(resolve,20));
  const page=await backend.historyPage(chat);assert.equal(page.sourceMode,'compatibility');assert.equal(page.data[0].status,'completed');
  const ready=backend.connectionReady(chat,first.data.detail.thread.runtime);assert.equal(ready.data.apiVersion,'1');assert.equal(ready.data.chatId,chat);
  assert.equal((await backend.listThreads({group:'all'})).data.length,1);
  await backend.archiveThread(chat,true);assert.equal((await backend.listThreads({group:'all'})).data.length,0);assert.equal((await backend.listThreads({group:'all',archived:true})).data.length,1);
});
