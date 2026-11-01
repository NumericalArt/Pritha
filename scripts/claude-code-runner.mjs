import { createHash,randomUUID,randomBytes } from 'node:crypto';
import { accessSync,constants,existsSync,readFileSync,realpathSync,rmSync } from 'node:fs';
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

const fail=code=>Object.assign(new Error('The configured Claude runtime could not complete this task safely.'),{code});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function resolveClaudeBinary(value='claude',env=process.env){
  if(typeof value!=='string' || value.includes('\0'))throw fail('provider_runtime_unavailable');
  const candidates=path.isAbsolute(value)?[value]:value==='claude'?String(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,value)):[];
  for(const candidate of candidates)try{accessSync(candidate,constants.X_OK);return realpathSync(candidate);}catch{/* Try only the explicit PATH. */}
  throw fail('provider_runtime_unavailable');
}
export function buildClaudeExecArgs({model,sessionId,resume,effort='medium',maxTurns=32,mcpConfigPath,allowedTools=[]}){
  if(!CLAUDE_MODEL_ID.test(model || '') || !CLAUDE_SESSION_ID.test(sessionId || '') || !['low','medium','high','xhigh','max'].includes(effort)
      || !Number.isSafeInteger(maxTurns) || maxTurns<1 || maxTurns>128 || allowedTools.length>64 || allowedTools.some(name=>!/^mcp__pritha__[a-z_]{1,60}$/.test(name)))throw fail('provider_input_invalid');
  const args=['--print','--bare','--restricted','--output-format','stream-json','--verbose','--model',model,'--effort',effort,'--max-turns',String(maxTurns),
    '--tools','','--strict-mcp-config','--permission-mode','dontAsk','--permission-prompts','none','--setting-sources','',
    '--settings',JSON.stringify({disableAllHooks:true,autoUpdates:false,permissions:{deny:['Agent','Bash','Read','Write','Edit','WebFetch','WebSearch']}})];
  args.push(resume?'--resume':'--session-id',sessionId);
  if(mcpConfigPath)args.push('--mcp-config',mcpConfigPath);
  if(allowedTools.length)args.push('--allowedTools',...allowedTools);
  return args;
}

/** API-key lane only. local-cli-session is a separate auth contract, never a
 * fallback and never an excuse to copy or extract Claude OAuth credentials. */
export async function startClaudeCodeRun(options,dependencies={}){
  if(options.authMode && options.authMode!=='api-key')throw fail('provider_auth_mode_unverified');
  if(!CLAUDE_MODEL_ID.test(options.model || '') || typeof options.prompt!=='string' || !options.prompt.trim() || Buffer.byteLength(options.prompt)>256000
      || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs<1000 || options.timeoutMs>3600000 || options.resume && !CLAUDE_SESSION_ID.test(options.resume))throw fail('provider_input_invalid');
  if(options.signal?.aborted)throw fail('operator_cancel');
  const root=realpathSync(options.root),cwd=realpathSync(options.cwd),stateRoot=path.resolve(options.stateRoot),privateRoot=privateStateDirectory(stateRoot,options.privateRoot);
  const key=(dependencies.readCredential || readProviderCredential)('claude',{stateRoot,env:options.env || process.env});if(!key)throw fail('provider_pending_auth');
  const binary=resolveClaudeBinary(options.claudeBin,options.env || process.env);
  const cli=await (dependencies.probeCli || probeClaudeCli)({binary,root,stateRoot,env:options.env || process.env});
  if(!cli.available)throw fail(cli.code);
  const profile=privateStateDirectory(stateRoot,path.join(privateRoot,'profiles',hash([cwd,options.model,'api-key'])));
  const home=privateStateDirectory(stateRoot,path.join(profile,'home')),config=privateStateDirectory(stateRoot,path.join(profile,'config'));
  const sessionId=options.resume || randomUUID(),identity=hash([realpathSync(stateRoot),profile,cwd,options.model,'api-key']);
  const proofFile=privateStateFile(stateRoot,path.join(profile,'sessions',sessionId+'.json'));
  if(options.resume){
    let proof;try{proof=JSON.parse(readFileSync(proofFile,'utf8'));}catch{throw fail('runtime_identity_mismatch');}
    if(proof.identity!==identity || proof.sessionId!==sessionId || proof.model!==options.model || proof.observedInit!==true)throw fail('runtime_identity_mismatch');
  }
  const temporary=createProviderTemporaryDirectory({provider:'claude',stateRoot,temporaryRoot:options.temporaryRoot});
  const localToken=randomBytes(32).toString('base64url');
  let proxy,owned,timer,verifiedExit=false,closed=false,stopReason=null,sandboxPlan;
  const stop=reason=>{stopReason ||= reason;return owned?.stop('SIGTERM') || false;},abort=()=>stop('operator_cancel');
  const events=new ClaudeStreamState({model:options.model,sessionId,onEvent:async event=>{
    if(event.type==='thread.started')atomicWriteFile(proofFile,JSON.stringify({version:1,identity,sessionId,model:options.model,cliVersion:cli.version,observedInit:true})+'\n');
    // The journal holds the same visible records as the UI, not private thinking.
    await options.onRawChunk?.(Buffer.from(JSON.stringify(event)+'\n'));await options.onEvent?.(event);
  }});
  try{
    proxy=await (dependencies.listenProxy || listenClaudeApiProxy)({localToken,apiKey:key,model:options.model,timeoutMs:options.timeoutMs,maxOutputTokens:options.maxOutputTokens || 8192,
      allowedTools:options.allowedTools || [],beforeRequest:options.beforeRequest,fetchImpl:dependencies.fetchImpl});
    const args=buildClaudeExecArgs({...options,sessionId});
    const env=providerProcessEnvironment({provider:'claude',root,stateRoot,claudeConfigDir:config,temporary,env:options.env || process.env});
    Object.assign(env,{HOME:home,ANTHROPIC_API_KEY:localToken,ANTHROPIC_BASE_URL:proxy.baseUrl,CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST:'1',CLAUDE_CODE_TMPDIR:temporary,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1',PRITHA_PYTHON:resolvePrithaPython({root,env:options.env || process.env})});
    env.CLAUDE_CODE_MAX_RETRIES='0';env.CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES='0';env.CLAUDE_CODE_DISABLE_REFUSAL_RETRY='1';
    sandboxPlan=(dependencies.prepareSandbox || prepareProviderSandbox)({root,stateRoot,privateRoot,command:binary,args,cwd,temporary,readRoots:[home,config],writeRoots:[home,config],loopbackPorts:[proxy.port]});
    owned=await (dependencies.spawnSupervised || spawnSupervisedCli)(sandboxPlan.command,sandboxPlan.args,{cwd,env,supervisorPath:path.join(root,'scripts','neuraldeep','process-supervisor.mjs'),
      beforeStart:async evidence=>{if(options.signal?.aborted)throw fail('operator_cancel');await options.beforeStart?.({identity,evidence,model:options.model,resume:options.resume || null});},onEvidence:options.onEvidence});
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    timer=setTimeout(()=>stop('provider_timeout'),options.timeoutMs);
    let parseError=null;
    const consume=(async()=>{
      let bytes=0;
      for await(const line of readJsonlLines(owned.child.stdout,{maximumLineBytes:16*1024*1024,onChunk:chunk=>{bytes+=chunk.length;if(bytes>128*1024*1024)throw fail('provider_output_limit');}})){
        if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch{throw fail('provider_stream_malformed');}await events.accept(event);
      }
    })().catch(error=>{parseError=/^(runtime_identity_mismatch|provider_[a-z_]+|cli_record_too_large)$/.test(error.code || '')?error.code:'provider_stream_failed';stop(parseError);});
    const diagnostic=(async()=>{let bytes=0;for await(const chunk of owned.child.stderr){bytes+=chunk.length;if(bytes>8*1024*1024){parseError='provider_output_limit';stop(parseError);break;}await options.onDiagnosticChunk?.(chunk);}})().catch(()=>{parseError='provider_stream_failed';stop(parseError);});
    owned.child.stdin.on('error',()=>{});owned.child.stdin.end(options.prompt);
    const completion=(async()=>{
      try{
        const [exit]=await Promise.all([owned.completion,consume,diagnostic]);verifiedExit=exit.processTreeExited===true;
        const result=await events.finish(parseError || stopReason || (!verifiedExit?'provider_process_exit_unconfirmed':exit.code!==0?'provider_runtime_failed':null));
        return {...result,identity,cliVersion:cli.version,processTreeExited:verifiedExit,exitCode:exit.code};
      }finally{closed=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);await proxy?.close();if(verifiedExit){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan?.planPath)rmSync(sandboxPlan.planPath,{force:true});}}
    })();
    return {identity,completion,stop:()=>closed?false:stop('operator_cancel')};
  }catch(error){clearTimeout(timer);options.signal?.removeEventListener('abort',abort);owned?.stop();if(owned)verifiedExit=(await owned.completion).processTreeExited===true;
    error.processTreeExited=owned?verifiedExit:error.processTreeExited!==false;await proxy?.close();if(error.processTreeExited){rmSync(temporary,{recursive:true,force:true});if(sandboxPlan?.planPath)rmSync(sandboxPlan.planPath,{force:true});}throw error;}
}
