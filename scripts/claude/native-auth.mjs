import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {privateStateDirectory} from '../lib/private-state-path.mjs';
import {createProviderTemporaryDirectory,providerProcessEnvironment} from '../lib/provider-process-environment.mjs';
import {prepareProviderSandbox} from '../lib/provider-sandbox.mjs';
import {spawnSupervisedCli} from '../neuraldeep/process-supervisor.mjs';
import {atomicWriteFile} from '../lib/atomic-file.mjs';
import {prithaRootEnvironment} from '../lib/paths.mjs';

const fail=code=>Object.assign(new Error('Review the native Claude session for this Pritha instance.'),{code});
export const CLAUDE_NATIVE_MODELS=Object.freeze(['sonnet','opus','haiku'].map(line=>Object.freeze({id:`claude-${line}-5-5`,label:`Claude ${line[0].toUpperCase()+line.slice(1)} 5.5`,line,lifecycle:'active',efforts:['low','medium','high'],maxOutputTokens:128000,contextTokens:1000000,source:'reviewed-native-cli-catalog-2026-11-01'})));
export function resolveNativeClaudeModel(requested){
  const model=CLAUDE_NATIVE_MODELS.find(row=>row.id===requested || row.line===requested);
  if(!model)throw fail('provider_model_unavailable');return {...model,efforts:[...model.efforts]};
}
export function nativeClaudeAuthPaths({stateRoot},{prepare=false}={}){
  let canonical=path.resolve(stateRoot);try{canonical=fs.realpathSync(canonical);}catch(error){if(error.code!=='ENOENT')throw error;}
  const base=path.join(canonical,'claude-native'),home=path.join(base,'home'),config=path.join(base,'config');
  if(prepare)for(const dir of [base,home,config])privateStateDirectory(stateRoot,dir);
  let available=true;
  for(const dir of [base,home,config]){
    try{const st=fs.lstatSync(dir);if(!st.isDirectory() || st.isSymbolicLink() || st.uid!==process.getuid() || (st.mode&0o077)!==0)throw fail('provider_native_auth_unsafe');}
    catch(error){if(error.code==='ENOENT'){available=false;continue;}throw error;}
  }
  try{const st=fs.lstatSync(path.join(config,'.credentials.json'));if(!st.isFile() || st.isSymbolicLink() || st.nlink!==1 || st.uid!==process.getuid() || (st.mode&0o077)!==0)throw fail('provider_native_auth_unsafe');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  let keychain=null;
  if(process.platform==='darwin'){
    const directory=path.join(os.userInfo().homedir,'Library','Keychains');
    try{const st=fs.lstatSync(directory);if(!st.isDirectory() || st.isSymbolicLink() || st.uid!==process.getuid())throw fail('provider_native_auth_unsafe');keychain=fs.realpathSync(directory);}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return {base,home,config,available,keychain};
}
// Only the trusted, unmodified native CLI gets its macOS credential store.
// Security.framework needs directory writes for atomic refresh. Model tools
// run in separate sandboxes and must never receive these roots. Account and
// history selection remain pinned to this instance's CLAUDE_CONFIG_DIR.
export function nativeClaudeSandboxRoots(paths,{refresh=false}={}){
  const roots=[paths.home,paths.config,...(paths.keychain?[paths.keychain]:[])];
  return {readRoots:roots,writeRoots:refresh?roots:[paths.home,paths.config]};
}
export function nativeClaudeEnvironment(options,paths,temporary){
  const env=providerProcessEnvironment({provider:'claude',root:options.root,stateRoot:options.stateRoot,claudeConfigDir:paths.config,temporary,env:options.env || process.env});
  // macOS selects the user's Keychain through HOME. A synthetic home hides the
  // login keychain, so the native CLI cannot save its login. CLAUDE_CONFIG_DIR
  // still scopes this instance's account and history; only its Keychain
  // directory is accessible in the real home. Resolve it from the OS account,
  // never an inherited HOME supplied by another task.
  Object.assign(env,{HOME:process.platform==='darwin'?os.userInfo().homedir:paths.home,CLAUDE_CODE_TMPDIR:temporary,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',DISABLE_ERROR_REPORTING:'1',CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1',ENABLE_CLAUDEAI_MCP_SERVERS:'false',CLAUDE_CODE_DISABLE_ARTIFACT:'1',CLAUDE_CODE_MAX_RETRIES:'0'});
  return env;
}
export const NATIVE_AUTH_SETTINGS=Object.freeze({disableAllHooks:true,disableClaudeAiConnectors:true,autoUpdates:false,apiKeyHelper:''});
export function nativeClaudeLoginPlan({root,stateRoot}){
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const environment={...prithaRootEnvironment(root),PRITHA_STATE_ROOT:stateRoot};
  return {command:`${Object.entries(environment).map(([key,value])=>`${key}=${quote(value)}`).join(' ')} ${quote(process.execPath)} ${quote(path.join(root,'scripts/claude-auth.mjs'))} login`,automatic:false};
}

/** Only the unmodified CLI reads its own auth store. The host accepts a small
 * status projection and never persists stdout, account details or credentials. */
const pending=new Map();
export function probeClaudeNativeAuth(options,dependencies={}){
  const key=JSON.stringify([path.resolve(options.stateRoot),options.binary]);
  if(pending.has(key))return pending.get(key);
  const operation=probeOwnedNativeAuth(options,dependencies).finally(()=>pending.delete(key));pending.set(key,operation);return operation;
}
async function probeOwnedNativeAuth(options,dependencies){
  const paths=nativeClaudeAuthPaths(options);if(!paths.available)return {authenticated:false,status:'not-configured',code:'provider_native_login_required'};
  const temporary=createProviderTemporaryDirectory({provider:'claude',stateRoot:options.stateRoot,temporaryRoot:options.temporaryRoot});
  const lease=path.join(paths.base,'auth-probe.json');let owned,plan,timer,exited=false,unconfirmed=false,ownLease=false;
  try{
    let descriptor;try{descriptor=fs.openSync(lease,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);ownLease=true;fs.writeFileSync(descriptor,JSON.stringify({schema:1,status:'prepared',ownerPid:process.pid})+'\n');fs.fsyncSync(descriptor);}
    catch{throw fail('provider_native_auth_unavailable');}finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
    const args=['--setting-sources','','--settings',JSON.stringify(NATIVE_AUTH_SETTINGS),'auth','status','--json'];
    plan=(dependencies.prepareSandbox || prepareProviderSandbox)({root:options.root,stateRoot:options.stateRoot,privateRoot:paths.base,command:options.binary,args,cwd:temporary,temporary,...nativeClaudeSandboxRoots(paths)});
    const record=evidence=>atomicWriteFile(lease,JSON.stringify({schema:1,status:'running',ownerPid:process.pid,evidence})+'\n');
    owned=await (dependencies.spawnSupervised || spawnSupervisedCli)(plan.command,plan.args,{cwd:temporary,env:nativeClaudeEnvironment(options,paths,temporary),beforeStart:record,onEvidence:record});
    const buffers=[];let bytes=0,invalid=false;
    const collect=(async()=>{for await(const chunk of owned.child.stdout){
      bytes+=chunk.length;if(bytes>64000){invalid=true;owned.stop();break;}buffers.push(chunk);
      // Some native CLI versions leave background handles open after printing
      // status. A complete status is enough for this read-only probe: stop its
      // owned process group, then still require a verified full exit below.
      try{if(typeof JSON.parse(Buffer.concat(buffers).toString('utf8'))?.loggedIn==='boolean')owned.stop();}catch{/* bounded fragmented JSON */}
    }})();
    const drain=(async()=>{let count=0;for await(const chunk of owned.child.stderr){count+=chunk.length;if(count>64000){invalid=true;owned.stop();break;}}})();
    timer=setTimeout(()=>{invalid=true;owned.stop();},15000);owned.child.stdin.end();
    const [result]=await Promise.all([owned.completion,collect,drain]);exited=result.processTreeExited===true;
    if(!exited || invalid)throw fail('provider_native_auth_unavailable');
    let value;try{value=JSON.parse(Buffer.concat(buffers).toString('utf8'));}catch{throw fail('provider_native_auth_unavailable');}
    if(value?.loggedIn===false)return {authenticated:false,status:'pending-auth',code:'provider_native_login_required'};
    if(value?.loggedIn!==true || value.authMethod!=='claude.ai' || value.apiProvider!=='firstParty')throw fail('provider_native_auth_unsupported');
    // Bind resume to an account without publishing or logging its identity.
    const account=[value.email,value.orgId].filter(item=>typeof item==='string' && item.length>0 && item.length<500);
    if(!account.length)throw fail('provider_native_auth_unavailable');
    return {authenticated:true,status:'ready',identity:createHash('sha256').update(JSON.stringify([fs.realpathSync(paths.config),value.authMethod,...account])).digest('hex')};
  }catch(error){unconfirmed=error.processTreeExited===false;throw error;}finally{
    clearTimeout(timer);
    if(owned && !exited){owned.stop();exited=(await owned.completion).processTreeExited===true;}
    if(exited || !owned && !unconfirmed){fs.rmSync(temporary,{recursive:true,force:true});if(plan?.planPath)fs.rmSync(plan.planPath,{force:true});if(ownLease)fs.rmSync(lease,{force:true});}
  }
}
