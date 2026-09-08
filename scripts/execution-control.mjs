#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmodSync,existsSync,mkdirSync,readFileSync,realpathSync,lstatSync } from 'node:fs';
import path from 'node:path';
import { loadPrithaRuntimeEnv } from './lib/env.mjs';
import { prithaInstanceConfig,resolveTechscopeRoot } from './lib/paths.mjs';
import { ExecutionCoordinator } from './lib/execution-coordinator.mjs';
import { drainExecutions,executionBuildCompatible,executionDirectory,executionLifecycleStatus } from './lib/execution-lifecycle.mjs';
const args=process.argv.slice(2),command=args.shift() || 'status';
const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if(command==='help' || args.includes('--help'))console.log('execution-control.mjs status | plan | drain --yes | activate --yes --expected-build BUILD_ID [--capacity 3] | backup --yes --destination PRIVATE_FILE');
else {
  let db;
  try {
    const root=resolveTechscopeRoot();loadPrithaRuntimeEnv({root});const config=prithaInstanceConfig({root});
    if(['status','plan'].includes(command))console.log(JSON.stringify({readOnly:true,...executionLifecycleStatus(root,config.stateRoot),schemaVersion:1,defaultCapacity:3,requiresActivation:['primary','replica'].includes(config.instanceRole)},null,2));
    else {
      if(!args.includes('--yes'))throw new Error('explicit_action_required');
      if(command==='drain')console.log(JSON.stringify(drainExecutions(root,config.stateRoot)));
      else {
        db=new ExecutionCoordinator({stateRoot:config.stateRoot,directory:executionDirectory(root,config.stateRoot)});
        if(command==='activate') {
          const expected=value('--expected-build');
          const disk=readFileSync(path.join(root,'interfaces/control-center/.next/BUILD_ID'),'utf8').trim();
          if(!expected || expected!==disk || !executionBuildCompatible(root,config.stateRoot))throw new Error('execution_build_unverified');
          const marker=JSON.parse(readFileSync(path.join(root,'interfaces/control-center/.next/pritha-execution-protocol.json'),'utf8'));
          if(marker.version!==1 || marker.buildId!==expected)throw new Error('execution_build_unverified');
          const response=await fetch(`http://127.0.0.1:${config.controlCenterPort}/api/health`,{signal:AbortSignal.timeout(10_000)});
          const health=await response.json();
          if(!response.ok || health.release?.buildId!==expected || health.instance?.id!==config.instanceId)throw new Error('execution_live_build_unverified');
          await promisify(execFile)(process.execPath,['scripts/control-center-health.mjs','--strict','--json'],{cwd:root,timeout:120_000,maxBuffer:1024*1024});
          console.log(JSON.stringify(db.setAdmission(true,Number(value('--capacity') || db.admission().capacity))));
        } else if(command==='backup') {
          if(db.admission().enabled || executionLifecycleStatus(root,config.stateRoot).active)throw new Error('execution_drain_required');
          const destination=path.resolve(value('--destination') || '');
          if(!destination.startsWith(path.resolve(config.stateRoot)+path.sep) || existsSync(destination))throw new Error('private_new_backup_path_required');
          mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
          if(lstatSync(path.dirname(destination)).isSymbolicLink() || !realpathSync(path.dirname(destination)).startsWith(realpathSync(config.stateRoot)+path.sep))throw new Error('private_new_backup_path_required');
          // SQLite includes committed WAL pages in the resulting consistent snapshot.
          db.db.prepare('VACUUM INTO ?').run(destination);chmodSync(destination,0o600);
          console.log(JSON.stringify({backedUp:true,schema:1,scope:'execution-store',otherPrivateArtifacts:'snapshot separately under the release workflow'}));
        } else throw new Error('unknown_command');
      }
    }
  }catch(error){console.error(JSON.stringify({error:error.code || error.message}));process.exitCode=1;}
  finally{db?.close();}
}
