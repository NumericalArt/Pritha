import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {normalizeNeuralDeepModels} from '../scripts/neuraldeep/provider-service.mjs';
import {attachmentSupport,assertAttachmentSupport,attachmentModelEvidenceHash,ATTACHMENT_TRANSPORT_VERSION} from '../scripts/neuraldeep/attachment-policy.mjs';
import {readAttachmentTransport,saveAttachmentTransport,neuralDeepAttachmentTransport} from '../scripts/neuraldeep/attachment-transport.mjs';
import {validateResponsesInputs} from '../scripts/neuraldeep/responses-input-policy.mjs';
import {syntheticAttachmentPng} from '../scripts/neuraldeep/verify-attachment-transport.mjs';
import {ImmutableAttachmentStore} from '../scripts/lib/chat-attachment-store.mjs';
import {ProviderChatRegistry} from '../scripts/lib/provider-chat-registry.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),hash=value=>createHash('sha256').update(value).digest('hex');
const bytes=syntheticAttachmentPng(),uri='data:image/png;base64,'+bytes.toString('base64');
const expected={sha256:hash(bytes),size:bytes.length,mediaType:'image/png'};
const payload=(images=[uri])=>({model:'fixture-vision',input:[{role:'user',content:images.map(image_url=>({type:'input_image',image_url}))}]});
function context(){
  const [model]=normalizeNeuralDeepModels({data:[{id:'fixture-vision',type:'chat',capabilities:{vision:true,tools:true},modalities:{input:['text','image']}}]});
  const catalog={source:'provider-fixture',refreshedAt:new Date().toISOString()},entry={model:model.id,path:'initial',modelEvidenceHash:attachmentModelEvidenceHash(model),image:'passed',files:'passed',imageFormats:['image/png'],verifiedAt:catalog.refreshedAt,source:'synthetic-provider-smoke'};
  return {model,catalog,transport:{version:1,protocolVersion:ATTACHMENT_TRANSPORT_VERSION,cliVersion:'0.153.0',currentCliVersion:'0.153.0',adapterHash:'a'.repeat(64),currentAdapterHash:'a'.repeat(64),entries:[entry]}};
}
const image={view:{kind:'image',mediaType:'image/png',size:100},sha256:'fixture'};

// Adapted from pinned ND neuraldeep-attachment-capabilities.test.mjs; canonical
// public model normalization replaces its fork-only TypeScript catalog loader.
test('catalog preserves absent and contradictory image declarations as unknown',()=>{
  const rows=normalizeNeuralDeepModels({data:[{id:'absent'},{id:'contradictory',capabilities:{vision:false},modalities:{input:['text','image']}},{id:'text-only',capabilities:{vision:false,tools:true},modalities:{input:['text']}}]}),c=context();
  assert.equal(rows[0].inputModalities,null);assert.equal(rows[0].visionAdvertised,null);assert.equal(rows[0].vision,null);
  assert.equal(attachmentSupport({...c,model:rows[0]}).image,'unknown');assert.equal(attachmentSupport({...c,model:rows[1]}).image,'unknown');
  assert.equal(attachmentSupport({...c,model:rows[2]}).image,'unsupported');
  assert.equal(attachmentSupport({...c,model:{id:'price-only',provider:'neuraldeep'}}).image,'unknown');
});

test('advertisement cannot replace exact model, CLI, adapter, path and fresh evidence',()=>{
  const c=context();assert.equal(assertAttachmentSupport({...c,attachments:[image]}).image,'supported');
  assert.throws(()=>assertAttachmentSupport({...c,path:'resume',historicalImages:true}),{code:'model_image_unverified'});
  c.transport.entries.push({...c.transport.entries[0],path:'resume'});
  assert.equal(assertAttachmentSupport({...c,path:'resume',historicalImages:true}).image,'supported');
  for(const patch of [{currentCliVersion:'0.154.0'},{currentAdapterHash:'b'.repeat(64)},{protocolVersion:'unknown'},{entries:{}},{entries:[{...c.transport.entries[0],modelEvidenceHash:'c'.repeat(64)}]},{entries:[{...c.transport.entries[0],source:'advertised'}]},{entries:[{...c.transport.entries[0],verifiedAt:'2020-01-01'}]}])assert.equal(attachmentSupport({...c,transport:{...c.transport,...patch}}).image,'unknown');
  for(const catalog of [{...c.catalog,source:'fallback'},{...c.catalog,refreshedAt:'2020-01-01'},{...c.catalog,refreshedAt:new Date(Date.now()+60000).toISOString()}])assert.throws(()=>assertAttachmentSupport({...c,catalog,historicalImages:true}),{code:'model_image_unverified'});
});

test('unverified formats and encoding limits retain explicit failures instead of dropping images',()=>{
  const c=context();
  assert.throws(()=>assertAttachmentSupport({...c,attachments:[{...image,view:{...image.view,size:13*1024**2}}]}),{code:'attachment_provider_payload_too_large'});
  assert.throws(()=>assertAttachmentSupport({...c,attachments:[{...image,view:{...image.view,mediaType:'image/jpeg'}}]}),{code:'image_format_unverified'});
  assert.throws(()=>assertAttachmentSupport({...c,model:{...c.model,inputModalities:['text'],visionAdvertised:false},historicalImages:true}),{code:'model_image_unsupported'});
});

test('encoded inputs preserve original bytes and duplicate counts in the current message',async()=>{
  const options={model:'fixture-vision',imagesAllowed:true,imageFormats:['image/png'],expectedImages:[expected],requireCurrentImages:true};
  assert.deepEqual(await validateResponsesInputs(payload(),options),[expected.sha256]);
  for(const value of ['https://external.invalid/image.png','data:image/jpeg;base64,'+bytes.toString('base64')])await assert.rejects(validateResponsesInputs(payload([value]),options),{code:'image_format_unverified'});
  await assert.rejects(validateResponsesInputs(payload(['data:image/png;base64,YQ']),options),{code:'invalid_image_encoding'});
  await assert.rejects(validateResponsesInputs(payload(['data:image/png;base64,'+Buffer.from('resized').toString('base64')]),options),{code:'attachment_original_not_preserved'});
  await assert.rejects(validateResponsesInputs({...payload(),model:'foreign'},options),{code:'neuraldeep_model_identity_mismatch'});
  await assert.rejects(validateResponsesInputs(payload([]),options),{code:'attachment_image_missing'});
  await assert.rejects(validateResponsesInputs(payload(),{...options,expectedImages:[expected,expected]}),{code:'attachment_image_missing'});
  assert.equal((await validateResponsesInputs(payload([uri,uri]),{...options,expectedImages:[expected,expected]})).length,2);
  const history={...payload(),input:[...payload().input,{role:'user',content:[{type:'input_text',text:'new image silently dropped'}]}]};
  await assert.rejects(validateResponsesInputs(history,options),{code:'attachment_image_missing'});
  assert.equal((await validateResponsesInputs(history,{...options,expectedImages:[],hasHistoricalImage:(sha,type,size)=>sha===expected.sha256 && type===expected.mediaType && size===expected.size})).length,1);
});

async function fixture(t){
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-image-boundary-')),privateRoot=path.join(stateRoot,'private','neuraldeep'),cwd=path.join(stateRoot,'workspace');mkdirSync(cwd);
  const options={root,stateRoot,privateRoot},c=context();saveAttachmentTransport(options,{model:c.model,cliVersion:'0.153.0',imageFormats:['image/png']});
  const registry=new ProviderChatRegistry({stateRoot,privateRoot:path.join(stateRoot,'private'),connectorId:'neuraldeep'}),store=new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(stateRoot,'private','originals')});
  let index=0,status={status:'ready',version:'0.153.0',models:[c.model],catalog:c.catalog,capabilities:{attachments:{files:true,images:true}}};const scopes=[];
  t.after(async()=>{for(const scope of scopes)await scope.close();registry.close();await store.close();rmSync(stateRoot,{recursive:true,force:true});});
  const chat=()=>registry.create({clientThreadId:'image_chat_'+(++index),request:{index},modelId:c.model.id,timeoutMs:30000,workspacePath:cwd,executionConfig:{modelId:c.model.id,sandbox:'read-only'}}).binding;
  const transport=neuralDeepAttachmentTransport({...options,snapshot:async()=>status});
  async function attach(binding,body=bytes){
    const id=randomUUID();await store.upload(id,'original.png',new Request('http://fixture.invalid',{method:'PUT',body}));const [file]=await store.prepare([id],{retain:true});
    const turn=registry.reserveTurn(binding.chatId,{clientMessageId:'image_turn_'+(++index),text:'image',request:{index},attachments:[{...file.view,sha256:file.sha256}]}).turn;
    return {file,turn};
  }
  async function prepare(binding,files,turn){
    const delivery=await transport.prepare({binding,files,turnId:turn.turnId,store,registry,check:()=>{}});scopes.push(delivery.hostAttachments);return delivery;
  }
  return {...options,registry,store,transport,chat,attach,prepare,context:c,replaceStatus:value=>{status=value;},getStatus:()=>status};
}

test('private evidence rejects another instance, a symlink and a changed CLI or adapter',async t=>{
  const f=await fixture(t),file=path.join(f.privateRoot,'attachment-capabilities.json');
  let proof=readAttachmentTransport({...f,cliVersion:'0.153.0'});assert.equal(attachmentSupport({...f.context,transport:proof}).image,'supported');
  proof=readAttachmentTransport({...f,cliVersion:'0.154.0'});assert.equal(attachmentSupport({...f.context,transport:proof}).image,'unknown');
  const other=await fixture(t);copyFileSync(file,path.join(other.privateRoot,'attachment-capabilities.json'));assert.equal(readAttachmentTransport({...other,cliVersion:'0.153.0'}),null);
  const record=JSON.parse(readFileSync(file));record.adapterHash='b'.repeat(64);writeFileSync(file,JSON.stringify(record));assert.equal(attachmentSupport({...f.context,transport:readAttachmentTransport({...f,cliVersion:'0.153.0'})}).image,'unknown');
  const outside=path.join(f.stateRoot,'outside.json');writeFileSync(outside,'preserve');rmSync(file);symlinkSync(outside,file);
  assert.throws(()=>readAttachmentTransport({...f,cliVersion:'0.153.0'}));assert.equal(readFileSync(outside,'utf8'),'preserve');
});

test('current and historical images resolve only within their chat and cleanup retains originals',async t=>{
  const f=await fixture(t),chat=f.chat(),other=f.chat(),one=await f.attach(chat),foreign=await f.attach(other,syntheticAttachmentPng(127));
  const delivery=await f.prepare(chat,[one.file],one.turn),scope=delivery.hostAttachments;
  await scope.validateInputs(payload(),'0.153.0');assert.equal(delivery.images.length,1);
  assert.deepEqual(readFileSync(delivery.images[0]),bytes);
  await assert.rejects(scope.validateInputs(payload(['data:image/png;base64,'+syntheticAttachmentPng(127).toString('base64')]),'0.153.0'),{code:'attachment_original_not_preserved'});
  assert.equal(f.registry.imageReference(chat.chatId,foreign.file.sha256,'image/png',foreign.file.view.size),null);
  await scope.close();await f.transport.cleanup({receipt:delivery.receipt,store:f.store});assert.equal(existsSync(delivery.images[0]),false);
  const turn=f.registry.reserveTurn(chat.chatId,{clientMessageId:'image_text_resume',text:'continue',request:{resume:true},attachments:[]}).turn;
  const resumed=await f.prepare({...chat,nativeThreadId:'12345678-1234-1234-1234-123456789012'},[],turn);
  const history={...payload(),input:[...payload().input,{role:'user',content:[{type:'input_text',text:'continue'}]}]};
  await resumed.hostAttachments.validateInputs(history,'0.153.0');assert.deepEqual(resumed.images,[]);
  assert.equal((await f.store.resolve(one.file.view.id)).sha256,expected.sha256);
});

test('changed originals, snapshots and metadata never reach the encoded provider boundary',async t=>{
  for(const mode of ['original','snapshot','metadata']){
    const f=await fixture(t),chat=f.chat(),one=await f.attach(chat),delivery=await f.prepare(chat,[one.file],one.turn);
    if(mode==='original')writeFileSync(one.file.filePath,'changed original');
    if(mode==='snapshot')writeFileSync(delivery.images[0],'changed copy');
    if(mode==='metadata')f.replaceStatus({...f.getStatus(),catalog:{source:'fallback',refreshedAt:new Date().toISOString()}});
    await assert.rejects(delivery.hostAttachments.validateInputs(payload(),'0.153.0'));
    if(mode!=='metadata')await assert.rejects(f.transport.cleanup({receipt:delivery.receipt,store:f.store}));
    assert.equal(existsSync(one.file.filePath),true);assert.equal(existsSync(delivery.images[0]),true);
  }
});

test('image readiness is revalidated after queue acceptance and stopping invalidates its scope',async t=>{
  const f=await fixture(t),chat=f.chat(),one=await f.attach(chat),input={binding:chat,files:[one.file],historicalImages:false,historicalAttachments:true};
  await f.transport.validate(input);
  const delivery=await f.prepare(chat,[one.file],one.turn);f.replaceStatus({...f.getStatus(),version:'0.154.0'});
  await assert.rejects(f.transport.validate(input),{code:'model_image_unverified'});
  await assert.rejects(delivery.hostAttachments.validateInputs(payload(),'0.154.0'),{code:'model_image_unverified'});
  await delivery.hostAttachments.close();await assert.rejects(delivery.hostAttachments.validateInputs(payload(),'0.153.0'),{code:'attachment_scope_closed'});
  assert.equal((await f.store.resolve(one.file.view.id)).sha256,expected.sha256);
});
