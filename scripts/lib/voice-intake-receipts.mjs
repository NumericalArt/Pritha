import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const fail=code=>Object.assign(new Error('The confirmed intake could not be replayed safely. Its originals and task receipt are preserved.'),{code,status:409});
const uuid=value=>{const h=hash(value);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};

/** Private host receipt for one browser confirmation. Timestamps are excluded
 * because retrying the same confirmed upload creates a new HTTP timestamp.
 * User content, bytes, selected backend and every semantic confirmation field
 * remain part of the immutable request hash. */
export function voiceIntakeIdentity(input){
  if(!/^vctx_[a-f0-9]{32}$/.test(input.contextId || '') || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(input.sourceIntakeId || '')
    || typeof input.sessionId!=='string' || input.sessionId.length>160 || typeof input.text!=='string' || input.text.length>6000
    || !object(input.confirmation) || !object(input.selection) || !Array.isArray(input.files) || input.files.length>8)throw fail('voice_intake_identity_invalid');
  let total=0;
  const files=input.files.map(file=>{
    if(!(file.bytes instanceof Uint8Array) || !Number.isSafeInteger(file.size) || file.size!==file.bytes.byteLength || file.size<=0 || file.size>10*1024**2
      || typeof file.name!=='string' || file.name.length>240 || typeof file.type!=='string' || file.type.length>120)throw fail('voice_intake_input_invalid');
    total+=file.size;return {name:file.name,type:file.type,size:file.size,sha256:hash(file.bytes)};
  });
  if(total>25*1024**2)throw fail('voice_intake_input_invalid');
  const confirmation={...input.confirmation};delete confirmation.timestamp;
  const selection={connectorId:input.selection.connectorId,preset:input.selection.preset,serviceTier:input.selection.serviceTier};
  const content=JSON.stringify({sessionId:input.sessionId,text:input.text,confirmation,selection,files});
  if(Buffer.byteLength(content)>64*1024)throw fail('voice_intake_input_invalid');
  const digest=hash(JSON.stringify([input.contextId,input.sourceIntakeId]));
  return {key:'voice-intake:'+digest,hash:hash(content),taskId:'voice_intake_'+digest.slice(0,48),intakeId:'voice-intake-'+digest.slice(0,48),
    attachmentIds:files.map((_,index)=>uuid(digest+':'+index)),files,totalBytes:total,contextId:input.contextId};
}

/** Old staged-file manifests do not authorize external file access. Only the
 * shared immutable originals, in the exact saved order, may enter Task Chat. */
export async function voiceIntakeAttachmentIds(intake,store){
  if(!intake)return [];
  if(!object(intake) || !Array.isArray(intake.files))throw fail('provider_attachments_unverified');
  if(intake.files.length===0){if(intake.attachment_refs?.length)throw fail('attachment_integrity_failed');return [];}
  const refs=intake.attachment_refs;
  if(intake.attachment_protocol!=='pritha-voice-originals-v1' || !Array.isArray(refs) || refs.length!==intake.files.length || refs.length>8)throw fail('provider_attachments_unverified');
  const ids=[];
  for(const [index,ref] of refs.entries()){
    if(!ref || ref.id!==intake.files[index].id || ids.includes(ref.id))throw fail('attachment_integrity_failed');
    const original=await store.resolve(ref.id);
    if(['id','name','size','mediaType','kind','href'].some(key=>original.view[key]!==ref[key]) || original.sha256!==ref.sha256)throw fail('attachment_integrity_failed');
    ids.push(ref.id);
  }
  return ids;
}

/** No automatic dispatch from an uncertain receipt, even if the original HTTP
 * worker died before writing its task card. Recovery only reads a known card;
 * it never creates a second task or changes provider/session identity. */
export class VoiceIntakeReceipts {
  constructor({coordinator}){this.coordinator=coordinator;}
  async submit(input,{prepare=async()=>{},create,recover=async()=>null}){
    const identity=voiceIntakeIdentity(input),c=this.coordinator;
    return c.withMutation(identity.key,async()=>{
      let prior=c.getIntent(identity.key);
      if(prior && prior.hash!==identity.hash)throw fail('voice_intake_idempotency_conflict');
      if(prior?.state==='completed' || prior?.state==='rejected')return {...prior.result,replayed:true};
      if(prior && ['dispatching','recovery_required'].includes(prior.state)){
        const result=await recover(identity);
        if(result?.ok===true && result.task_id===identity.taskId){
          const response=this.response(identity,result);c.updateIntent(identity.key,{state:'completed',result:response});return {...response,replayed:true};
        }
        return {ok:false,error:'voice_intake_recovery_required',task_id:identity.taskId,intake_id:identity.intakeId,originals_preserved:true};
      }
      if(prior && !['reserved','prepared'].includes(prior.state))throw fail('voice_intake_recovery_required');
      if(!prior)prior=c.reserveIntent(identity.key,identity.hash,{kind:'voice-intake',taskId:identity.taskId,intakeId:identity.intakeId,
        contextId:identity.contextId,attachmentIds:identity.attachmentIds,files:identity.files,totalBytes:identity.totalBytes}).intent;
      await prepare(identity);
      c.updateIntent(identity.key,{state:'prepared'});
      c.updateIntent(identity.key,{state:'dispatching'});
      try{
        const result=await create(identity);
        if(!object(result) || typeof result.ok!=='boolean' || result.ok && result.task_id!==identity.taskId)throw fail('voice_intake_result_invalid');
        const response=this.response(identity,result);
        c.updateIntent(identity.key,{state:result.ok?'completed':'rejected',result:response});return response;
      }catch(error){c.updateIntent(identity.key,{state:'recovery_required'});throw error;}
    });
  }
  response(identity,result){
    const response={...result,intake_id:identity.intakeId,file_count:identity.files.length,total_bytes:identity.totalBytes};
    if(Buffer.byteLength(JSON.stringify(response))>128*1024)throw fail('voice_intake_result_invalid');
    return response;
  }
}
