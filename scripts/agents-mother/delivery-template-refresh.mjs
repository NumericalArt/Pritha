import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {atomicWriteFile,atomicCompareAndSwapFile} from '../lib/atomic-file.mjs';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {slug} from '../lib/slug.mjs';
import {HEADLESS_ENV_EXAMPLE} from './scaffold/headless-cli.mjs';
import {planDeliveryWorktreeCleanup,readDeliveryWorktree,verifyProtectedTrialInputs} from './delivery-worktree.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Object.assign(new Error('Only an unchanged, host-generated CLI environment example can be refreshed.'),{code:'scaffold_template_refresh_denied'});};

// Called only under the delivery execution lease after validating the accepted
// Outcome/plan. Never dispatches a model, resets a budget or edits user code.
export function refreshHeadlessScaffoldTemplate(runRoot){
  const binding=readDeliveryWorktree(runRoot);
  if(!binding || binding.cleanup_status!=='active' || !/^[a-f0-9]{40}$/.test(binding.base_revision || '') || binding.verified_checkpoint)fail();
  planDeliveryWorktreeCleanup(runRoot); // Validate canonical registration, branch and both roots; read-only.
  const baseline=file=>{
    try{return execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false','show',binding.base_revision+':'+file],{cwd:binding.source_project,encoding:'utf8',maxBuffer:65536,stdio:['ignore','pipe','pipe']});}catch{fail();}
  };
  let manifest;try{manifest=JSON.parse(baseline('interfaces/manifest.json'));}catch{fail();}
  if(manifest.schema!=='pritha-cli-interface-v1' || manifest.generated_by!=='Pritha' || manifest.scaffold_adapter!=='headless-cli-v1' || typeof manifest.agent!=='string'
      || existsSync(path.join(binding.worktree,'runtime','provider.json')))fail();
  const before=baseline('.env.example'),after=HEADLESS_ENV_EXAMPLE;
  if(before!==`AGENT_NAME=${slug(manifest.agent)}\nLOG_LEVEL=info\n` && before!==after)fail();
  const file=path.join(binding.worktree,'.env.example'),stat=lstatSync(file);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1)fail();
  const read=target=>readBoundedRegularFile(target,{allowedRoots:[runRoot],maxBytes:65536}).text;
  const snapshotFile=path.join(runRoot,'protected-trial-inputs.json');
  if(!existsSync(snapshotFile))fail();
  {
    let snapshot;try{snapshot=JSON.parse(read(snapshotFile));}catch{fail();}
    if(snapshot.entries?.some(entry=>entry.path==='.env.example') || !verifyProtectedTrialInputs(snapshot,binding.worktree).ok)fail();
  }
  const current=read(file),receiptFile=path.join(runRoot,'scaffold-template-refresh.json');
  const identity={schema:'pritha-scaffold-template-refresh-v1',runId:binding.run_id,baseRevision:binding.base_revision,path:'.env.example',beforeSha256:hash(before),afterSha256:hash(after)};
  let receipt=null;if(existsSync(receiptFile)){
    try{receipt=JSON.parse(read(receiptFile));}catch{fail();}
    if(Object.entries(identity).some(([key,value])=>receipt[key]!==value) || !['prepared','completed'].includes(receipt.status))fail();
  }
  if(current!==before && !(receipt && current===after) || receipt?.status==='completed' && current!==after)fail();
  if(before===after)return {...identity,status:'unchanged'};
  // Persist intent before replacement so a lost response can be recovered from
  // exact before/after bytes, without touching any other scaffold or verifier.
  if(!receipt){receipt={...identity,status:'prepared',createdAt:new Date().toISOString()};atomicWriteFile(receiptFile,JSON.stringify(receipt));}
  if(current===before)atomicCompareAndSwapFile(file,before,after);
  const completed={...receipt,status:'completed',completedAt:receipt.completedAt || new Date().toISOString()};
  atomicWriteFile(receiptFile,JSON.stringify(completed));
  return completed;
}
