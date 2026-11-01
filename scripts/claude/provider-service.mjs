import { createHash } from 'node:crypto';
import { readProviderCredential } from '../lib/provider-credential.mjs';
import { providerSandboxDependency } from '../lib/provider-sandbox.mjs';
import { ProviderTaskError } from '../lib/provider-task-runtime.mjs';
import { resolveClaudeBinary } from '../claude-code-runner.mjs';
import { probeClaudeCli } from './cli-probe.mjs';
import { listClaudeModels,resolveClaudeModel } from './messages-client.mjs';
import {hostFileAttachmentVerified} from '../lib/provider-file-attachments.mjs';
import {probeClaudeNativeAuth,nativeClaudeLoginPlan,CLAUDE_NATIVE_MODELS,resolveNativeClaudeModel} from './native-auth.mjs';

const capabilities=()=>({steer:false,interrupt:true,approvals:true,tools:true,attachments:{files:false,images:false},usage:'observed',resume:true,sandbox:'host-enforced',offline:false});
const messages={provider_pending_auth:'Connect an Anthropic API key in Settings.',provider_auth_mode_unverified:'This Claude authentication mode is not available in the isolated task runtime.',provider_native_login_required:'Sign in through Claude Code for this Pritha instance.',provider_native_auth_unavailable:'The native Claude session could not be verified. Check its status in the terminal.',provider_native_auth_unsafe:'The native Claude configuration needs a private directory repair.',provider_native_auth_unsupported:'Use a Claude account in this native CLI session, or choose the separate API-key mode.',provider_runtime_unavailable:'Install a supported Claude Code CLI.',provider_runtime_unverified:'The installed Claude Code version is not verified for this runtime.',provider_sandbox_unavailable:'The required host sandbox is unavailable.',provider_model_unavailable:'Choose a currently available Claude model.',provider_effort_unavailable:'The selected model does not support this effort level.',provider_billing_required:'Anthropic billing is required.',provider_rate_limited:'Anthropic currently limits requests.',provider_unavailable:'Anthropic model metadata is temporarily unavailable.'};

/** Read-only catalog and local binary checks; no inference or OAuth extraction. */
export class ClaudeProviderService {
  constructor(options){this.options=options;this.cache=new Map();this.pending=new Map();}
  result(status,code,extra={}){return {connectorId:'claude',status,version:null,checkedAt:new Date().toISOString(),capabilities:capabilities(),models:[],model:null,error:code?{code,message:messages[code] || messages.provider_unavailable}:null,...extra};}
  async snapshot(preset){
    if(preset.authMode==='local-cli-session')return this.nativeSnapshot(preset);
    if(preset.authMode && preset.authMode!=='api-key')return this.result('unavailable','provider_auth_mode_unverified');
    let key;try{key=(this.options.readCredential || readProviderCredential)('claude',{stateRoot:this.options.stateRoot,env:this.options.env || process.env});}catch{return this.result('pending-auth','provider_pending_auth');}
    if(!key)return this.result('not-configured','provider_pending_auth');
    const identity=createHash('sha256').update(key+'\0'+JSON.stringify([preset.modelId,preset.reasoningEffort])).digest('hex'),cached=this.cache.get(identity);
    if(cached && Date.now()-cached.at<15000)return cached.result;if(this.pending.has(identity))return this.pending.get(identity);
    const pending=this.probe(key,preset).then(result=>{this.cache.clear();this.cache.set(identity,{at:Date.now(),result});return result;}).finally(()=>this.pending.delete(identity));
    this.pending.set(identity,pending);return pending;
  }
  async nativeSnapshot(preset){
    const key='native:'+JSON.stringify([preset.modelId,preset.reasoningEffort]);
    if(this.pending.has(key))return this.pending.get(key);
    const operation=(async()=>{
      const extra={authMode:'local-cli-session',nativeSession:{status:'pending-auth',loginCommand:nativeClaudeLoginPlan(this.options).command},models:CLAUDE_NATIVE_MODELS.map(row=>({...row,efforts:[...row.efforts]}))};
      try{
        (this.options.checkSandbox || providerSandboxDependency)(this.options.root);
        const binary=this.options.probeNativeAuth?null:resolveClaudeBinary(this.options.claudeBin,this.options.env || process.env);
        const cli=await (this.options.probeCli || (()=>probeClaudeCli({...this.options,binary})))();extra.version=cli.version || null;
        if(!cli.available)return this.result('unavailable',cli.code || 'provider_runtime_unavailable',extra);
        const auth=await (this.options.probeNativeAuth || probeClaudeNativeAuth)({...this.options,binary});extra.nativeSession.status=auth.status;
        const model=resolveNativeClaudeModel(preset.modelId);extra.model=model;
        if(!auth.authenticated)return this.result(auth.status==='not-configured'?'not-configured':'pending-auth',auth.code || 'provider_native_login_required',extra);
        if(preset.reasoningEffort && !model.efforts.includes(preset.reasoningEffort))return this.result('configured','provider_effort_unavailable',extra);
        return this.result('ready',null,{...extra,capabilities:{...capabilities(),attachments:{files:hostFileAttachmentVerified('claude',cli.version),images:false},outputTokens:8192}});
      }catch(error){return this.result('unavailable',Object.hasOwn(messages,error.code)?error.code:'provider_native_auth_unavailable',extra);}
    })().finally(()=>this.pending.delete(key));this.pending.set(key,operation);return operation;
  }
  async probe(key,preset){
    let version=null,models=[];
    try{
      (this.options.checkSandbox || providerSandboxDependency)(this.options.root);
      const cli=await (this.options.probeCli || (async()=>probeClaudeCli({binary:resolveClaudeBinary(this.options.claudeBin,this.options.env || process.env),...this.options})))();
      version=cli.version || null;if(!cli.available)return this.result('unavailable',cli.code || 'provider_runtime_unavailable',{version});
      models=await (this.options.listModels || listClaudeModels)({apiKey:key,fetchImpl:this.options.fetchImpl});
      const model=resolveClaudeModel(preset.modelId,models);
      if(preset.reasoningEffort && !model.efforts.includes(preset.reasoningEffort))return this.result('configured','provider_effort_unavailable',{version,models,model});
      return this.result('ready',null,{version,models,model,capabilities:{...capabilities(),attachments:{files:hostFileAttachmentVerified('claude',version),images:false},outputTokens:model.maxOutputTokens?Math.min(8192,model.maxOutputTokens):8192}});
    }catch(error){const code=Object.hasOwn(messages,error.code)?error.code:'provider_unavailable';return this.result(code==='provider_pending_auth'?'pending-auth':code==='provider_model_unavailable'?'configured':code==='provider_rate_limited'?'rate-limited':code==='provider_billing_required'?'billing-required':code.startsWith('provider_runtime') || code==='provider_sandbox_unavailable'?'unavailable':'error',code,{version,models});}
  }
  async require(preset){const snapshot=await this.snapshot(preset);if(snapshot.status!=='ready')throw new ProviderTaskError(snapshot.error.code,snapshot.error.message,snapshot.status==='rate-limited'?429:snapshot.status==='billing-required'?402:503);return snapshot;}
  async resolveConfiguration(preset){const snapshot=await this.require(preset);return {...preset,modelId:snapshot.model.id};}
}
