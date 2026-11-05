import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync,linkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDeliveryWorktree,captureProtectedTrialInputs} from '../scripts/agents-mother/delivery-worktree.mjs';
import {refreshHeadlessScaffoldTemplate} from '../scripts/agents-mother/delivery-template-refresh.mjs';
import {HEADLESS_ENV_EXAMPLE} from '../scripts/agents-mother/scaffold/headless-cli.mjs';

function fixture(t,{env='AGENT_NAME=example-cli\nLOG_LEVEL=info\n',provider=false,protectEnv=false}={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-template-refresh-')),source=path.join(directory,'source'),runRoot=path.join(directory,'run');
  mkdirSync(path.join(source,'interfaces'),{recursive:true});
  const git=args=>execFileSync('git',args,{cwd:source,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(['init']);git(['config','user.email','tests@pritha.local']);git(['config','user.name','Pritha Tests']);
  writeFileSync(path.join(source,'.env.example'),env);writeFileSync(path.join(source,'implementation.txt'),'builder code\n');
  writeFileSync(path.join(source,'verify.mjs'),'// protected verifier\n');
  writeFileSync(path.join(source,'interfaces/manifest.json'),JSON.stringify({schema:'pritha-cli-interface-v1',generated_by:'Pritha',scaffold_adapter:'headless-cli-v1',agent:'Example CLI'}));
  if(provider){mkdirSync(path.join(source,'runtime'));writeFileSync(path.join(source,'runtime/provider.json'),'{}');}
  git(['add','-A']);git(['commit','-m','host scaffold']);
  const worktree=prepareDeliveryWorktree(source,runRoot,'template-refresh').worktree,file=path.join(worktree,'.env.example');
  const snapshot=captureProtectedTrialInputs({trials:[{kind:'automated',argv:['node',protectEnv?'.env.example':'verify.mjs'],cwd:'.'}]},worktree,runRoot);
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  return {source,runRoot,worktree,file,snapshot,refresh:()=>refreshHeadlessScaffoldTemplate(runRoot)};
}
test('a host template refresh preserves source, builder code, verifier and accounting; exact replay recovers a lost reply',t=>{
  const f=fixture(t),ledger=path.join(f.runRoot,'ledger.json');writeFileSync(ledger,'immutable accounting');
  const result=f.refresh();assert.equal(result.status,'completed');assert.equal(readFileSync(f.file,'utf8'),HEADLESS_ENV_EXAMPLE);
  assert.equal(readFileSync(path.join(f.source,'.env.example'),'utf8'),'AGENT_NAME=example-cli\nLOG_LEVEL=info\n');
  assert.equal(readFileSync(path.join(f.worktree,'implementation.txt'),'utf8'),'builder code\n');assert.equal(readFileSync(path.join(f.worktree,'verify.mjs'),'utf8'),'// protected verifier\n');
  assert.equal(readFileSync(ledger,'utf8'),'immutable accounting');assert.deepEqual(f.refresh(),result);
  const receipt=path.join(f.runRoot,'scaffold-template-refresh.json');writeFileSync(receipt,JSON.stringify({...result,status:'prepared',completedAt:undefined}));
  assert.equal(f.refresh().status,'completed');
});
test('customized examples, linked files, selected providers and protected inputs are never replaced',t=>{
  for(const options of [{env:'CUSTOM_SETTING=keep\n'},{provider:true},{protectEnv:true}]){
    const f=fixture(t,options),before=readFileSync(f.file,'utf8');assert.throws(f.refresh,{code:'scaffold_template_refresh_denied'});assert.equal(readFileSync(f.file,'utf8'),before);
  }
  for(const type of ['custom','symlink','hardlink']){
    const f=fixture(t);rmSync(f.file);
    if(type==='custom')writeFileSync(f.file,'API_KEY=private-value\n');
    else if(type==='symlink')symlinkSync(path.join(f.source,'.env.example'),f.file);
    else linkSync(path.join(f.source,'.env.example'),f.file);
    assert.throws(f.refresh,{code:'scaffold_template_refresh_denied'});
  }
});
test('a prepared receipt recovers before replacement; changed receipts and changed verifiers fail closed',t=>{
  const f=fixture(t),receipt=path.join(f.runRoot,'scaffold-template-refresh.json'),before=readFileSync(f.file,'utf8');
  const completed=f.refresh();writeFileSync(receipt,JSON.stringify({...completed,status:'prepared',completedAt:undefined}));writeFileSync(f.file,before);
  assert.equal(f.refresh().status,'completed');
  writeFileSync(receipt,JSON.stringify({...completed,baseRevision:'a'.repeat(40)}));assert.throws(f.refresh,{code:'scaffold_template_refresh_denied'});
  const other=fixture(t);writeFileSync(path.join(other.worktree,'verify.mjs'),'changed verifier');assert.throws(other.refresh,{code:'scaffold_template_refresh_denied'});
});
