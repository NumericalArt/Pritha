import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {prithaInstanceConfig,resolvePrithaAgentMemoryRoot,resolvePrithaRoot} from './lib/paths.mjs';
import {loadPrithaRuntimeEnv} from './lib/env.mjs';
import {privateStateDirectory,privateStateFile} from './lib/private-state-path.mjs';
import {atomicWriteFile,withFileLock} from './lib/atomic-file.mjs';
import {agentInstanceKey} from './agents-mother/identity.mjs';

const id='brief-desk-nd',inventory='03_reviews/2026-11-01-brief-desk-adoption.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function regular(file){
  let fd;try{fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.nlink!==1||stat.size>2_000_000)fail('brief_desk_unsafe_file');return fs.readFileSync(fd);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function absent(file){try{fs.lstatSync(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
function directory(file){const stat=fs.lstatSync(file);if(!stat.isDirectory()||stat.isSymbolicLink())fail('brief_desk_unsafe_directory');}
function canonicalFuture(file){const suffix=[];let current=path.resolve(file);while(absent(current)){suffix.unshift(path.basename(current));current=path.dirname(current);}return path.join(fs.realpathSync(current),...suffix);}
function exclusive(file,text){const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}

export function briefDeskPlan(options={}){
  const instance=prithaInstanceConfig(options),root=fs.realpathSync(instance.codeRoot);
  const stateRoot=canonicalFuture(instance.stateRoot),agentParent=canonicalFuture(instance.agentParent);
  const source=path.join(root,'examples',id),memory=resolvePrithaAgentMemoryRoot({...options,root,stateRoot});
  // Read-only planning never creates roots, ports, credentials or runtime state.
  if(!absent(instance.agentParent))directory(instance.agentParent);
  const target=path.join(agentParent,id),instanceKey=agentInstanceKey(stateRoot);
  if(target===root || target.startsWith(root+path.sep))fail('brief_desk_target_inside_pritha');
  const manifest=JSON.parse(regular(path.join(root,inventory)));
  if(manifest.schema!=='pritha-bundled-example-v1'||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>100)fail('brief_desk_invalid_inventory');
  const seen=new Set();
  const files=manifest.files.map(entry=>{
    const relative=entry.path;
    if(typeof relative!=='string'||! /^(project|agent-memory)\/[A-Za-z0-9_./-]+$/.test(relative)||relative.split('/').some(x=>!x||x==='.'||x==='..')||seen.has(relative))fail('brief_desk_invalid_inventory');
    seen.add(relative);
    const file=path.join(source,relative);directory(source);
    let parent=path.dirname(file);while(parent!==source){directory(parent);parent=path.dirname(parent);}
    const bytes=regular(file);if(hash(bytes)!==entry.target_sha256)fail('brief_desk_source_changed');return {path:relative,bytes};
  });
  const contract=path.join(memory,'contracts',`${id}-contract.md`);
  const artifactPaths={
    'agent-memory/contracts/brief-desk-nd.md':contract,
    'agent-memory/outcome-specs/brief-desk-nd.md':path.join(memory,'contracts',`${id}-outcome-spec.md`),
    'agent-memory/profiles/brief-desk-nd.md':path.join(memory,'profiles',`${id}.md`),
  };
  for(const name of Object.keys(artifactPaths))if(!seen.has(name))fail('brief_desk_invalid_inventory');
  if(!seen.has('project/AGENTS.md')||!seen.has('project/server.mjs'))fail('brief_desk_invalid_inventory');
  return {root,source,target,memory,instanceKey,stateRoot,agentParent,
    receipt:path.join(memory,'imports',`${id}.json`),files,artifactPaths,contract,
    bundleHash:hash(JSON.stringify(manifest.files)),sourcePin:manifest.source_pin};
}

export function installBriefDesk(options={}){
  const plan=briefDeskPlan(options);
  if(options.plan)return {ok:true,status:'planned',target:plan.target,artifacts:Object.values(plan.artifactPaths),sourcePin:plan.sourcePin,autostart:false};
  privateStateDirectory(plan.stateRoot,plan.memory);
  const receiptFile=privateStateFile(plan.stateRoot,plan.receipt);
  return withFileLock(receiptFile,()=>{
    if(!absent(receiptFile)){
      const receipt=JSON.parse(regular(receiptFile));
      if(receipt.schema!=='pritha-example-import-v1'||receipt.instanceKey!==plan.instanceKey||receipt.target!==plan.target||receipt.status!=='installed')fail('brief_desk_import_recovery_required');
      directory(plan.target);
      const marker=JSON.parse(regular(path.join(plan.target,'.pritha-bundled-example.json')));
      if(marker.installId!==receipt.installId||marker.instanceKey!==plan.instanceKey)fail('brief_desk_import_identity_changed');
      for(const file of Object.values(plan.artifactPaths))regular(privateStateFile(plan.stateRoot,file));
      return {ok:true,status:'already-installed',target:plan.target,autostart:false};
    }
    if(!absent(plan.target))fail('brief_desk_target_exists');
    for(const file of Object.values(plan.artifactPaths)){
      privateStateFile(plan.stateRoot,file);if(!absent(file))fail('brief_desk_artifact_exists');
    }
    fs.mkdirSync(plan.agentParent,{recursive:true,mode:0o700});directory(plan.agentParent);
    const installId=randomUUID(),stage=path.join(plan.agentParent,`.brief-desk-import-${installId}`);
    fs.mkdirSync(stage,{mode:0o700});let journaled=false;
    try{
      for(const file of plan.files.filter(f=>f.path.startsWith('project/'))){
        const output=path.join(stage,file.path.slice(8));fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});exclusive(output,file.bytes);
      }
      exclusive(path.join(stage,'.pritha-bundled-example.json'),JSON.stringify({schema:'pritha-example-marker-v1',installId,instanceKey:plan.instanceKey}));
      const receipt={schema:'pritha-example-import-v1',installId,instanceKey:plan.instanceKey,target:plan.target,stage,status:'prepared',sourcePin:plan.sourcePin,bundleHash:plan.bundleHash,createdAt:new Date().toISOString(),autostart:false};
      atomicWriteFile(receiptFile,JSON.stringify(receipt,null,2));journaled=true;
      if(!absent(plan.target))fail('brief_desk_target_exists');
      fs.renameSync(stage,plan.target);
      for(const [relative,file] of Object.entries(plan.artifactPaths)){
        const text=plan.files.find(entry=>entry.path===relative).bytes.toString('utf8')
          .replaceAll('{{INSTANCE_KEY}}',plan.instanceKey).replaceAll('{{PROJECT_PATH}}',JSON.stringify(plan.target))
          .replaceAll('{{CONTRACT_PATH}}',JSON.stringify(plan.contract)).replace('privacy: public','privacy: local-private');
        exclusive(file,text);
      }
      atomicWriteFile(receiptFile,JSON.stringify({...receipt,status:'installed',installedAt:new Date().toISOString()},null,2));
      return {ok:true,status:'installed',target:plan.target,autostart:false};
    }finally{
      // After the journal exists, retain evidence on failure. A rerun refuses
      // partial imports instead of replacing files or declaring false success.
      if(!journaled)fs.rmSync(stage,{recursive:true,force:true});
    }
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.includes('--help'))console.log('node scripts/install-brief-desk.mjs --plan | --install\nImports a reviewed example with private draft artifacts; no Git, keys or services.');
    else if(args.length!==1||!['--plan','--install'].includes(args[0]))fail('brief_desk_explicit_action_required');
    else {
      loadPrithaRuntimeEnv({root:resolvePrithaRoot(),pathOnly:true});
      console.log(JSON.stringify(installBriefDesk({plan:args[0]==='--plan'}),null,2));
    }
  }catch(error){console.error(JSON.stringify({ok:false,error:error.code?.startsWith('brief_desk_')?error.code:'brief_desk_import_failed'}));process.exitCode=1;}
}
