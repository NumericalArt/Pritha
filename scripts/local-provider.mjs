#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolvePrithaRoot,resolvePrithaStateRoot} from './lib/paths.mjs';
import {loadPrithaRuntimeEnv} from './lib/env.mjs';
import {saveLocalServerConfiguration,readLocalServerConfiguration,startOwnedLocalServer,LOCAL_SERVER_PROBE_TIMEOUT_MS} from './openai-compatible/owned-local-server.mjs';

// Configuration is an explicit operator action. No install, model download,
// launchd entry, arbitrary existing listener or automatic background process.
try{
  const [action,...args]=process.argv.slice(2),flags={};
  if(args.length%2)throw new Error();
  for(let i=0;i<args.length;i+=2){if(!['--file','--base-url','--model'].includes(args[i]) || flags[args[i]])throw new Error();flags[args[i]]=args[i+1];}
  const root=resolvePrithaRoot();
  loadPrithaRuntimeEnv({root,pathOnly:true});
  const stateRoot=resolvePrithaStateRoot({root}),options={root,stateRoot};
  if(action==='configure' && flags['--file'] && Object.keys(flags).length===1){
    const bytes=readFileSync(flags['--file']);if(bytes.length>64000)throw new Error();
    console.log(JSON.stringify({configured:true,...saveLocalServerConfiguration(options,JSON.parse(bytes))}));
  }else if(action==='probe' && flags['--base-url'] && flags['--model'] && Object.keys(flags).length===2){
    const config=readLocalServerConfiguration(options,{baseUrl:flags['--base-url'],modelId:flags['--model']}),server=await startOwnedLocalServer({...options,timeoutMs:LOCAL_SERVER_PROBE_TIMEOUT_MS},config);
    const result=await server.close();if(!result.processTreeExited)throw Object.assign(new Error(),{code:'provider_local_process_unverified'});
    console.log(JSON.stringify({status:'ready',offline:true,model:server.model,processTreeExited:true}));
  }else throw new Error();
}catch(error){console.error(JSON.stringify({error:/^provider_[a-z_]+$/.test(error?.code || '')?error.code:'provider_local_configuration_invalid'}));process.exitCode=1;}
