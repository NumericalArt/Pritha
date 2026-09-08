#!/usr/bin/env node
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadPrithaRuntimeEnv } from './lib/env.mjs';
import { resolveTechscopeRoot,resolvePrithaStateRoot } from './lib/paths.mjs';
import { ExecutionCoordinator } from './lib/execution-coordinator.mjs';
import { reviewTaskWorkspace,applyTaskWorkspace,cleanupTaskWorkspace } from './lib/task-workspace.mjs';
const args=process.argv.slice(2),command=args.shift() || 'help';
const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if(command==='help' || args.includes('--help')) {
  console.log('task-workspace.mjs list | review --id ID | apply --id ID --source-sha SHA --head-sha SHA --request-id ID --check-script SCRIPT --yes | cleanup --id ID --head-sha SHA --yes');
} else {
  let coordinator;
  try {
    const root=resolveTechscopeRoot();loadPrithaRuntimeEnv({root});
    const stateRoot=resolvePrithaStateRoot({root});
    coordinator=new ExecutionCoordinator({stateRoot,directory:path.join(stateRoot===root?path.join(root,'.private'):stateRoot,'codex-chat','execution')});
    if(command==='list')console.log(JSON.stringify(coordinator.listIntents({kind:'task-workspace',limit:1000}).map(row=>({id:row.workspace?.id || row.plannedWorkspace?.id,state:row.state,mode:row.workspace?.mode})),null,2));
    else {
      const workspace=coordinator.getIntent(`task-workspace:${value('--id')}`)?.workspace;
      if(!workspace)throw new Error('workspace_not_found');
      if(command==='review')console.log(JSON.stringify(await reviewTaskWorkspace(workspace),null,2));
      else {
        if(!args.includes('--yes'))throw new Error('explicit_apply_required');
        const expectedHead=value('--head-sha');if(!/^[a-f0-9]{40,64}$/.test(expectedHead || ''))throw new Error('expected_head_required');
        let result;
        if(command==='cleanup')result=await cleanupTaskWorkspace({coordinator,workspace,expectedHead});
        else if(command==='apply') {
          const expectedSource=value('--source-sha'),requestId=value('--request-id'),script=value('--check-script');
          if(!/^[a-f0-9]{40,64}$/.test(expectedSource || '') || !requestId || !/^[a-zA-Z0-9:_-]{1,80}$/.test(script || ''))throw new Error('apply_arguments_required');
          result=await applyTaskWorkspace({coordinator,workspace,expectedSource,expectedHead,requestId,verify:async(source,head)=>{
            try {await promisify(execFile)('npm',['run',script],{cwd:source,timeout:900_000,maxBuffer:16*1024*1024,env:{...process.env,TECHSCOPE_ROOT:source}});return {passed:true,command:['npm','run',script],head};}
            catch{return {passed:false,command:['npm','run',script],head};}
          }});
        } else throw new Error('unknown_command');
        console.log(JSON.stringify(result,null,2));
        if(result.state==='applied_checks_failed')process.exitCode=1;
      }
    }
  } catch(error){console.error(JSON.stringify({error:error.code || error.message}));process.exitCode=1;}
  finally{coordinator?.close();}
}
