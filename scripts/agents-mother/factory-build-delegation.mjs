import {createHash} from 'node:crypto';
import {factoryFail} from './voice-factory-state.mjs';

/** A waiting factory tool can lend its single admission/provider slot to one
 * bounded build. The child keeps a distinct lease and recovery identity: it
 * can never release the parent claim. No model-facing argument enables this. */
export function factoryBuildDelegation(coordinator,parent,connectorId){
  if(parent===undefined)return null;
  if(!parent || Object.keys(parent).some(key=>!['owner','generation','chatId','turnId','operationId','target'].includes(key)))throw factoryFail('factory_delegation_invalid');
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const check=()=>{
    const row=coordinator.getIntent('provider-tool:'+parent.turnId+':'+parent.operationId);
    const claims=coordinator.claims().filter(row=>row.owner===parent.owner && row.generation===parent.generation);
    if(!row || row.kind!=='provider-tool' || row.tool!=='factory_step' || row.state!=='running' || !['deliver','delivery_resume','verify'].includes(row.factoryAction)
        || row.owner!==parent.owner || row.generation!==parent.generation || row.chatId!==parent.chatId || row.connectorId!==connectorId || row.factoryTarget!==parent.target
        || !claims.some(row=>row.kind==='turn' && row.detail.chatId===parent.chatId && row.detail.connectorId===connectorId)
        || !claims.some(row=>row.mode==='write' && row.detail.workspacePath===parent.target))throw factoryFail('factory_delegation_invalid');
    return claims;
  };
  check();
  return {check,resource:'factory-build-child:'+parent.turnId+':'+parent.operationId,
    hasProviderSlot:index=>check().some(row=>row.resource===digest('provider-slot:'+connectorId+':'+index))};
}
