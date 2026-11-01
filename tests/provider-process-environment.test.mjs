import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { providerProcessEnvironment, createProviderTemporaryDirectory } from '../scripts/lib/provider-process-environment.mjs';
import {processSnapshot} from '../scripts/neuraldeep/process-snapshot.mjs';

test('provider CLIs inherit a minimal environment with no foreign secrets or shell injection hooks',()=>{
  const env={PATH:'/usr/bin:/bin',HOME:'/fixture/home',LANG:'C',NODE_OPTIONS:'--require private',NODE_PATH:'/private',BASH_ENV:'/private',OPENAI_API_KEY:'SECRET_CANARY',ANTHROPIC_API_KEY:'SECRET_CANARY',PRITHA_NEURALDEEP_API_KEY:'SECRET_CANARY',OPENROUTER_API_KEY:'SECRET_CANARY',AWS_SECRET_ACCESS_KEY:'SECRET_CANARY',HTTP_PROXY:'http://secret',PRITHA_PROVIDER_PROFILE:'claude',CODEX_HOME:'/foreign',CLAUDE_CONFIG_DIR:'/foreign'};
  for(const provider of ['neuraldeep','claude','openrouter','local']) {
    const result=providerProcessEnvironment({provider,root:'/fixture/code',stateRoot:'/fixture/state',temporary:'/fixture/tmp',codexHome:'/fixture/codex',claudeConfigDir:'/fixture/claude',env});
    assert.doesNotMatch(JSON.stringify(result),/SECRET_CANARY|--require|foreign|HTTP_PROXY|BASH_ENV/);
    assert.equal(result.LC_ALL,'en_US.UTF-8');assert.equal(result.PRITHA_ROOT,result.TECHSCOPE_ROOT);
    assert.equal(result.TMPDIR,'/fixture/tmp');
    assert.equal(result.CODEX_HOME,provider==='claude'?undefined:'/fixture/codex');
    assert.equal(result.CLAUDE_CONFIG_DIR,provider==='claude'?'/fixture/claude':undefined);
  }
});

test('UTF-8 heredoc and process identity survive Cyrillic cwd and a Russian host locale',{skip:process.platform==='win32'},()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-locale-')),cwd=path.join(directory,'Прита с пробелами');mkdirSync(cwd);
  try{const temporary=createProviderTemporaryDirectory({provider:'claude',stateRoot:cwd,temporaryRoot:directory});
    const env=providerProcessEnvironment({provider:'claude',root:cwd,stateRoot:cwd,temporary,env:{PATH:process.env.PATH,HOME:directory,LC_ALL:'ru_RU.UTF-8'}});
    const run=spawnSync('/bin/sh',['-c',"cat > message.txt <<'PRITHA_EOF'\nПрита — 雪\nPRITHA_EOF\n"],{cwd,env,encoding:'utf8',timeout:5000});assert.equal(run.status,0,run.stderr);assert.equal(readFileSync(path.join(cwd,'message.txt'),'utf8'),'Прита — 雪\n');
    assert.equal(statSync(temporary).mode&0o777,0o700);assert.match(temporary,/^[\x20-\x7e]+$/);
    const snapshot=processSnapshot({runProbe:(command,args,options)=>spawnSync(command,args,{...options,env:{...process.env,LANG:'ru_RU.UTF-8',LC_ALL:'ru_RU.UTF-8'},encoding:'utf8'})});assert.ok(snapshot.some(row=>row.pid===process.pid));
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('private ASCII scratch stays unique across attempts and instances with Cyrillic names',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-env-'));
  try {
    const a=createProviderTemporaryDirectory({provider:'neuraldeep',stateRoot:'/Прита/state',temporaryRoot:root});
    const b=createProviderTemporaryDirectory({provider:'neuraldeep',stateRoot:'/Прита/state',temporaryRoot:root});
    const c=createProviderTemporaryDirectory({provider:'neuraldeep',stateRoot:'/Другая/state',temporaryRoot:root});
    assert.match(a,/^[\x20-\x7e]+$/);assert.notEqual(a,b);assert.notEqual(path.dirname(a),path.dirname(c));
    assert.equal(statSync(a).mode & 0o777,0o700);
    assert.throws(()=>createProviderTemporaryDirectory({provider:'local',stateRoot:root,temporaryRoot:root+'/Прита'}),/non_ascii/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
