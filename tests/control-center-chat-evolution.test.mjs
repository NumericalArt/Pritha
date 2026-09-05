import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

export async function fixtureModules() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-chat-evolution-"));
  const root = path.join(tmp, "project");
  const state = path.join(tmp, "state");
  mkdirSync(root); mkdirSync(state);
  writeFileSync(path.join(tmp, "paths.mjs"), `export const resolveTechscopeRoot=()=>${JSON.stringify(root)}; export const resolvePrithaStateRoot=()=>${JSON.stringify(state)};`);
  writeFileSync(path.join(tmp, "app-server.mjs"), "export class AppServerConnection {} export class CodexRuntimeManager {}");
  writeFileSync(path.join(tmp, "voice-links.mjs"), "export const queueVoiceTaskChatIndexRefresh=()=>{}; export const reconcileVoiceTaskChatLink=async()=>{}; export const voiceTaskChatIndexStatus=()=>({state:'ready'});");
  for (const name of ["storage-identity", "native-thread-errors", "normalize", "native-turn-coordinator", "private-store", "gateway", "../private-json"]) {
    const source = readFileSync(`interfaces/control-center/src/lib/codex-chat/${name}.ts`, "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
      .replaceAll('"@/lib/pritha-paths"', '"./paths.mjs"')
      .replaceAll('"@/lib/private-json"', '"./private-json.mjs"')
      .replace(/from "\.\/(.*?)"/g, (_, file) => `from "./${file.endsWith('.mjs') ? file : file + '.mjs'}"`);
    writeFileSync(path.join(tmp, `${path.basename(name)}.mjs`), output);
  }
  return { tmp, root, state, load: (name) => import(pathToFileURL(path.join(tmp, `${name}.mjs`)).href), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

test("storage identity survives version/provider changes and canonicalizes symlinks", async () => {
  const f = await fixtureModules();
  try {
    const m = await f.load("storage-identity");
    const alias = path.join(f.tmp, "alias"); symlinkSync(f.root, alias);
    assert.equal(m.storageIdentity(alias), m.storageIdentity(f.root));
    assert.notEqual(m.storageIdentity(f.root), m.storageIdentity(f.state));
    const old = createHash("sha256").update(`desktop_bundled:old-version:${f.root}`).digest("hex").slice(0, 20);
    assert.equal(m.legacyIdentityMatches(old, "desktop_bundled", ["old-version", "new-version"], f.root), true);
    assert.equal(m.legacyIdentityMatches(old, "desktop_bundled", ["new-version"], f.root), false);
    assert.equal(m.legacyIdentityMatches(old, "desktop_bundled", ["old-version"], f.state), false);
    assert.equal(m.legacyIdentityMatches(null, "desktop_bundled", ["old-version"], f.root), false);
    assert.equal(m.verifyNativeThreadIdentity({ id: "one", cwd: alias }, "one", f.root), true);
    assert.equal(m.verifyNativeThreadIdentity({ id: "two", cwd: alias }, "one", f.root), false);
  } finally { f.cleanup(); }
});

test("recovery verifies native history and preserves original registry, receipts and task links", async () => {
  const f = await fixtureModules();
  try {
    const { CodexChatPrivateStore } = await f.load("private-store");
    const { CodexChatGateway } = await f.load("gateway");
    const store = new CodexChatPrivateStore();
    const binding = await store.put({ chatId: "chat_one", nativeThreadId: "one", providerId: "desktop_bundled", stateIdentityHash: "old", title: "Original", preview: "Present", origin: "chat", group: "my_chats", continuationEnabled: true, messageReceipts: { receipt: { turnId: "turn_original" } }, taskLinks: [{ taskId: "task-original" }] });
    const gateway = Object.create(CodexChatGateway.prototype);
    Object.assign(gateway, { store, root: f.root, activeTurns: new Map() });
    let candidate = true, reads = 0;
    let thread = { id: "one", cwd: f.root, turns: [], status: "idle" };
    gateway.runtime = {
      provider: async () => ({ view: { availability: "ready", stateIdentityHash: "storage-v2:new" } }),
      canRecoverIdentity: async () => candidate,
      readThread: async () => { reads++; return { thread }; },
    };
    assert.equal((await gateway.threadDetail("chat_one")).history.state, "recovery_available");
    await assert.rejects(gateway.listTurns("chat_one"), (e) => e.code === "history_recovery_available");
    assert.equal((await store.get("chat_one")).stateIdentityHash, "old");
    candidate = false;
    const before = reads;
    await assert.rejects(gateway.restoreAccess("chat_one"), (e) => e.code === "runtime_identity_mismatch");
    assert.equal(reads, before, "unverified homes must fail before native read");
    candidate = true; thread.cwd = f.state;
    await assert.rejects(gateway.restoreAccess("chat_one"), (e) => e.code === "runtime_identity_mismatch");
    thread.cwd = f.root; delete thread.turns;
    await assert.rejects(gateway.restoreAccess("chat_one"), (e) => e.code === "history_format_unsupported");
    thread.turns = [];
    await gateway.restoreAccess("chat_one");
    await gateway.restoreAccess("chat_one");
    const restored = await store.get("chat_one");
    assert.deepEqual(restored, { ...binding, stateIdentityHash: "storage-v2:new" });
    const backups = readdirSync(path.join(store.root, "identity-migrations"));
    assert.equal(backups.length, 1);
    const original = JSON.parse(readFileSync(path.join(store.root, "identity-migrations", backups[0]), "utf8"));
    assert.deepEqual(original.chats.chat_one, binding);
    assert.deepEqual((await gateway.listTurns("chat_one")).data, []);
  } finally { f.cleanup(); }
});
