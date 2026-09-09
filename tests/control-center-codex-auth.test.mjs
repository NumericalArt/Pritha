import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

function loadModule(file, dependencies) {
  const source = readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

for (const available of [true, false]) {
  test(`Codex auth HTTP response awaits delayed App probe (${available})`, async () => {
    let finishProbe;
    const probe = new Promise(resolve => { finishProbe = resolve; });
    const auth = loadModule("interfaces/control-center/src/lib/settings/codex-auth.ts", {
      "node:child_process": { spawnSync: () => ({ status: 0, stdout: "codex-cli fixture" }) },
      "@/lib/realtime/codex-task/codex-app-server-client": { checkCodexAppServerAvailable: () => probe },
      "@/lib/realtime/pritha-runtime": { resolveTechscopeRoot: () => "/fixture/pritha" },
      "./codex-binaries": { resolveCodexCliBinary: () => "codex", resolveCodexAppBinary: () => "/fixture/codex" },
    });
    const route = loadModule("interfaces/control-center/src/app/api/settings/codex-auth/route.ts", {
      "next/server": { NextResponse: Response },
      "@/lib/settings/codex-auth": auth,
    });
    let settled = false;
    const response = route.GET().then(value => { settled = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, "HTTP response must wait for the availability result");
    finishProbe({ available, detail: "probe fixture" });
    const payload = await (await response).json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.codex.appServer, { available, detail: "probe fixture" });
    assert.equal(payload.codex.cli.available, true);
  });
}
