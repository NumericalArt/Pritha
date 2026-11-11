import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {factoryArtifact,factoryRead} from './voice-factory-state.mjs';
import {verifyTrialResultFreshness} from './trial-runner.mjs';
import {contractData} from './contract.mjs';
import {validateOutcomeSpecText} from './outcome-spec.mjs';
import {firstUseExamples,validateProductTrial} from './factory-product-trial.mjs';
import {createHash} from 'node:crypto';

function matchesModelExample(actual,expected){
  let nonce;
  const visit=(a,b)=>{
    if(typeof b==='string' && b.includes('__PRITHA_MODEL_TEXT__')){
      if(typeof a!=='string')return false;
      const parts=b.split('__PRITHA_MODEL_TEXT__'),escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const match=new RegExp('^'+parts.map(escape).join('([a-f0-9]{40})')+'$').exec(a);
      if(!match)return false;nonce ||= match[1];return match.slice(1).every(value=>value===nonce);
    }
    if(b && typeof b==='object')return a && typeof a==='object' && Array.isArray(a)===Array.isArray(b) && isDeepStrictEqual(Object.keys(a).sort(),Object.keys(b).sort()) && Object.keys(b).every(key=>visit(a[key],b[key]));
    return isDeepStrictEqual(a,b);
  };
  return visit(actual,expected) && Boolean(nonce);
}

/** Only a v2 protected verifier can attest these command/output pairs. Render
 * no command supplied by product stdout. Older Outcomes retain their locks. */
export function verifiedFirstUse(p,s,result){
  if(!['verified','awaiting_acceptance','accepted'].includes(result.state.status))return null;
  const ref=result.state.last_trial_result,dir=result.worktree?.worktree;
  if(!dir || !result.runRoot || dir!==path.join(result.runRoot,'worktree') || !/^trial-results\/verification-\d+\.json$/.test(ref?.path))return null;
  const spec=factoryArtifact(p,s,'outcome');
  const trial=validateOutcomeSpecText(spec.text,{root:p.root}).parsed.trials.find(t=>t.id==='product-http-cli');
  const verifier=trial?.verifierInputs?.find(v=>v.path==='verification/product.mjs' && v.provenance==='host-template:api-cli-product-v2');
  if(!verifier)return null;
  const content=factoryRead(path.join(dir,verifier.path),dir,128000);
  if('sha256:'+createHash('sha256').update(content).digest('hex')!==verifier.hash)return null;
  const match=/^const checks = JSON\.parse\(([^\n]+)\);\n/.exec(content);
  if(!match)return null;
  const cases=JSON.parse(JSON.parse(match[1])),data=contractData(s.contract,{root:p.root});
  validateProductTrial(cases,data);
  const receipt=JSON.parse(factoryRead(path.join(result.runRoot,ref.path),result.runRoot,2*1024*1024));
  if(receipt.evidence_lock!==ref.evidence_lock || receipt.spec_id!==result.state.spec.id || receipt.document_lock!==result.state.spec.document_lock)return null;
  const fresh=verifyTrialResultFreshness(receipt,dir,{root:p.root,stateRoot:p.stateRoot,outcomeSpecPath:s.outcome});
  if(!fresh.ok || !fresh.current?.head || fresh.current.dirty!==false)return null;
  const row=receipt.trials.find(t=>t.id===trial.id && t.status==='passed');
  let demo;try {demo=JSON.parse(row.execution.stdout.trim());}catch{return null;}
  const observed=demo.observed,modelProof=data.childModelConnection==='pritha';
  if(modelProof && (demo.modelVerification!=='protected-local-responder' || demo.liveModelVerified!==false))return null;
  if(!observed || Object.keys(cases).some(k=>!(modelProof?matchesModelExample:isDeepStrictEqual)(observed[k],cases[k].find(c=>(c.expected_exit??0)===0 && (c.expected_status??200)===200).expected_json)))return null;
  const application=s.localApplication?.status==='applied' && s.localApplication.to===fresh.current.head;
  if(application && !verifyTrialResultFreshness(receipt,p.target,{root:p.root,stateRoot:p.stateRoot,outcomeSpecPath:s.outcome}).ok)return null;
  const applied=Boolean(application);
  return {directory:applied?p.target:dir,commit:fresh.current.head,commands:firstUseExamples(cases,data),observed,
    ...(applied && data.agentId?{interactionHref:'/agents/'+encodeURIComponent(data.agentId)+'#try-agent'}:{}),
    ...(modelProof?{modelVerification:'protected-local-responder',liveModelVerified:false}:{}),
    disposition:applied?'applied-local-project':'verified-worktree',acceptance:result.state.accepted_by==='user'?'accepted':'pending'};
}
