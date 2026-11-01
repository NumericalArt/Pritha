import {readProviderSettingsInput} from './provider-settings-api.mjs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(code,status=400)=>Object.assign(new Error('Image delivery could not be verified. Your existing chats and originals are preserved.'),{code,status});

/** Bounded operator action: the caller selects only the current saved model.
 * No paths, keys, evidence, probe scripts or upstream URLs are accepted. */
export async function providerAttachmentVerificationRequest(request,connectorId,{current,verify}){
  try{
    if(request.method!=='POST')throw fail('provider_method_invalid',405);
    if(connectorId!=='neuraldeep')throw fail('provider_capability_unavailable',422);
    const body=await readProviderSettingsInput(request);
    if(Object.keys(body).some(key=>!['modelId','expectedRevision'].includes(key)) || typeof body.modelId!=='string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(body.modelId) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision<0)throw fail('provider_input_invalid');
    const saved=current();if(saved.revision!==body.expectedRevision || saved.modelId!==body.modelId)throw fail('provider_configuration_conflict',409);
    if(request.signal.aborted)throw fail('operator_cancel',409);
    const result=await verify(body.modelId,request.signal);
    // Deliberately project the public receipt; private paths/proofs/diagnostics
    // returned by an internal implementation must never reach the browser.
    if(result?.verified!==true || result.modelId!==body.modelId || result.paidCalls!==0 || result.processTreesExited!==true
      || !Array.isArray(result.imageFormats) || !result.imageFormats.length || result.imageFormats.some(value=>!['image/png','image/jpeg','image/gif','image/webp'].includes(value)))throw fail('provider_image_verification_failed',503);
    return reply({ok:true,modelId:body.modelId,verified:true,imageFormats:result.imageFormats.filter(value=>['image/png','image/jpeg','image/gif','image/webp'].includes(value)),paidCalls:0});
  }catch(error){const known=/^(?:provider_|attachment_|model_image_|image_format_|operator_cancel$)[a-z_]*$/.test(error?.code || '');
    return reply({ok:false,error:known?error.code:'provider_image_verification_failed',message:'Image delivery could not be verified. Your existing chats and originals are preserved.'},Number.isInteger(error?.status) && error.status>=400 && error.status<=599?error.status:409);}
}
