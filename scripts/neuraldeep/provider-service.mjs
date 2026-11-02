import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readProviderCredential,providerCredentialError } from '../lib/provider-credential.mjs';
import { providerProcessEnvironment } from '../lib/provider-process-environment.mjs';
import { providerJson } from '../lib/provider-http.mjs';
import { ProviderTaskError } from '../lib/provider-task-runtime.mjs';
import { loadNeuralDeepAccountSnapshot, billingContextForModel } from './account-snapshot.mjs';
import { declaredModelInputs } from './model-input-capabilities.mjs';
import {hostFileAttachmentVerified} from '../lib/provider-file-attachments.mjs';
import {providerSandboxDependency} from '../lib/provider-sandbox.mjs';
import {readAttachmentTransport} from './attachment-transport.mjs';
import {attachmentSupport} from './attachment-policy.mjs';

const execute=promisify(execFile),token=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(value)?value:null;
const positive=value=>Number.isSafeInteger(value) && value>0?value:null;
const capabilities=()=>({steer:false,interrupt:true,approvals:false,tools:false,attachments:{files:false,images:false},usage:'observed',resume:true,sandbox:'runtime-enforced',offline:false});
const messages={provider_pending_auth:'Connect NeuralDeep in Settings.',provider_model_unavailable:'The selected model is absent from the current key catalog.',provider_billing_required:'The selected model requires Wallet access.',provider_limits_unknown:'Current account limits could not be verified.',provider_rate_limited:'NeuralDeep currently limits new requests.',provider_tools_unverified:'The selected model has not declared tool support.',provider_runtime_unavailable:'A compatible installed Codex CLI is required.',provider_sandbox_unavailable:'The required host sandbox is unavailable.',provider_unavailable:'NeuralDeep metadata is temporarily unavailable.'};

export function normalizeNeuralDeepModels(payload){
  if(!Array.isArray(payload?.data) || payload.data.length>1000)throw new ProviderTaskError('provider_metadata_invalid','The provider model catalog is invalid.',503);
  const ids=new Set();return payload.data.flatMap(row=>{
    const id=token(row?.id);if(!id || ids.has(id) || row.type && row.type!=='chat')return [];ids.add(id);
    const declared=declaredModelInputs(row);
    return [{id,provider:'neuraldeep',capabilitiesKnown:true,tools:declared.toolsAdvertised===true,...declared,vision:declared.visionAdvertised,
      contextTokens:positive(row.limit?.context),outputTokens:positive(row.limit?.output),requiresWallet:row.requires_wallet===true || row.access==='requires_wallet',available:typeof row.available==='boolean'?row.available:null}];
  });
}

/** Only read-only account/catalog calls run here. No completion, subscription or payment mutation. */
export class NeuralDeepProviderService {
  constructor(options){this.options=options;this.cache=new Map();this.pending=new Map();}
  async cli(){
    if(this.options.requireCli===false)return null;
    if(this.cliCache && Date.now()-this.cliCache.at<60000)return this.cliCache.version;
    try{
      const env=providerProcessEnvironment({provider:'neuraldeep',root:this.options.root,stateRoot:this.options.stateRoot,env:this.options.env || process.env});
      const binary=this.options.codexBin || 'codex';
      const version=this.options.probeCli ? await this.options.probeCli() : await (async()=>{
        const result=await execute(binary,['--version'],{env,encoding:'utf8',timeout:5000,maxBuffer:8192});
        const parsed=/\b(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)\b/.exec(result.stdout)?.[1];
        if(!parsed)throw new Error();
        const help=await execute(binary,['exec','--help'],{env,encoding:'utf8',timeout:5000,maxBuffer:64000});
        if(!['--strict-config','--ignore-user-config','--ignore-rules','--json'].every(flag=>help.stdout.includes(flag)))throw new Error();return parsed;
      })();
      if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version || ''))throw new Error();
      this.cliCache={at:Date.now(),version};return version;
    }catch{return null;}
  }
  async snapshot(modelId){
    let key;try{key=(this.options.readCredential || readProviderCredential)('neuraldeep',{stateRoot:this.options.stateRoot,env:this.options.env || process.env});}
    catch(error){return this.result('error',null,null,{error:providerCredentialError(error)});}
    if(!key)return this.result('not-configured','provider_pending_auth',null);
    const identity=createHash('sha256').update(key+'\0'+modelId).digest('hex'),cached=this.cache.get(identity);
    if(cached && Date.now()-cached.at<15000)return cached.result;
    if(this.pending.has(identity))return this.pending.get(identity);
    const pending=this.probe(key,modelId).then(result=>{this.cache.clear();this.cache.set(identity,{at:Date.now(),result});return result;}).finally(()=>this.pending.delete(identity));
    this.pending.set(identity,pending);return pending;
  }
  result(status,code,version,extra={}){return {connectorId:'neuraldeep',status,version,checkedAt:new Date().toISOString(),capabilities:capabilities(),error:code?{code,message:messages[code] || messages.provider_unavailable}:null,models:[],account:null,billing:null,...extra};}
  async probe(key,modelId){
    let version=null;
    try{
      const [installed,account,payload]=await Promise.all([
        this.cli(),loadNeuralDeepAccountSnapshot({stateRoot:this.options.stateRoot,privateRoot:this.options.privateRoot,token:key,fetchImpl:this.options.fetchImpl}),
        providerJson('https://api.neuraldeep.ru/v1/models',{headers:{authorization:'Bearer '+key},fetchImpl:this.options.fetchImpl}),
      ]);
      version=installed;const models=normalizeNeuralDeepModels(payload),model=models.find(row=>row.id===modelId),limits=account.limits;
      const catalog={source:'provider',refreshedAt:new Date().toISOString()};
      const extra={models,catalog,account,billing:billingContextForModel(account,modelId)};
      if(!version && this.options.requireCli!==false)return this.result('unavailable','provider_runtime_unavailable',null,extra);
      if(this.options.requireCli!==false)try{(this.options.checkSandbox || providerSandboxDependency)(this.options.root);}catch{return this.result('unavailable','provider_sandbox_unavailable',version,extra);}
      if(!limits || account.sections.limits.stale || limits.decision.canRequest===null || !Number.isSafeInteger(limits.parallelLimit) || limits.parallelLimit<1 || limits.parallelLimit>64)return this.result('configured','provider_limits_unknown',version,extra);
      if(limits.keyStatus!=='ok')return this.result('pending-auth','provider_pending_auth',version,extra);
      if(limits.decision.canRequest!==true)return this.result('rate-limited','provider_rate_limited',version,extra);
      if(!model || model.available===false)return this.result('configured','provider_model_unavailable',version,extra);
      if(!account.sections.public.available || account.sections.public.stale || !['subscription','wallet'].includes(limits.billingMode))return this.result('configured','provider_limits_unknown',version,extra);
      const price=account.walletPrices.find(row=>row.model===modelId),walletOnly=model.requiresWallet || price?.premium===true || price?.openRouter===true;
      const allowance=limits.specialAllowances?.some(row=>row.name===modelId && row.active && typeof row.remaining==='number' && row.remaining>0);
      if(walletOnly && !allowance && (limits.billingMode!=='wallet' || !(limits.wallet?.balanceRub>0)))return this.result('billing-required','provider_billing_required',version,extra);
      if(!model.tools)return this.result('configured','provider_tools_unverified',version,extra);
      let transport=null;
      if(this.options.requireCli!==false)try{transport=readAttachmentTransport({...this.options,cliVersion:version});}catch{/* A damaged image proof does not disable text tasks. */}
      const imageSupport=attachmentSupport({model,catalog,transport}),resumeSupport=attachmentSupport({model,catalog,transport,path:'resume'});
      return this.result('ready',null,version,{...extra,imageSupport,capabilities:{...capabilities(),tools:true,approvals:this.options.requireCli!==false,sandbox:this.options.requireCli===false?'runtime-enforced':'host-enforced',attachments:{files:hostFileAttachmentVerified('neuraldeep',version),images:imageSupport.image==='supported' && resumeSupport.image==='supported'},parallelLimit:limits.parallelLimit,contextTokens:model.contextTokens,outputTokens:model.outputTokens}});
    }catch(error){const code=['provider_pending_auth','provider_billing_required','provider_rate_limited'].includes(error.code)?error.code:'provider_unavailable';return this.result(code==='provider_pending_auth'?'pending-auth':code==='provider_billing_required'?'billing-required':code==='provider_rate_limited'?'rate-limited':'error',code,version);}
  }
  async require(modelId){const snapshot=await this.snapshot(modelId);if(snapshot.status!=='ready')throw new ProviderTaskError(snapshot.error.code,snapshot.error.message,snapshot.status==='rate-limited'?429:snapshot.status==='billing-required'?402:503);return snapshot.capabilities;}
  async verifyAttachments(modelId,{signal}={}){
    this.cache.clear();const status=await this.snapshot(modelId);
    if(status.status!=='ready')throw new ProviderTaskError(status.error.code,status.error.message,409);
    const {verifyNeuralDeepAttachmentTransport}=await import('./verify-attachment-transport.mjs');
    const result=await verifyNeuralDeepAttachmentTransport({...this.options,model:status.models.find(row=>row.id===modelId),catalog:status.catalog,signal});
    this.cache.clear();return result;
  }
}
