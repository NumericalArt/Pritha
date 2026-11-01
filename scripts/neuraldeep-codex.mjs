#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import {factorySubjectInstructions} from './lib/chat-subject.mjs';
import { realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenNeuralDeepAdapter, closeNeuralDeepAdapter } from './neuraldeep/responses-adapter.mjs';
import { readJsonlLines } from './neuraldeep/jsonl-reader.mjs';
import { spawnSupervisedCli } from './neuraldeep/process-supervisor.mjs';
import { effectiveNeuralDeepEffort, neuralDeepExecutionProfile } from './neuraldeep/model-execution-profile.mjs';
import { neuralDeepUsageKnown } from './neuraldeep/usage-ledger.mjs';
import { readProviderCredential } from './lib/provider-credential.mjs';
import { providerProcessEnvironment, createProviderTemporaryDirectory } from './lib/provider-process-environment.mjs';
import { privateStateDirectory } from './lib/private-state-path.mjs';
import { resolvePrithaPython } from './lib/python-runtime.mjs';
import { inspectProviderCliSession } from './neuraldeep/native-history-proof.mjs';

const fail=(code,message='The selected NeuralDeep runtime could not complete this task.')=>Object.assign(new Error(message),{code});
const modelPattern=/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/;
const sessionPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const toml=value=>JSON.stringify(value);

export function buildCodexExecArgs(options){
  const factoryInstructions=factorySubjectInstructions(options.factorySubject);
  if(!modelPattern.test(options.model || ''))throw fail('provider_model_invalid');
  if(!['read-only','workspace-write'].includes(options.sandbox || 'read-only'))throw fail('provider_sandbox_invalid');
  if(options.resume && !sessionPattern.test(options.resume))throw fail('runtime_identity_mismatch');
  const endpoint=new URL(options.baseUrl);
  if(endpoint.protocol!=='http:' || endpoint.hostname!=='127.0.0.1' || !endpoint.port || endpoint.pathname!=='/v1' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)throw fail('provider_adapter_endpoint_invalid');
  const roots=(options.writableRoots || []).map(value=>realpathSync(value));
  if(roots.length>16)throw fail('provider_writable_roots_invalid');
  const sandbox=options.sandbox || 'read-only';
  const config={
    model_provider:'neuraldeep',approval_policy:'never',sandbox_mode:sandbox,
    'model_providers.neuraldeep.name':'NeuralDeep through Pritha',
    'model_providers.neuraldeep.base_url':endpoint.href,
    'model_providers.neuraldeep.wire_api':'responses',
    'model_providers.neuraldeep.env_key':'PRITHA_PROVIDER_CAPABILITY',
    'model_providers.neuraldeep.request_max_retries':0,
    'model_providers.neuraldeep.stream_max_retries':0,
    'model_providers.neuraldeep.stream_idle_timeout_ms':960000,
    'model_providers.neuraldeep.supports_websockets':false,
    'analytics.enabled':false,'otel.exporter':'none','otel.log_user_prompt':false,
    check_for_update_on_startup:false,
    'sandbox_workspace_write.network_access':false,
    'sandbox_workspace_write.exclude_slash_tmp':true,
    'sandbox_workspace_write.exclude_tmpdir_env_var':false,
    'sandbox_workspace_write.writable_roots':roots,
  };
  const effort=effectiveNeuralDeepEffort(options.model,options.effort);
  if(factoryInstructions)config.developer_instructions=factoryInstructions;
  if(effort)config.model_reasoning_effort=effort;
  const context=Number.isSafeInteger(options.modelContextTokens) && options.modelContextTokens>0 ? options.modelContextTokens : neuralDeepExecutionProfile(options.model).declaredContextTokens;
  if(context)config.model_context_window=context;
  const args=['exec',...(options.resume?['resume']:[]),'--json','--strict-config','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-m',options.model];
  for(const [key,value] of Object.entries(config))args.push('-c',`${key}=${toml(value)}`);
  for(const feature of ['remote_plugin','plugins','plugin_sharing','apps'])args.push('--disable',feature);
  if(options.images?.length)throw fail('model_image_unverified','This NeuralDeep image path still requires transport verification. The originals are preserved.');
  if(options.resume)args.push(options.resume,'-');else args.push('--color','never','-s',sandbox,'-C',realpathSync(options.cwd),'-');
  return args;
}

/** Owned, bounded CLI attempt. The host persists admission and transcript receipts via callbacks. */
export async function startNeuralDeepRun(options,dependencies={}){
  if(!modelPattern.test(options.model || '') || typeof options.prompt!=='string' || !options.prompt.trim() || Buffer.byteLength(options.prompt)>256000)throw fail('provider_input_invalid');
  if(!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs<1000 || options.timeoutMs>3600000)throw fail('provider_timeout_invalid');
  if(options.resume && !sessionPattern.test(options.resume))throw fail('runtime_identity_mismatch');
  if(options.signal?.aborted)throw fail('operator_cancel');
  const root=realpathSync(options.root),cwd=realpathSync(options.cwd);
  const stateRoot=path.resolve(options.stateRoot),privateRoot=path.resolve(options.privateRoot);
  const key=(dependencies.readCredential || readProviderCredential)('neuraldeep',{stateRoot,env:options.env || process.env});
  if(!key)throw fail('provider_pending_auth','Connect NeuralDeep in Settings before starting a task.');
  const codexHome=privateStateDirectory(stateRoot,path.join(privateRoot,'codex-home'));
  if(options.resume){
    const proof=(dependencies.inspectSession || inspectProviderCliSession)({stateRoot,codexHome,cwd,provider:'neuraldeep',sessionId:options.resume,model:options.model});
    if(!proof.available)throw fail(proof.code,'The original provider session could not be verified. Its private files have been preserved.');
  }
  const temporary=createProviderTemporaryDirectory({provider:'neuraldeep',stateRoot,temporaryRoot:options.temporaryRoot});
  const localToken=randomBytes(32).toString('base64url');
  const grace=Math.max(1,Math.min(30000,Math.floor(options.timeoutMs/10))),window=options.timeoutMs-grace,now=Date.now();
  const deadline={version:2,hardDeadlineAt:now+options.timeoutMs,softDeadlineAt:now+window-Math.max(1,Math.min(60000,Math.floor(window/2))),requestTimeoutMs:Math.min(window,930000),settlementGraceMs:grace};
  let server,owned,providerError=null,closed=false,stopReason=null,verifiedExit=false;
  const identity=createHash('sha256').update(JSON.stringify([realpathSync(stateRoot),codexHome,cwd,'neuraldeep',options.model])).digest('hex');
  const stop=reason=>{stopReason ||= reason;return owned?.stop('SIGTERM') || false;};
  const abort=()=>stop('operator_cancel');
  let timer;
  try{
    server=await (dependencies.listenAdapter || listenNeuralDeepAdapter)({port:0,localToken,upstreamAuthorization:`Bearer ${key}`,deadline,providerRetryAttempts:1,responsesOnly:true,
      createDispatcher:dependencies.createDispatcher,
      ...(dependencies.fetchImpl ? {fetchImpl:dependencies.fetchImpl} : {}),
      validateResponsesRequest(payload){if(payload.model!==options.model)throw fail('neuraldeep_model_identity_mismatch');},
      prepareResponsesRequest(payload){const declared=Number.isSafeInteger(options.maxOutputTokens) && options.maxOutputTokens>0?options.maxOutputTokens:Infinity;
        const cap=Math.min(declared,neuralDeepExecutionProfile(options.model).applicationOutputCap);return {...payload,max_output_tokens:Math.min(Number.isSafeInteger(payload.max_output_tokens) && payload.max_output_tokens>0 ? payload.max_output_tokens : cap,cap)};},
      beforeResponsesDispatch:options.beforeRequest,
      onRequest:event=>{if(event.error)providerError=event.error;options.onProviderRequest?.(event);},
    });
    const args=buildCodexExecArgs({...options,cwd,writableRoots:[...(options.writableRoots || []),temporary],baseUrl:`http://127.0.0.1:${server.address().port}/v1`});
    const env=providerProcessEnvironment({provider:'neuraldeep',root,stateRoot,codexHome,temporary,env:options.env || process.env});
    env.PRITHA_PROVIDER_CAPABILITY=localToken;
    env.PRITHA_PYTHON=resolvePrithaPython({root,env:options.env || process.env});
    owned=await (dependencies.spawnSupervised || spawnSupervisedCli)(options.codexBin || 'codex',args,{cwd,env,supervisorPath:path.join(root,'scripts','neuraldeep','process-supervisor.mjs'),beforeStart:async evidence=>{
      if(options.signal?.aborted)throw fail('operator_cancel');
      await options.beforeStart?.({identity,evidence,codexHome,model:options.model,resume:options.resume || null});
    },onEvidence:options.onEvidence});
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    timer=setTimeout(()=>stop('provider_timeout'),Math.max(1,deadline.hardDeadlineAt-Date.now()));
    const state={sessionId:null,usage:null,completed:false,failed:false,eventCount:0,errorCode:null};
    const consume=(async()=>{
      let total=0;
      for await(const line of readJsonlLines(owned.child.stdout,{maximumLineBytes:16*1024*1024,onChunk:async chunk=>{
        total+=chunk.length;if(total>128*1024*1024)throw fail('provider_output_limit');await options.onRawChunk?.(chunk);
      }})){
        if(++state.eventCount>100000)throw fail('provider_output_limit');
        let event;try{event=JSON.parse(line);}catch{throw fail('provider_stream_malformed');}
        if(!event || typeof event!=='object' || Array.isArray(event))throw fail('provider_stream_malformed');
        if(event.type==='thread.started'){
          if(!sessionPattern.test(event.thread_id || '') || (options.resume && event.thread_id!==options.resume) || (state.sessionId && state.sessionId!==event.thread_id))throw fail('runtime_identity_mismatch');
          state.sessionId=event.thread_id;
        }
        if(event.type==='turn.completed'){state.completed=true;state.usage=neuralDeepUsageKnown(event.usage)?event.usage:null;}
        if(event.type==='turn.failed' || event.type==='error')state.failed=true;
        await options.onEvent?.(event);
      }
    })().catch(error=>{state.errorCode=['runtime_identity_mismatch','provider_output_limit','provider_stream_malformed','cli_record_too_large'].includes(error.code)?error.code:'provider_stream_failed';stop(state.errorCode);});
    // CLI diagnostic text may contain paths or prompt excerpts; it is not an HTTP error body.
    const stderr=(async()=>{let bytes=0;for await(const chunk of owned.child.stderr){bytes+=chunk.length;if(bytes>8*1024*1024){state.errorCode='provider_output_limit';stop(state.errorCode);break;}await options.onDiagnosticChunk?.(chunk);}})().catch(()=>{state.errorCode='provider_stream_failed';stop(state.errorCode);});
    owned.child.stdin.on('error',()=>{});owned.child.stdin.end(options.prompt);
    const completion=(async()=>{
      try{
        const [result]=await Promise.all([owned.completion,consume,stderr]);
        verifiedExit=result.processTreeExited===true;
        const errorCode=state.errorCode || stopReason || (providerError?'provider_'+providerError.class:null) || (!result.processTreeExited?'provider_process_exit_unconfirmed':null) || (result.code!==0 || result.error || state.failed || !state.completed || !state.sessionId?'provider_runtime_failed':null);
        return {ok:!errorCode,sessionId:state.sessionId,model:options.model,identity,usage:state.usage,providerError,errorCode,processTreeExited:result.processTreeExited,exitCode:result.code};
      }finally{
        closed=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
        await closeNeuralDeepAdapter(server);if(verifiedExit)rmSync(temporary,{recursive:true,force:true});
      }
    })();
    return {completion,stop:()=>closed?false:stop('operator_cancel'),identity};
  }catch(error){
    clearTimeout(timer);options.signal?.removeEventListener('abort',abort);owned?.stop();if(owned)verifiedExit=(await owned.completion).processTreeExited===true;
    error.processTreeExited=owned ? verifiedExit : error.processTreeExited!==false;
    await closeNeuralDeepAdapter(server);if(error.processTreeExited)rmSync(temporary,{recursive:true,force:true});throw error;
  }
}

const entry=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(entry){
  if(process.argv.includes('--help') || process.argv.length===2){console.log('Pritha NeuralDeep transport. Task Chat and Agents Mother call startNeuralDeepRun with an owned execution receipt. No provider fallback or automatic credential setup.');}
  else{console.error('Use the configured Pritha task runtime for owned NeuralDeep execution.');process.exitCode=2;}
}
