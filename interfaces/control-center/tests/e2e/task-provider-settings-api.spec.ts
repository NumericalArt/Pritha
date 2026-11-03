import { expect, test } from "@playwright/test";

test("real settings routes preserve presets across workers and legacy Voice updates", async ({ request }) => {
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe("1");
  const get = async () => {
    const response = await request.get("/api/task-runtime/settings");
    expect(response.status()).toBe(200);
    return (await response.json()).settings;
  };
  let settings = await get();
  expect(Object.keys(settings.providerPresets)).toEqual(["codex", "neuraldeep", "claude", "openrouter", "local"]);
  const initialNative = settings.providerPresets.codex;
  const saved = await request.post("/api/task-runtime/settings", { data: { expectedRevision: settings.revision, connectorId: "openrouter", preset: { modelId: "fixture/model", reasoningEffort: "low", timeoutMs: 45000 } } });
  expect(saved.status()).toBe(200); settings = (await saved.json()).settings;
  const results = await Promise.all(["claude", "neuraldeep"].map(connectorId => request.post("/api/task-runtime/settings", { data: { expectedRevision: settings.revision, connectorId, preset:{timeoutMs:60000} } })));
  expect(results.map(response => response.status()).sort()).toEqual([200, 409]);
  settings = await get();
  expect(settings.providerPresets.openrouter).toEqual({ modelId: "fixture/model", reasoningEffort: "low", timeoutMs: 45000 });
  expect(settings.providerPresets.codex).toEqual(initialNative);
  const blocked=await request.post('/api/task-runtime/settings',{data:{expectedRevision:settings.revision,activeConnectorId:'openrouter'}});
  expect(blocked.status()).toBe(400);expect((await blocked.json()).error).toBe('provider_default_not_ready');expect(await get()).toEqual(settings);
  const combined=await request.post('/api/task-runtime/settings',{data:{expectedRevision:settings.revision,activeConnectorId:'openrouter',connectorId:'openrouter',preset:{modelId:'unchecked'}}});
  expect(combined.status()).toBe(400);expect((await combined.json()).error).toBe('provider_default_requires_saved_preset');expect(await get()).toEqual(settings);
  const oldRevision = settings.revision;
  const legacy = await request.post("/api/realtime/runtime-settings", { data: { voiceModel: "gpt-live-1" } });
  expect(legacy.status()).toBe(200);
  expect((await legacy.json()).settings.voiceModel).toBe("gpt-live-1");
  const after = await get();
  expect(after.revision).toBeGreaterThan(oldRevision);
  expect(after.providerPresets).toEqual(settings.providerPresets);
  expect(after.activeConnectorId).toBe(settings.activeConnectorId);
  const rejected = await request.post("/api/task-runtime/settings", { data: { expectedRevision: after.revision, connectorId: "openrouter", preset: { apiKey: "SECRET_CANARY_MUST_NOT_ECHO" } } });
  expect(rejected.status()).toBe(400);
  expect(await rejected.text()).not.toContain("SECRET_CANARY");
  expect(await get()).toEqual(after);
});
