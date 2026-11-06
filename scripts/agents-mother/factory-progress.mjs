import {verifiedFirstUse} from './factory-first-use.mjs';
import {voiceFactoryPaths,loadVoiceFactory,requireFactoryApprovals,validateFactoryDelivery,factoryFail} from './voice-factory-state.mjs';
import {deliveryStatus} from './delivery-loop.mjs';
import {deliveryExplanation} from './delivery-explanation.mjs';
import {verifyOutcomeApproval} from './outcome-spec.mjs';

import {factoryMilestone} from './factory-milestone.mjs';

/** Used by both thread adapters. No recovery, approvals, tools or model calls on read. */
export function readBoundFactoryProgress(options) {
  if(!options.slug)return undefined;
  try {
    const p=voiceFactoryPaths(options);
    if(p.target!==options.target)throw factoryFail('factory_binding_changed');
    const state=loadVoiceFactory(p,options);
    let delivery=null,firstUse=null;
    if(state?.runId){
      requireFactoryApprovals(p,state);
      if(!verifyOutcomeApproval(state.outcome,p).ok)throw factoryFail('factory_outcome_approval_required');
      const result=validateFactoryDelivery(p,state,deliveryStatus(state.runId,p));
      delivery=deliveryExplanation(result.state);
      firstUse=verifiedFirstUse(p,state,result);
    }
    return {available:true,slug:p.slug,phase:state?.phase || 'not-started',running:Boolean(state?.running),
      documentsApproved:Boolean(state?.contractApproval && state?.outcomeApproval),milestone:factoryMilestone(state,delivery,firstUse),
      builder:{provider:options.connectorId,modelId:state?.buildConfiguration?.modelId || options.model,effort:state?.buildConfiguration?.effort || options.effort || 'none'},delivery,firstUse};
  }catch{return {available:false,errorCode:'factory_evidence_unavailable'};}
}
