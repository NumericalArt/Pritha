import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {startNeuralDeepRun} from '../neuraldeep-codex.mjs';
import {ImmutableAttachmentStore} from '../lib/chat-attachment-store.mjs';
import {ProviderChatRegistry} from '../lib/provider-chat-registry.mjs';
import {ExecutionCoordinator} from '../lib/execution-coordinator.mjs';
import {privateStateDirectory} from '../lib/private-state-path.mjs';
import {atomicWriteFile} from '../lib/atomic-file.mjs';
import {cleanupHostFileAttachments} from '../lib/provider-file-attachments.mjs';
import {ATTACHMENT_TRANSPORT_VERSION,attachmentSupport,attachmentModelEvidenceHash} from './attachment-policy.mjs';
import {NeuralDeepImageAttachments,attachmentTransportHash,saveAttachmentTransport} from './attachment-transport.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>Object.assign(new Error('Local image delivery verification did not complete. Existing evidence and originals are preserved.'),{code,status:409});
// Deterministic synthetic 2x2 PNGs; adapted from the pinned ND acceptance probe.
export function syntheticAttachmentPng(color=255){
  const crc=bytes=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let i=0;i<8;i++)n=n>>>1^(n&1?0xedb88320:0);}return(n^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const bytes=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(bytes));return Buffer.concat([length,bytes,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,color,0,0,color,0,0,0,color,0,0,color,0,0]))),chunk('IEND',Buffer.alloc(0))]);
}

/** Installed CLI + real sandbox + synthetic provider only. Account/model
 * metadata comes from the caller; this function never reads a provider key or
 * sends an inference request to the internet. A failed probe publishes nothing. */
export async function verifyNeuralDeepAttachmentTransport(options){
  const {root,stateRoot,privateRoot,model,catalog,signal}=options;
  if(attachmentSupport({model,catalog,transport:null}).advertisedImage!=='supported' || model.toolsAdvertised!==true)throw fail('model_image_unverified');
  if(signal?.aborted)throw fail('operator_cancel');
  const coordinator=new ExecutionCoordinator({stateRoot});
  try{return await coordinator.withMutation('neuraldeep-image-verification',async()=>{
    const probes=privateStateDirectory(stateRoot,path.join(privateRoot,'image-verification'));
    const base=mkdtempSync(path.join(probes,'probe-')),state=path.join(base,'state'),cwd=path.join(base,'workspace'),providerRoot=path.join(state,'private','neuraldeep');
    mkdirSync(state,{mode:0o700});mkdirSync(cwd,{mode:0o700});
    const store=new ImmutableAttachmentStore({stateRoot:state,privateRoot:path.join(state,'private','originals')});
    const registry=new ProviderChatRegistry({stateRoot:state,privateRoot:path.join(state,'private'),connectorId:'neuraldeep'}),execution=new ExecutionCoordinator({stateRoot:state});
    let exited=true,session,cliVersion,requests=0,scope,lease,proof;
    const adapterHash=attachmentTransportHash(root),verifiedAt=new Date().toISOString(),formats=['image/png'];
    const transport={version:1,protocolVersion:ATTACHMENT_TRANSPORT_VERSION,cliVersion:'0.153.0',currentCliVersion:'0.153.0',adapterHash,currentAdapterHash:adapterHash,
      entries:['initial','resume'].map(path=>({model:model.id,path,modelEvidenceHash:attachmentModelEvidenceHash(model),image:'passed',imageFormats:formats,source:'synthetic-provider-smoke',verifiedAt}))};
    try{
      const ids=[randomUUID(),randomUUID(),randomUUID()];
      for(const [index,id] of ids.entries())await store.upload(id,'synthetic-'+index+'.png',new Request('http://fixture.invalid',{method:'PUT',body:syntheticAttachmentPng(index===2?127:255)}));
      const originals=await store.prepare(ids,{retain:true});
      const created=registry.create({clientThreadId:'image_verification_chat',request:{fixture:1},modelId:model.id,timeoutMs:25000,workspacePath:cwd,executionConfig:{modelId:model.id,sandbox:'read-only'}}).binding;
      for(const iteration of [0,1,2]){
        if(signal?.aborted)throw fail('operator_cancel');
        const current=iteration===0?originals.slice(0,2):iteration===2?[originals[2]]:[],binding=registry.require(created.chatId);
        const turn=registry.reserveTurn(binding.chatId,{clientMessageId:'image_verification_turn_'+iteration,text:'Reply IMAGE_TRANSPORT_OK.',request:{iteration},attachments:current.map(file=>({...file.view,sha256:file.sha256}))}).turn;
        lease=execution.claim(['synthetic-image-turn'],turn.turnId);if(!lease)throw fail('provider_verification_busy');
        scope=new NeuralDeepImageAttachments({store,stateRoot:state,privateRoot:providerRoot,chatId:binding.chatId,turnId:turn.turnId,
          lookup:id=>registry.attachmentReference(binding.chatId,id),imageLookup:(sha256,mediaType,size)=>registry.imageReference(binding.chatId,sha256,mediaType,size),check:()=>lease.assertOwned(),
          context:version=>({model,catalog,transport:{...transport,currentCliVersion:version},path:iteration?'resume':'initial'})});
        const images=await scope.prepareImages(current);let turnRequests=0;
        exited=false;
        const run=await startNeuralDeepRun({root,cwd,stateRoot:state,privateRoot:providerRoot,temporaryRoot:base,codexBin:options.codexBin,model:model.id,effort:'none',timeoutMs:25000,sandbox:'read-only',resume:session,signal,
          prompt:'Reply exactly IMAGE_TRANSPORT_OK without tools.',images,hostAttachments:scope,
          hostExecutionContext:{coordinator:execution,lease,chatId:binding.chatId,turnId:turn.turnId},approve:async()=>({decision:'reject'}),
          beforeStart:value=>{proof=value.evidence;},onEvidence:value=>{proof=value;},
        },{readCredential:()=> 'SYNTHETIC_IMAGE_VERIFICATION_KEY',fetchImpl:async(url,request)=>{
          if(String(url)!=='https://api.neuraldeep.ru/v1/responses' || request.headers.get('authorization')!=='Bearer SYNTHETIC_IMAGE_VERIFICATION_KEY')throw fail('provider_verification_boundary');
          const body=JSON.parse(request.body),hashes=[];
          for(const message of body.input || [])for(const part of message.content || [])if(part.type==='input_image')hashes.push(hash(Buffer.from(part.image_url.split(',')[1],'base64')));
          if(hashes.filter(value=>value===originals[0].sha256).length!==2 || iteration===2 && !hashes.includes(originals[2].sha256) || ++turnRequests!==1)throw fail('attachment_original_not_preserved');
          requests++;const response={id:'response_image_'+iteration,model:model.id,status:'completed',output:[{id:'message_image_'+iteration,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'IMAGE_TRANSPORT_OK',annotations:[]}]}],usage:{input_tokens:10,output_tokens:2,total_tokens:12}};
          return new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
        }});
        const result=await run.completion;exited=result.processTreeExited===true;
        if(!result.ok || !exited || !result.sessionId || session && session!==result.sessionId || turnRequests!==1)throw fail(result.providerError?.code || result.errorCode || 'provider_image_verification_failed');
        session=result.sessionId;cliVersion=result.cliVersion;registry.pinSession(binding.chatId,session,result.identity);
        await scope.close();await cleanupHostFileAttachments({stateRoot:state,privateRoot:providerRoot,store},scope.receipt);scope=null;lease.release();lease=null;
      }
      if(adapterHash!==attachmentTransportHash(root) || signal?.aborted)throw fail('provider_verification_changed');
      const evidence=saveAttachmentTransport(options,{model,cliVersion,imageFormats:formats,verifiedAt});
      return {verified:true,modelId:model.id,cliVersion,imageFormats:formats,initial:true,exactSessionResume:true,textResumeWithImages:true,resumeOriginalImage:true,processTreesExited:true,providerRequests:requests,paidCalls:0,verifiedAt,adapterHash:evidence.adapterHash};
    }catch(error){
      if(error.processTreeExited===true)exited=true;
      atomicWriteFile(path.join(base,'recovery.json'),JSON.stringify({code:/^[a-z_]{1,96}$/.test(error.code || '')?error.code:'provider_image_verification_failed',processTreeExited:exited,proof})+'\n');
      throw error;
    }finally{
      await scope?.close();if(exited)lease?.release();registry.close();execution.close();await store.close();
      if(exited)rmSync(base,{recursive:true,force:true});
    }
  },{timeoutMs:1000});}finally{coordinator.close();}
}
