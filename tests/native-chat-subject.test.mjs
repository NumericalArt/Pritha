import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as subjectModule from '../scripts/lib/chat-subject.mjs';
const require=createRequire(import.meta.url),module={exports:{}};
const source=readFileSync('interfaces/control-center/src/lib/codex-chat/native-gateway.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const dependencies={
  '../../../../../scripts/lib/chat-subject.mjs':subjectModule,
  '../../../../../scripts/lib/task-workspace.mjs':{prepareTaskWorkspace:async()=>({cwd:'/fixture-code',mode:'read-only'}),verifyTaskWorkspace:async()=>{}},
  './normalize':{asObject:value=>value && typeof value==='object'?value:null},
  './native-turn-coordinator':{nativeThreadLeaseKey:(storage,id)=>storage+id,tryAcquireNativeThreadTurn:()=>Object.assign(()=>{},{owner:'replacement',generation:1})},
};
new Function('require','module','exports',code)(id=>id.startsWith('node:')?require(id):dependencies[id] || {},module,module.exports);

test('native creation and empty-thread recovery preserve exact factory context without rewriting user history',async()=>{
  const calls=[],bindings=new Map(),intents=new Map(),subject={kind:'child',slug:'paper-radar',phase:'contract'};
  const execution={reserveIntent(key,hash,value){if(!intents.has(key))intents.set(key,{...value,state:'reserved',revision:0,hash});return {intent:intents.get(key)};},getIntent:key=>intents.get(key),
    updateIntent(key,patch){Object.assign(intents.get(key),patch);},claim:()=>({assertOwned(){},release(){}}),withMutation:async(_key,work)=>work(),listIntents:()=>[]};
  const connection={request:async(method,params)=>{calls.push({method,params});return {thread:{id:'native_'+calls.length},model:'native-model'};},markThreadLoaded(){}};
  const gateway=Object.create(module.exports.CodexChatGateway.prototype);
  Object.assign(gateway,{root:'/fixture-code',store:{root:'/fixture-state',execution,findByClientThreadId:async id=>[...bindings.values()].find(row=>row.clientThreadId===id),putCreatedBinding:async row=>bindings.set(row.chatId,row),patch:async(id,patch)=>{const row={...bindings.get(id),...patch};bindings.set(id,row);return row;}},
    runtime:{effectiveProvider:async()=>({providerId:'desktop_bundled',view:{stateIdentityHash:'fixture'}}),provider:async()=>({view:{stateIdentityHash:'fixture'}}),connection:async()=>connection,threadDefaults:()=>({cwd:'/fixture-code',sandbox:'read-only',model:'native-model'})},
    threadDetail:async id=>({thread:bindings.get(id)}),requireBinding:async id=>bindings.get(id),emit(){}});
  const input={clientThreadId:'native_factory_subject',source:'chat',subject},first=await gateway.createThread(input);
  assert.deepEqual(first.detail.thread.subject,subject);assert.equal(calls.length,1);assert.equal(calls[0].method,'thread/start');assert.equal(calls[0].params.developerInstructions,subjectModule.factorySubjectInstructions(subject));assert.equal(calls[0].params.sandbox,'read-only');
  assert.equal((await gateway.createThread(input)).replayed,true);assert.equal(calls.length,1);
  await assert.rejects(gateway.createThread({...input,subject:{...subject,phase:'implement'}}),{code:'idempotency_conflict'});
  await assert.rejects(gateway.createThread({...input,clientThreadId:'native_invalid_subject',subject:{...subject,approved:true}}),{code:'chat_subject_invalid'});assert.equal(calls.length,1);
  for(const extra of [{factoryIntent:{action:'create-new-agent',slug:'new-child'}},{workspace:{factorySlug:'new-child'}}])await assert.rejects(gateway.createThread({...input,clientThreadId:'native_factory_injection',...extra}),{code:'provider_capability_unavailable'});
  for(const method of ['startTurn','enqueueMessage'])await assert.rejects(gateway[method](first.detail.thread.chatId,{factoryIntent:{action:'create-new-agent',slug:'new-child'}}),{code:'runtime_identity_mismatch'});
  const replaced=await gateway.replaceEmptyDirectThread(first.detail.thread,input);assert.deepEqual(replaced.subject,subject);assert.equal(calls[1].params.developerInstructions,calls[0].params.developerInstructions);assert.equal(calls[1].method,'thread/start');
  await assert.rejects(gateway.startTurn(replaced.chatId,{subject:{...subject,phase:'finish'}}),{code:'runtime_identity_mismatch'});assert.equal(calls.length,2);
});
