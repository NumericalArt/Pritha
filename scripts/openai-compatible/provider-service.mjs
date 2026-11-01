import {createHash} from 'node:crypto';
import {readProviderCredential} from '../lib/provider-credential.mjs';
import {providerJson} from '../lib/provider-http.mjs';
import {normalizeLocalProviderUrl,normalizeProviderPreset} from '../lib/provider-profile.mjs';
import {providerSandboxDependency} from '../lib/provider-sandbox.mjs';
import {ProviderTaskError} from '../lib/provider-task-runtime.mjs';
import {probeCompatibleCli} from './cli-probe.mjs';
import {hostFileAttachmentVerified} from '../lib/provider-file-attachments.mjs';
import {readLocalServerConfiguration,startOwnedLocalServer,inspectOwnedLocalServer} from './owned-local-server.mjs';
import {OPENROUTER_BASE_URL,OPENROUTER_HEADERS,normalizeOpenRouterAccount,normalizeOpenRouterModels,openRouterShortlist,normalizeLocalModels,ollamaModelMetadata,lmStudioModelMetadata} from './catalog.mjs';

export const LOCAL_DISCOVERY_ENDPOINTS=Object.freeze(['http://127.0.0.1:11434/v1','http://127.0.0.1:1234/v1']);
const messages={provider_pending_auth:'Connect the selected provider in Settings.',provider_model_unavailable:'Select a model from this server’s current catalog.',provider_tools_unverified:'The selected model has not declared tool support.',provider_protocol_unverified:'This model server has not declared the required Responses protocol.',provider_effort_unavailable:'The selected model does not declare this reasoning setting. Choose one of its supported values.',provider_runtime_unavailable:'A compatible installed Codex CLI is required.',provider_sandbox_unavailable:'A verified host sandbox is required.',provider_billing_required:'The current key budget is exhausted.',provider_rate_limited:'The provider currently limits new requests.',provider_local_cloud_model:'This model uses a remote backend and cannot run in Local offline mode.',provider_offline_unverified:'This local server is reachable, but its network isolation has not been verified.',provider_unavailable:'The selected provider is temporarily unavailable.'};
Object.assign(messages,{provider_local_configuration_invalid:'Review the private Local server manifest before running this model.',provider_local_configuration_mismatch:'The selected Local model or source differs from its private server configuration.',provider_local_binary_changed:'The installed Local server changed. Review and configure it again.',provider_local_process_unverified:'A Local model process needs ownership or exit verification before another task can start.'});
function capabilities(connectorId){return {steer:false,interrupt:true,approvals:true,tools:false,attachments:{files:false,images:false},usage:'observed',resume:true,sandbox:'host-enforced',offline:false};}
function result(connectorId,status,code,extra={}){return {connectorId,status,version:null,checkedAt:new Date().toISOString(),capabilities:capabilities(connectorId),models:[],account:null,shortlist:[],endpoint:null,error:code?{code,message:messages[code] || messages.provider_unavailable}:null,...extra};}
function statusFor(code){return code==='provider_pending_auth'?'pending-auth':code==='provider_rate_limited'?'rate-limited':code==='provider_billing_required'?'billing-required':'error';}
function modelFailure(model,preset){
  if(!model)return 'provider_model_unavailable';if(model.cloud)return 'provider_local_cloud_model';
  if(!model.responses)return 'provider_protocol_unverified';if(!model.tools)return 'provider_tools_unverified';
  if(!model.efforts.includes(preset.reasoningEffort) || preset.thinkingBudget!==undefined && (!model.thinkingBudget || preset.thinkingBudget<1 || preset.reasoningEffort==='none'))return 'provider_effort_unavailable';
  return null;
}

/** Metadata probes only. Never a completion, model load/download, login or service start. */
export class CompatibleProviderService {
  constructor(options){if(!['openrouter','local'].includes(options.connectorId))throw new Error('provider_profile_invalid');this.options=options;this.connectorId=options.connectorId;this.cache=new Map();this.pending=new Map();}
  async snapshot(input){
    let preset,key='';
    try{
      // Task bindings add a host sandbox policy to the saved preset. Validate
      // that boundary separately; it is not an upstream model setting.
      const {sandbox,...configuration}=input || {};
      if(sandbox!==undefined && !['read-only','workspace-write'].includes(sandbox))throw new Error('provider_sandbox_invalid');
      preset=normalizeProviderPreset(this.connectorId,configuration);
      if(this.connectorId==='openrouter'){key=(this.options.readCredential || readProviderCredential)('openrouter',{stateRoot:this.options.stateRoot,env:this.options.env || process.env});if(!key)return result('openrouter','not-configured','provider_pending_auth');}
    }catch{return result(this.connectorId,'configured','provider_metadata_invalid');}
    const identity=createHash('sha256').update(JSON.stringify([preset,key])).digest('hex'),saved=this.cache.get(identity);
    if(saved && Date.now()-saved.at<15000)return saved.result;
    if(this.pending.has(identity))return this.pending.get(identity);
    const pending=this.probe(preset,key).then(value=>{this.cache.clear();this.cache.set(identity,{at:Date.now(),result:value});return value;}).finally(()=>this.pending.delete(identity));
    this.pending.set(identity,pending);return pending;
  }
  async runtime(){
    const cli=await (this.options.probeCli || probeCompatibleCli)({...this.options,connectorId:this.connectorId});
    if(!cli.available)return {version:cli.version,code:'provider_runtime_unavailable'};
    try{(this.options.probeSandbox || providerSandboxDependency)(this.options.root);}catch{return {version:cli.version,code:'provider_sandbox_unavailable'};}
    return {version:cli.version,code:null};
  }
  async probe(preset,key){
    try{
      const metadata=this.connectorId==='openrouter'?this.openrouter(preset,key):this.local(preset);
      const [runtime,data]=await Promise.all([this.runtime(),metadata]);
      const model=data.models.find(row=>row.id===preset.modelId),code=data.code || modelFailure(model,preset) || runtime.code;
      const extra={...data,version:runtime.version};delete extra.code;
      if(code)return result(this.connectorId,['provider_pending_auth','provider_billing_required','provider_rate_limited'].includes(code)?statusFor(code):'configured',code,extra);
      if(this.connectorId==='local' && !data.offlineVerified)return result('local','configured','provider_offline_unverified',extra);
      return result(this.connectorId,'ready',null,{...extra,capabilities:{...capabilities(this.connectorId),tools:true,offline:this.connectorId==='local',attachments:{files:hostFileAttachmentVerified(this.connectorId,runtime.version),images:false},contextTokens:model.contextTokens,outputTokens:model.outputTokens,reasoningControl:model.reasoningControl===true,parallelLimit:1}});
    }catch(error){return result(this.connectorId,statusFor(error.code),Object.hasOwn(messages,error.code)?error.code:'provider_unavailable');}
  }
  async openrouter(preset,key){
    const options={fetchImpl:this.options.fetchImpl,headers:{authorization:'Bearer '+key,...OPENROUTER_HEADERS},timeoutMs:5000};
    const [keyPayload,catalog]=await Promise.all([providerJson(OPENROUTER_BASE_URL+'/key',{...options,maxBytes:128000}),providerJson(OPENROUTER_BASE_URL+'/models',{...options,maxBytes:8*1024*1024})]);
    const account=normalizeOpenRouterAccount(keyPayload),models=normalizeOpenRouterModels(catalog);
    const code=account.managementOnly || account.expiresAt && Date.parse(account.expiresAt)<=Date.now()?'provider_pending_auth':account.remainingUsd===0?'provider_billing_required':null;
    return {account,models,shortlist:openRouterShortlist(models),code};
  }
  async local(preset){
    const endpoint=preset.baseUrl?normalizeLocalProviderUrl(preset.baseUrl):null;
    // Discovery reports every candidate and never silently selects another server.
    if(!endpoint)return {models:[],endpoint:null,discovery:await this.discover(),code:'provider_model_unavailable'};
    let config;try{config=(this.options.localConfiguration || readLocalServerConfiguration)(this.options,preset);}catch(error){if(error.code!=='provider_offline_unverified')throw error;}
    if(config){
      const active=await (this.options.inspectLocalServer || inspectOwnedLocalServer)(this.options,config);
      if(active)return {models:[active],endpoint,account:null,offlineVerified:true};
      const server=await (this.options.startLocalServer || startOwnedLocalServer)({...this.options,timeoutMs:15000},config);
      const result=await server.close();if(!result.processTreeExited)throw Object.assign(new Error('Local process needs review.'),{code:'provider_local_process_unverified'});
      return {models:[server.model],endpoint,account:null,offlineVerified:true};
    }
    const options={fetchImpl:this.options.fetchImpl,timeoutMs:5000},origin=new URL(endpoint).origin;
    let models=normalizeLocalModels(await providerJson(endpoint+'/models',options));
    // Native read-only metadata distinguishes tool support without inference.
    // No key, cookie or ambient Authorization header is ever sent to localhost.
    try{
      const payload=await providerJson(origin+'/api/v1/models',options);models=lmStudioModelMetadata(models,payload);
    }catch{/* An OpenAI-compatible server need not implement LM Studio metadata. */}
    const selected=models.find(row=>row.id===preset.modelId);
    if(selected && selected.source==='openai-compatible')try{
      const payload=await providerJson(origin+'/api/show',{...options,method:'POST',jsonBody:{model:selected.id}});
      models=models.map(row=>row.id===selected.id?ollamaModelMetadata(row,payload):row);
    }catch{/* Unknown capabilities remain unverified; no inference probe. */}
    return {models,endpoint,account:null};
  }
  async discover(){return Promise.all(LOCAL_DISCOVERY_ENDPOINTS.map(async endpoint=>{
    try{return {endpoint,status:'reachable',models:normalizeLocalModels(await providerJson(endpoint+'/models',{fetchImpl:this.options.fetchImpl,timeoutMs:1500}))};}
    catch{return {endpoint,status:'unavailable',models:[]};}
  }));}
  async require(preset){const snapshot=await this.snapshot(preset);if(snapshot.status!=='ready')throw new ProviderTaskError(snapshot.error?.code || 'provider_unavailable',snapshot.error?.message,snapshot.status==='rate-limited'?429:snapshot.status==='billing-required'?402:503);return snapshot;}
}
