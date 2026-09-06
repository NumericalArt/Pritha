import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
  for (const name of ["attachment-policy", "attachment-store", "copy-response", "storage-identity", "native-thread-errors", "normalize", "native-turn-coordinator", "private-store", "goal-control", "gateway", "../private-json"]) {
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

test("attachments preserve originals, enforce limits and reject conflicting or incomplete uploads", async () => {
  const f = await fixtureModules();
  try {
    const { ChatAttachmentStore, ATTACHMENT_LIMITS } = await f.load("attachment-store");
    const store = new ChatAttachmentStore(f.state, path.join(f.state, "codex-chat"));
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2qYIAAAAASUVORK5CYII=", "base64");
    const samples = [["pixel.png", png], ["note.md", Buffer.from("# hello")], ["source.js", Buffer.from("throw 'never execute me'")], ["document.pdf", Buffer.from("%PDF-test")], ["audio.mp3", Buffer.from("ID3sample")], ["video.mp4", Buffer.from("binary-video")], ["files.zip", Buffer.from("PKarchive")], ["arbitrary.bin", Buffer.from([0, 1, 254, 255])]];
    const ids = [];
    for (const [name, bytes] of samples) {
      const id = randomUUID(); ids.push(id);
      const upload = () => store.upload(id, name, new Request("http://localhost/upload", { method: "PUT", body: bytes }));
      const first = await upload();
      assert.deepEqual(await upload(), first);
      assert.equal(first.kind, name === "pixel.png" ? "image" : "file");
      const resolved = await store.resolve(id);
      assert.deepEqual(readFileSync(resolved.filePath), bytes);
      assert.doesNotMatch(JSON.stringify(first), /\/tmp\//);
      await assert.rejects(store.upload(id, name, new Request("http://localhost/upload", { method: "PUT", body: "other" })), e => e.code === "attachment_conflict");
    }
    assert.equal((await store.prepare(ids)).length, samples.length);
    await assert.rejects(store.prepare([ids[0], ids[0]]), e => e.code === "attachment_limit");
    await assert.rejects(store.resolve("../outside"), e => e.code === "attachment_not_found");
    await assert.rejects(store.upload(randomUUID(), "large", new Request("http://localhost/upload", { method: "PUT", headers: { "content-length": String(ATTACHMENT_LIMITS.fileBytes + 1) }, body: "small" })), e => e.code === "attachment_too_large");
    const incomplete = randomUUID();
    await assert.rejects(store.upload(incomplete, "partial", new Request("http://localhost/upload", { method: "PUT", headers: { "content-length": "100" }, body: "short" })), e => e.code === "attachment_upload_interrupted");
    await assert.rejects(store.resolve(incomplete), e => e.code === "attachment_not_found");
    const escaped = randomUUID(); symlinkSync(f.root, path.join(store.root, escaped));
    await assert.rejects(store.upload(escaped, "outside", new Request("http://localhost/upload", { method: "PUT", body: "no" })), e => e.code === "attachment_storage_unavailable");
    assert.deepEqual(readdirSync(f.root), []);
    const corrupted = await store.resolve(ids[0]);
    writeFileSync(corrupted.filePath, Buffer.alloc(png.length));
    await assert.rejects(store.prepare([ids[0]]), e => e.code === "attachment_corrupt");
  } finally { f.cleanup(); }
});

test("referenced attachments survive expiry, and corrupt metadata never triggers deletion", async () => {
  const f = await fixtureModules();
  try {
    const { ChatAttachmentStore, ATTACHMENT_LIMITS } = await f.load("attachment-store");
    const store = new ChatAttachmentStore(f.state, path.join(f.state, "codex-chat"));
    const first = randomUUID(), unused = randomUUID();
    for (const id of [first, unused]) await store.upload(id, "original.txt", new Request("http://localhost/upload", { method: "PUT", body: "original" }));
    await store.retain([first]);
    for (const id of [first, unused]) {
      const p = path.join(store.root, id, "metadata.json");
      const r = JSON.parse(readFileSync(p, "utf8")); r.createdAt = "2000-01-01T00:00:00Z"; writeFileSync(p, JSON.stringify(r));
    }
    await store.upload(randomUUID(), "next", new Request("http://localhost/upload", { method: "PUT", body: "x" }));
    assert.equal((await store.resolve(first)).view.size, 8);
    await assert.rejects(store.resolve(unused), e => e.code === "attachment_not_found");
    ATTACHMENT_LIMITS.storageBytes = 9;
    await assert.rejects(store.upload(randomUUID(), "quota", new Request("http://localhost/upload", { method: "PUT", body: "xx" })), e => e.code === "attachment_storage_full");
    assert.equal((await store.resolve(first)).view.size, 8);
    writeFileSync(path.join(store.root, first, "metadata.json"), "damaged");
    await assert.rejects(store.upload(randomUUID(), "new", new Request("http://localhost/upload", { method: "PUT", body: "x" })), e => e.code === "attachment_storage_unavailable");
    assert.equal(readFileSync(path.join(store.root, first, "original.txt"), "utf8"), "original");
  } finally { f.cleanup(); }
});

test("image capability must be verified and attachment history retains exact user text", async () => {
  const f = await fixtureModules();
  try {
    const { assertAttachmentCapabilities } = await f.load("attachment-policy");
    const capabilities = { imageInput: true, fileMetadata: true };
    for (const inputModalities of [null, ["text"]]) assert.throws(() => assertAttachmentCapabilities({ capabilities, inputModalities, hasImages: true, hasFiles: false }), e => e.code === "model_image_unsupported");
    assert.doesNotThrow(() => assertAttachmentCapabilities({ capabilities, inputModalities: ["text", "image"], hasImages: true, hasFiles: true }));
    assert.throws(() => assertAttachmentCapabilities({ capabilities: {}, inputModalities: ["image"], hasImages: true, hasFiles: true }), e => e.code === "attachment_runtime_unsupported");
    const { normalizeNativeTurn } = await f.load("normalize");
    const attachment = { id: randomUUID(), name: "file.txt", kind: "file", href: "/api/attachment" };
    const binding = { chatId: "chat_one", messageReceipts: {}, attachmentMessages: { "message-123": { attachments: [attachment], manifest: "generated manifest" } } };
    const raw = { id: "turn-one", items: [{ type: "userMessage", clientId: "message-123", content: [{ type: "text", text: "User text\n\ngenerated manifest" }] }] };
    const turn = normalizeNativeTurn(binding, raw, f.root);
    assert.equal(turn.userMessage.markdown, "User text");
    assert.deepEqual(turn.userMessage.attachments, [attachment]);
    raw.items[0].content[0].text = "generated manifest";
    assert.equal(normalizeNativeTurn(binding, raw, f.root).userMessage.markdown, "");
  } finally { f.cleanup(); }
});

test("attachment-only first messages reconcile unknown delivery without a second native turn", async () => {
  const f = await fixtureModules();
  try {
    const { ChatAttachmentStore } = await f.load("attachment-store");
    const { CodexChatPrivateStore } = await f.load("private-store");
    const { CodexChatGateway } = await f.load("gateway");
    const store = new CodexChatPrivateStore();
    const attachments = new ChatAttachmentStore(store.stateRoot, store.root);
    const id = randomUUID();
    await attachments.upload(id, "pixel.png", new Request("http://localhost/upload", { method: "PUT", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2qYIAAAAASUVORK5CYII=", "base64") }));
    let starts = 0, creates = 0, modalities = ["text", "image"], regularFile = true;
    const native = { id: "native", cwd: f.root, status: "idle", turns: [] };
    let sentInput;
    const connection = { markThreadLoaded: () => {}, ensureThreadLoaded: async () => {}, request: async (method, params) => {
      if (method === "thread/start") { creates++; return { thread: native }; }
      if (method === "fs/getMetadata") { assert.ok(params.path.startsWith(await import('node:fs/promises').then(fs => fs.realpath(f.state)))); return { isFile: regularFile, isSymlink: false }; }
      if (method === "turn/start") {
        starts++; sentInput = params.input;
        native.turns.push({ id: "native-turn", status: "completed", items: [{ id: "user", type: "userMessage", clientId: params.clientUserMessageId, content: params.input }] });
        throw new Error("Codex App Server request timed out: turn/start");
      }
      return {};
    } };
    const view = { stateIdentityHash: "storage-v2:fixture", availability: "ready", capabilities: { fullChat: true, fileMetadata: true, imageInput: true } };
    const gateway = Object.create(CodexChatGateway.prototype);
    Object.assign(gateway, { store, attachments, root: f.root, activeTurns: new Map(), activeTurnLeases: new Map(), uncertainTurnTimers: new Map(), emit: () => {}, runtime: {
      provider: async () => ({ providerId: "desktop_bundled", view }), effectiveProvider: async () => ({ providerId: "desktop_bundled", view }),
      connection: async () => connection, threadDefaults: () => ({ model: "test", cwd: f.root }), modelInputModalities: async () => modalities,
      readThread: async () => ({ thread: native }),
    } });
    const input = { clientThreadId: randomUUID(), source: "chat", initialTurn: { clientMessageId: randomUUID(), input: [{ type: "text", text: "" }], attachments: [id], settings: { modelId: "test" } } };
    modalities = ["text"];
    await assert.rejects(gateway.createThreadWithFirstTurn(input), e => e.code === "model_image_unsupported");
    assert.equal(creates, 0, "invalid attachments must fail before a new native chat exists");
    modalities = ["text", "image"];
    regularFile = false;
    await assert.rejects(gateway.createThreadWithFirstTurn(input), e => e.code === "attachment_inaccessible");
    assert.equal(creates, 0, "inaccessible originals must not create a native chat");
    regularFile = true;
    await assert.rejects(gateway.createThreadWithFirstTurn(input), e => e.code === "fallback_confirmation_required");
    assert.equal(starts, 1);
    assert.equal(sentInput[1].type, "localImage");
    assert.match(sentInput[0].text, /Attached originals/);
    const firstBinding = (await store.all())[0];
    gateway.releaseActiveTurn(firstBinding.chatId);
    gateway.store = new CodexChatPrivateStore();
    const replay = await gateway.createThreadWithFirstTurn(input);
    assert.equal(creates, 1); assert.equal(starts, 1); assert.equal(replay.replayed, true);
    assert.equal(replay.data.accepted.turn.userMessage.markdown, "");
    assert.equal(replay.data.accepted.turn.userMessage.attachments[0].id, id);
    const page = await gateway.listTurns(firstBinding.chatId);
    assert.equal(page.hasImageInputs, true);
    modalities = ["text"];
    await assert.rejects(gateway.startTurn(firstBinding.chatId, { clientMessageId: randomUUID(), input: [{ type: "text", text: "Follow up" }], settings: { modelId: "text-only" } }), e => e.code === "model_image_unsupported");
    assert.equal(starts, 1, "an incompatible follow-up cannot discard previous images");
  } finally { f.cleanup(); }
});
