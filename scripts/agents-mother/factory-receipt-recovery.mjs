import path from 'node:path';
import {processTreeExited} from '../neuraldeep/process-snapshot.mjs';
import {atomicCompareAndSwapFile} from '../lib/atomic-file.mjs';
import {factoryHash,factoryRead,loadVoiceFactory,requireFactoryApprovals,validateVoiceFactory} from './voice-factory-state.mjs';

// Only an execution owner can recover a finished worker receipt. A browser
// read does not do this. Never infer paid usage or success from process exit.
export function reconcileFactoryReceipt(p,options,{proveExit=processTreeExited}={}) {
  options.lease.assertOwned();
  const state=loadVoiceFactory(p,options),active=state?.running;
  if(!active)return false;
  const db=options.coordinator,key='provider-tool:'+active.turnId+':'+active.operationId,row=db.getIntent(key);
  if(!row || row.kind!=='provider-tool' || row.tool!=='factory_step' || row.chatId!==options.chatId || row.connectorId!==options.connectorId
    || row.factoryAction!==active.action || row.factoryTarget!==p.target || row.turnId!==active.turnId || row.operationId!==active.operationId || !row.processProof
    || db.claims().some(c=>c.owner===row.owner && c.generation===row.generation))return false;
  try{
    if(!proveExit(row.processProof))return false;
    const dir=row.factoryWorkDirectory;
    if(typeof dir!=='string' || path.dirname(dir)!==path.join(p.directory,'operations') || !/^[a-f0-9-]{36}$/.test(path.basename(dir)))return false;
    const file=path.join(dir,'result.json'),req=JSON.parse(factoryRead(path.join(dir,'request.json'),dir)),result=JSON.parse(factoryRead(file,dir,500000));
    if(req.root!==p.root || req.stateRoot!==p.stateRoot || req.agentParent!==p.parent || req.chatId!==state.chatId || req.connectorId!==state.connectorId
      || req.slug!==p.slug || req.input?.action!==active.action || req.input.operation_id!==active.operationId || req.resultFile!==file
      || factoryHash(['factory_step',req.input])!==row.hash
      || req.factoryParent?.owner!==row.owner || req.factoryParent.generation!==row.generation || req.state.revision!==state.revision
      || result.version!==1 || typeof result.ok!=='boolean' || result.operationId!==active.operationId || result.state?.revision!==state.revision
      || factoryHash(result.state.running)!==factoryHash(active) || state.runId && state.runId!==result.state.runId)return false;
    const recovered=validateVoiceFactory(p,{...result.state,running:null,continuationPause:result.ok?null:active.action},options);
    if(recovered.contractApproval)requireFactoryApprovals(p,recovered,{outcome:Boolean(recovered.outcomeApproval)});
    const before=factoryRead(p.file,p.directory);
    if(factoryHash(JSON.parse(before))!==factoryHash(state))return false;
    options.lease.assertOwned();
    atomicCompareAndSwapFile(p.file,before,JSON.stringify(recovered));
    return {input:req.input,result};
  }catch{return false;}
}
