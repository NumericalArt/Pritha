import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, statSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { RuntimeSettingsStore, mergeLegacyRuntimeSettings, providerSettingsSnapshot, updateStoredProviderSettings } from "../scripts/lib/runtime-settings-store.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-provider-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "private", "runtime-settings.json");
  return { root, file, store: new RuntimeSettingsStore(file, { allowedRoot: root }) };
}
test('optional provider controls can be cleared without resetting other fields or another provider',t=>{
  const {store}=fixture(t);let value=updateStoredProviderSettings(store,{expectedRevision:0,connectorId:'local',preset:{baseUrl:'http://127.0.0.1:1234',modelId:'fixture',thinkingBudget:2048}});
  const before=value.providerPresets.openrouter;
  value=updateStoredProviderSettings(store,{expectedRevision:value.revision,connectorId:'local',preset:{baseUrl:null,thinkingBudget:null}});
  assert.equal(value.providerPresets.local.baseUrl,undefined);assert.equal(value.providerPresets.local.thinkingBudget,undefined);assert.equal(value.providerPresets.local.modelId,'fixture');assert.deepEqual(value.providerPresets.openrouter,before);
});
test("saved native settings migrate lazily and all provider presets survive legacy writes", t => {
  const {file,store} = fixture(t);
  const legacy = { codexModel:"native-pinned", codexReasoningEffort:"high", codexTimeoutMs:45000, codexServiceTier:"fast", voiceModel:"gpt-live-1" };
  store.mutate(() => legacy);
  assert.equal(providerSettingsSnapshot(store.read()).providerPresets.codex.modelId, "native-pinned");
  let snapshot = updateStoredProviderSettings(store, {expectedRevision:1,connectorId:"neuraldeep",preset:{modelId:"nd-pinned",reasoningEffort:"xhigh"},activeConnectorId:"neuraldeep"});
  assert.equal(snapshot.revision,2);
  store.mutate(current => mergeLegacyRuntimeSettings(current, {...legacy,codexModel:"native-next"}));
  snapshot = providerSettingsSnapshot(store.read());
  assert.equal(snapshot.activeConnectorId,"neuraldeep");
  assert.equal(snapshot.providerPresets.neuraldeep.modelId,"nd-pinned");
  assert.equal(snapshot.providerPresets.codex.modelId,"native-next");
  assert.equal(store.read().voiceModel,"gpt-live-1");
  assert.equal(store.read().codexServiceTier,"fast");
  assert.equal(statSync(file).mode & 0o777,0o600);
  assert.throws(() => updateStoredProviderSettings(store,{expectedRevision:2,activeConnectorId:"claude"}),{code:"provider_settings_revision_conflict"});
  assert.equal(providerSettingsSnapshot(store.read()).activeConnectorId,"neuraldeep");
});

test("independent settings workers cannot both overwrite the same revision", async t => {
  const {file,root,store} = fixture(t);
  updateStoredProviderSettings(store,{expectedRevision:0});
  const moduleUrl = new URL("../scripts/lib/runtime-settings-store.mjs",import.meta.url).href;
  const worker = connector => new Promise((resolve,reject) => {
    const code = `import {RuntimeSettingsStore,updateStoredProviderSettings} from ${JSON.stringify(moduleUrl)};
      try { const s=updateStoredProviderSettings(new RuntimeSettingsStore(process.argv[1],{allowedRoot:process.argv[2]}),{expectedRevision:1,connectorId:process.argv[3],preset:{modelId:'concurrent-model'}}); console.log(JSON.stringify({revision:s.revision})); }
      catch(e) {console.log(JSON.stringify({code:e.code}));}`;
    const child=spawn(process.execPath,["--input-type=module","-e",code,file,root,connector],{env:{PATH:process.env.PATH},stdio:["ignore","pipe","pipe"]});
    let out=""; child.stdout.on("data",chunk=>out+=chunk);child.on("error",reject);child.on("close",code=>code?reject(new Error("Settings worker failed")):resolve(JSON.parse(out)));
  });
  const results = await Promise.all([worker("claude"),worker("openrouter")]);
  assert.equal(results.filter(row=>row.revision===2).length,1);
  assert.equal(results.filter(row=>["provider_settings_revision_conflict","runtime_settings_busy"].includes(row.code)).length,1);
  assert.equal(providerSettingsSnapshot(store.read()).revision,2);
});

test("corrupt settings never choose a replacement provider and explicit recovery preserves evidence", t => {
  const {file,store} = fixture(t);
  updateStoredProviderSettings(store,{expectedRevision:0,activeConnectorId:"claude"});
  updateStoredProviderSettings(store,{expectedRevision:1,connectorId:"claude",preset:{modelId:"pinned-model"}});
  const broken = '{"private-canary":"do-not-echo"';writeFileSync(file,broken);
  assert.throws(()=>store.read(),error=>error.code==="runtime_settings_corrupt" && !error.message.includes("canary"));
  assert.throws(()=>updateStoredProviderSettings(store,{expectedRevision:2,activeConnectorId:"codex"}),{code:"runtime_settings_corrupt"});
  assert.equal(readFileSync(file,"utf8"),broken);
  const recovery=store.recoveryStatus();assert.equal(recovery.previousAvailable,true);
  assert.throws(()=>store.restorePrevious("0".repeat(64)),{code:"provider_settings_revision_conflict"});
  const restored=store.restorePrevious(recovery.fingerprint,providerSettingsSnapshot);
  assert.equal(providerSettingsSnapshot(restored).activeConnectorId,"claude");assert.ok(restored.providerSettingsRevision>2);
  assert.equal(readFileSync(`${file}.recovered-${recovery.fingerprint}`,"utf8"),broken);
  assert.throws(()=>updateStoredProviderSettings(store,{expectedRevision:1}),{code:"provider_settings_revision_conflict"});
});

test("settings reject file, directory and lock symlinks without touching their targets", t => {
  const {root,file,store}=fixture(t), target=path.join(root,"canary.json");
  writeFileSync(target,'{"canary":"private"}');mkdirSync(path.dirname(file));
  for(const unsafe of [file,`${file}.lock`,`${file}.previous`]) {
    symlinkSync(target,unsafe);
    assert.throws(()=>store.mutate(()=>({})),{code:"runtime_settings_path_invalid"});
    assert.equal(readFileSync(target,"utf8"),'{"canary":"private"}');rmSync(unsafe);
  }
  rmSync(path.dirname(file),{recursive:true});symlinkSync(root,path.dirname(file));
  assert.throws(()=>store.read(),{code:"runtime_settings_path_invalid"});
  rmSync(path.dirname(file));symlinkSync(path.join(root,"missing"),path.dirname(file));
  assert.throws(()=>store.read(),{code:"runtime_settings_path_invalid"});
});

test("instances and invalid input cannot change one another or persist credentials", t => {
  const first=fixture(t),second=fixture(t);
  updateStoredProviderSettings(first.store,{expectedRevision:0,activeConnectorId:"claude"});
  assert.equal(providerSettingsSnapshot(second.store.read()).activeConnectorId,"codex");
  assert.throws(()=>new RuntimeSettingsStore(first.file,{allowedRoot:second.root}),{code:"runtime_settings_path_invalid"});
  const before=readFileSync(first.file,"utf8");
  assert.throws(()=>updateStoredProviderSettings(first.store,{expectedRevision:1,connectorId:"claude",preset:{apiKey:"SECRET_CANARY"}}),{code:"provider_preset_field_invalid"});
  assert.equal(readFileSync(first.file,"utf8"),before);
  assert.ok(!readdirSync(path.dirname(first.file)).some(name=>name.endsWith(".tmp")));
});
