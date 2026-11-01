#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {loadPrithaRuntimeEnv} from './lib/env.mjs';
import {resolvePrithaRoot,resolvePrithaStateRoot} from './lib/paths.mjs';
import {resolveClaudeBinary} from './claude-code-runner.mjs';
import {probeClaudeCli} from './claude/cli-probe.mjs';
import {nativeClaudeAuthPaths,nativeClaudeEnvironment,nativeClaudeLoginPlan,probeClaudeNativeAuth,NATIVE_AUTH_SETTINGS} from './claude/native-auth.mjs';
import {createProviderTemporaryDirectory} from './lib/provider-process-environment.mjs';
import {spawnSupervisedCli} from './neuraldeep/process-supervisor.mjs';
import {atomicWriteFile} from './lib/atomic-file.mjs';

try{
  const [action,...rest]=process.argv.slice(2);if(rest.length || !['plan','status','login'].includes(action))throw new Error();
  const root=resolvePrithaRoot();loadPrithaRuntimeEnv({root,pathOnly:true});const options={root,stateRoot:resolvePrithaStateRoot({root})};
  if(action==='plan')console.log(JSON.stringify(nativeClaudeLoginPlan(options)));
  else {
    const binary=resolveClaudeBinary(process.env.PRITHA_CLAUDE_CLI_BIN || 'claude');
    const cli=await probeClaudeCli({...options,binary});if(!cli.available)throw Object.assign(new Error(),{code:cli.code});
    if(action==='status'){
      const status=await probeClaudeNativeAuth({...options,binary});console.log(JSON.stringify({authenticated:status.authenticated,status:status.status,code:status.code || null}));
    }else{
      // Explicit terminal action: Anthropic's native interactive flow owns all
      // credentials. No app login form, copied OAuth token, service or API call.
      const paths=nativeClaudeAuthPaths(options,{prepare:true}),temporary=createProviderTemporaryDirectory({provider:'claude',stateRoot:options.stateRoot});
      const lease=path.join(paths.base,'auth-probe.json');let ownLease=false,owned,exited=false,uncertain=false;
      const stop=()=>owned?.stop('SIGINT');
      try{
        const fd=fs.openSync(lease,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);ownLease=true;
        try{fs.writeFileSync(fd,JSON.stringify({schema:1,status:'login-prepared',ownerPid:process.pid})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
        const record=evidence=>atomicWriteFile(lease,JSON.stringify({schema:1,status:'login-running',ownerPid:process.pid,evidence})+'\n');
        owned=await spawnSupervisedCli(binary,['--setting-sources','','--settings',JSON.stringify(NATIVE_AUTH_SETTINGS),'auth','login'],{cwd:paths.home,env:nativeClaudeEnvironment(options,paths,temporary),inherit:true,beforeStart:record,onEvidence:record});
        process.on('SIGINT',stop);process.on('SIGTERM',stop);
        const result=await owned.completion;exited=result.processTreeExited===true;process.exitCode=exited?result.code ?? 1:1;
      }catch(error){uncertain=error.processTreeExited===false;throw error;}
      finally{
        process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
        if(owned && !exited){owned.stop();exited=(await owned.completion).processTreeExited===true;}
        if(exited || !owned && !uncertain){fs.rmSync(temporary,{recursive:true,force:true});if(ownLease)fs.rmSync(lease,{force:true});}
      }
    }
  }
}catch(error){console.error(JSON.stringify({error:/^provider_[a-z_]+$/.test(error?.code || '')?error.code:'provider_native_auth_unavailable'}));process.exitCode=1;}
