// One sandbox manager per owned attempt: proxy state is never shared across chats.
import { constants,openSync,closeSync,fstatSync,readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
let manager;
try{
  if(process.argv.length!==3 || process.platform!=='darwin')throw new Error();
  const fd=openSync(process.argv[2],constants.O_RDONLY|constants.O_NOFOLLOW);
  let plan;
  try{
    const stat=fstatSync(fd);if(!stat.isFile() || stat.nlink!==1 || stat.size>256000 || stat.uid!==process.getuid() || (stat.mode&0o077)!==0)throw new Error();
    plan=JSON.parse(readFileSync(fd,'utf8'));
  }finally{closeSync(fd);}
  if(plan.version!==1 || !Array.isArray(plan.args) || typeof plan.command!=='string')throw new Error();
  process.chdir(plan.cwd); // srt anchors its glob and mandatory-deny rules here.
  const {SandboxManager}=await import(pathToFileURL(plan.dependency).href);manager=SandboxManager;
  await manager.initialize(plan.config,()=>false,false);
  if(!manager.isSandboxingEnabled())throw new Error();
  const inner=await manager.wrapWithSandboxArgv([plan.command,...plan.args].map(quote).join(' '),'/bin/bash',undefined,undefined,plan.cwd);
  if(!Array.isArray(inner.argv) || !inner.argv.length || !inner.argv.join(' ').includes('sandbox-exec'))throw new Error();
  const child=spawn(inner.argv[0],inner.argv.slice(1),{cwd:plan.cwd,env:inner.env,stdio:'inherit',shell:false});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(status)=>resolve(status ?? 1));});
  process.exitCode=code;
}catch{
  // The host preserves the attempt journal; untrusted paths and diagnostic
  // strings never become an HTTP error or a fallback to unsandboxed execution.
  process.stderr.write('provider_sandbox_unavailable\n');process.exitCode=74;
}finally{await manager?.reset();}
