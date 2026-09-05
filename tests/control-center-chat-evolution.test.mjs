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
  for (const name of ["copy-response", "storage-identity", "native-thread-errors", "normalize", "native-turn-coordinator", "private-store", "gateway", "../private-json"]) {
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

test("local archive preserves active work and deduplicates only verified storage aliases", async () => {
  const f = await fixtureModules();
  try {
    const { CodexChatPrivateStore } = await f.load("private-store");
    const { CodexChatGateway } = await f.load("gateway");
    let store = new CodexChatPrivateStore();
    const first = await store.put({ chatId: "chat_first", nativeThreadId: "same", providerId: "desktop_bundled", stateIdentityHash: "storage-v2:one", group: "voice_work", origin: "voice", title: "Active original", lastStatus: "active", taskLinks: [{ taskId: "task1", label: "First task" }], messageReceipts: { keep: { turnId: "turn1" } } });
    await store.put({ ...first, chatId: "chat_alias", taskLinks: [{ taskId: "task2", label: "Second task" }] });
    await store.put({ ...first, chatId: "chat_other", stateIdentityHash: "storage-v2:other" });
    await store.put({ ...first, chatId: "chat_legacy", stateIdentityHash: "old" });
    const gateway = Object.create(CodexChatGateway.prototype);
    Object.assign(gateway, { store, root: f.root, emit: () => {}, runtime: { provider: async () => ({ view: { availability: "ready", stateIdentityHash: "storage-v2:one" } }) } });
    const list = () => gateway.listThreads({ group: "voice_work", view: "all" });
    const rows = (await list()).data;
    assert.equal(rows.length, 3);
    assert.equal(rows.find(row => row.runtime.compatibility === "bound").taskLinks.length, 2);
    await gateway.archiveThread("chat_first", true);
    assert.equal((await list()).data.length, 2);
    assert.deepEqual((await store.get("chat_first")).messageReceipts, first.messageReceipts);
    assert.equal((await store.get("chat_first")).lastStatus, "active");
    await store.put({ ...first, chatId: "chat_late", archived: false });
    assert.equal((await list()).data.length, 2, "a late alias cannot resurrect an archived chat");
    const archived = await gateway.listThreads({ group: "voice_work", view: "all", archived: true, search: "Second task", limit: 1 });
    assert.equal(archived.data.length, 1);
    await gateway.archiveThread("chat_late", false);
    store = new CodexChatPrivateStore(); gateway.store = store;
    assert.equal((await list()).data.length, 3);
    assert.equal((await store.all()).filter(row => row.archived).length, 0);
  } finally { f.cleanup(); }
});

test("copy includes complete assistant Markdown in order, excluding activity", async () => {
  const f = await fixtureModules();
  try {
    const { responseMarkdown, responseComplete } = await f.load("copy-response");
    const { normalizeNativeItem } = await f.load("normalize");
    const text = "Русский текст\n```js\nconst a = 1;\n```\n" + "x".repeat(300_000);
    const item = normalizeNativeItem("chat_one", { id: "message", type: "agentMessage", text }, f.root, "2026-09-04T00:00:00Z");
    const turn = { status: "interrupted", items: [item, { kind: "command", commandPreview: "private tool output" }, { kind: "assistant_message", message: { markdown: "Last paragraph" } }] };
    assert.equal(responseMarkdown(turn), text + "\n\nLast paragraph");
    assert.equal(responseComplete(turn), true);
    assert.equal(responseComplete({ ...turn, status: "in_progress" }), false);
  } finally { f.cleanup(); }
});
