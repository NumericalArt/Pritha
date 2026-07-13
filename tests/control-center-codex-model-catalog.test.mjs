import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadCatalogModule() {
  const sourcePath = "interfaces/control-center/src/lib/settings/codex-model-catalog.ts";
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-model-catalog-test-"));
  const modulePath = path.join(tmp, "codex-model-catalog.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("fallback catalog exposes Sol, Terra, Luna, all requested efforts, and model-specific Fast", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    const byId = new Map(mod.FALLBACK_CODEX_MODELS.map((model) => [model.id, model]));
    assert.equal(mod.DEFAULT_CODEX_SELECTION.model, "gpt-5.6-sol");
    assert.equal(mod.DEFAULT_CODEX_SELECTION.effort, "medium");
    assert.equal(mod.DEFAULT_CODEX_SELECTION.serviceTier, "standard");
    assert.deepEqual(byId.get("gpt-5.6-sol").supportedReasoningEfforts.map((item) => item.id), ["low", "medium", "high", "xhigh", "max", "ultra"]);
    assert.deepEqual(byId.get("gpt-5.6-terra").supportedReasoningEfforts.map((item) => item.id), ["low", "medium", "high", "xhigh", "max", "ultra"]);
    assert.deepEqual(byId.get("gpt-5.6-luna").supportedReasoningEfforts.map((item) => item.id), ["low", "medium", "high", "xhigh", "max"]);
    assert.equal(mod.codexReasoningEffortLabel("xhigh"), "Extra High");
    assert.equal(mod.codexReasoningEffortLabel("ultra"), "Ultra");
    assert.equal(mod.codexModelSupportsFast(byId.get("gpt-5.6-luna")), true);
    assert.equal(mod.codexModelSupportsFast(byId.get("gpt-5.4-mini")), false);
  } finally {
    loaded.cleanup();
  }
});

test("model/list normalization filters hidden or malformed entries and keeps advertised capabilities", async () => {
  const loaded = await loadCatalogModule();
  try {
    const models = loaded.module.normalizeCodexModelList({
      data: [
        {
          id: "gpt-future",
          displayName: "GPT Future",
          description: "Future model",
          hidden: false,
          supportedReasoningEfforts: [
            { reasoningEffort: "medium", description: "Balanced" },
            { reasoningEffort: "super_deep", description: "Future effort" },
            { reasoningEffort: "medium", description: "Duplicate" },
          ],
          defaultReasoningEffort: "super_deep",
          serviceTiers: [{ id: "priority", name: "Fast", description: "Faster" }],
          isDefault: true,
        },
        {
          id: "hidden-model",
          hidden: true,
          supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
        },
        {
          id: "missing-hidden-flag",
          supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
          defaultReasoningEffort: "medium",
          serviceTiers: [],
        },
        {
          id: "string-hidden-flag",
          hidden: "false",
          supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
          defaultReasoningEffort: "medium",
          serviceTiers: [],
        },
        { id: "bad model id", hidden: false, supportedReasoningEfforts: [{ reasoningEffort: "medium" }] },
        { id: "missing-efforts", hidden: false, supportedReasoningEfforts: [] },
      ],
    });
    assert.equal(models.length, 1);
    assert.equal(models[0].id, "gpt-future");
    assert.equal(models[0].defaultReasoningEffort, "super_deep");
    assert.deepEqual(models[0].supportedReasoningEfforts.map((item) => item.id), ["medium", "super_deep"]);
    assert.deepEqual(models[0].serviceTiers.map((item) => item.id), ["priority"]);
  } finally {
    loaded.cleanup();
  }
});

test("catalog loader caches live and fallback results for the configured TTL", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    let now = 0;
    let liveCalls = 0;
    const livePayload = {
      data: [{
        id: "gpt-live",
        displayName: "GPT Live",
        hidden: false,
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
        defaultReasoningEffort: "medium",
        serviceTiers: [],
        isDefault: true,
      }],
    };
    const loadLive = mod.createCodexModelCatalogLoader(async () => {
      liveCalls += 1;
      return livePayload;
    }, { ttlMs: 100, now: () => now });

    const [first, concurrent] = await Promise.all([loadLive(), loadLive()]);
    assert.equal(first.source, "app-server");
    assert.equal(concurrent.source, "app-server");
    assert.equal(liveCalls, 1);
    now = 99;
    assert.equal((await loadLive()).refreshedAt, first.refreshedAt);
    assert.equal(liveCalls, 1);
    now = 101;
    await loadLive();
    assert.equal(liveCalls, 2);

    let fallbackCalls = 0;
    const loadFallback = mod.createCodexModelCatalogLoader(async () => {
      fallbackCalls += 1;
      throw new Error("offline");
    }, { ttlMs: 100, now: () => 10 });
    const fallback = await loadFallback();
    assert.equal(fallback.source, "fallback");
    assert.match(fallback.warning, /fallback/i);
    await loadFallback();
    assert.equal(fallbackCalls, 1);
  } finally {
    loaded.cleanup();
  }
});

test("capability reconciliation chooses the closest lower effort and disables unsupported Fast", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    const byId = new Map(mod.FALLBACK_CODEX_MODELS.map((model) => [model.id, model]));
    const luna = mod.reconcileCodexSelectionForModel(byId.get("gpt-5.6-luna"), {
      model: "gpt-5.6-sol",
      effort: "ultra",
      serviceTier: "fast",
    });
    assert.equal(luna.effort, "max");
    assert.equal(luna.serviceTier, "fast");

    const legacy = mod.reconcileCodexSelectionForModel(byId.get("gpt-5.5"), {
      model: "gpt-5.6-luna",
      effort: "max",
      serviceTier: "fast",
    });
    assert.equal(legacy.effort, "xhigh");

    const mini = mod.reconcileCodexSelectionForModel(byId.get("gpt-5.4-mini"), {
      model: "gpt-5.5",
      effort: "xhigh",
      serviceTier: "fast",
    });
    assert.equal(mini.effort, "xhigh");
    assert.equal(mini.serviceTier, "standard");
  } finally {
    loaded.cleanup();
  }
});

test("selection validation rejects unsupported combinations but preserves an unchanged custom model", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    assert.equal(mod.validateCodexSelection({ model: "gpt-5.6-sol", effort: "ultra", serviceTier: "fast" }, mod.FALLBACK_CODEX_MODELS).ok, true);
    assert.equal(mod.validateCodexSelection({ model: "gpt-5.6-luna", effort: "ultra", serviceTier: "fast" }, mod.FALLBACK_CODEX_MODELS).error, "unsupported_codex_reasoning_effort");
    assert.equal(mod.validateCodexSelection({ model: "gpt-5.4-mini", effort: "xhigh", serviceTier: "fast" }, mod.FALLBACK_CODEX_MODELS).error, "unsupported_codex_service_tier");
    assert.equal(
      mod.validateCodexSelection({ model: "gpt-5.6-sol", effort: "medium", serviceTier: "priority" }, mod.FALLBACK_CODEX_MODELS).error,
      "invalid_codex_service_tier",
    );

    const custom = { model: "company-custom-model", effort: "custom_effort", serviceTier: "fast" };
    assert.deepEqual(mod.validateCodexSelection(custom, mod.FALLBACK_CODEX_MODELS, custom), { ok: true, custom: true });
    assert.equal(
      mod.validateCodexSelection({ ...custom, effort: "medium" }, mod.FALLBACK_CODEX_MODELS, custom).error,
      "unavailable_codex_model",
    );
    assert.equal(mod.normalizeCodexReasoningEffortToken("very_high"), "xhigh");
  } finally {
    loaded.cleanup();
  }
});

test("catalog server uses model/list with bounded timeout/cache and never reads the undocumented cache file", () => {
  const serverSource = readFileSync("interfaces/control-center/src/lib/settings/codex-model-catalog-server.ts", "utf8");
  const routeSource = readFileSync("interfaces/control-center/src/app/api/settings/codex-models/route.ts", "utf8");
  assert.match(serverSource, /CODEX_MODEL_LIST_TIMEOUT_MS = 3_000/);
  assert.match(serverSource, /CODEX_MODEL_CATALOG_TTL_MS = 5 \* 60_000/);
  assert.match(serverSource, /request\("model\/list", \{ limit: 100, includeHidden: false \}\)/);
  assert.match(serverSource, /method: "initialized"/);
  assert.match(serverSource, /child\.stdin\.on\("error"/);
  assert.match(serverSource, /child\.kill\("SIGKILL"\)/);
  assert.doesNotMatch(serverSource, /models_cache\.json/);
  assert.match(routeSource, /getCodexModelCatalog/);
  assert.match(routeSource, /Cache-Control.*no-store/);
});
