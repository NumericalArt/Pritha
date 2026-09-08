import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { ExecutionCoordinator } from './execution-coordinator.mjs';
const require=createRequire(import.meta.url);
export function executionDirectory(root,stateRoot) {return path.join(stateRoot===root?path.join(root,'.private'):stateRoot,'codex-chat','execution');}
export function executionLifecycleStatus(root,stateRoot) {
  const file=path.join(executionDirectory(root,stateRoot),'execution.sqlite');
  if(!existsSync(file))return {exists:false,floor:0,enabled:false,active:0,schema:null};
  const realRoot=realpathSync(stateRoot),realFile=realpathSync(file);
  if(lstatSync(file).isSymbolicLink() || !realFile.startsWith(realRoot+path.sep))throw new Error('execution_store_invalid');
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file,{readOnly:true});
  try {
    const meta=Object.fromEntries(db.prepare('SELECT key,value FROM execution_meta').all().map(row=>[row.key,row.value]));
    if(meta.schema!=='1')throw new Error('execution_schema_unsupported');
    return {exists:true,schema:meta.schema,floor:Number(meta.runtime_floor || 0),enabled:meta.admission==='enabled',active:Number(db.prepare("SELECT COUNT(DISTINCT owner) AS count FROM execution_claims WHERE kind!='metadata'").get().count)};
  }finally{db.close();}
}
export function drainExecutions(root,stateRoot) {
  if(!executionLifecycleStatus(root,stateRoot).exists)return {active:0,legacy:true};
  const db=new ExecutionCoordinator({stateRoot,directory:executionDirectory(root,stateRoot)});
  try {db.setAdmission(false);return {...executionLifecycleStatus(root,stateRoot),legacy:false};}
  finally{db.close();}
}
export function executionBuildCompatible(root,stateRoot,dist='.next') {
  const status=executionLifecycleStatus(root,stateRoot);
  if(status.floor===0)return true;
  try {
    const directory=path.join(root,'interfaces','control-center',dist),marker=JSON.parse(readFileSync(path.join(directory,'pritha-execution-protocol.json'),'utf8'));
    return marker.version>=status.floor && marker.buildId===readFileSync(path.join(directory,'BUILD_ID'),'utf8').trim();
  }catch{return false;}
}
