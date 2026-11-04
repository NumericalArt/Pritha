import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadCatalogModule() {
  const source = readFileSync("interfaces/control-center/src/lib/settings/codex-model-catalog.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-model-transport-test-"));
  const modulePath = path.join(tmp, "codex-model-catalog.mjs");
  writeFileSync(modulePath, output, "utf8");
  return { module: await import(pathToFileURL(modulePath).href), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

test("Codex App turn settings send Ultra with explicit priority or default service tiers", async () => {
  const loaded = await loadCatalogModule();
  try {
    assert.deepEqual(
      loaded.module.codexAppTurnSettings({ model: "gpt-5.6-sol", effort: "ultra", serviceTier: "fast" }),
      { model: "gpt-5.6-sol", effort: "ultra", serviceTier: "priority" },
    );
    assert.deepEqual(
      loaded.module.codexAppTurnSettings({ model: "gpt-5.6-sol", effort: "ultra", serviceTier: "standard" }),
      { model: "gpt-5.6-sol", effort: "ultra", serviceTier: "default" },
    );
  } finally {
    loaded.cleanup();
  }
});

test("Codex CLI config sends Ultra with explicit fast or default service tiers", async () => {
  const loaded = await loadCatalogModule();
  try {
    assert.deepEqual(
      loaded.module.codexCliConfigEntries({ model: "gpt-5.6-sol", effort: "ultra", serviceTier: "fast" }),
      ['model_reasoning_effort="ultra"', 'service_tier="fast"', "features.fast_mode=true"],
    );
    assert.deepEqual(
      loaded.module.codexCliConfigEntries({ model: "gpt-5.6-sol", effort: "ultra", serviceTier: "standard" }),
      ['model_reasoning_effort="ultra"', 'service_tier="default"'],
    );
  } finally {
    loaded.cleanup();
  }
});

test("runtime, API, and App transport consume the shared catalog-backed contract", () => {
  const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
  const routeSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
  const appSource = readFileSync("interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts", "utf8");

  assert.match(runtimeSource, /"gpt-5\.6-sol"/);
  assert.match(runtimeSource, /normalizeCodexReasoningEffortToken\(value, fallback\)/);
  assert.match(runtimeSource, /codexCliConfigEntries\(\{/);
  assert.match(routeSource, /validateCodexSelection/);
  assert.match(routeSource, /error: validation\.error/);
  assert.match(routeSource, /patch\.codexModel = model/);
  assert.match(routeSource, /patch\.codexReasoningEffort = normalizeCodexReasoningEffort\(rawEffort\)/);
  assert.match(routeSource, /patch\.codexServiceTier = serviceTier/);
  assert.match(routeSource, /ultra_requires_inline_execution/);
  assert.ok(routeSource.indexOf("validateCodexSelection(") < routeSource.indexOf("await updatePrithaRuntimeSettings(patch)"));
  assert.match(appSource, /const turnSettings = codexAppTurnSettings/);
  assert.match(appSource, /serviceTier: turnSettings\.serviceTier/);
});

test('native runtime advertises the selected wire tier so configured Codex remains selectable',async()=>{
 const loaded=await loadCatalogModule();
 try {
  const source=readFileSync('interfaces/control-center/src/lib/codex-chat/app-server.ts','utf8');
  const ast=ts.createSourceFile('app-server.ts',source,ts.ScriptTarget.Latest,true);
  const klass=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='CodexRuntimeManager');
  const method=klass.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='status');
  const body=ts.transpileModule('async function readStatus() '+method.body.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  for(const [setting,wire] of [['standard','default'],['fast','priority']]){
   const read=new Function('getPrithaRuntimeSettings','codexAppTurnSettings','sandboxModeForView',body+';return readStatus;')(
    ()=>({codexModel:'gpt-6-astra',codexReasoningEffort:'high',codexServiceTier:setting,codexSandbox:'read-only'}),loaded.module.codexAppTurnSettings,()=> 'read_only');
   const status=await read.call({preferredProvider:()=> 'desktop_bundled',probe:async providerId=>({view:{providerId,availability:'ready',protocol:'app-server'}}),modelInputModalities:async()=>['text','image']});
   assert.equal(status.availability,'ready');assert.equal(status.selected.serviceTierId,wire);
   assert.ok(status.models[0].serviceTierIds.includes(status.selected.serviceTierId));
  }
 }finally{loaded.cleanup();}
});
