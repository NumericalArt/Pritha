import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
const require = createRequire(import.meta.url);
const directory = mkdtempSync(path.join(os.tmpdir(), "pritha-history-transport-"));
const binary = path.join(directory, "fake-codex");
writeFileSync(binary, `#!/usr/bin/env node
const readline = require('node:readline'), fs = require('node:fs');
readline.createInterface({ input: process.stdin }).on('line', async line => {
 const message = JSON.parse(line); if (message.id == null) return;
 if (message.method === 'initialize') return process.stdout.write(JSON.stringify({id:message.id,result:{userAgent:message.params.capabilities.experimentalApi?'experimental':'stable'}})+'\\n');
 if (message.params?.hang) return;
 if (message.params?.retry && !fs.existsSync(${JSON.stringify(path.join(directory, 'retried'))})) { fs.writeFileSync(${JSON.stringify(path.join(directory, 'retried'))},'1');process.exit(1); }
 if (message.params?.oversize) { for (let i=0;i<65;i++) if (!process.stdout.write('x'.repeat(1024*1024))) await new Promise(resolve=>process.stdout.once('drain',resolve)); return; }
 process.stdout.write(JSON.stringify({id:message.id,result:{method:message.method}})+'\\n');
});
`);
chmodSync(binary, 0o700);
const source = readFileSync("interfaces/control-center/src/lib/codex-chat/app-server.ts", "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", output)(id => {
 if (id.startsWith("node:")) return require(id);
 if (id === "./storage-identity") return { effectiveCodexHome: () => directory, storageIdentity: () => "fixture" };
 return {};
}, module, module.exports);
const { AppServerConnection, CodexRuntimeManager } = module.exports;
test.after(() => rmSync(directory, { recursive: true, force: true }));

test("history transport opts into experimental reads and rejects turn/resume before sending", async () => {
 const connection = new AppServerConnection("desktop_bundled", binary, directory, () => {}, undefined, true);
 try {
  for (const method of ["turn/start", "thread/resume", "thread/start", "turn/interrupt"]) await assert.rejects(connection.request(method, {}), /read methods only/);
  assert.equal(connection.isRunning(), false);
  assert.deepEqual(await connection.request("thread/read", {}), { method: "thread/read" });
  assert.equal(connection.runtimeVersion, "experimental");
 } finally { await connection.dispose(); }
});
test("oversized native frames fail before JSON parsing", async () => {
 const connection = new AppServerConnection("standalone_cli", binary, directory, () => {}, undefined, true);
 try { await assert.rejects(connection.request("thread/read", { oversize: true }), error => error.code === "history_response_too_large"); }
 finally { await connection.dispose(); }
});
test("history transport retries once and its absolute deadline never closes execution transport", async () => {
 const manager = new CodexRuntimeManager({}, () => {}, directory);
 let closed = 0;
 manager.connections.set("desktop_bundled", { close: () => closed++, dispose: async () => {} });
 manager.probe = async () => ({ binary, view: { availability: "ready" } });
 try {
  const result = await manager.historyRequest("desktop_bundled", "thread/read", { retry: true }, Date.now() + 2000);
  assert.equal(result.method, "thread/read"); assert.equal(closed, 0);
  const start = Date.now();
  await assert.rejects(manager.historyRequest("desktop_bundled", "thread/read", { hang: true }, Date.now() + 80), /timed out/i);
  assert.ok(Date.now() - start < 700); assert.equal(closed, 0);
 } finally { await manager.dispose(); }
});
