import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute=promisify(execFile),cache=new Map();
/** Share in-flight probes; no synchronous child process blocks request handling. */
export function runtimeProbe(binary,args,cwd,{timeoutMs=5000,ttlMs=30000}={}) {
  const key=JSON.stringify([binary,args,cwd]),now=Date.now(),cached=cache.get(key);
  if(cached && (cached.pending || now-cached.at<ttlMs))return cached.promise;
  const row={at:now,pending:true,promise:null};
  row.promise=execute(binary,args,{cwd,encoding:'utf8',timeout:timeoutMs,maxBuffer:256*1024})
    .then(result=>({ok:true,stdout:result.stdout,stderr:result.stderr}))
    .catch(error=>({ok:false,stdout:String(error.stdout || ''),stderr:String(error.stderr || '')}))
    .finally(()=>{row.pending=false;row.at=Date.now();});
  cache.set(key,row);
  if(cache.size>32)for(const [oldKey,old] of cache){if(oldKey!==key && !old.pending){cache.delete(oldKey);break;}}
  return row.promise;
}
