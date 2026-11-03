import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ImmutableAttachmentStore} from '../scripts/lib/chat-attachment-store.mjs';
import {ProviderChatRegistry} from '../scripts/lib/provider-chat-registry.mjs';
import {ProviderHostTools} from '../scripts/lib/provider-host-tools.mjs';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {ClaudeImageAttachments,claudeAttachmentTransport,assertNoClaudeImageInputs,CLAUDE_IMAGE_LIMITS} from '../scripts/claude/image-attachments.mjs';
import {cleanupHostFileAttachments} from '../scripts/lib/provider-file-attachments.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=','base64');
async function fixture(t){
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-images-')),cwd=path.join(directory,'workspace'),stateRoot=path.join(directory,'state'),privateRoot=path.join(stateRoot,'private');mkdirSync(cwd);mkdirSync(stateRoot);
  const store=new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(privateRoot,'originals')}),registry=new ProviderChatRegistry({stateRoot,privateRoot,connectorId:'claude'}),coordinator=new ExecutionCoordinator({stateRoot}),lease=coordinator.claim(['image'],'image-test',{kind:'turn',capacity:4});
  const scopes=[],tools=[];let count=0;
  const status={status:'ready',version:'2.1.296',model:{imageInput:true},capabilities:{attachments:{files:true,images:true}}};
  const chat=()=>registry.create({clientThreadId:'image_chat_'+(++count),request:{},modelId:'fixture',timeoutMs:30000,workspacePath:cwd}).binding;
  const attach=async(binding,bytes=image,name='fixture.png')=>{const id=randomUUID();await store.upload(id,name,new Request('http://fixture.invalid',{method:'POST',body:bytes}));const [file]=await store.prepare([id],{retain:true});registry.reserveTurn(binding.chatId,{clientMessageId:'image_turn_'+(++count),text:'Read attachment.',request:{},attachments:[{...file.view,sha256:file.sha256}]});return file;};
  const scope=binding=>{const value=new ClaudeImageAttachments({stateRoot,privateRoot,store,chatId:binding.chatId,turnId:'turn_'+randomUUID().replaceAll('-',''),lookup:id=>registry.attachmentReference(binding.chatId,id),imageLookup:(...args)=>registry.imageReference(binding.chatId,...args),context:async()=>status,check:()=>lease.assertOwned()});scopes.push(value);return value;};
  const host=(binding,attachments)=>{const tool=new ProviderHostTools({root,cwd,stateRoot,privateRoot,connectorId:'claude',coordinator,lease,chatId:binding.chatId,turnId:attachments.receipt.turnId,sandbox:'read-only',attachments});tools.push(tool);return tool;};
  t.after(async()=>{for(const tool of tools)await tool.close();for(const value of scopes)await value.close();lease.release();coordinator.close();registry.close();await store.close();rmSync(directory,{recursive:true,force:true});});
  return {stateRoot,privateRoot,store,registry,status,chat,attach,scope,host};
}
const block=(bytes=image)=>({type:'image',source:{type:'base64',media_type:'image/png',data:bytes.toString('base64')}});
const direct=value=>({messages:[{role:'user',content:[value]}]});
const tool=(id,value,name='mcp__pritha__read_file')=>({messages:[{role:'assistant',content:[{type:'tool_use',id:'image_read',name,input:{path:'attachment:'+id}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'image_read',content:[value]}]}]});

test('Claude host tool delivers a real image block, bounded metadata and exact originals in a new resume scope',async t=>{
  const f=await fixture(t),chat=f.chat(),file=await f.attach(chat),scope=f.scope(chat);
  const result=await f.host(chat,scope).call('read_file',{path:'attachment:'+file.view.id});assert.equal(result.content[1].type,'image');assert.deepEqual(Buffer.from(result.content[1].data,'base64'),image);assert.doesNotMatch(result.content[0].text,/readOnlyPath|iVBOR/);
  const first=await scope.read('attachment:'+file.view.id);await scope.close();await cleanupHostFileAttachments(f,scope.receipt);assert.equal(existsSync(first.attachment.readOnlyPath),false);assert.deepEqual(readFileSync(file.filePath),image);
  const resumed=f.scope(chat);await resumed.assertReady();assert.deepEqual((await resumed.read('attachment:'+file.view.id)).bytes,image);
});
test('Claude request validation restores CLI-resized MCP bytes only from the exact read_file chat URI',async t=>{
  const f=await fixture(t),chat=f.chat(),file=await f.attach(chat),scope=f.scope(chat),request=tool(file.view.id,block(Buffer.from('CLI_RESIZED_BYTES')));
  assert.deepEqual(await scope.validateInputs(request),{images:1,bytes:image.length,restored:1});assert.deepEqual(Buffer.from(request.messages[1].content[0].content[0].source.data,'base64'),image);
  assert.deepEqual(await scope.validateInputs(direct(block())),{images:1,bytes:image.length,restored:0});
  await assert.rejects(scope.validateInputs(tool(file.view.id,block(Buffer.from('FOREIGN_IMAGE')),'mcp__pritha__unrelated')),{code:'attachment_not_in_chat'});
  await assert.rejects(f.scope(f.chat()).validateInputs(tool(file.view.id,block())),{code:'attachment_not_in_chat'});
  const duplicate=tool(file.view.id,block());duplicate.messages[1].content[0].content.push(block());await assert.rejects(scope.validateInputs(duplicate));
});
test('Claude rejects URL images, foreign data, malformed base64 and oversized images before dispatch',async t=>{
  const f=await fixture(t),chat=f.chat();await f.attach(chat);const scope=f.scope(chat);
  for(const value of [
    {type:'image',source:{type:'url',url:'https://foreign.invalid/image.png'}},block(Buffer.from('FOREIGN')),
    {type:'image',source:{type:'base64',media_type:'image/svg+xml',data:image.toString('base64')}},
    {type:'image',source:{type:'base64',media_type:'image/png',data:image.toString('base64')+'\n'}},block(Buffer.alloc(CLAUDE_IMAGE_LIMITS.imageBytes+1)),
  ])await assert.rejects(scope.validateInputs(direct(value)));
  assert.throws(()=>assertNoClaudeImageInputs(direct(block())),{code:'model_image_unverified'});assert.doesNotThrow(()=>assertNoClaudeImageInputs({messages:[{role:'user',content:'ordinary text'}]}));
});
for(const changed of ['original','snapshot'])test(`changed Claude image ${changed} is never dispatched or discarded`,async t=>{
  const f=await fixture(t),chat=f.chat(),file=await f.attach(chat),scope=f.scope(chat),read=await scope.read('attachment:'+file.view.id);
  writeFileSync(changed==='original'?file.filePath:read.attachment.readOnlyPath,Buffer.alloc(image.length));await assert.rejects(scope.validateInputs(tool(file.view.id,block())));await assert.rejects(cleanupHostFileAttachments(f,scope.receipt));assert.equal(existsSync(file.filePath),true);
});
test('Claude image admission is exact-version and model-metadata dependent, including historical images',async t=>{
  const f=await fixture(t),chat=f.chat(),file=await f.attach(chat),transport=claudeAttachmentTransport({...f,snapshot:async()=>f.status}),input={binding:chat,files:[file],historicalImages:false};
  await transport.validate(input);f.status.model.imageInput=false;await assert.rejects(transport.validate(input),{code:'model_image_unverified'});
  f.status.model.imageInput=true;f.status.version='2.1.297';await assert.rejects(transport.validate({...input,files:[],historicalImages:true}),{code:'model_image_unverified'});await assert.rejects(f.scope(chat).assertReady(),{code:'model_image_unverified'});
});
