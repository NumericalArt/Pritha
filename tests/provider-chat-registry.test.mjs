import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,symlinkSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProviderChatRegistry } from '../scripts/lib/provider-chat-registry.mjs';
import { privateStateFile } from '../scripts/lib/private-state-path.mjs';

function fixture(t,connectorId='neuraldeep'){
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-external-history-'));
  const options={stateRoot,privateRoot:path.join(stateRoot,'private'),connectorId};const stores=[];
  t.after(()=>{for(const store of stores)store.close();rmSync(stateRoot,{recursive:true,force:true});});
  return {options,open:()=>{const store=new ProviderChatRegistry(options);stores.push(store);return store;},input:{clientThreadId:'client-thread-fixture',modelId:'original-model',effortId:'high',timeoutMs:20000,workspacePath:stateRoot,request:{source:'chat',clientThreadId:'client-thread-fixture'},title:'Original'}};
}
test('all external providers keep permanent creation, model and session bindings across workers',t=>{
  for(const connectorId of ['neuraldeep','claude','openrouter','local']){
    const f=fixture(t,connectorId),a=f.open(),b=f.open();
    const created=a.create(f.input);assert.equal(created.created,true);assert.match(created.binding.chatId,new RegExp(`^chat_${connectorId}_`));
    assert.equal(b.create(f.input).created,false);
    const session='12345678-1234-1234-1234-123456789012';a.pinSession(created.binding.chatId,session,'a'.repeat(64));
    assert.equal(b.require(created.binding.chatId).nativeThreadId,session);
    assert.throws(()=>b.pinSession(created.binding.chatId,'87654321-4321-4321-4321-210987654321','a'.repeat(64)),{code:'runtime_identity_mismatch'});
    assert.throws(()=>b.mutate(created.binding.chatId,row=>({...row,modelId:'new-default'})),{code:'runtime_identity_mismatch'});
    assert.throws(()=>b.create({...f.input,request:{...f.input.request,title:'different'}}),{code:'idempotency_conflict'});
    assert.throws(()=>b.require('chat_otherprovider_1234'),{code:'thread_not_found'});
  }
});
test('turn receipts and full original Unicode survive replay and duplicate requests cannot change text',t=>{
  const f=fixture(t),a=f.open(),b=f.open(),chatId=a.create(f.input).binding.chatId;
  const text='Точная исходная строка. '.repeat(1000),input={clientMessageId:'message-fixture-123',text,request:{text}};
  const first=a.reserveTurn(chatId,input),replay=b.reserveTurn(chatId,input);
  assert.equal(first.created,true);assert.equal(replay.created,false);assert.equal(first.turn.turnId,replay.turn.turnId);
  assert.throws(()=>b.reserveTurn(chatId,{...input,request:{text:'different'}}),{code:'idempotency_conflict'});
  let result='',cursor=replay.turn.userMessage.contentRef;
  do{const page=b.content(chatId,'user',cursor);result+=page.text;cursor=page.nextCursor;}while(cursor);
  assert.equal(result,text);
  a.updateTurn(chatId,first.turn.turnId,turn=>({...turn,status:'interrupted',completedAt:new Date().toISOString()}));
  assert.equal(b.turn(chatId,first.turn.turnId).status,'interrupted');
  assert.equal(b.reserveTurn(chatId,input).created,false,'an interrupted receipt must not start the same request again');
});
test('private state boundaries reject symlinks before any file can be overwritten',t=>{
  const f=fixture(t),outside=mkdtempSync(path.join(os.tmpdir(),'pritha-history-outside-'));
  t.after(()=>rmSync(outside,{recursive:true,force:true}));
  const marker=path.join(outside,'history.sqlite');writeFileSync(marker,'untouched');
  mkdirSync(f.options.privateRoot);symlinkSync(outside,path.join(f.options.privateRoot,'neuraldeep'));
  assert.throws(()=>f.open(),{code:'provider_state_path_invalid'});assert.equal(readFileSync(marker,'utf8'),'untouched');
  assert.equal(privateStateFile(f.options.stateRoot,path.join(f.options.stateRoot,'absent','file'),{createDirectory:false}),null);
});
