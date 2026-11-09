import { createHash,randomUUID,randomBytes } from 'node:crypto';
import { accessSync,constants,closeSync,fstatSync,fsyncSync,openSync,readFileSync,realpathSync,rmSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { readJsonlLines } from './neuraldeep/jsonl-reader.mjs';
import { spawnSupervisedCli } from './neuraldeep/process-supervisor.mjs';
import { readProviderCredential } from './lib/provider-credential.mjs';
import { providerProcessEnvironment,createProviderTemporaryDirectory } from './lib/provider-process-environment.mjs';
import { privateStateDirectory,privateStateFile } from './lib/private-state-path.mjs';
import { atomicWriteFile } from './lib/atomic-file.mjs';
import { prepareProviderSandbox } from './lib/provider-sandbox.mjs';
import { resolvePrithaPython } from './lib/python-runtime.mjs';
import { listenClaudeApiProxy } from './claude/api-proxy.mjs';
import { ClaudeStreamState,CLAUDE_SESSION_ID,CLAUDE_MODEL_ID } from './claude/stream-state.mjs';
import { probeClaudeCli } from './claude/cli-probe.mjs';
import { ProviderHostTools,PROVIDER_HOST_TOOL_DEFINITIONS } from './lib/provider-host-tools.mjs';
import {factorySubjectInstructions} from './lib/chat-subject.mjs';
import { listenProviderToolServer } from './lib/provider-tool-server.mjs';
import { ClaudeRequestBudget } from './claude/request-budget.mjs';
import {hostFileAttachmentVerified} from './lib/provider-file-attachments.mjs';
import {ClaudeImageAttachments,assertNoClaudeImageInputs,CLAUDE_IMAGE_LIMITS} from './claude/image-attachments.mjs';
import {nativeClaudeAuthPaths,probeClaudeNativeAuth,nativeClaudeEnvironment,nativeClaudeSandboxRoots} from './claude/native-auth.mjs';
import {listenClaudeNativeTunnel} from './claude/native-tunnel.mjs';
import {createSearchHost} from './search/host.mjs';

const fail=code=>Object.assign(new Error('The configured Claude runtime could not complete this task safely.'),{code});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function resolveClaudeBinary(value='claude',env=process.env){
  if(typeof value!=='string' || value.includes('\0'))throw fail('provider_runtime_unavailable');
  const candidates=path.isAbsolute(value)?[value]:value==='claude'?String(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,value)):[];
  for(const candidate of candidates)try{accessSync(candidate,constants.X_OK);return realpathSync(candidate);}catch{/* Try only the explicit PATH. */}
  throw fail('provider_runtime_unavailable');
}
export function buildClaudeExecArgs({model,sessionId,resume,effort='medium',maxTurns=32,mcpConfigPath,allowedTools=[],factorySubject,authMode='api-key'}){
  const factoryInstructions=factorySubjectInstructions(factorySubject);
  if(!CLAUDE_MODEL_ID.test(model || '') || !CLAUDE_SESSION_ID.test(sessionId || '') || !['low','medium','high','xhigh','max'].includes(effort)
      || !['api-key','local-cli-session'].includes(authMode) || !Number.isSafeInteger(maxTurns) || maxTurns<1 || maxTurns>128 || allowedTools.length>64 || allowedTools.some(name=>!/^mcp__pritha__[a-z_]{1,60}$/.test(name)))throw fail('provider_input_invalid');
  const args=['--print',...(authMode==='api-key'?['--bare']:[]),'--restricted','--output-format','stream-json','--verbose','--model',model,'--effort',effort,'--max-turns',String(maxTurns),
    '--tools','','--strict-mcp-config','--permission-mode','dontAsk','--permission-prompts','none','--setting-sources','',
    '--settings',JSON.stringify({disableAllHooks:true,disableClaudeAiConnectors:true,enableArtifact:false,autoUpdates:false,permissions:{deny:['Agent','Bash','Read','Write','Edit','WebFetch','WebSearch']}})];
  args.push(resume?'--resume':'--session-id',sessionId);
  if(mcpConfigPath)args.push('--mcp-config',mcpConfigPath);
  if(allowedTools.length)args.push('--allowedTools',...allowedTools);
  args.push('--append-system-prompt','This task is hosted by Pritha. Read the workspace AGENTS.md and applicable nested instructions before editing. Use only the supplied Pritha tools. Preserve operation_id when retrying an identical tool request; never retry an ambiguous effect under a new ID. Host approval authorizes only the displayed action. Do not bypass protected paths, network restrictions, tests or the host verifier. Report unavailable tools and incomplete verification honestly.'+(factoryInstructions?'\n\n'+factoryInstructions:''));
  return args;
}

/** API requests use the host-key proxy. A native session uses the unmodified
 * CLI's own credential store and opaque TLS; these lanes never fall back. */
export async function startClaudeCodeRun(options,dependencies={}){
  const authMode=options.authMode || 'api-key',native=authMode==='local-cli-session';
  if(!['api-key','local-cli-session'].includes(authMode))throw fail('provider_auth_mode_unverified');
  // Host-reserved factory budgets require visible API request accounting.
  // Native CLI usage is observed, not a request reservation mechanism.
  if(native && options.tokenBudget!==undefined)throw fail('provider_budget_mode_unavailable');
  if(!CLAUDE_MODEL_ID.test(options.model || '') || typeof options.prompt!=='string' || !options.prompt.trim() || Buffer.byteLength(options.prompt)>256000
      || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs<1000 || options.timeoutMs>3600000 || options.resume && !CLAUDE_SESSION_ID.test(options.resume)
      || options.tokenBudget!==undefined && (!Number.isSafeInteger(options.tokenBudget) || options.tokenBudget<1) || options.budgetId!==undefined && !CLAUDE_SESSION_ID.test(options.budgetId))throw fail('provider_input_invalid');
  if(options.signal?.aborted)throw fail('operator_cancel');
  if(options.images?.length || options.hostAttachments && !options.hostExecutionContext)throw fail('provider_attachments_unverified');
  const root=realpathSync(options.root),cwd=realpathSync(options.cwd),stateRoot=path.resolve(options.stateRoot),privateRoot=privateStateDirectory(stateRoot,options.privateRoot);
  const key=native?null:(dependencies.readCredential || readProviderCredential)('claude',{stateRoot,env:options.env || process.env});if(!native && !key)throw fail('provider_pending_auth');
  const binary=resolveClaudeBinary(options.claudeBin,options.env || process.env);
  const cli=await (dependencies.probeCli || probeClaudeCli)({binary,root,stateRoot,env:options.env || process.env});
  if(!cli.available)throw fail(cli.code);
  const nativeAuth=native?await (dependencies.probeNativeAuth || probeClaudeNativeAuth)({binary,root,stateRoot,env:options.env || process.env}):null;
  if(native && (!nativeAuth?.authenticated || !/^[a-f0-9]{64}$/.test(nativeAuth.identity || '')))throw fail(nativeAuth?.code || 'provider_native_login_required');
  if(options.hostAttachments && !hostFileAttachmentVerified('claude',cli.version))throw fail('provider_attachments_unverified');
  if(options.hostAttachments instanceof ClaudeImageAttachments)await options.hostAttachments.assertReady(cli.version);
  const profile=privateStateDirectory(stateRoot,path.join(privateRoot,'profiles',hash([cwd,options.model,authMode])));
  const nativePaths=native?nativeClaudeAuthPaths({stateRoot}):null;
  if(native && !nativePaths.available)throw fail('provider_native_login_required');
  const home=nativePaths?.home || privateStateDirectory(stateRoot,path.join(profile,'home')),config=nativePaths?.config || privateStateDirectory(stateRoot,path.join(profile,'config'));
  const sessionId=options.resume || randomUUID(),identity=hash([realpathSync(stateRoot),profile,cwd,options.model,authMode,...(native?[nativeAuth.identity]:[])]);
  const proofFile=privateStateFile(stateRoot,path.join(profile,'sessions',sessionId+'.json'));
  if(options.resume){
    let proof,fd;try{fd=openSync(proofFile,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=fstatSync(fd);if(!stat.isFile() || stat.nlink!==1 || stat.size>8000)throw fail('runtime_identity_mismatch');proof=JSON.parse(readFileSync(fd,'utf8'));}catch{throw fail('runtime_identity_mismatch');}finally{if(fd!==undefined)closeSync(fd);}
    if(proof.identity!==identity || proof.sessionId!==sessionId || proof.model!==options.model || proof.observedInit!==true)throw fail('runtime_identity_mismatch');
  }
  const temporary=createProviderTemporaryDirectory({provider:'claude',stateRoot,temporaryRoot:options.temporaryRoot});
  const localToken=randomBytes(32).toString('base64url');
  const budgetId=options.budgetId || randomUUID();
  if(options.tokenBudget!==undefined && !CLAUDE_SESSION_ID.test(budgetId))throw fail('provider_budget_invalid');
  let proxy,owned,timer,verifiedExit=false,closed=false,stopReason=null,sandboxPlan,hostTools,toolServer,searchHost,budget=null;
  const controller=new AbortController(),trees=new Map();
  const proof=()=>({kind:'provider-process-set',version:1,trees:[...trees].map(([id,evidence])=>({id,evidence}))});
  const recordTree=(id,evidence)=>{trees.set(id,evidence);options.onEvidence?.(proof());};
  const stop=reason=>{stopReason ||= reason;controller.abort();options.cancelPendingApprovals?.();return owned?.stop('SIGTERM') || false;},abort=()=>stop('operator_cancel');
  const closeTools=async()=>{controller.abort();options.cancelPendingApprovals?.();const result=await hostTools?.close();await toolServer?.close();await searchHost?.close();return result?.processTreeExited!==false;};
  const events=new ClaudeStreamState({model:options.model,sessionId,authMode,onUsage:native?options.onNativeUsage:undefined,onEvent:async event=>{
    if(event.type==='thread.started')atomicWriteFile(proofFile,JSON.stringify({version:1,identity,sessionId,model:options.model,cliVersion:cli.version,observedInit:true})+'\n');
    // The journal holds the same visible records as the UI, not private thinking.
    await options.onRawChunk?.(Buffer.from(JSON.stringify(event)+'\n'));await options.onEvent?.(event);
  }});
  try{
    if(options.tokenBudget!==undefined){
      const budgetFile=privateStateFile(stateRoot,path.join(privateRoot,'budgets',budgetId+'.json'));
      const serialized=snapshot=>JSON.stringify({identity,model:options.model,sessionId,budgetId,...snapshot})+'\n';
      budget=new ClaudeRequestBudget({tokenBudget:options.tokenBudget,checkpoint:async snapshot=>{atomicWriteFile(budgetFile,serialized(snapshot));await options.onBudgetCheckpoint?.(snapshot);}});
      let fd;try{fd=openSync(budgetFile,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,serialized(budget.snapshot()));fsyncSync(fd);}
      catch(error){if(error.code==='EEXIST')throw Object.assign(fail('provider_attempt_already_started'),{processTreeExited:false});throw error;}finally{if(fd!==undefined)closeSync(fd);}
      await options.onBudgetCheckpoint?.(budget.snapshot());
    }
    let mcpConfigPath,allowedTools=[];
    if(options.hostExecutionContext){
      searchHost=options.allowSearch===false?undefined:createSearchHost({root,stateRoot,connectorId:'claude',chatId:options.hostExecutionContext.chatId,turnId:options.hostExecutionContext.turnId,signal:controller.signal,text:options.searchUserText || '',environment:options.env || process.env,check:()=>options.hostExecutionContext.lease.assertOwned(),service:dependencies.searchService});
      hostTools=new ProviderHostTools({...options.hostExecutionContext,root,cwd,stateRoot,privateRoot,connectorId:'claude',sandbox:options.sandbox,signal:controller.signal,approve:options.approve,onProcessEvidence:recordTree,attachments:options.hostAttachments,search:searchHost});
      toolServer=await listenProviderToolServer({hostTools});
      mcpConfigPath=path.join(temporary,'mcp.json');
      atomicWriteFile(mcpConfigPath,JSON.stringify({mcpServers:{pritha:{type:'http',url:toolServer.url,headers:{Authorization:'Bearer '+toolServer.token}}}})+'\n');
      allowedTools=hostTools.definitions.map(tool=>'mcp__pritha__'+tool.name);
    }
    proxy=native?await (dependencies.listenNativeTunnel || listenClaudeNativeTunnel)({signal:controller.signal}):await (dependencies.listenProxy || listenClaudeApiProxy)({localToken,apiKey:key,model:options.model,timeoutMs:options.timeoutMs,maxOutputTokens:options.maxOutputTokens || 8192,
      allowedTools,beforeRequest:options.beforeRequest,budget,fetchImpl:dependencies.fetchImpl,
      validateImages:payload=>options.hostAttachments instanceof ClaudeImageAttachments?options.hostAttachments.validateInputs(payload):assertNoClaudeImageInputs(payload)});
    const args=buildClaudeExecArgs({...options,sessionId,mcpConfigPath,allowedTools});
    const env=native?nativeClaudeEnvironment({...options,root,stateRoot},nativePaths,temporary):providerProcessEnvironment({provider:'claude',root,stateRoot,claudeConfigDir:config,temporary,env:options.env || process.env});
    if(!native)Object.assign(env,{ANTHROPIC_API_KEY:localToken,ANTHROPIC_BASE_URL:proxy.baseUrl,CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST:'1'});
    else env.CLAUDE_CODE_MAX_OUTPUT_TOKENS=String(options.maxOutputTokens || 8192);
    Object.assign(env,{HOME:native?env.HOME:home,CLAUDE_CODE_TMPDIR:temporary,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1',PRITHA_PYTHON:resolvePrithaPython({root,env:options.env || process.env})});
    env.CLAUDE_CODE_MAX_RETRIES='0';env.CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES='0';env.CLAUDE_CODE_DISABLE_REFUSAL_RETRY='1';env.MCP_CONNECTION_NONBLOCKING='0';env.ENABLE_TOOL_SEARCH='false';
    if(options.hostExecutionContext?.factory){env.MCP_TOOL_TIMEOUT=String(options.timeoutMs+5000);env.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=env.MCP_TOOL_TIMEOUT;env.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS='0';}
    sandboxPlan=(dependencies.prepareSandbox || prepareProviderSandbox)({root,stateRoot,privateRoot,command:binary,args,cwd,temporary,...(native?{...nativeClaudeSandboxRoots(nativePaths,{refresh:true}),runtime:'claude-native'}:{readRoots:[home,config],writeRoots:[home,config]}),loopbackPorts:[proxy.port,...(toolServer?[toolServer.port]:[])]});
    owned=await (dependencies.spawnSupervised || spawnSupervisedCli)(sandboxPlan.command,sandboxPlan.args,{cwd,env,supervisorPath:path.join(root,'scripts','neuraldeep','process-supervisor.mjs'),
      beforeStart:async evidence=>{if(options.signal?.aborted)throw fail('operator_cancel');trees.set('cli',evidence);await options.beforeStart?.({identity,evidence:proof(),model:options.model,sessionId,budgetId:budget?budgetId:null,resume:options.resume || null});},onEvidence:evidence=>recordTree('cli',evidence)});
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    timer=setTimeout(()=>stop('provider_timeout'),options.timeoutMs);
    let parseError=null;
    const consume=(async()=>{
      let bytes=0;
      for await(const line of readJsonlLines(owned.child.stdout,{maximumLineBytes:CLAUDE_IMAGE_LIMITS.requestBytes,onChunk:chunk=>{bytes+=chunk.length;if(bytes>128*1024*1024)throw fail('provider_output_limit');}})){
        if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{throw fail('provider_stream_malformed');}await events.accept(event);
      }
    })().catch(error=>{parseError=/^(runtime_identity_mismatch|factory_[a-z_]+|provider_[a-z_]+|cli_record_too_large)$/.test(error.code || '')?error.code:'provider_stream_failed';stop(parseError);});
    const diagnostic=(async()=>{let bytes=0;for await(const chunk of owned.child.stderr){bytes+=chunk.length;if(bytes>8*1024*1024){parseError='provider_output_limit';stop(parseError);break;}await options.onDiagnosticChunk?.(chunk);}})().catch(()=>{parseError='provider_stream_failed';stop(parseError);});
    owned.child.stdin.on('error',()=>{});owned.child.stdin.end(options.prompt);
    const completion=(async()=>{
      try{
        const [exit]=await Promise.all([owned.completion,consume,diagnostic]);const toolsExited=await closeTools();verifiedExit=exit.processTreeExited===true && toolsExited;
        const accounting=budget?.snapshot();
        const result=await events.finish(stopReason || accounting?.errorCode || parseError || (!verifiedExit?'provider_process_exit_unconfirmed':exit.code!==0 && !events.errorCode?'provider_runtime_failed':null));
        return {...result,identity,cliVersion:cli.version,processTreeExited:verifiedExit,exitCode:exit.code,...(budget?{budgetId,budget:accounting}:{})};
      }finally{closed=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);await proxy?.close();if(verifiedExit){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan?.planPath)rmSync(sandboxPlan.planPath,{force:true});}}
    })();
    return {identity,completion,stop:()=>closed?false:stop('operator_cancel')};
  }catch(error){clearTimeout(timer);options.signal?.removeEventListener('abort',abort);owned?.stop();if(owned)verifiedExit=(await owned.completion).processTreeExited===true;
    const toolsExited=await closeTools();error.processTreeExited=(owned?verifiedExit:error.processTreeExited!==false) && toolsExited;await proxy?.close();if(error.processTreeExited){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan?.planPath)rmSync(sandboxPlan.planPath,{force:true});}throw error;}
}
