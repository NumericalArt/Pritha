// Explicit opt-in: stock Claude CLI + Seatbelt + synthetic Anthropic upstream.
// Image bytes travel through the real MCP tool, not a mocked CLI transcript.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startClaudeCodeRun} from '../../scripts/claude-code-runner.mjs';
import {ImmutableAttachmentStore} from '../../scripts/lib/chat-attachment-store.mjs';
import {ProviderChatRegistry} from '../../scripts/lib/provider-chat-registry.mjs';
import {ExecutionCoordinator} from '../../scripts/lib/execution-coordinator.mjs';
import {claudeAttachmentTransport} from '../../scripts/claude/image-attachments.mjs';
import {providerProcessTreesExited} from '../../scripts/lib/provider-process-proof.mjs';
import {listenClaudeApiProxy} from '../../scripts/claude/api-proxy.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),model='claude-sonnet-5-5';
const sharp=createRequire(path.join(root,'interfaces/control-center/package.json'))('sharp');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function png(width,height){
  const chunk=(type,data)=>{const value=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const byte of value){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,value,sum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const pixels=Buffer.alloc((width*3+1)*height,95);for(let y=0;y<height;y++)pixels[y*(width*3+1)]=0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function reply(id,uri){
  const events=[{type:'message_start',message:{id,role:'assistant',model,type:'message',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0}}},
    {type:'content_block_start',index:0,content_block:uri?{type:'tool_use',id:'tool_'+id,name:'mcp__pritha__read_file',input:{}}:{type:'text',text:''}},
    {type:'content_block_delta',index:0,delta:uri?{type:'input_json_delta',partial_json:JSON.stringify({path:uri})}:{type:'text_delta',text:'IMAGE_FIXTURE_OK'}},
    {type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:uri?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:3}},{type:'message_stop'}];
  return new Response(events.map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
}
test('stock Claude preserves PNG, JPEG, GIF and WebP originals across initial and resume turns, including a large screenshot',{timeout:150000,skip:process.platform!=='darwin'},async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-image-')),cwd=path.join(directory,'workspace'),stateRoot=path.join(directory,'state');mkdirSync(cwd);mkdirSync(stateRoot);
  const privateRoot=path.join(stateRoot,'private'),store=new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(privateRoot,'originals')}),registry=new ProviderChatRegistry({stateRoot,privateRoot,connectorId:'claude'});
  const coordinator=new ExecutionCoordinator({stateRoot}),lease=coordinator.claim(['image-fixture'],'image-fixture',{kind:'turn',capacity:4});
  const scopes=[];t.after(async()=>{for(const scope of scopes)await scope.hostAttachments?.close();lease.release();coordinator.close();registry.close();await store.close();rmSync(directory,{recursive:true,force:true});});
  const binding=registry.create({clientThreadId:'image_fixture_chat',request:{},modelId:model,timeoutMs:60000,workspacePath:cwd,executionConfig:{modelId:model,sandbox:'read-only'}}).binding;
  const originals=[];for(const [width,height,format] of [[16,16,'png'],[2400,1400,'png'],[256,128,'jpeg'],[256,128,'gif'],[256,128,'webp']]){const id=randomUUID(),raw=png(width,height),bytes=format==='png'?raw:await sharp(raw)[format]().toBuffer();await store.upload(id,'fixture-'+width+'.'+format,new Request('http://fixture.invalid',{method:'POST',body:bytes}));const [file]=await store.prepare([id],{retain:true});originals.push(file);}
  const status={status:'ready',version:'2.1.296',model:{id:model,imageInput:true},capabilities:{attachments:{files:true,images:true}}};
  const transport=claudeAttachmentTransport({stateRoot,privateRoot,snapshot:async()=>status});
  let sessionId,proof,request=0;const visible=[],diagnostics=[];
  for(let index=0;index<originals.length;index++){
    const file=originals[index],turn=registry.reserveTurn(binding.chatId,{clientMessageId:'image_fixture_'+index,text:'Inspect the attached image.',request:{},attachments:[{...file.view,sha256:file.sha256}]}).turn;
    await transport.validate({binding,files:[file],historicalImages:index>0});
    const delivery=await transport.prepare({binding,files:[file],turnId:turn.turnId,store,registry,check:()=>lease.assertOwned()});scopes.push(delivery);
    let round=0;
    const dependencies={readCredential:()=> 'SYNTHETIC_ONLY_NOT_A_REAL_KEY',listenProxy:options=>listenClaudeApiProxy({...options,validateImages:async payload=>{try{await options.validateImages(payload);}catch(error){diagnostics.push({code:error.code,images:payload.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(block=>block.type==='tool_result').flatMap(block=>Array.isArray(block.content)?block.content:[]).filter(block=>block.type==='image').map(block=>({type:block.source?.type,mediaType:block.source?.media_type,size:Buffer.from(block.source?.data || '','base64').length,sha256:hash(Buffer.from(block.source?.data || '','base64'))}))});throw error;}}}),fetchImpl:async(url,init)=>{
      const payload=JSON.parse(init.body);if(url.includes('/count_tokens'))return Response.json({input_tokens:10});request++;round++;
      if(round===1)return reply('msg_image_'+request,'attachment:'+file.view.id);
      const images=[];for(const message of payload.messages)for(const block of Array.isArray(message.content)?message.content:[])if(block.type==='tool_result')for(const item of Array.isArray(block.content)?block.content:[])if(item.type==='image')images.push(item);
      assert.ok(images.some(image=>image.source?.media_type===file.view.mediaType && hash(Buffer.from(image.source.data,'base64'))===file.sha256),'The actual CLI request must contain the original image SHA-256');
      return reply('msg_image_'+request);
    }};
    const options={root,cwd,stateRoot,privateRoot,model,authMode:'api-key',effort:'medium',sandbox:'read-only',timeoutMs:60000,maxTurns:4,tokenBudget:30000,
      prompt:delivery.prompt+'\nInspect this image with read_file, then answer.',...(sessionId?{resume:sessionId}:{}),hostAttachments:delivery.hostAttachments,
      hostExecutionContext:{coordinator,lease,chatId:binding.chatId,turnId:turn.turnId},onEvidence:value=>{proof=value;},onEvent:event=>visible.push(event),onDiagnosticChunk:chunk=>diagnostics.push(String(chunk))};
    const result=await (await startClaudeCodeRun(options,dependencies)).completion;
    assert.equal(result.ok,true,JSON.stringify({result,round,diagnostics}));assert.equal(round,2);assert.equal(result.processTreeExited,true);assert.equal(providerProcessTreesExited(proof),true);
    if(sessionId)assert.equal(result.sessionId,sessionId);sessionId=result.sessionId;
    await delivery.hostAttachments.close();await transport.cleanup({receipt:delivery.receipt,store});assert.equal((await store.resolve(file.view.id)).sha256,file.sha256);
  }
  assert.equal(request,10);assert.doesNotMatch(JSON.stringify(visible),/SYNTHETIC_ONLY_NOT_A_REAL_KEY|iVBORw0KGgo/);
});
