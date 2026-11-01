import {execFile} from 'node:child_process';
import {accessSync,constants,realpathSync,statSync} from 'node:fs';
import {promisify} from 'node:util';
import path from 'node:path';
import {providerProcessEnvironment} from '../lib/provider-process-environment.mjs';
const execute=promisify(execFile),cache=new Map();
export function resolveCodexProviderBinary(value='codex',env=process.env){
  if(typeof value!=='string' || value.includes('\0'))throw Object.assign(new Error('The task CLI is unavailable.'),{code:'provider_runtime_unavailable'});
  const candidates=path.isAbsolute(value)?[value]:value==='codex'?String(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,value)):[];
  for(const candidate of candidates)try{accessSync(candidate,constants.X_OK);return realpathSync(candidate);}catch{/* Only the explicit PATH is searched. */}
  throw Object.assign(new Error('The task CLI is unavailable.'),{code:'provider_runtime_unavailable'});
}
export async function probeCompatibleCli({root,stateRoot,connectorId,codexBin,env=process.env,executeImpl=execute}){
  try{
    const binary=resolveCodexProviderBinary(codexBin,env),stat=statSync(binary),key=JSON.stringify([binary,stat.mtimeMs,stat.size]),saved=cache.get(key);
    if(executeImpl===execute && saved && Date.now()-saved.at<60000)return saved.result;
    const options={env:providerProcessEnvironment({provider:connectorId,root,stateRoot,env}),encoding:'utf8',timeout:5000,maxBuffer:64000};
    const version=/\b(\d+\.\d+\.\d+)\b/.exec((await executeImpl(binary,['--version'],options)).stdout)?.[1];
    const help=(await executeImpl(binary,['exec','--help'],options)).stdout;
    if(!version || !['--strict-config','--ignore-user-config','--ignore-rules','--json'].every(flag=>help.includes(flag)))throw new Error();
    const result={available:true,version,binary};if(executeImpl===execute){cache.clear();cache.set(key,{at:Date.now(),result});}return result;
  }catch{return {available:false,version:null,code:'provider_runtime_unavailable'};}
}
