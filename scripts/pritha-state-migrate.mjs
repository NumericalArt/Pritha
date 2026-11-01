#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadPrithaRuntimeEnv } from './lib/env.mjs';
import { resolvePrithaRoot,resolvePrithaStateRoot,prithaRootEnvironment } from './lib/paths.mjs';
import { resolvePrithaPython } from './lib/python-runtime.mjs';
import { executionLifecycleStatus } from './lib/execution-lifecycle.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fail = code => { throw Object.assign(new Error(code), {code}); };
function args() {
  const tokens=process.argv.slice(2), command=tokens.shift() || 'plan', values={};
  if(!['plan','status','apply','rollback'].includes(command))fail('command_invalid');
  for(let i=0;i<tokens.length;i++){
    const key=tokens[i];
    if(['--json','--yes'].includes(key)){values[key.slice(2)]=true;continue;}
    if(!['--root','--state-root','--memory-source','--setup-source','--plan-hash','--id'].includes(key) || !tokens[i+1] || tokens[i+1].startsWith('--'))fail('arguments_invalid');
    values[key.slice(2)]=tokens[++i];
  }
  for(const key of ['memory-source','setup-source'])if(values[key] && !['legacy','canonical'].includes(values[key]))fail('source_choice_invalid');
  if(['apply','rollback'].includes(command) && !values.yes)fail('explicit_yes_required');
  return {command,values};
}
function offline(root,stateRoot){
  try {
    const execution=executionLifecycleStatus(root,stateRoot);
    if(execution.active>0)return ['active_or_unknown_executions'];
    const probe=spawnSync(process.execPath,[path.join(scriptDirectory,'control-center-runtime.mjs'),'status','--root',root,'--state-root',stateRoot,'--json'],{
      cwd:root,env:{...process.env,...prithaRootEnvironment(root),PRITHA_STATE_ROOT:stateRoot},encoding:'utf8',timeout:10_000,maxBuffer:256*1024,
    });
    const status=JSON.parse(probe.stdout);
    if(status.schema!=='pritha-control-center-runtime-status-v1')return ['runtime_status_unavailable'];
    if(!['not-loaded','not-applicable'].includes(status.service?.queryState))return [status.service?.loaded ? 'managed_runtime_loaded' : 'runtime_status_unavailable'];
    if(status.port?.listener || status.port?.ownerMatch!==true)return ['runtime_listener_or_ownership_unknown'];
    for(const pid of [status.process?.wrapperPid,status.process?.childPid])if(Number.isSafeInteger(pid) && pid>1){try{process.kill(pid,0);return ['runtime_process_present'];}catch(error){if(error.code!=='ESRCH')return ['runtime_process_unknown'];}}
    return [];
  }catch{return ['runtime_status_unavailable'];}
}
const pythonMain=`import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom pritha_state_migration import StateMigration,MigrationError\na=json.load(sys.stdin)\ntry:\n m=StateMigration(a['root'],a['stateRoot'],a['choices'])\n if a['command']=='plan': result=m.plan()\n elif a['command']=='apply': result=m.apply(a.get('planHash'))\n elif a['command']=='rollback': result=m.rollback(a.get('id'))\n else:\n  identifier=a.get('id')\n  if not identifier and m.barrier.exists():\n   from pritha_state_migration import read_json\n   identifier=read_json(m.barrier)['id']\n  if identifier:\n   directory,value=m.manifest(identifier)\n   result={'status':value['status'],'id':identifier,'plan_hash':value['plan']['plan_hash'],'recovery_required':m.barrier.exists()}\n  else: result={'status':'idle','recovery_required':False}\n print(json.dumps(result))\nexcept Exception as error:\n print(json.dumps({'error':getattr(error,'code','migration_unavailable')}))\n sys.exit(2)`;
try {
  const {command,values}=args(),root=resolvePrithaRoot({root:values.root});
  loadPrithaRuntimeEnv({root,pathOnly:true});
  const stateRoot=resolvePrithaStateRoot({root,stateRoot:values['state-root']}),choices={};
  for(const kind of ['memory','setup'])if(values[kind+'-source'])choices[kind]=values[kind+'-source'];
  const blockers=command==='status'?[]:offline(root,stateRoot);
  if(['apply','rollback'].includes(command) && blockers.length)fail(blockers[0]);
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
  Object.assign(env,prithaRootEnvironment(root),{PRITHA_STATE_ROOT:stateRoot});
  const result=spawnSync(resolvePrithaPython({root}),['-c',pythonMain,scriptDirectory],{cwd:root,env,encoding:'utf8',timeout:120_000,killSignal:'SIGKILL',maxBuffer:1024*1024,input:JSON.stringify({command,root,stateRoot,choices,planHash:values['plan-hash'],id:values.id})});
  let payload;try{payload=JSON.parse(result.stdout);}catch{fail('migration_unavailable');}
  if(result.status!==0)fail(/^[a-z_]{1,80}$/.test(payload.error || '')?payload.error:'migration_unavailable');
  if(command==='plan'){payload.runtime_blockers=blockers;payload.ready=blockers.length===0 && payload.blockers.length===0;}
  console.log(JSON.stringify(payload,null,2));
}catch(error){
  console.error(JSON.stringify({ok:false,error:error.code || 'migration_unavailable',message:'State was not silently replaced. Inspect the migration plan/status; resolve the reported blocker, complete recovery or roll back before opening state.'}));
  process.exitCode=2;
}
