import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const fixtureHome = path.join(os.tmpdir(), "pritha-codex-home-fixture");

async function loadBinaryModule() {
  const source = readFileSync("interfaces/control-center/src/lib/settings/codex-binaries.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-binary-test-"));
  const modulePath = path.join(tmp, "codex-binaries.mjs");
  writeFileSync(modulePath, output, "utf8");
  return { module: await import(pathToFileURL(modulePath).href), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

test("Voice Codex App and emergency CLI resolve to separate binaries", async () => {
  const loaded = await loadBinaryModule();
  try {
    const homeDir = fixtureHome;
    const desktop = "/Applications/ChatGPT.app/Contents/Resources/codex";
    const cli = `${homeDir}/.local/bin/codex`;
    const existing = new Set([desktop, cli]);
    const options = { env: {}, homeDir, existsSync: (candidate) => existing.has(candidate) };

    assert.equal(loaded.module.resolveCodexAppBinary(undefined, options), desktop);
    assert.equal(loaded.module.resolveCodexCliBinary(undefined, options), cli);
    assert.equal(loaded.module.isDesktopCodexBinary(desktop), true);
    assert.equal(loaded.module.isDesktopCodexBinary(cli), false);
  } finally {
    loaded.cleanup();
  }
});

test("generic CODEX_BIN cannot silently turn the primary App route into CLI", async () => {
  const loaded = await loadBinaryModule();
  try {
    const desktop = "/Applications/ChatGPT.app/Contents/Resources/codex";
    const cli = "/custom/bin/codex";
    const options = { env: { CODEX_BIN: cli }, homeDir: fixtureHome, existsSync: (candidate) => candidate === desktop };

    assert.equal(loaded.module.resolveCodexAppBinary(undefined, options), desktop);
    assert.equal(loaded.module.resolveCodexCliBinary(undefined, options), cli);
    assert.equal(loaded.module.resolveCodexAppBinary("/explicit/Codex.app/Contents/Resources/codex", options), "/explicit/Codex.app/Contents/Resources/codex");

    const fallbackCli = path.join(fixtureHome, ".local", "bin", "codex");
    const desktopLegacy = { ...options, env: { CODEX_BIN: desktop }, existsSync: (candidate) => candidate === desktop || candidate === fallbackCli };
    assert.equal(loaded.module.resolveCodexAppBinary(undefined, desktopLegacy), desktop);
    assert.equal(loaded.module.resolveCodexCliBinary(undefined, desktopLegacy), fallbackCli);
  } finally {
    loaded.cleanup();
  }
});

test("missing desktop App leaves the App route unavailable and preserves CLI fallback", async () => {
  const loaded = await loadBinaryModule();
  try {
    const options = { env: {}, homeDir: fixtureHome, existsSync: () => false };
    assert.equal(loaded.module.resolveCodexAppBinary(undefined, options), "");
    assert.equal(loaded.module.resolveCodexCliBinary(undefined, options), "codex");
  } finally {
    loaded.cleanup();
  }
});

test("Voice runtime uses desktop App first and standalone CLI only for fallback execution", () => {
  const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
  const appClientSource = readFileSync("interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts", "utf8");
  const catalogSource = readFileSync("interfaces/control-center/src/lib/settings/codex-model-catalog-server.ts", "utf8");

  assert.match(runtimeSource, /codexBin: codexAppBin\(\)/);
  assert.match(runtimeSource, /spawn\(codexCliBin\(\), args/);
  assert.match(runtimeSource, /requestedTransport === "codex-app" && app\.available/);
  assert.match(appClientSource, /resolveCodexAppBinary/);
  assert.match(catalogSource, /resolveCodexAppBinary/);
});
