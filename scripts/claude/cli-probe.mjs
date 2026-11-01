import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statSync } from 'node:fs';
import { providerProcessEnvironment } from '../lib/provider-process-environment.mjs';
const execute=promisify(execFile),cache=new Map();

/** No login, OAuth reads, provider requests or compatibility guesses. */
export async function probeClaudeCli({binary,root,stateRoot,env=process.env,executeImpl=execute}){
  try{
    const stat=statSync(binary),key=JSON.stringify([binary,stat.size,stat.mtimeMs]),saved=cache.get(key);
    if(executeImpl===execute && saved && Date.now()-saved.at<60000)return saved.result;
    const clean=providerProcessEnvironment({provider:'claude',root,stateRoot,env});
    const options={env:clean,encoding:'utf8',timeout:5000,maxBuffer:128000};
    const versionText=await executeImpl(binary,['--bare','--version'],options),version=/\b(\d+)\.(\d+)\.(\d+)\b/.exec(versionText.stdout || '');
    if(!version || Number(version[1])!==2 || Number(version[2])!==1 || Number(version[3])<286)return {available:false,version:version?.[0] || null,code:'provider_runtime_unverified'};
    const help=await executeImpl(binary,['--bare','--help'],options);
    if(!['--bare','--restricted','--strict-mcp-config','--tools','--setting-sources','--permission-prompts','--session-id'].every(flag=>help.stdout.includes(flag)))return {available:false,version:version[0],code:'provider_runtime_unverified'};
    const result={available:true,version:version[0],code:null};if(executeImpl===execute){cache.clear();cache.set(key,{result,at:Date.now()});}return result;
  }catch{return {available:false,version:null,code:'provider_runtime_unavailable'};}
}
