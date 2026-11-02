import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {constants,openSync,closeSync,fstatSync,readFileSync,realpathSync,rmSync,writeFileSync,renameSync,ftruncateSync,fsyncSync,writeSync,existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {normalizeLocalProviderUrl} from '../lib/provider-profile.mjs';
import {privateStateDirectory,privateStateFile} from '../lib/private-state-path.mjs';
import {createProviderTemporaryDirectory} from '../lib/provider-process-environment.mjs';
import {prepareProviderSandbox} from '../lib/provider-sandbox.mjs';
import {spawnSupervisedCli} from '../neuraldeep/process-supervisor.mjs';
import {processSnapshot,processTreeExited} from '../neuraldeep/process-snapshot.mjs';
import {providerJson} from '../lib/provider-http.mjs';
import {modelId,normalizeLocalModels,ollamaModelMetadata,lmStudioModelMetadata,COMPATIBLE_EFFORTS} from './catalog.mjs';

const execute=promisify(execFile);
// A launchd background process can take longer than a foreground CLI to load
// the same CPU model. Keep startup bounded and below the probe's total lease.
export const LOCAL_SERVER_STARTUP_TIMEOUT_MS=30_000;
export const LOCAL_SERVER_PROBE_TIMEOUT_MS=45_000;
const fail=(code='provider_local_configuration_invalid')=>Object.assign(new Error('The selected Local runtime needs a verified private server configuration.'),{code});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function configPath({root,stateRoot}) {return path.join(path.resolve(stateRoot)===path.resolve(root)?path.join(root,'.private'):stateRoot,'local-runtime','server.json');}
const activePath=options=>path.join(path.dirname(configPath(options)),'active.json');
function boundedFile(file,limit,privateMode=false){
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const stat=fstatSync(fd);if(!stat.isFile() || stat.nlink!==1 || stat.size>limit || privateMode && (stat.uid!==process.getuid() || (stat.mode&0o077)!==0))throw fail();return readFileSync(fd);}
  finally{closeSync(fd);}
}
/** Operator-authored configuration. No model can choose the process or inherit
 * the host environment. The selected URL identifies a configuration, never an
 * existing listener: each attempt owns a fresh server and exact loopback port. */
export function validateLocalServerConfiguration(value){
  if(!value || value.schema!==1 || Object.keys(value).some(key=>!['schema','endpoint','command','args','readRoots','model','environment','commandSha256'].includes(key)))throw fail();
  const endpoint=normalizeLocalProviderUrl(value.endpoint);
  if(typeof value.command!=='string' || !path.isAbsolute(value.command) || !Array.isArray(value.args) || value.args.length>40 || value.args.some(arg=>typeof arg!=='string' || arg.includes('\0') || arg.length>4096)
    || !Array.isArray(value.readRoots) || !value.readRoots.length || value.readRoots.length>8)throw fail();
  const command=realpathSync(value.command),commandSha256=sha(boundedFile(command,256*1024*1024));
  if(value.commandSha256 && commandSha256!==value.commandSha256)throw fail('provider_local_binary_changed');
  const readRoots=value.readRoots.map(directory=>{if(typeof directory!=='string' || !path.isAbsolute(directory))throw fail();const actual=realpathSync(directory);if(actual.split(path.sep).filter(Boolean).length<3)throw fail();return actual;});
  const model=value.model;
  if(!model || !modelId(model.id) || /(?:^|[:/-])cloud(?:$|[:/-])/i.test(model.id) || model.tools!==true || model.responses!==true
    || !Number.isSafeInteger(model.contextTokens) || model.contextTokens<8192 || model.contextTokens>2000000 || !Number.isSafeInteger(model.outputTokens) || model.outputTokens<1024 || model.outputTokens>32768
    || !Array.isArray(model.efforts) || !model.efforts.length || model.efforts.some(effort=>!['default',...COMPATIBLE_EFFORTS].includes(effort)))throw fail();
  const environment=value.environment || {};
  if(Object.keys(environment).some(key=>!['OLLAMA_MODELS','OLLAMA_CONTEXT_LENGTH','MLX_METAL_MEMORY_LIMIT','HF_HOME'].includes(key)) || Object.values(environment).some(item=>typeof item!=='string' || item.includes('\0') || item.length>4096))throw fail();
  const canonicalArg=arg=>path.isAbsolute(arg) && existsSync(arg)?realpathSync(arg):arg;
  return {schema:1,endpoint,command,commandSha256,args:value.args.map(canonicalArg),readRoots,environment:Object.fromEntries(Object.entries(environment).map(([key,item])=>[key,canonicalArg(item)])),model:{id:model.id,tools:true,responses:true,contextTokens:model.contextTokens,outputTokens:model.outputTokens,efforts:[...new Set(model.efforts)]}};
}
export function readLocalServerConfiguration(options,preset){
  let value;try{value=JSON.parse(boundedFile(configPath(options),64000,true));}catch(error){if(error.code==='ENOENT')throw fail('provider_offline_unverified');throw fail();}
  const config=validateLocalServerConfiguration(value);
  if(config.endpoint!==normalizeLocalProviderUrl(preset.baseUrl) || config.model.id!==preset.modelId)throw fail('provider_local_configuration_mismatch');
  return {...config,identity:sha(JSON.stringify(config))};
}
export function saveLocalServerConfiguration(options,value){
  const config=validateLocalServerConfiguration(value),file=privateStateFile(options.stateRoot,configPath(options)),temporary=file+'.'+process.pid+'.tmp';
  const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(config,null,2)+'\n');}finally{closeSync(fd);}
  renameSync(temporary,file);return {endpoint:config.endpoint,modelId:config.model.id};
}
async function freePort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function listenerOwned(port,evidence){
  const {stdout}=await execute('/usr/sbin/lsof',['-nP','-a','-iTCP:'+port,'-sTCP:LISTEN','-Fp'],{timeout:2000,maxBuffer:16000});
  const ids=stdout.split('\n').filter(line=>/^p\d+$/.test(line)).map(line=>Number(line.slice(1))),rows=processSnapshot();
  if(!ids.length || !evidence || !rows.some(row=>row.pid===evidence.session && row.started===evidence.leaderStarted))throw fail('provider_local_process_unverified');
  if(ids.some(pid=>!rows.some(row=>row.pid===pid && row.session===evidence.session)))throw fail('provider_local_process_unverified');
}
export async function inspectOwnedLocalServer(options,config){
  let receipt;try{receipt=JSON.parse(boundedFile(activePath(options),64000,true));}catch(error){if(error.code==='ENOENT')return null;throw fail('provider_local_process_unverified');}
  if(receipt.identity!==config.identity || !receipt.model)throw fail('provider_local_process_unverified');
  await listenerOwned(receipt.port,receipt.evidence);
  return receipt.model;
}
export async function startOwnedLocalServer(options,config,dependencies={}){
  const lock=privateStateFile(options.stateRoot,activePath(options));let lockFd;
  try{lockFd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(error){
    if(error.code!=='EEXIST')throw error;
    let prior;try{prior=JSON.parse(boundedFile(lock,64000,true));}catch{throw fail('provider_local_process_unverified');}
    if(!prior.evidence || processSnapshot().some(row=>row.pid===prior.ownerPid && row.started===prior.ownerStarted) || !processTreeExited(prior.evidence))throw fail('provider_local_process_unverified');
    rmSync(lock);lockFd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  }
  const owner=processSnapshot().find(row=>row.pid===process.pid),record={identity:config.identity,ownerPid:process.pid,ownerStarted:owner?.started};
  const journal=()=>{if(lockFd===undefined)return;const bytes=Buffer.from(JSON.stringify(record));ftruncateSync(lockFd,0);let offset=0;while(offset<bytes.length)offset+=writeSync(lockFd,bytes,offset,bytes.length-offset,offset);fsyncSync(lockFd);};
  journal();
  let temporary,port,baseUrl,owned,evidence,plan,closed=false,exitResult,outputBytes=0,timer,processFinished=false,unconfirmedStart=false;
  const stop=()=>owned?.stop('SIGTERM'),abort=()=>stop();
  const close=async()=>{if(closed)return exitResult;closed=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);stop();exitResult=owned?await owned.completion:{processTreeExited:!unconfirmedStart};
    if(lockFd!==undefined){closeSync(lockFd);lockFd=undefined;}
    if(exitResult.processTreeExited){rmSync(lock);if(temporary)rmSync(temporary,{recursive:true,force:true});if(plan?.planPath)rmSync(plan.planPath,{force:true});}return exitResult;};
  try{
    if(options.signal?.aborted)throw fail('operator_cancel');
    temporary=createProviderTemporaryDirectory({provider:'local',stateRoot:options.stateRoot});port=await freePort();baseUrl=`http://127.0.0.1:${port}/v1`;
    const privateRoot=privateStateDirectory(options.stateRoot,path.join(path.dirname(configPath(options)),'attempts'));
    const args=config.args.map(arg=>arg.replaceAll('{port}',String(port)));
    plan=(dependencies.prepareSandbox || prepareProviderSandbox)({root:options.root,stateRoot:options.stateRoot,privateRoot,command:config.command,args,cwd:temporary,temporary,
      readRoots:config.readRoots,readOnlyRoots:config.readRoots,loopbackPorts:[port]});
    const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:temporary,TMPDIR:temporary,LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8',
      ...config.environment,OLLAMA_HOST:`127.0.0.1:${port}`,OLLAMA_NO_CLOUD:'1',OLLAMA_KEEP_ALIVE:'0',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_DATASETS_OFFLINE:'1',DO_NOT_TRACK:'1'};
    owned=await (dependencies.spawnSupervised || spawnSupervisedCli)(plan.command,plan.args,{cwd:temporary,env,
      beforeStart:async proof=>{evidence=proof;Object.assign(record,{port,evidence});journal();await options.beforeStart?.(proof);},onEvidence:proof=>{evidence=proof;record.evidence=proof;journal();options.onEvidence?.(proof);}});
    owned.completion.then(()=>{processFinished=true;});
    for(const stream of [owned.child.stdout,owned.child.stderr])stream.on('data',chunk=>{outputBytes+=chunk.length;if(outputBytes>4*1024*1024)stop();else options.onDiagnosticChunk?.(chunk);});
    owned.child.stdin.end();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    timer=setTimeout(stop,options.timeoutMs || 30000);
    const verify=async()=>{if(options.signal?.aborted)throw fail('operator_cancel');await (dependencies.listenerOwned || listenerOwned)(port,evidence);};
    const deadline=Date.now()+Math.min(LOCAL_SERVER_STARTUP_TIMEOUT_MS,options.timeoutMs || 30000);let models;
    while(Date.now()<deadline && !processFinished){
      if(options.signal?.aborted)throw fail('operator_cancel');
      try{await verify();models=normalizeLocalModels(await providerJson(baseUrl+'/models',{timeoutMs:1000}));break;}
      catch{await new Promise(resolve=>setTimeout(resolve,100));}
    }
    if(!models && Date.now()>=deadline)throw fail('provider_local_startup_timeout');
    const selected=models?.find(model=>model.id===config.model.id);
    if(!selected || selected.cloud)throw fail('provider_model_unavailable');
    // A declared adapter capability is verified by the first bounded Responses
    // request. Native metadata can veto cloud models and unsupported tools.
    let model={...selected,...config.model,source:'owned-local',cloud:false};
    try{model=ollamaModelMetadata(model,await providerJson(baseUrl.replace('/v1','')+'/api/show',{method:'POST',jsonBody:{model:model.id},timeoutMs:1000}));}catch{}
    try{model=lmStudioModelMetadata([model],await providerJson(baseUrl.replace('/v1','')+'/api/v1/models',{timeoutMs:1000}))[0];}catch{}
    if(model.cloud)throw fail('provider_local_cloud_model');
    if(!model.tools || !model.responses)throw fail(!model.tools?'provider_tools_unverified':'provider_protocol_unverified');
    record.model=model;journal();
    return {baseUrl,port,model,identity:config.identity,verify,stop,close};
  }catch(error){unconfirmedStart=error.processTreeExited===false;const result=await close();error.processTreeExited=result.processTreeExited===true;throw error;}
}
