import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_CONNECTOR_IDS, assertProviderBinding, connectorForBootstrapProfile, normalizeLocalProviderUrl,
  normalizeProviderSettings, readyProviderConnectors, resolveProviderSelection, resolveVoiceEngine, updateProviderPreset } from "../scripts/lib/provider-profile.mjs";

test("provider precedence is strict and bootstrap local still selects native Codex", () => {
  assert.equal(connectorForBootstrapProfile("local"), "codex");
  assert.equal(connectorForBootstrapProfile("local-model"), "local");
  assert.equal(resolveProviderSelection().connectorId, "codex");
  assert.equal(resolveProviderSelection({setup:{providerProfile:"neuraldeep"}}).source, "setup");
  const options = { env: {PRITHA_PROVIDER_PROFILE:"claude"}, instance:{providerProfile:"neuraldeep"}, setup:{providerProfile:"codex-native"} };
  assert.equal(resolveProviderSelection(options).connectorId, "claude");
  assert.equal(resolveProviderSelection({...options,connector:"openrouter"}).connectorId,"openrouter");
  for (const bad of ["", "unknown-secret", null, [], {}]) {
    assert.throws(() => resolveProviderSelection({env:{PRITHA_PROVIDER_PROFILE:bad}}), {code:"provider_profile_invalid"});
  }
});

test("all five presets survive switches and edits without mutating one another", () => {
  const legacy={codexModel:"pinned-native-model",codexReasoningEffort:"high",codexTimeoutMs:120_000};
  let settings=normalizeProviderSettings({}, {legacy});
  assert.equal(settings.providerPresets.codex.modelId,legacy.codexModel);
  const initial=structuredClone(settings);
  for(const [index,id] of PROVIDER_CONNECTOR_IDS.entries()) {
    settings=updateProviderPreset(settings,id,{modelId:`vendor/model-${id}`,timeoutMs:60_000+index*1000,reasoningEffort:"low"});
    settings=normalizeProviderSettings({...settings,activeConnectorId:id});
  }
  for(const [index,id] of PROVIDER_CONNECTOR_IDS.entries()) {
    assert.deepEqual(settings.providerPresets[id], {modelId:`vendor/model-${id}`,timeoutMs:60_000+index*1000,reasoningEffort:"low"});
  }
  assert.equal(initial.providerPresets.codex.modelId,legacy.codexModel);
  assert.deepEqual(normalizeProviderSettings(JSON.parse(JSON.stringify(settings))),settings);
  assert.throws(()=>updateProviderPreset(settings,"openrouter",{apiKey:"SYNTHETIC_SECRET"}),{code:"provider_preset_field_invalid"});
  assert.throws(()=>normalizeProviderSettings({version:2}),{code:"provider_settings_version_invalid"});
  assert.throws(()=>updateProviderPreset(settings,"codex",{timeoutMs:NaN}),{code:"provider_timeout_invalid"});
});

test("quick selector requires ready, and wrong-provider resume fails closed", () => {
  assert.deepEqual(readyProviderConnectors({codex:{status:"ready"},claude:{status:"configured"},neuraldeep:{status:"pending-auth"},local:{status:"ready"}}),["codex","local"]);
  const saved={connectorId:"claude",modelId:"pinned-model",sessionId:"session-1"};
  assert.deepEqual(assertProviderBinding(saved,{connectorId:"claude"}),saved);
  for(const request of [{connectorId:"codex"},{connectorId:"claude",sessionId:"session-2"},{connectorId:"claude",modelId:"new-model"}]) {
    assert.throws(()=>assertProviderBinding(saved,request),{code:"runtime_identity_mismatch"});
  }
});

test("Local endpoints reject credentials, redirects-by-URL, DNS names and nonliteral hosts", () => {
  assert.equal(normalizeLocalProviderUrl("http://127.0.0.1:11434"),"http://127.0.0.1:11434/v1");
  assert.equal(normalizeLocalProviderUrl("http://[::1]:1234/v1/"),"http://[::1]:1234/v1");
  for(const url of ["https://example.com/v1","http://localhost:1234","http://127.1:1234","http://2130706433:1234","http://127.0.0.1:99999","http://key@127.0.0.1","http://127.0.0.1/v1?redirect=cloud","http://127.0.0.1/v1#cloud","file:///v1","http://127.0.0.1/other"]) {
    assert.throws(()=>normalizeLocalProviderUrl(url),{code:"local_endpoint_invalid"});
  }
});

test("voice defaults follow native/ND while offline and Local auto cannot leak to cloud", () => {
  const configured={openai:true,neuraldeep:true};
  assert.equal(resolveVoiceEngine({connectorId:"codex",configured}).engine,"openai");
  assert.equal(resolveVoiceEngine({connectorId:"neuraldeep",configured}).engine,"neuraldeep");
  assert.equal(resolveVoiceEngine({connectorId:"codex",configured:{neuraldeep:true}}).engine,null);
  for(const connectorId of ["claude","openrouter"]) assert.equal(resolveVoiceEngine({connectorId,configured:{neuraldeep:true}}).engine,"neuraldeep");
  assert.deepEqual(resolveVoiceEngine({connectorId:"local",configured}),{engine:null,reason:"offline"});
  for(const engine of ['openai','neuraldeep'])assert.throws(()=>resolveVoiceEngine({connectorId:'local',configured,engine}),{code:'voice_network_disallowed'});
  for(const connectorId of PROVIDER_CONNECTOR_IDS) {
    assert.equal(resolveVoiceEngine({connectorId,configured,offline:true}).engine,null);
    assert.throws(()=>resolveVoiceEngine({connectorId,configured,offline:true,engine:"openai"}),{code:"voice_network_disallowed"});
  }
});
