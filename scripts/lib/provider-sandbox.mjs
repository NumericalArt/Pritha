import { closeSync,constants,existsSync,openSync,readFileSync,realpathSync,writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { privateStateFile } from './private-state-path.mjs';

export const PROVIDER_SANDBOX_VERSION='0.0.81';
const failure=()=>{throw Object.assign(new Error('A verified host sandbox is required for this provider.'),{code:'provider_sandbox_unavailable'});};
const literal=value=>({path:realpathSync(value),literal:true});
const protectedNames=['**/.env','**/.env.*','**/.mcp.json','**/credentials.json','**/.credentials.json','**/id_rsa','**/id_ed25519',...['.git','.claude','.codex','.private','.memory-private','.queue','.logs','.ssh','.aws','.config'].flatMap(name=>['**/'+name,'**/'+name+'/**'])];

/** Version and host support are checked before an attempt may be dispatched. */
export function providerSandboxDependency(root){
  if(process.platform!=='darwin' || !existsSync('/usr/bin/sandbox-exec'))failure();
  const require=createRequire(path.join(root,'interfaces','control-center','package.json'));
  try{
    const entry=require.resolve('@anthropic-ai/sandbox-runtime');
    const metadata=JSON.parse(readFileSync(path.join(path.dirname(entry),'..','package.json'),'utf8'));
    if(metadata.version!==PROVIDER_SANDBOX_VERSION)failure();return entry;
  }catch{failure();}
}

/** A host-authored, bounded plan. The sandboxed program never reads or edits it. */
export function prepareProviderSandbox({root,stateRoot,privateRoot,command,args,cwd,temporary,readRoots=[],writeRoots=[],loopbackPorts=[]}){
  const dependency=providerSandboxDependency(root);
  if(typeof command!=='string' || !path.isAbsolute(command) || !Array.isArray(args) || args.some(arg=>typeof arg!=='string' || arg.includes('\0'))
      || Buffer.byteLength(JSON.stringify(args))>128000 || readRoots.length>32 || writeRoots.length>16 || loopbackPorts.length>2
      || loopbackPorts.some(port=>!Number.isSafeInteger(port) || port<1 || port>65535))failure();
  const binary=realpathSync(command),working=realpathSync(cwd),scratch=realpathSync(temporary);
  const system=['/usr','/bin','/sbin','/System','/Library/Apple','/private/etc/ssl','/private/etc/localtime','/private/etc/hosts','/dev/null','/dev/random','/dev/urandom'].filter(existsSync);
  const read=[...system,binary,realpathSync(process.execPath),working,scratch,...readRoots];
  const config={network:{allowedDomains:[],deniedDomains:[],strictAllowlist:true,allowLocalBinding:false,allowUnixSockets:[],allowAllUnixSockets:false,
      ...(loopbackPorts[0]?{httpProxyPort:loopbackPorts[0],socksProxyPort:loopbackPorts[1] || loopbackPorts[0]}:{})},
    filesystem:{denyRead:[{path:'/',literal:true},...protectedNames],allowRead:[...new Set(read)].map(literal),allowWrite:[scratch,...writeRoots].map(literal),denyWrite:protectedNames},
    enableWeakerNetworkIsolation:false,enableWeakerNestedSandbox:false,allowAppleEvents:false,allowPty:false};
  // External proxy slots open only these exact loopback ports in Seatbelt.
  // They point to capability-authenticated protocol endpoints, not forwarding
  // proxies: CONNECT, SOCKS and foreign paths are rejected by their handlers.
  // With no slots srt supplies a proxy whose empty strict allowlist denies all.
  const plan={version:1,dependency,command:binary,args,cwd:working,config};
  const file=privateStateFile(stateRoot,path.join(privateRoot,'sandbox-plans',randomUUID()+'.json'));
  const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(plan));}finally{closeSync(fd);}
  return {command:process.execPath,args:[path.join(root,'scripts','lib','provider-sandbox-run.mjs'),file],planPath:file};
}
