import {openResponsesBudget} from './lib/responses-request-budget.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {factorySubjectInstructions} from './lib/chat-subject.mjs';
import {realpathSync,rmSync} from 'node:fs';
import path from 'node:path';
import {listenCompatibleAdapter} from './openai-compatible/responses-adapter.mjs';
import {resolveCodexProviderBinary,probeCompatibleCli} from './openai-compatible/cli-probe.mjs';
import {modelId,COMPATIBLE_EFFORTS} from './openai-compatible/catalog.mjs';
import {readJsonlLines} from './neuraldeep/jsonl-reader.mjs';
import {spawnSupervisedCli} from './neuraldeep/process-supervisor.mjs';
import {neuralDeepUsageKnown} from './neuraldeep/usage-ledger.mjs';
import {inspectProviderCliSession} from './neuraldeep/native-history-proof.mjs';
import {readProviderCredential} from './lib/provider-credential.mjs';
import {providerProcessEnvironment,createProviderTemporaryDirectory} from './lib/provider-process-environment.mjs';
import {privateStateDirectory} from './lib/private-state-path.mjs';
import {prepareProviderSandbox} from './lib/provider-sandbox.mjs';
import {resolvePrithaPython} from './lib/python-runtime.mjs';
import {ProviderHostTools,PROVIDER_HOST_TOOL_DEFINITIONS} from './lib/provider-host-tools.mjs';
import {listenProviderToolServer} from './lib/provider-tool-server.mjs';
import {hostFileAttachmentVerified} from './lib/provider-file-attachments.mjs';
import {readLocalServerConfiguration,startOwnedLocalServer} from './openai-compatible/owned-local-server.mjs';
const failure=code=>Object.assign(new Error('The selected provider task could not complete safely.'),{code});
const sessionPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function buildCompatibleCodexArgs(options){
  const factoryInstructions=factorySubjectInstructions(options.factorySubject);
  const provider=options.connectorId;
  if(!['openrouter','local'].includes(provider) || !modelId(options.model) || !['default',...COMPATIBLE_EFFORTS].includes(options.effort || 'default'))throw failure('provider_input_invalid');
  if(!['read-only','workspace-write'].includes(options.sandbox || 'read-only'))throw failure('provider_sandbox_invalid');
  if(options.resume && !sessionPattern.test(options.resume))throw failure('runtime_identity_mismatch');
  const endpoint=new URL(options.adapterBaseUrl);
  if(endpoint.protocol!=='http:' || endpoint.hostname!=='127.0.0.1' || !endpoint.port || endpoint.pathname!=='/v1' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)throw failure('provider_adapter_endpoint_invalid');
  const prefix='model_providers.'+provider,sandbox=options.sandbox || 'read-only';
  const roots=(options.writableRoots || []).map(value=>realpathSync(value));if(roots.length>16)throw failure('provider_writable_roots_invalid');
  const config={model_provider:provider,approval_policy:'never',sandbox_mode:sandbox,web_search:'disabled',
    [prefix+'.name']:provider+' through Pritha',[prefix+'.base_url']:endpoint.href,[prefix+'.wire_api']:'responses',[prefix+'.env_key']:'PRITHA_PROVIDER_CAPABILITY',
    [prefix+'.request_max_retries']:0,[prefix+'.stream_max_retries']:0,[prefix+'.stream_idle_timeout_ms']:960000,[prefix+'.supports_websockets']:false,
    'analytics.enabled':false,'otel.exporter':'none','otel.log_user_prompt':false,check_for_update_on_startup:false,
    'sandbox_workspace_write.network_access':false,'sandbox_workspace_write.exclude_slash_tmp':true,'sandbox_workspace_write.exclude_tmpdir_env_var':false,'sandbox_workspace_write.writable_roots':roots};
  if(options.effort && !['none','default'].includes(options.effort))config.model_reasoning_effort=options.effort;
  if(factoryInstructions)config.developer_instructions=factoryInstructions;
  if(options.toolServer){
    config['mcp_servers.pritha.url']=options.toolServer.url;
    config['mcp_servers.pritha.bearer_token_env_var']='PRITHA_TOOL_CAPABILITY';
    config['mcp_servers.pritha.required']=true;
    // Only this ephemeral host server owns decisions; it persists exact action
    // approval before executing. The CLI must not add an unanswerable prompt.
    config['mcp_servers.pritha.default_tools_approval_mode']='approve';
    config['mcp_servers.pritha.startup_timeout_sec']=10;
    config['mcp_servers.pritha.tool_timeout_sec']=180;
    config['mcp_servers.pritha.enabled_tools']=PROVIDER_HOST_TOOL_DEFINITIONS.map(tool=>tool.name);
  }
  if(Number.isSafeInteger(options.modelContextTokens) && options.modelContextTokens>0)config.model_context_window=options.modelContextTokens;
  const args=['exec',...(options.resume?['resume']:[]),'--json','--strict-config','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-m',options.model];
  for(const [key,value] of Object.entries(config))args.push('-c',key+'='+JSON.stringify(value));
  for(const feature of ['remote_plugin','plugins','plugin_sharing','apps','multi_agent','multi_agent_v2','goals','hooks','image_generation','view_image','computer_use','browser_use','browser_use_external','in_app_browser','workspace_dependencies','skill_search','skill_mcp_dependency_install','unbounded_connection_retries','remote_compaction_v2','shell_tool','unified_exec'])args.push('--disable',feature);
  if(options.images?.length)throw failure('provider_attachment_unverified');
  if(options.resume)args.push(options.resume,'-');else args.push('--color','never','-s',sandbox,'-C',realpathSync(options.cwd),'-');
  return args;
}

/** Native Codex is only the local harness. OpenRouter holds its own key, exact
 * model, isolated home, history namespace and owned process proof. */
export async function startCompatibleRun(options,dependencies={}){
  const provider=options.connectorId;
  const localConfig=provider==='local'?(dependencies.localConfiguration || readLocalServerConfiguration)(options,{baseUrl:options.baseUrl,modelId:options.model}):null;
  if(!['openrouter','local'].includes(provider) || !modelId(options.model) || provider==='openrouter' && !options.model.includes('/') || typeof options.prompt!=='string' || !options.prompt.trim() || Buffer.byteLength(options.prompt)>256000
    || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs<1000 || options.timeoutMs>3600000 || options.resume && !sessionPattern.test(options.resume))throw failure('provider_input_invalid');
  if(options.signal?.aborted)throw failure('operator_cancel');
  if(options.hostAttachments && !options.hostExecutionContext)throw failure('provider_attachments_unverified');
  const root=realpathSync(options.root),cwd=realpathSync(options.cwd),stateRoot=path.resolve(options.stateRoot),privateRoot=privateStateDirectory(stateRoot,options.privateRoot);
  const key=provider==='local'?undefined:(dependencies.readCredential || readProviderCredential)(provider,{stateRoot,env:options.env || process.env});if(provider==='openrouter' && !key)throw failure('provider_pending_auth');
  const binary=resolveCodexProviderBinary(options.codexBin,options.env || process.env);
  const cli=await (dependencies.probeCli || probeCompatibleCli)({root,stateRoot,connectorId:provider,codexBin:binary,env:options.env || process.env});if(!cli.available)throw failure(cli.code);
  if(options.hostAttachments && !hostFileAttachmentVerified(provider,cli.version))throw failure('provider_attachments_unverified');
  const codexHome=privateStateDirectory(stateRoot,path.join(privateRoot,'codex-home')),home=privateStateDirectory(stateRoot,path.join(privateRoot,'home'));
  if(options.resume){const proof=(dependencies.inspectSession || inspectProviderCliSession)({stateRoot,codexHome,cwd,provider,sessionId:options.resume,model:options.model});if(!proof.available)throw failure(proof.code);}
  const temporary=createProviderTemporaryDirectory({provider,stateRoot,temporaryRoot:options.temporaryRoot}),localToken=randomBytes(32).toString('base64url');
  const identity=createHash('sha256').update(JSON.stringify([realpathSync(stateRoot),codexHome,cwd,provider,options.model,options.baseUrl || null,...(localConfig?[localConfig.identity]:[])])).digest('hex');
  const controller=new AbortController(),trees=new Map();let budget,adapter,owned,sandboxPlan,timer,closed=false,verifiedExit=false,stopReason=null,providerError=null,hostTools,toolServer,localServer;
  const proof=()=>({kind:'provider-process-set',version:1,trees:[...trees].map(([id,evidence])=>({id,evidence}))});
  const recordTree=(id,evidence)=>{trees.set(id,evidence);options.onEvidence?.(proof());};
  const stop=reason=>{stopReason ||= reason;controller.abort();adapter?.abort();localServer?.stop();options.cancelPendingApprovals?.();return owned?.stop('SIGTERM') || false;},abort=()=>stop('operator_cancel');
  const closeTools=async()=>{controller.abort();options.cancelPendingApprovals?.();const result=await hostTools?.close();await toolServer?.close();const inference=await localServer?.close();return result?.processTreeExited!==false && inference?.processTreeExited!==false;};
  try{
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    const deadline=Date.now()+options.timeoutMs;timer=setTimeout(()=>stop('provider_timeout'),options.timeoutMs);
    budget=await openResponsesBudget({...options,root,stateRoot,privateRoot,identity,contextTokens:options.modelContextTokens,onCheckpoint:options.onBudgetCheckpoint});
    if(localConfig)localServer=await (dependencies.startLocalServer || startOwnedLocalServer)({root,stateRoot,signal:controller.signal,timeoutMs:options.timeoutMs,
      beforeStart:async evidence=>{trees.set('inference',evidence);await options.beforeStart?.({identity,evidence:proof(),codexHome,model:options.model,sessionId:options.resume || null});},
      onEvidence:evidence=>recordTree('inference',evidence)},localConfig);
    if(options.hostExecutionContext){
      hostTools=new ProviderHostTools({...options.hostExecutionContext,root,cwd,stateRoot,privateRoot,connectorId:provider,sandbox:options.sandbox,signal:controller.signal,approve:options.approve,onProcessEvidence:recordTree,attachments:options.hostAttachments});
      toolServer=await listenProviderToolServer({hostTools});
    }
    adapter=await (dependencies.listenAdapter || listenCompatibleAdapter)({connectorId:provider,localToken,...(localServer?{baseUrl:localServer.baseUrl}:{apiKey:key}),model:options.model,effort:options.effort || 'default',reasoningControl:options.reasoningControl,thinkingBudget:options.thinkingBudget,
      allowedTools:toolServer?PROVIDER_HOST_TOOL_DEFINITIONS.map(tool=>'mcp__pritha__'+tool.name):[],
      timeoutMs:options.timeoutMs,hardDeadlineAt:deadline,maxOutputTokens:options.maxOutputTokens || 16384,fetchImpl:dependencies.fetchImpl,dispatcher:dependencies.dispatcher,
      ...(budget?{prepareRequest:(payload,context)=>budget.begin(payload,context)}:{}),
      beforeRequest:async request=>{if(controller.signal.aborted)throw failure('operator_cancel');await localServer?.verify();await options.beforeRequest?.(request);},
      onRequest:async event=>{if(event.error)providerError=event.error;await budget?.record(event);await options.onProviderRequest?.(event);}});
    const args=buildCompatibleCodexArgs({...options,cwd,toolServer,adapterBaseUrl:adapter.baseUrl,writableRoots:[temporary]});
    const env=providerProcessEnvironment({provider,root,stateRoot,codexHome,temporary,env:options.env || process.env});
    Object.assign(env,{HOME:home,PRITHA_PROVIDER_CAPABILITY:localToken,PRITHA_PYTHON:resolvePrithaPython({root,env:options.env || process.env})});
    if(toolServer)env.PRITHA_TOOL_CAPABILITY=toolServer.token;
    sandboxPlan=(dependencies.prepareSandbox || prepareProviderSandbox)({root,stateRoot,privateRoot,command:binary,args,cwd,temporary,readRoots:[codexHome,home],writeRoots:[codexHome,home],loopbackPorts:[adapter.port,...(toolServer?[toolServer.port]:[])],runtime:'codex'});
    owned=await (dependencies.spawnSupervised || spawnSupervisedCli)(sandboxPlan.command,sandboxPlan.args,{cwd,env,supervisorPath:path.join(root,'scripts','neuraldeep','process-supervisor.mjs'),
      beforeStart:async evidence=>{if(options.signal?.aborted)throw failure('operator_cancel');trees.set('cli',evidence);await options.beforeStart?.({identity,evidence:proof(),codexHome,model:options.model,sessionId:options.resume || null,budgetId:budget?.budgetId || null,resume:options.resume || null});},onEvidence:evidence=>recordTree('cli',evidence)});
    if(controller.signal.aborted)stop(stopReason || 'operator_cancel');
    const state={sessionId:null,usage:null,completed:false,failed:false,errorCode:null};
    const consume=(async()=>{let bytes=0,events=0;
      for await(const line of readJsonlLines(owned.child.stdout,{maximumLineBytes:16*1024*1024,onChunk:async chunk=>{bytes+=chunk.length;if(bytes>128*1024*1024)throw failure('provider_output_limit');await options.onRawChunk?.(chunk);}})){
        if(++events>100000)throw failure('provider_output_limit');let event;try{event=JSON.parse(line);}catch{throw failure('provider_stream_invalid');}
        if(!event || typeof event!=='object' || Array.isArray(event))throw failure('provider_stream_invalid');
        if(event.type==='thread.started'){if(!sessionPattern.test(event.thread_id || '') || options.resume && event.thread_id!==options.resume || state.sessionId && state.sessionId!==event.thread_id)throw failure('runtime_identity_mismatch');state.sessionId=event.thread_id;await budget?.bindSession(event.thread_id);}
        if(event.type==='turn.completed'){state.completed=true;state.usage=neuralDeepUsageKnown(event.usage)?event.usage:null;}
        if(event.type==='turn.failed' || event.type==='error')state.failed=true;
        await options.onEvent?.(event);
      }
    })().catch(error=>{state.errorCode=['provider_output_limit','provider_stream_invalid','runtime_identity_mismatch','cli_record_too_large'].includes(error.code)?error.code:'provider_stream_failed';stop(state.errorCode);});
    const diagnostic=(async()=>{let bytes=0;for await(const chunk of owned.child.stderr){bytes+=chunk.length;if(bytes>8*1024*1024)throw failure('provider_output_limit');await options.onDiagnosticChunk?.(chunk);}})().catch(()=>{state.errorCode='provider_stream_failed';stop(state.errorCode);});
    owned.child.stdin.on('error',()=>{});owned.child.stdin.end(options.prompt);
    const completion=(async()=>{
      try{const [result]=await Promise.all([owned.completion,consume,diagnostic]);const toolsExited=await closeTools();verifiedExit=result.processTreeExited===true && toolsExited;
        const errorCode=budget?.budget.errorCode || state.errorCode || stopReason || providerError?.code || (!verifiedExit?'provider_process_exit_unconfirmed':null) || (result.code!==0 || result.error || state.failed || !state.completed || !state.sessionId?'provider_runtime_failed':null);
        return {ok:!errorCode,errorCode,sessionId:state.sessionId,model:options.model,identity,usage:state.usage,providerError,processTreeExited:verifiedExit,...(budget?{budgetId:budget.budgetId,budget:budget.snapshot()}:{})};
      }finally{closed=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);await adapter?.close();if(verifiedExit){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan.planPath)rmSync(sandboxPlan.planPath,{force:true});}}
    })();return {completion,stop:()=>closed?false:stop('operator_cancel'),identity};
  }catch(error){clearTimeout(timer);options.signal?.removeEventListener('abort',abort);owned?.stop();if(owned)verifiedExit=(await owned.completion).processTreeExited===true;
    const toolsExited=await closeTools();error.processTreeExited=(owned?verifiedExit:error.processTreeExited!==false) && toolsExited;await adapter?.close();if(error.processTreeExited){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan?.planPath)rmSync(sandboxPlan.planPath,{force:true});}throw error;
  }
}
