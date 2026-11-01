import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,existsSync,readdirSync,chmodSync,symlinkSync,realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {instanceConfig,prepareDistributionInstance,readInstancePointer,applyInstanceEnvironment} from '../scripts/lib/distribution-instance.mjs';
import {resolvePrithaStateRoot,resolvePrithaAgentParent,prithaInstanceConfig} from '../scripts/lib/paths.mjs';
import {loadPrithaRuntimeEnv} from '../scripts/lib/env.mjs';
import {instancePythonPath} from '../scripts/lib/python-runtime.mjs';

function fixture(t){const directory=realpathSync(mkdtempSync(path.join(os.tmpdir(),'pritha-distribution-')));t.after(()=>rmSync(directory,{recursive:true,force:true}));const root=path.join(directory,'Pritha');mkdirSync(root);return {directory,root};}
test('fresh distribution planning is read-only; prepare isolates state and agents without Git or credentials',t=>{
  const f=fixture(t),env={},planned=instanceConfig(f.root,{env,providerProfile:'neuraldeep'});assert.deepEqual(readdirSync(f.root),[]);assert.equal(existsSync(planned.stateRoot),false);
  const saved=prepareDistributionInstance(f.root,{env,providerProfile:'neuraldeep'});assert.deepEqual(saved,planned);assert.deepEqual(readInstancePointer(f.root),saved);
  assert.equal(env.PRITHA_PROVIDER_PROFILE,'neuraldeep');assert.equal(env.PRITHA_ROOT,f.root);assert(!existsSync(path.join(f.root,'.git')));assert(!Object.keys(env).some(key=>/API_KEY|TOKEN|KEYCHAIN|CODEX_HOME/.test(key)));
  const second=path.join(f.directory,'Pritha-copy');mkdirSync(second);const other=prepareDistributionInstance(second,{env:{},providerProfile:'claude'});assert.notEqual(other.id,saved.id);assert.notEqual(other.stateRoot,saved.stateRoot);assert.notEqual(other.agentParent,saved.agentParent);
  assert.deepEqual(prepareDistributionInstance(f.root,{env:{}}),saved);assert.deepEqual(readdirSync(saved.stateRoot),['config']);
  assert.equal(resolvePrithaStateRoot({root:f.root,env:{}}),saved.stateRoot);assert.equal(resolvePrithaAgentParent({root:f.root,env:{}}),saved.agentParent);
  assert.equal(prithaInstanceConfig({root:f.root,env:{}}).instanceId,saved.id);assert.equal(instancePythonPath({root:f.root,env:{}}),path.join(saved.stateRoot,'venv/bin/python'));
  const loaded={};loadPrithaRuntimeEnv({root:f.root,target:loaded,pathOnly:true});assert.equal(loaded.PRITHA_PROVIDER_PROFILE,'neuraldeep');assert.equal(loaded.PRITHA_STATE_ROOT,saved.stateRoot);
});
test('legacy instance stays in place; a profile change never retargets existing state',t=>{
  const f=fixture(t);mkdirSync(path.join(f.root,'.private'));writeFileSync(path.join(f.root,'.private','canary'),'original');
  const first=prepareDistributionInstance(f.root,{env:{}});assert.equal(first.stateRoot,f.root);assert.equal(first.agentParent,path.dirname(f.root));
  const selected=prepareDistributionInstance(f.root,{env:{},providerProfile:'openrouter'});assert.equal(selected.stateRoot,first.stateRoot);assert.equal(selected.providerProfile,'openrouter');
  assert.throws(()=>prepareDistributionInstance(f.root,{env:{PRITHA_STATE_ROOT:path.join(f.directory,'other')}}),{code:'instance_identity_conflict'});assert.equal(readFileSync(path.join(f.root,'.private','canary'),'utf8'),'original');
});
test('copied pointers, insecure files, symlinks and overlapping roots cannot authorize bootstrap',t=>{
  const f=fixture(t),config=prepareDistributionInstance(f.root,{env:{}}),other=path.join(f.directory,'other');mkdirSync(other);
  const pointer=path.join(f.root,'.pritha-instance.json');writeFileSync(path.join(other,'.pritha-instance.json'),readFileSync(pointer),{mode:0o600});assert.throws(()=>readInstancePointer(other),{code:'instance_checkout_mismatch'});
  chmodSync(pointer,0o644);assert.throws(()=>readInstancePointer(f.root),{code:'instance_configuration_unreadable'});chmodSync(pointer,0o600);
  assert.throws(()=>applyInstanceEnvironment(f.root,{...config,agentParent:config.stateRoot},{}),{code:'instance_roots_overlap'});
  rmSync(pointer);symlinkSync(path.join(other,'.pritha-instance.json'),pointer);assert.throws(()=>readInstancePointer(f.root),{code:'instance_configuration_unreadable'});
});
