import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';

function identity(pid) {
  try {
    const text=execFileSync('/bin/ps',['-p',String(pid),'-o','lstart=,pgid='],{encoding:'utf8',timeout:1000,stdio:['ignore','pipe','ignore']}).trim();
    const match=/^(.*?)\s+(\d+)$/.exec(text);
    return match?{birth:match[1].trim(),group:Number(match[2])}:null;
  } catch {return null;}
}
export function ownChildProcess(child,cwd) {
  const snapshot=identity(child.pid);
  if(!snapshot || snapshot.group!==child.pid)throw new Error('owned_process_identity_unavailable');
  return {child,pid:child.pid,generation:randomUUID(),cwd:realpathSync(cwd),birth:snapshot.birth,group:snapshot.group};
}
export function signalOwnedProcess(owner,signal='SIGTERM') {
  if(!owner || owner.child.pid!==owner.pid || owner.child.exitCode!==null || owner.child.signalCode!==null)return {attempted:false,signaled:false,reason:'owner_not_live'};
  const current=identity(owner.pid);
  if(!current || current.birth!==owner.birth || current.group!==owner.group || current.group!==owner.pid)return {attempted:false,signaled:false,reason:'owner_identity_changed'};
  try {process.kill(-owner.group,signal);return {attempted:true,signaled:true,reason:'owned_group_signaled'};}
  catch {return {attempted:true,signaled:false,reason:'owned_group_unavailable'};}
}
export function ownedGroupExited(owner) {
  if(!owner || (owner.child.exitCode===null && owner.child.signalCode===null))return false;
  try {process.kill(-owner.group,0);return false;}catch(error){return error.code==='ESRCH';}
}
