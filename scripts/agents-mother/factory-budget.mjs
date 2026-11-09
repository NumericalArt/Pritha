import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWriteFile,withFileLock} from '../lib/atomic-file.mjs';
import {privateStateFile} from '../lib/private-state-path.mjs';
import {voiceFactoryPaths,factoryRead} from './voice-factory-state.mjs';

// Stability profile: shared by preparation, implementation and subsequent work
// in the same factory conversation. Explicit, accepted smaller build limits
// remain binding; these defaults never rewrite an accepted document.
export const FACTORY_STABILITY_BUDGET=Object.freeze({maxTokens:10_000_000,maxActiveMs:7_200_000,buildIterations:24,buildElapsedMs:7_200_000});
const count=value=>Number.isSafeInteger(value) && value>=0;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>Object.assign(new Error('The factory saved its work and could not admit more model work within the shared budget.'),{code,statusCode:409});
const elapsed=(start,end)=>Math.max(0,Date.parse(end)-Date.parse(start)) || 0;
function context(options){
  const p=voiceFactoryPaths({...options,agentParent:options.agentParent ?? options.parent});
  if(options.target && options.target!==p.target || !/^chat_[A-Za-z0-9_-]{1,160}$/.test(options.chatId || '')
    || !['codex','claude','neuraldeep','openrouter','local'].includes(options.connectorId))throw fail('factory_budget_identity');
  return {...p,identity:{chatId:options.chatId,connectorId:options.connectorId,slug:p.slug,target:p.target,stateRoot:p.stateRoot},file:path.join(p.directory,'workflow-budget.json')};
}
function read(p){
  if(!fs.existsSync(p.file))return null;
  const value=JSON.parse(factoryRead(p.file,p.directory,8_000_000));
  if(value.version!==1 || digest(value.identity)!==digest(p.identity) || !count(value.limits?.maxTokens) || value.limits.maxTokens<1
    || !count(value.limits?.maxActiveMs) || value.limits.maxActiveMs<1 || !value.attempts || Array.isArray(value.attempts))throw fail('factory_budget_identity');
  for(const row of Object.values(value.attempts))if(!['preparation','build'].includes(row.phase) || !count(row.observedTokens) || !count(row.chargedTokens)
    || row.chargedTokens<row.observedTokens || !count(row.activeMs))throw fail('factory_budget_receipt_invalid');
  return value;
}
function view(value){
  const rows=Object.values(value?.attempts || {}),limits=value?.limits || FACTORY_STABILITY_BUDGET;
  const sum=key=>rows.reduce((n,row)=>n+row[key],0);
  const observedTokens=sum('observedTokens'),chargedTokens=sum('chargedTokens'),activeMs=sum('activeMs');
  const since=value?.progress || {tokens:0,activeMs:0};
  return {version:1,maxTokens:limits.maxTokens,maxActiveMs:limits.maxActiveMs,observedTokens,chargedTokens,
    remainingTokens:Math.max(0,limits.maxTokens-chargedTokens),activeMs,remainingActiveMs:Math.max(0,limits.maxActiveMs-activeMs),
    preparationTokens:rows.filter(row=>row.phase==='preparation').reduce((n,row)=>n+row.observedTokens,0),
    buildTokens:rows.filter(row=>row.phase==='build').reduce((n,row)=>n+row.observedTokens,0),
    usageKnown:rows.every(row=>row.usageKnown),uncertainAttempts:rows.filter(row=>!row.usageKnown).length,
    reservationTokens:chargedTokens-observedTokens,elapsedMs:value?elapsed(value.createdAt,value.updatedAt):0,
    progressReview:chargedTokens-since.tokens>=1_000_000 && activeMs-since.activeMs>=600_000,
    warning:chargedTokens>=limits.maxTokens*0.8 || activeMs>=limits.maxActiveMs*0.8,
    accounting:'provider requests; approval waiting excluded; uncertain charges retain their reservation'};
}
export function readFactoryBudget(options){return view(read(context(options)));}

/** One host-owned ledger for both sides of a factory. A checkpoint replaces
 * one attempt's cumulative observation; retries and resumed turns never add
 * the same usage twice. No prompts, credentials or model reasoning are stored. */
export class FactoryBudget {
  constructor(options){this.p=context(options);this.options=options;}
  view(){return view(read(this.p));}
  async change(update){
    privateStateFile(this.p.stateRoot,this.p.file);
    const until=Date.now()+5000;
    for(;;){
      try{return withFileLock(this.p.file,()=>{
        const prior=read(this.p),now=new Date().toISOString();
        const value=prior || {version:1,identity:this.p.identity,limits:{...FACTORY_STABILITY_BUDGET},attempts:{},createdAt:now,updatedAt:now};
        const result=update(value);value.updatedAt=now;
        atomicWriteFile(this.p.file,JSON.stringify(value)+'\n');return result ?? view(value);
      });}catch(error){
        if(!String(error.message).startsWith('File is locked by another operation:') || Date.now()>=until)throw error;
        await new Promise(resolve=>setTimeout(resolve,15));
      }
    }
  }
  async ensure(){return this.change(()=>{});}
  check(){const value=this.view();if(!value.remainingTokens)throw fail('factory_token_budget_exhausted');if(!value.remainingActiveMs)throw fail('factory_time_budget_exhausted');return value;}
  async observe(id,phase,data,{admission=false}={}){
    if(typeof id!=='string' || id.length>300 || !['preparation','build'].includes(phase))throw fail('factory_budget_receipt_invalid');
    return this.change(value=>{
      const key=digest(id),previous=value.attempts[key];
      if(previous && (previous.phase!==phase || data.observedTokens<previous.observedTokens || data.activeMs<previous.activeMs))throw fail('factory_budget_receipt_conflict');
      if(!count(data.observedTokens) || !count(data.chargedTokens) || data.chargedTokens<data.observedTokens || !count(data.activeMs))throw fail('factory_budget_receipt_invalid');
      value.attempts[key]={phase,observedTokens:data.observedTokens,chargedTokens:data.chargedTokens,activeMs:data.activeMs,usageKnown:data.usageKnown===true,
        source:data.source==='native-counter'?'native-counter':data.source==='legacy-observation'?'legacy-observation':'request-receipts'};
      const next=view(value);
      if(admission && (next.chargedTokens>next.maxTokens || next.activeMs>=next.maxActiveMs))throw fail(next.chargedTokens>next.maxTokens?'factory_token_budget_exhausted':'factory_time_budget_exhausted');
    });
  }
  async checkpoint(id,phase,snapshot){
    if(!Array.isArray(snapshot.requests))throw fail('factory_budget_receipt_invalid');
    let observedTokens=0,chargedTokens=0,activeMs=0,usageKnown=true,admission=false;
    for(const row of snapshot.requests){
      const measured=row.status==='measured' && count(row.usage?.totalTokens);
      if(measured)observedTokens+=row.usage.totalTokens;
      const charge=measured?row.usage.totalTokens:row.reservedTokens;
      if(!count(charge))throw fail('factory_budget_receipt_invalid');
      chargedTokens+=charge;usageKnown &&=measured;admission ||=row.status==='reserved';
      activeMs+=elapsed(row.createdAt,row.finishedAt || new Date().toISOString());
    }
    return this.observe(id,phase,{observedTokens,chargedTokens,activeMs,usageKnown},{admission});
  }
  async native(id,phase,total,activeDeltaMs=0){
    if(!['preparation','build'].includes(phase) || typeof id!=='string' || id.length>300 || total!==undefined && !count(total) || !count(activeDeltaMs))throw fail('factory_budget_receipt_invalid');
    return this.change(value=>{const key=digest(id),prior=value.attempts[key];
      if(prior && prior.phase!==phase || total!==undefined && total<(prior?.observedTokens || 0))throw fail('factory_budget_receipt_conflict');
      const tokens=total ?? prior?.observedTokens ?? 0;
      value.attempts[key]={phase,observedTokens:tokens,chargedTokens:tokens,activeMs:(prior?.activeMs || 0)+activeDeltaMs,
        usageKnown:total!==undefined || prior?.usageKnown===true,source:'native-counter'};
    });
  }
  async extend(operationId,{tokens=0,activeMs=0}){
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(operationId || '') || !count(tokens) || tokens>10_000_000 || !count(activeMs) || activeMs>86_400_000)throw fail('factory_budget_receipt_invalid');
    return this.change(value=>{
      const key=digest(operationId),addition={tokens,activeMs};value.extensions ||= {};
      if(value.extensions[key]){if(digest(value.extensions[key])!==digest(addition))throw fail('factory_budget_receipt_conflict');return;}
      if(!Number.isSafeInteger(value.limits.maxTokens+tokens) || !Number.isSafeInteger(value.limits.maxActiveMs+activeMs))throw fail('factory_budget_receipt_invalid');
      value.limits.maxTokens+=tokens;value.limits.maxActiveMs+=activeMs;value.extensions[key]=addition;
    });
  }
  async progress(evidence){
    if(typeof evidence!=='string' || evidence.length>1000)throw fail('factory_budget_receipt_invalid');
    return this.change(value=>{const key=digest(evidence);if(value.progress?.key===key)return;const current=view(value);value.progress={key,tokens:current.chargedTokens,activeMs:current.activeMs};});
  }
}
