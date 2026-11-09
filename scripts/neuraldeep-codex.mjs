#!/usr/bin/env node
import {openResponsesBudget} from './lib/responses-request-budget.mjs';
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
import {resolveCodexProviderBinary,probeCompatibleCli} from './openai-compatible/cli-probe.mjs';
import {prepareProviderSandbox} from './lib/provider-sandbox.mjs';
import {ProviderHostTools,PROVIDER_HOST_TOOL_DEFINITIONS} from './lib/provider-host-tools.mjs';
import {listenProviderToolServer} from './lib/provider-tool-server.mjs';
import {hostFileAttachmentVerified} from './lib/provider-file-attachments.mjs';
import {validateResponsesInputs} from './neuraldeep/responses-input-policy.mjs';
import {NeuralDeepImageAttachments} from './neuraldeep/attachment-transport.mjs';
import {createSearchHost} from './search/host.mjs';
import {providerToolInstructions} from './lib/provider-tool-instructions.mjs';

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
    model_provider:'neuraldeep',approval_policy:'never',sandbox_mode:sandbox,web_search:'disabled',
    'model_providers.neuraldeep.name':'NeuralDeep through Pritha',
    'model_providers.neuraldeep.base_url':endpoint.href,
    'model_providers.neuraldeep.wire_api':'responses',
    'model_providers.neuraldeep.env_key':'PRITHA_PROVIDER_CAPABILITY',
    'model_providers.neuraldeep.request_max_retries':0,
    'model_providers.neuraldeep.stream_max_retries':0,
    'model_providers.neuraldeep.stream_idle_timeout_ms':Math.max(1000,options.timeoutMs || 960000),
    'model_providers.neuraldeep.supports_websockets':false,
    'analytics.enabled':false,'otel.exporter':'none','otel.log_user_prompt':false,
    check_for_update_on_startup:false,
    'sandbox_workspace_write.network_access':false,
    'sandbox_workspace_write.exclude_slash_tmp':true,
    'sandbox_workspace_write.exclude_tmpdir_env_var':false,
    'sandbox_workspace_write.writable_roots':roots,
  };
  const effort=effectiveNeuralDeepEffort(options.model,options.effort);
  const hostInstructions=options.toolServer?providerToolInstructions(options.toolServer.definitions || PROVIDER_HOST_TOOL_DEFINITIONS):'';
  const developerInstructions=[factoryInstructions,hostInstructions].filter(Boolean).join('\n\n');
  if(developerInstructions)config.developer_instructions=developerInstructions;
  if(options.toolServer){
    config['mcp_servers.pritha.url']=options.toolServer.url;
    config['mcp_servers.pritha.bearer_token_env_var']='PRITHA_TOOL_CAPABILITY';
    config['mcp_servers.pritha.required']=true;
    config['mcp_servers.pritha.default_tools_approval_mode']='approve';
    config['mcp_servers.pritha.startup_timeout_sec']=10;
    config['mcp_servers.pritha.tool_timeout_sec']=options.hostExecutionContext?.factory?Math.ceil(options.timeoutMs/1000)+5:180;
    config['mcp_servers.pritha.enabled_tools']=(options.toolServer.definitions || PROVIDER_HOST_TOOL_DEFINITIONS).map(tool=>tool.name);
  }
  if(effort)config.model_reasoning_effort=effort;
  const context=Number.isSafeInteger(options.modelContextTokens) && options.modelContextTokens>0 ? options.modelContextTokens : neuralDeepExecutionProfile(options.model).declaredContextTokens;
  if(context)config.model_context_window=context;
  const args=['exec',...(options.resume?['resume']:[]),'--json','--strict-config','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-m',options.model];
  for(const [key,value] of Object.entries(config))args.push('-c',`${key}=${toml(value)}`);
  for(const feature of ['remote_plugin','plugins','plugin_sharing','apps','multi_agent','multi_agent_v2','goals','hooks','image_generation','view_image','computer_use','browser_use','browser_use_external','in_app_browser','workspace_dependencies','skill_search','skill_mcp_dependency_install','unbounded_connection_retries','remote_compaction_v2','shell_tool','unified_exec'])args.push('--disable',feature);
  if(options.images?.length){
    if(!(options.hostAttachments instanceof NeuralDeepImageAttachments) || JSON.stringify(options.images)!==JSON.stringify(options.hostAttachments.currentImages.map(file=>file.filePath)))throw fail('model_image_unverified','This NeuralDeep image path still requires transport verification. The originals are preserved.');
    for(const image of options.images)args.push('--image',image);
  }
  if(options.resume)args.push(options.resume,'-');else args.push('--color','never','-s',sandbox,'-C',realpathSync(options.cwd),'-');
  return args;
}

/** Owned, bounded CLI attempt. The host persists admission and transcript receipts via callbacks. */
export async function startNeuralDeepRun(options,dependencies={}){
  if(!modelPattern.test(options.model || '') || typeof options.prompt!=='string' || !options.prompt.trim() || Buffer.byteLength(options.prompt)>256000)throw fail('provider_input_invalid');
  if(!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs<1000 || options.timeoutMs>3600000)throw fail('provider_timeout_invalid');
  if(options.resume && !sessionPattern.test(options.resume))throw fail('runtime_identity_mismatch');
  if(options.signal?.aborted)throw fail('operator_cancel');
  if(options.hostAttachments && !options.hostExecutionContext)throw fail('provider_attachments_unverified');
  const root=realpathSync(options.root),cwd=realpathSync(options.cwd);
  const stateRoot=path.resolve(options.stateRoot),privateRoot=path.resolve(options.privateRoot);
  const key=(dependencies.readCredential || readProviderCredential)('neuraldeep',{stateRoot,env:options.env || process.env});
  if(!key)throw fail('provider_pending_auth','Connect NeuralDeep in Settings before starting a task.');
  const binary=resolveCodexProviderBinary(options.codexBin,options.env || process.env);
  const cli=await (dependencies.probeCli || probeCompatibleCli)({root,stateRoot,connectorId:'neuraldeep',codexBin:binary,env:options.env || process.env});
  if(!cli.available)throw fail(cli.code);
  if(options.hostAttachments && !hostFileAttachmentVerified('neuraldeep',cli.version))throw fail('provider_attachments_unverified');
  const imageScope=options.hostAttachments instanceof NeuralDeepImageAttachments?options.hostAttachments:null;
  const imagePaths=imageScope?await imageScope.imagePaths():[];
  if(JSON.stringify(options.images || [])!==JSON.stringify(imagePaths))throw fail('attachment_manifest_invalid');
  const codexHome=privateStateDirectory(stateRoot,path.join(privateRoot,'codex-home')),home=privateStateDirectory(stateRoot,path.join(privateRoot,'home'));
  if(options.resume){
    const proof=(dependencies.inspectSession || inspectProviderCliSession)({stateRoot,codexHome,cwd,provider:'neuraldeep',sessionId:options.resume,model:options.model});
    if(!proof.available)throw fail(proof.code,'The original provider session could not be verified. Its private files have been preserved.');
  }
  const temporary=createProviderTemporaryDirectory({provider:'neuraldeep',stateRoot,temporaryRoot:options.temporaryRoot});
  const localToken=randomBytes(32).toString('base64url');
  const grace=Math.max(1,Math.min(30000,Math.floor(options.timeoutMs/10))),window=options.timeoutMs-grace,now=Date.now();
  const deadline={version:2,hardDeadlineAt:now+options.timeoutMs,softDeadlineAt:now+window-Math.max(1,Math.min(60000,Math.floor(window/2))),requestTimeoutMs:window,settlementGraceMs:grace};
  let budget,server,owned,sandboxPlan,hostTools,toolServer,searchHost,providerError=null,closed=false,stopReason=null,verifiedExit=false;
  const controller=new AbortController(),trees=new Map();
  const proof=()=>({kind:'provider-process-set',version:1,trees:[...trees].map(([id,evidence])=>({id,evidence}))});
  const recordTree=(id,evidence)=>{trees.set(id,evidence);options.onEvidence?.(proof());};
  const identity=createHash('sha256').update(JSON.stringify([realpathSync(stateRoot),codexHome,cwd,'neuraldeep',options.model])).digest('hex');
  const stop=reason=>{stopReason ||= reason;controller.abort();options.cancelPendingApprovals?.();return owned?.stop('SIGTERM') || false;};
  const closeTools=async()=>{controller.abort();options.cancelPendingApprovals?.();const result=await hostTools?.close();await toolServer?.close();await searchHost?.close();return result?.processTreeExited!==false;};
  const abort=()=>stop('operator_cancel');
  let timer;
  try{
    budget=await openResponsesBudget({...options,root,stateRoot,privateRoot,identity,contextTokens:neuralDeepExecutionProfile(options.model).declaredContextTokens,onCheckpoint:options.onBudgetCheckpoint});
    if(options.hostExecutionContext){
      searchHost=options.allowSearch===false?undefined:createSearchHost({root,stateRoot,connectorId:'neuraldeep',chatId:options.hostExecutionContext.chatId,turnId:options.hostExecutionContext.turnId,signal:controller.signal,text:options.searchUserText || '',environment:options.env || process.env,check:()=>options.hostExecutionContext.lease.assertOwned(),service:dependencies.searchService});
      hostTools=new ProviderHostTools({...options.hostExecutionContext,root,cwd,stateRoot,privateRoot,connectorId:'neuraldeep',sandbox:options.sandbox,signal:controller.signal,approve:options.approve,onProcessEvidence:recordTree,attachments:options.hostAttachments,search:searchHost});
      toolServer=await listenProviderToolServer({hostTools});
    }
    const allowedTools=toolServer?hostTools.definitions.map(tool=>'mcp__pritha__'+tool.name):[];
    server=await (dependencies.listenAdapter || listenNeuralDeepAdapter)({port:0,localToken,upstreamAuthorization:`Bearer ${key}`,deadline,providerRetryAttempts:1,responsesOnly:true,
      allowedTools,
      createDispatcher:dependencies.createDispatcher,
      ...(dependencies.fetchImpl ? {fetchImpl:dependencies.fetchImpl} : {}),
      async validateResponsesRequest(payload){
        if(payload.model!==options.model)throw fail('neuraldeep_model_identity_mismatch');
        if(imageScope)await imageScope.validateInputs(payload,cli.version);
        else await validateResponsesInputs(payload,{model:options.model});
      },
      async prepareResponsesRequest(payload,context){const declared=Number.isSafeInteger(options.maxOutputTokens) && options.maxOutputTokens>0?options.maxOutputTokens:Infinity;
        const cap=Math.min(declared,neuralDeepExecutionProfile(options.model).applicationOutputCap);const prepared={...payload,max_output_tokens:Math.min(Number.isSafeInteger(payload.max_output_tokens) && payload.max_output_tokens>0 ? payload.max_output_tokens : cap,cap)};return budget?budget.begin(prepared,context):prepared;},
      beforeResponsesDispatch:options.beforeRequest,
      onRequest:async event=>{if(event.error)providerError=event.error;try{await budget?.record(event);}finally{await options.onProviderRequest?.(event);}},
    });
    const args=buildCodexExecArgs({...options,cwd,toolServer,writableRoots:[temporary],baseUrl:`http://127.0.0.1:${server.address().port}/v1`});
    const env=providerProcessEnvironment({provider:'neuraldeep',root,stateRoot,codexHome,temporary,env:options.env || process.env});
    env.HOME=home;env.PRITHA_PROVIDER_CAPABILITY=localToken;
    if(toolServer)env.PRITHA_TOOL_CAPABILITY=toolServer.token;
    env.PRITHA_PYTHON=resolvePrithaPython({root,env:options.env || process.env});
    sandboxPlan=(dependencies.prepareSandbox || prepareProviderSandbox)({root,stateRoot,privateRoot,command:binary,args,cwd,temporary,readRoots:[codexHome,home],writeRoots:[codexHome,home],readOnlyRoots:imageScope?await imageScope.readOnlyPaths():[],loopbackPorts:[server.address().port,...(toolServer?[toolServer.port]:[])],runtime:'codex'});
    owned=await (dependencies.spawnSupervised || spawnSupervisedCli)(sandboxPlan.command,sandboxPlan.args,{cwd,env,supervisorPath:path.join(root,'scripts','neuraldeep','process-supervisor.mjs'),beforeStart:async evidence=>{
      if(options.signal?.aborted)throw fail('operator_cancel');
      trees.set('cli',evidence);await options.beforeStart?.({identity,evidence:proof(),codexHome,model:options.model,sessionId:options.resume || null,budgetId:budget?.budgetId || null,resume:options.resume || null});
    },onEvidence:evidence=>recordTree('cli',evidence)});
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
          state.sessionId=event.thread_id;await budget?.bindSession(event.thread_id);
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
        const toolsExited=await closeTools();verifiedExit=result.processTreeExited===true && toolsExited;
        // Input refusals already carry host-classified, non-secret codes. Keep
        // the precise cause in durable build receipts instead of provider_input.
        const errorCode=budget?.budget.errorCode || state.errorCode || stopReason || (providerError?.class==='input'?providerError.code:providerError?'provider_'+providerError.class:null) || (!verifiedExit?'provider_process_exit_unconfirmed':null) || (result.code!==0 || result.error || state.failed || !state.completed || !state.sessionId?'provider_runtime_failed':null);
        return {ok:!errorCode,sessionId:state.sessionId,model:options.model,identity,cliVersion:cli.version,usage:state.usage,providerError,errorCode,processTreeExited:verifiedExit,exitCode:result.code,...(budget?{budgetId:budget.budgetId,budget:budget.snapshot()}:{})};
      }finally{
        closed=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
        await closeNeuralDeepAdapter(server);if(verifiedExit){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan?.planPath)rmSync(sandboxPlan.planPath,{force:true});}
      }
    })();
    return {completion,stop:()=>closed?false:stop('operator_cancel'),identity};
  }catch(error){
    clearTimeout(timer);options.signal?.removeEventListener('abort',abort);owned?.stop();if(owned)verifiedExit=(await owned.completion).processTreeExited===true;
    const toolsExited=await closeTools();error.processTreeExited=(owned ? verifiedExit : error.processTreeExited!==false) && toolsExited;
    await closeNeuralDeepAdapter(server);if(error.processTreeExited){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan?.planPath)rmSync(sandboxPlan.planPath,{force:true});}throw error;
  }
}

const entry=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(entry){
  if(process.argv.includes('--help') || process.argv.length===2){console.log('Pritha NeuralDeep transport. Task Chat and Agents Mother call startNeuralDeepRun with an owned execution receipt. No provider fallback or automatic credential setup.');}
  else{console.error('Use the configured Pritha task runtime for owned NeuralDeep execution.');process.exitCode=2;}
}
