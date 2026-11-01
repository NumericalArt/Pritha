import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { providerProcessEnvironment, createProviderTemporaryDirectory } from '../scripts/lib/provider-process-environment.mjs';

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
