import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as storage from '../scripts/lib/runtime-settings-store.mjs';
import * as policy from '../scripts/lib/provider-profile.mjs';

function fixture(t){
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-default-activation-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'runtime.json'),store=new storage.RuntimeSettingsStore(file,{allowedRoot:root});
  storage.updateStoredProviderSettings(store,{expectedRevision:0});
  const probes=[],state={status:'ready',beforeReturn:()=>{}};
  const modules={
    'node:path':path,
    '../../../../../scripts/lib/runtime-settings-store.mjs':storage,
    './provider-profile':policy,
    '../pritha-paths':{resolvePrithaRoot:()=>root,resolvePrithaStateRoot:()=>root,resolvePrithaStatePath:()=>file,resolvePrithaSetupFile:()=>path.join(root,'setup.json'),PrithaStateFileError:class extends Error{}},
    '../realtime/pritha-runtime':{getPrithaRuntimeSettings:()=>({})},
    './codex-model-catalog-server':{getCodexModelCatalog:()=>{throw new Error('Activation does not edit native presets');}},
    './codex-model-catalog':{},
    '../codex-chat/gateway':{getCodexChatGateway:()=>({async providerSettingsSnapshot(connectorId){probes.push(connectorId);await state.beforeReturn();return {connectorId,status:state.status};}})},
  };
  const module={exports:{}},filePath='interfaces/control-center/src/lib/settings/provider-settings-server.ts';
  const compiled=ts.transpileModule(readFileSync(filePath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const require=createRequire(import.meta.url);
  new Function('require','module','exports','process',compiled)(id=>Object.hasOwn(modules,id)?modules[id]:require(id),module,module.exports,{env:{}});
  return {api:module.exports,store,state,probes};
}
for(const status of ['not-configured','configured','pending-auth','unavailable','rate-limited','billing-required','error'])test(`default activation rejects ${status} without changing saved settings`,async t=>{
  const f=fixture(t),before=f.store.read();f.state.status=status;
  await assert.rejects(f.api.updateProviderSettings({expectedRevision:1,activeConnectorId:'claude'}),{code:'provider_default_not_ready'});
  assert.deepEqual(f.store.read(),before);assert.deepEqual(f.probes,['claude']);
});
test('a checked saved provider becomes the common default and preserves all presets',async t=>{
  const f=fixture(t),before=f.api.getProviderSettings();
  const after=await f.api.updateProviderSettings({expectedRevision:before.revision,activeConnectorId:'claude'});
  assert.equal(after.activeConnectorId,'claude');assert.equal(after.revision,before.revision+1);
  assert.deepEqual(after.providerPresets,before.providerPresets);assert.deepEqual(f.probes,['claude']);
});
test('activation checks only a saved preset and refuses combined edits before any probe',async t=>{
  const f=fixture(t),before=f.store.read();
  await assert.rejects(f.api.updateProviderSettings({expectedRevision:1,activeConnectorId:'claude',connectorId:'claude',preset:{modelId:'unchecked'}}),{code:'provider_default_requires_saved_preset'});
  assert.deepEqual(f.store.read(),before);assert.deepEqual(f.probes,[]);
});
test('a concurrent edit while readiness is checked cannot activate an obsolete preset',async t=>{
  const f=fixture(t);f.state.beforeReturn=()=>storage.updateStoredProviderSettings(f.store,{expectedRevision:1,connectorId:'claude',preset:{modelId:'changed-elsewhere'}});
  await assert.rejects(f.api.updateProviderSettings({expectedRevision:1,activeConnectorId:'claude'}),{code:'provider_settings_revision_conflict'});
  const after=f.api.getProviderSettings();assert.equal(after.activeConnectorId,'codex');assert.equal(after.providerPresets.claude.modelId,'changed-elsewhere');
});
test('saving incomplete non-default presets remains possible without selecting them',async t=>{
  const f=fixture(t),after=await f.api.updateProviderSettings({expectedRevision:1,connectorId:'openrouter',preset:{modelId:''}});
  assert.equal(after.activeConnectorId,'codex');assert.equal(after.providerPresets.openrouter.modelId,'');assert.deepEqual(f.probes,[]);
});
for(const connectorId of policy.PROVIDER_CONNECTOR_IDS)test(`${connectorId}: only its checked saved model can be committed`,async t=>{
  const f=fixture(t);storage.updateStoredProviderSettings(f.store,{expectedRevision:1,connectorId,preset:{modelId:'ready-fixture'}});
  const after=await f.api.updateProviderSettings({expectedRevision:2,activeConnectorId:connectorId});
  assert.equal(after.activeConnectorId,connectorId);assert.equal(after.providerPresets[connectorId].modelId,'ready-fixture');assert.deepEqual(f.probes,[connectorId]);
});
test('an empty model or a failed readiness probe cannot activate a provider or leak diagnostics',async t=>{
  const f=fixture(t),before=f.store.read();
  await assert.rejects(f.api.updateProviderSettings({expectedRevision:1,activeConnectorId:'openrouter'}),{code:'provider_default_not_ready'});assert.deepEqual(f.probes,[]);
  f.state.beforeReturn=()=>{throw new Error('PRIVATE_PROBE_DIAGNOSTIC');};
  await assert.rejects(f.api.updateProviderSettings({expectedRevision:1,activeConnectorId:'claude'}),e=>e.code==='provider_default_not_ready' && !e.message.includes('PRIVATE_'));
  assert.deepEqual(f.store.read(),before);
});
