import fs from 'node:fs';
import path from 'node:path';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {resolvePrithaAgentMemoryRoot} from '../lib/paths.mjs';

export const MODEL_LED_CREATION='model-led-local-v1';

// Issued only by the host when a new, explicitly bound creation task starts.
// It is not a tool argument, user vote, service permission or budget extension.
export function creationAuthority(state,requestId){
  return {policy:MODEL_LED_CREATION,chatId:state.chatId,connectorId:state.connectorId,target:state.target,requestId};
}
export function hasCreationAuthority(state){
  const a=state?.creationAuthority;
  return Boolean(a && a.policy===MODEL_LED_CREATION && a.chatId===state.chatId
    && a.connectorId===state.connectorId && a.target===state.target
    && /^[A-Za-z0-9_-]{8,128}$/.test(a.requestId || '')
    && Object.keys(a).sort().join(',')==='chatId,connectorId,policy,requestId,target');
}

// A repairable draft does not revoke the request. Only a Contract actually
// finalized by Pritha makes research advisory; custom user reviews stay valid.
export function hasDelegatedContract(state){
  const approval=state?.contractApproval;
  return Boolean(hasCreationAuthority(state) && approval?.approvedBy==='pritha'
    && approval.authorization && Object.keys(approval.authorization).length===5
    && Object.entries(state.creationAuthority).every(([key,value])=>approval.authorization[key]===value));
}

// Outcome evidence must refer back to the host-owned creation request. A
// document saying "approved_by: pritha" is insufficient, even with valid hashes.
export function verifyCreationAuthority(authority,contract,specPath,options={}){
  try{
    if(!authority || authority.policy!==MODEL_LED_CREATION || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(contract?.technicalSlug || ''))return false;
    const memory=resolvePrithaAgentMemoryRoot(options);
    const directory=path.join(memory,'voice-factory',contract.technicalSlug),file=path.join(directory,'session.json');
    const stat=fs.lstatSync(file);
    if(stat.nlink!==1 || fs.realpathSync(file)!==file)return false;
    const state=JSON.parse(readBoundedRegularFile(file,{allowedRoots:[directory],maxBytes:100000}).text);
    const same=(a,b)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
    // While a built agent is being revised the session binds two Outcomes of
    // this Contract: the revision it is preparing and the applied one that
    // stays in use until the revision replaces it. Both were decided under
    // this request; no other document gains authority from it.
    const spec=path.resolve(specPath);
    return hasCreationAuthority(state) && same(authority,state.creationAuthority)
      && state.contract===contract.fullPath && (state.outcome===spec || state.improvement?.applied?.outcome===spec)
      && state.target===path.resolve(options.root,contract.targetFolder);
  }catch{return false;}
}
