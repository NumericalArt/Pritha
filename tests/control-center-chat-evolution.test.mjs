import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, symlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

export async function fixtureModules() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-chat-evolution-"));
  const root = path.join(tmp, "project");
  const state = path.join(tmp, "state");
  mkdirSync(root); mkdirSync(state);
  writeFileSync(path.join(tmp, "paths.mjs"), `export const resolveTechscopeRoot=()=>${JSON.stringify(root)}; export const resolvePrithaStateRoot=()=>${JSON.stringify(state)};`);
  writeFileSync(path.join(tmp, "app-server.mjs"), "export class AppServerConnection {} export class CodexRuntimeManager {}");
  writeFileSync(path.join(tmp, "voice-links.mjs"), "export const queueVoiceTaskChatIndexRefresh=()=>{}; export const reconcileVoiceTaskChatLink=async()=>{}; export const voiceTaskChatIndexStatus=()=>({state:'ready'});");
  for (const name of ["history-reader", "attachment-policy", "attachment-store", "copy-response", "storage-identity", "native-thread-errors", "normalize", "native-turn-coordinator", "native-control", "native-requests", "private-store", "goal-control", "budget-intent", "operation-runtime", "gateway", "../private-json"]) {
    const source = readFileSync(`interfaces/control-center/src/lib/codex-chat/${name}.ts`, "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
      .replaceAll('"@/lib/pritha-paths"', '"./paths.mjs"')
      .replaceAll('"@/lib/private-json"', '"./private-json.mjs"')
      .replaceAll('"../../../../../scripts/lib/task-workspace.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/lib/task-workspace.mjs")).href))
    .replaceAll('"../../../../../scripts/lib/execution-channel.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/lib/execution-channel.mjs")).href))
      .replaceAll('"../../../../../scripts/lib/execution-coordinator.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/lib/execution-coordinator.mjs")).href))
      .replaceAll('"../../../../../scripts/agents-mother/task-delivery.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/agents-mother/task-delivery.mjs")).href))
      .replaceAll('"../../../../../scripts/agents-mother/phase-usage.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/agents-mother/phase-usage.mjs")).href))
      .replaceAll('"../../../../../scripts/agents-mother/operation-decisions.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/agents-mother/operation-decisions.mjs")).href))
      .replaceAll('"../../../../../scripts/agents-mother/execution-backends.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/agents-mother/execution-backends.mjs")).href))
      .replace(/from "\.\/(.*?)"/g, (_, file) => `from "./${file.endsWith('.mjs') ? file : file + '.mjs'}"`);
    writeFileSync(path.join(tmp, `${path.basename(name)}.mjs`), output);
  }
  return { tmp, root, state, load: (name) => import(pathToFileURL(path.join(tmp, `${name}.mjs`)).href), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

test("storage identity survives version/provider changes and canonicalizes symlinks", async () => {
  const f = await fixtureModules();
  const previousHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = f.root;
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
  } finally { if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome; f.cleanup(); }
});

test("recovery verifies native history and preserves original registry, receipts and task links", async () => {
  const f = await fixtureModules();
  const previousHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = f.state;
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
  } finally { if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome; f.cleanup(); }
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

async function coordinatedGateway(f, connection, native) {
  const { CodexChatPrivateStore } = await f.load('private-store');
  const { CodexChatGateway } = await f.load('gateway');
  const store = new CodexChatPrivateStore();
  const gateway = Object.create(CodexChatGateway.prototype);
  const view = { stateIdentityHash:'storage-v2:fixture', availability:'ready', capabilities:{fullChat:true} };
  Object.assign(gateway, {store, root:f.root, activeTurns:new Map(), activeTurnLeases:new Map(), emit:()=>{}, runtime:{
    provider:async()=>({providerId:'desktop_bundled',view}),effectiveProvider:async()=>({providerId:'desktop_bundled',view}),
    connection:async()=>connection,threadDefaults:()=>({cwd:f.root}), readThread:async()=>({thread:native}),
  }});
  return gateway;
}

test('two gateway instances create exactly one native chat for a shared client key', async () => {
  const f=await fixtureModules();
  try {
    let starts=0, release, dispatched;
    const barrier=new Promise(r=>release=r), signal=new Promise(r=>dispatched=r);
    const native={id:'native-one',cwd:f.root,turns:[],status:'idle'};
    const connection={markThreadLoaded:()=>{},request:async(method)=>{
      if(method==='thread/start'){starts++;dispatched();await barrier;return {thread:native};} return {};
    }};
    const a=await coordinatedGateway(f,connection,native), b=await coordinatedGateway(f,connection,native);
    const input={clientThreadId:randomUUID(),source:'chat'};
    const first=a.createThread(input);await signal;
    await assert.rejects(b.createThread(input),e=>['create_pending','create_delivery_unknown'].includes(e.code));
    release();const result=await first;
    const replay=await b.createThread(input);
    assert.equal(starts,1);assert.equal(replay.detail.thread.chatId,result.detail.thread.chatId);
    assert.equal(replay.replayed,true);assert.equal((await b.store.all()).length,1);
    await assert.rejects(b.createThread({...input,title:'changed'}),{code:'idempotency_conflict'});
  } finally {f.cleanup();}
});

test('unknown turn delivery survives gateway replacement and releases only after exact terminal history', async () => {
  const f=await fixtureModules();
  try {
    let turns=0;
    const native={id:'native-one',cwd:f.root,turns:[],status:'idle'};
    const connection={markThreadLoaded:()=>{},ensureThreadLoaded:async()=>{},request:async(method,params)=>{
      if(method==='thread/start')return {thread:native};
      if(method==='turn/start'){turns++;throw new Error('request timed out: turn/start');}return {};
    }};
    const a=await coordinatedGateway(f,connection,native);
    const input={clientThreadId:randomUUID(),source:'chat',initialTurn:{clientMessageId:randomUUID(),input:[{type:'text',text:'Run once'}]}};
    await assert.rejects(a.createThreadWithFirstTurn(input),{code:'fallback_confirmation_required'});
    const b=await coordinatedGateway(f,connection,native);
    await assert.rejects(b.createThreadWithFirstTurn(input),{code:'turn_active'});
    assert.equal(turns,1,'empty history cannot authorize replay');
    native.turns.push({id:'native-turn',status:'completed',items:[{id:'u',type:'userMessage',clientId:input.initialTurn.clientMessageId,content:[{type:'text',text:'Run once'}]}]});
    const replay=await b.createThreadWithFirstTurn(input);
    assert.equal(replay.replayed,true);assert.equal(turns,1);
    assert.equal(b.store.execution.claims().filter(r=>r.kind==='turn').length,0);
    assert.equal((await b.store.all())[0].messageReceipts[input.initialTurn.clientMessageId].nativeTurnId,'native-turn');
  } finally {f.cleanup();}
});

test('voice reconciliation preserves concurrent receipts and operator choices', async () => {
  const f=await fixtureModules();
  try {
    const {CodexChatPrivateStore}=await f.load('private-store');
    const a=new CodexChatPrivateStore(),b=new CodexChatPrivateStore();
    const initial=await a.put({chatId:'chat_shared',nativeThreadId:'native',providerId:'desktop_bundled',messageReceipts:{},taskLinks:[],origin:'voice',continuationEnabled:false});
    await a.patch(initial.chatId,{continuationEnabled:true,title:'Operator title',messageReceipts:{newer:{clientMessageId:'newer',requestHash:'h',turnId:'t',nativeTurnId:'n',startedAt:'2026-01-01'}}});
    await b.mergeVoiceBinding({...initial,title:'Stale title'}, {taskId:'voice-1',label:'Voice task',mode:'observe'});
    const fresh=await a.get(initial.chatId);
    assert.equal(fresh.continuationEnabled,true);assert.equal(fresh.title,'Operator title');assert.ok(fresh.messageReceipts.newer);
    await Promise.all([a.patch(initial.chatId,{messageReceipts:{a:{turnId:'a'}}}),b.patch(initial.chatId,{messageReceipts:{b:{turnId:'b'}}})]);
    assert.deepEqual(Object.keys((await a.get(initial.chatId)).messageReceipts).sort(),['a','b','newer']);
  } finally {f.cleanup();}
});

async function voiceClientFixture(f, mode='complete') {
  const compilerOptions={module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022};
  writeFileSync(path.join(f.tmp,'voice-settings.mjs'), `export const resolveCodexAppBinary=x=>x;export const isDesktopCodexBinary=()=>true;export const codexAppTurnSettings=x=>x;`);
  for (const name of ['voice-execution','codex-app-server-client']) {
    const source=readFileSync(`interfaces/control-center/src/lib/realtime/codex-task/${name}.ts`,'utf8');
    const output=ts.transpileModule(source,{compilerOptions}).outputText
      .replaceAll('"../../../../../../scripts/lib/runtime-probe.mjs"',JSON.stringify(pathToFileURL(path.resolve("scripts/lib/runtime-probe.mjs")).href))
      .replaceAll('"../../codex-chat/native-turn-coordinator"','"./native-turn-coordinator.mjs"')
      .replaceAll('"../../codex-chat/storage-identity"','"./storage-identity.mjs"')
      .replaceAll('"../../codex-chat/native-control"','"./native-control.mjs"')
      .replaceAll('"../../codex-chat/native-requests"','"./native-requests.mjs"')
      .replaceAll('"./voice-execution"','"./voice-execution.mjs"')
      .replaceAll('"../../settings/codex-binaries"','"./voice-settings.mjs"')
      .replaceAll('"../../settings/codex-model-catalog"','"./voice-settings.mjs"');
    writeFileSync(path.join(f.tmp,`${name}.mjs`),output);
  }
  const trace=path.join(f.tmp,'rpc.jsonl');
  const bin=path.join(f.tmp,'fake-codex');
  writeFileSync(bin,`#!${process.execPath}
import readline from 'node:readline';import {appendFileSync} from 'node:fs';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);appendFileSync(${JSON.stringify(trace)},JSON.stringify({method:m.method,params:m.params})+'\\n');
 let result={};
 if(m.method==='thread/list')result={data:[{id:'native-voice',name:'VC · '+${JSON.stringify(path.basename(f.root))}+' · task · voice-task · main',cwd:${JSON.stringify(f.root)}}]};
 if(m.method==='thread/start'||m.method==='thread/resume'||m.method==='thread/read')result={thread:{id:'native-voice',cwd:${JSON.stringify(f.root)},status:'idle',turns:[]}};
 if(m.method==='turn/start'){
   if(${JSON.stringify(mode)}==='disconnect'){process.exit(1);return;}
   result={turn:{id:'voice-turn',status:'inProgress',items:[]}};
 }
 send({id:m.id,result});
 if(m.method==='turn/start')send({method:'turn/completed',params:{threadId:'native-voice',turn:{id:'voice-turn',status:'completed',items:[{type:'agentMessage',text:JSON.stringify({status:'ok',text:'done',data:{},errors:[],warnings:[]})}]}}});
});
`,{mode:0o700});
  const m=await f.load('codex-app-server-client');
  return {m,trace,client:new m.PrithaCodexAppServerClient({codexBin:bin,cwd:f.root,branch:'main',registryPath:path.join(f.tmp,'registry.json'),buildSandboxPolicy:()=>({type:'readOnly'}),getRuntimeSettings:()=>({codexAppThreadRoutingMode:'per_task'})})};
}
const voicePayload=f=>({requestId:'voice-task',userId:'test',taskType:'review',userIntent:'Inspect',projectContext:{project:'Pritha',cwd:f.root,interface:'realtime',focus:[]},constraints:[],expectedResponse:{format:'json',schema:{}}});

test('Voice denies a busy native thread before resume, reports or turn dispatch', async()=>{
 const f=await fixtureModules(); const previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
 try {
   const {client,m,trace}=await voiceClientFixture(f);
   const coordinator=await f.load('native-turn-coordinator');
   const release=coordinator.tryAcquireNativeThreadTurn(coordinator.nativeThreadLeaseKey('desktop_bundled','native-voice'),'direct-task');
   try {
     await assert.rejects(client.runTask(voicePayload(f),{timeoutMs:3000,userId:'test'}),e=>e instanceof m.CodexDispatchError && !m.safeCodexCliFallback(e,false));
     const methods=readFileSync(trace,'utf8').trim().split('\n').map(x=>JSON.parse(x).method);
     assert.ok(methods.includes('thread/list'));
     assert.ok(!methods.some(x=>['thread/resume','thread/inject_items','turn/start'].includes(x)),JSON.stringify(methods));
   } finally {release();}
 } finally {if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('Voice catches fast completion and replays its saved result without another turn', async()=>{
 const f=await fixtureModules();const previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
 try {
   const {client,trace}=await voiceClientFixture(f);
   const payload=voicePayload(f);
   assert.equal((await client.runTask(payload,{timeoutMs:3000,userId:'test'})).status,'ok');
   assert.equal((await client.runTask(payload,{timeoutMs:3000,userId:'test'})).status,'ok');
   const methods=readFileSync(trace,'utf8').trim().split('\n').map(x=>JSON.parse(x).method);
   assert.equal(methods.filter(x=>x==='turn/start').length,1);
 } finally {if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('Voice transport loss after dispatch preserves ownership and forbids fallback or replay', async()=>{
 const f=await fixtureModules();const previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
 try {
   const {client,m,trace}=await voiceClientFixture(f,'disconnect');
   const payload=voicePayload(f);
   await assert.rejects(client.runTask(payload,{timeoutMs:3000,userId:'test'}),e=>e.deliveryState==='unknown'&&!m.safeCodexCliFallback(e,false));
   await assert.rejects(client.runTask(payload,{timeoutMs:3000,userId:'test'}),e=>e.deliveryState==='unknown');
   const methods=readFileSync(trace,'utf8').trim().split('\n').map(x=>JSON.parse(x).method);
   assert.equal(methods.filter(x=>x==='turn/start').length,1);
   const coordinator=await f.load('native-turn-coordinator');
   assert.equal(coordinator.tryAcquireNativeThreadTurn(coordinator.nativeThreadLeaseKey('standalone_cli','native-voice'),'next'),null);
 } finally {if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('native answers require the exact request and generation and never grant session permissions',async()=>{
 const f=await fixtureModules(),previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
 try {
  const coordinator=await f.load('native-turn-coordinator'),control=await f.load('native-control'),requests=await f.load('native-requests');
  const key=coordinator.nativeThreadLeaseKey('desktop_bundled','native-request'),db=coordinator.nativeExecutionCoordinator();
  const lease=coordinator.tryAcquireNativeThreadTurn(key,'request-owner');
  const storage=(await f.load('storage-identity')).storageIdentity(f.state);
  const cleanup=control.registerNativeControl({coordinator:coordinator.nativeExecutionCoordinator(),key,owner:lease.owner,generation:lease.generation,turnId:()=> 'turn-request',steer:true,request:async()=>({})});
  const sent=[];
  try {
    const message={id:7,method:'item/permissions/requestApproval',params:{threadId:'native-request',turnId:'turn-request',permissions:{network:{enabled:true}}}};
    assert.equal(requests.captureNativeRequest(message,storage,'connection-one',result=>sent.push(result)),true);
    const row=requests.pendingNativeRequests(storage,'native-request')[0];
    const input={requestId:row.id,revision:row.revision,clientMessageId:randomUUID(),decision:'accept'};
    await assert.rejects(requests.answerNativeRequest(storage,'different-thread',input),{code:'native_request_not_found'});
    const results=await Promise.all([requests.answerNativeRequest(storage,'native-request',input),requests.answerNativeRequest(storage,'native-request',{...input,clientMessageId:randomUUID()})]);
    assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(sent.length,1);
    assert.deepEqual(sent[0],{permissions:{network:{enabled:true}},scope:'turn',strictAutoReview:true});
    await assert.rejects(requests.answerNativeRequest(storage,'native-request',{...input,decision:'decline'}),{code:'native_request_changed'});
    requests.captureNativeRequest({...message,id:8},storage,'connection-old',result=>sent.push(result));
    const old=requests.pendingNativeRequests(storage,'native-request')[0];requests.expireNativeRequests('connection-old');
    await assert.rejects(requests.answerNativeRequest(storage,'native-request',{...input,requestId:old.id,revision:old.revision}),{code:'native_request_changed'});
    assert.equal(sent.length,1);
  } finally {cleanup();lease();}
 } finally {if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('native input answers are submitted once and secret values are not retained in the coordinator',async()=>{
 const f=await fixtureModules(),previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
 try {
  const coordinator=await f.load('native-turn-coordinator'),control=await f.load('native-control'),requests=await f.load('native-requests');
  const storage=(await f.load('storage-identity')).storageIdentity(f.state),key=coordinator.nativeThreadLeaseKey(storage,'native-input');
  const lease=coordinator.tryAcquireNativeThreadTurn(key,'input-owner');
  const cleanup=control.registerNativeControl({coordinator:coordinator.nativeExecutionCoordinator(),key,owner:lease.owner,generation:lease.generation,turnId:()=> 'turn-input',steer:true,request:async()=>({})});
  let calls=0;
  try {
    requests.captureNativeRequest({id:1,method:'item/tool/requestUserInput',params:{threadId:'native-input',turnId:'turn-input',questions:[{id:'secret',question:'Credential',isSecret:true}]}},storage,'input-connection',()=>{calls++;throw new Error('write failed');});
    const row=requests.pendingNativeRequests(storage,'native-input')[0];
    const input={requestId:row.id,revision:row.revision,clientMessageId:randomUUID(),answers:{secret:['synthetic-sensitive-answer']}};
    await assert.rejects(requests.answerNativeRequest(storage,'native-input',input),/write failed/);
    await assert.rejects(requests.answerNativeRequest(storage,'native-input',input),{code:'native_request_changed'});
    assert.equal(calls,1);assert.ok(!JSON.stringify(coordinator.nativeExecutionCoordinator().getIntentById(row.id)).includes('synthetic-sensitive-answer'));
  } finally {cleanup();lease();}
 } finally {if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('queue waits for the exact predecessor and cancellation preserves following message order',async()=>{
 const f=await fixtureModules();let gateway;
 try {
  const native={id:'queue-native',cwd:f.root,status:'idle',turns:[]};let starts=0;
  const connection={generation:'fixture',isRunning:()=>true,markThreadLoaded:()=>{},ensureThreadLoaded:async()=>{},request:async(method,params)=>{
    if(method==='thread/start')return {thread:native};
    if(method==='turn/start'){starts++;const turn={id:`turn-${starts}`,status:'inProgress',items:[{id:`u-${starts}`,type:'userMessage',clientId:params.clientUserMessageId,content:params.input}]};native.turns.push(turn);native.status='active';return {turn};}return {};
  }};
  gateway=await coordinatedGateway(f,connection,native);
  const first={clientMessageId:randomUUID(),input:[{type:'text',text:'first'}]};
  const created=await gateway.createThreadWithFirstTurn({clientThreadId:randomUUID(),source:'chat',initialTurn:first});const chatId=created.data.detail.thread.chatId;
  const second={clientMessageId:randomUUID(),input:[{type:'text',text:'second'}]},third={clientMessageId:randomUUID(),input:[{type:'text',text:'third'}]};
  await gateway.enqueueMessage(chatId,second);await gateway.enqueueMessage(chatId,third);await gateway.drainQueue(chatId);assert.equal(starts,1);
  const queued=await gateway.queuedMessages(chatId);await gateway.cancelQueued(chatId,queued[0].id,queued[0].revision);
  native.turns[0].status='completed';native.status='idle';await gateway.reconcileExecutions(await gateway.store.get(chatId),native);
  await gateway.drainQueue(chatId);assert.equal(starts,2);assert.equal(native.turns[1].items[0].content[0].text,'third');
  await gateway.drainQueue(chatId);assert.equal(starts,2);
 } finally {if(gateway){gateway.queueStopped=true;clearTimeout(gateway.queueTimer);for(const id of gateway.activeTurns.keys())gateway.releaseActiveTurn(id);}f.cleanup();}
});

test('Voice logical ownership spans operator waits, preserves completed rounds, and blocks Direct until release',async()=>{
  const f=await fixtureModules();const previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
  try {
    await voiceClientFixture(f);
    const voice=await f.load('voice-execution'),native=await f.load('native-turn-coordinator');
    const task={id:'workflow-A',thread_scope:{kind:'task',id:'shared'}};
    const first=voice.beginVoiceWorkflow(task,f.root,'subject_scoped','read-only');
    const key=native.nativeThreadLeaseKey('desktop_bundled','native-shared');
    voice.assertVoiceOwner(task.id,key);
    voice.finishVoiceWorkflow(task.id,'waiting_for_operator',{question:'Which target?'});
    assert.equal(native.tryAcquireNativeThreadTurn(key,'direct'),null);
    assert.throws(()=>voice.beginVoiceWorkflow({...task,id:'workflow-B'},f.root,'subject_scoped','read-only'),/voice_scope_busy/);
    const next=voice.beginVoiceWorkflow({...task,operator_question_answered_at:'answer-1'},f.root,'subject_scoped','read-only');
    assert.equal(next.round,first.round+1);assert.equal(next.generation,first.generation);
    voice.finishVoiceWorkflow(task.id,'waiting_admission');
    const resumed=voice.beginVoiceWorkflow(task,f.root,'subject_scoped','read-only');
    assert.equal(resumed.round,next.round,'capacity wait does not rerun successful phase identities');
    voice.finishVoiceWorkflow(task.id,'completed');
    const direct=native.tryAcquireNativeThreadTurn(key,'direct');assert.ok(direct);direct();
  } finally {if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('stop and steer target only their exact native turn and expire with their owner',async()=>{
  const f=await fixtureModules();const previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
  try {
    const native=await f.load('native-turn-coordinator'),controls=await f.load('native-control');
    const db=native.nativeExecutionCoordinator(),aKey=native.nativeThreadLeaseKey('desktop_bundled','A'),bKey=native.nativeThreadLeaseKey('desktop_bundled','B');
    const a=native.tryAcquireNativeThreadTurn(aKey,'a'),b=native.tryAcquireNativeThreadTurn(bKey,'b');
    const calls=[];let aTurn='turn-A';
    const removeA=controls.registerNativeControl({coordinator:db,key:aKey,owner:a.owner,generation:a.generation,turnId:()=>aTurn,steer:true,request:async(method,params)=>calls.push({method,params})});
    const removeB=controls.registerNativeControl({coordinator:db,key:bKey,owner:b.owner,generation:b.generation,turnId:()=> 'turn-B',steer:true,request:async()=>{throw new Error('B must not be controlled');}});
    try {
      await controls.controlNativeTurn(db,aKey,'turn-A','interrupt',{threadId:'A',turnId:'turn-A'});
      assert.equal(calls.length,1);b.assertOwned();
      aTurn='turn-A-next';
      await assert.rejects(controls.controlNativeTurn(db,aKey,'turn-A','steer',{threadId:'A',expectedTurnId:'turn-A'}),{code:'control_turn_changed'});
      assert.equal(calls.length,1);a();
      await assert.rejects(controls.controlNativeTurn(db,aKey,'turn-A-next','interrupt',{threadId:'A',turnId:'turn-A-next'}),{code:'control_connection_expired'});
    } finally {removeA();removeB();a();b();}
  } finally {if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('Voice recovery needs original storage and exact delivery evidence, and releases only the phase capacity',async()=>{
  const f=await fixtureModules(),previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
  try {
    const {m}=await voiceClientFixture(f),native=await f.load('native-turn-coordinator'),db=native.nativeExecutionCoordinator();
    const storage=(await f.load('storage-identity')).storageIdentity(f.state),key='voice-turn:recovery:1:execution';
    const logical=db.claim(['workflow:recovery'],'logical',{kind:'voice-workflow'}),phase=db.claim(['capacity:recovery'],'phase',{kind:'turn'});
    const prompt='Original task',clientMessageId='original-delivery';
    db.reserveIntent(key,'hash',{kind:'voice-turn',key,taskId:'recovery',round:1,storage,nativeThreadId:'native-recovery',clientMessageId,promptHash:createHash('sha256').update(prompt).digest('hex')});
    db.updateIntent(key,{state:'unknown',owner:phase.owner,generation:phase.generation});
    const turn={id:'actual-turn',status:'completed',items:[{type:'userMessage',clientId:clientMessageId,content:[{type:'text',text:prompt}]},{type:'agentMessage',text:JSON.stringify({status:'ok',text:'Recovered',data:{}})}]};
    m.recoverVoiceNativeTurns('wrong-home','native-recovery',[turn]);assert.equal(db.getIntent(key).state,'unknown');
    m.recoverVoiceNativeTurns(storage,'native-recovery',[{...turn,items:[{...turn.items[0],clientId:'other'},turn.items[1]]}]);assert.equal(db.getIntent(key).state,'unknown');
    m.recoverVoiceNativeTurns(storage,'native-recovery',[]);assert.equal(db.getIntent(key).state,'unknown');
    m.recoverVoiceNativeTurns(storage,'native-recovery',[turn]);
    assert.equal(db.getIntent(key).state,'completed');assert.equal(db.getIntent(key).result.text,'Recovered');
    assert.throws(()=>phase.assertOwned(),{code:'execution_owner_changed'});logical.assertOwned();logical.release();
    assert.equal(readFileSync(path.join(f.tmp,'fake-codex'),'utf8').includes('readline'),true);
    assert.throws(()=>readFileSync(path.join(f.tmp,'rpc.jsonl')),{code:'ENOENT'});
  }finally{if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();}
});

test('legacy registry migration imports permanent delivery guards once and retains the original receipt',async()=>{
  const f=await fixtureModules();
  try {
    const {CodexChatPrivateStore}=await f.load('private-store');
    let store=new CodexChatPrivateStore();
    const receipt={clientMessageId:'old-message',requestHash:'original-hash',turnId:'public-turn',nativeTurnId:'native-turn',startedAt:'2026-09-01T00:00:00Z'};
    mkdirSync(store.root,{recursive:true});
    writeFileSync(store.registryPath,JSON.stringify({version:1,chats:{chat_legacy:{chatId:'chat_legacy',nativeThreadId:'native',providerId:'desktop_bundled',messageReceipts:{'old-message':receipt}}}}));
    await store.patch('chat_legacy',{title:'Updated title'});
    const guard=store.execution.getIntent('turn:chat_legacy:old-message');
    assert.equal(guard.state,'legacy_receipt');assert.deepEqual(guard.receipt,receipt);
    assert.equal(store.execution.getIntent('migration:registry-execution-v1').importedReceipts,1);
    store=new CodexChatPrivateStore();
    await store.patch('chat_legacy',{pinned:true});
    assert.equal(store.execution.getIntent('turn:chat_legacy:old-message').revision,guard.revision);
    assert.deepEqual((await store.get('chat_legacy')).messageReceipts['old-message'],receipt);
    assert.throws(()=>store.execution.reserveIntent('turn:chat_legacy:old-message','changed',{kind:'turn'}),{code:'idempotency_conflict'});
  }finally{f.cleanup();}
});

test('legacy migration rejects conflicting guards before changing registry bytes',async()=>{
  const f=await fixtureModules();
  try {
    const {CodexChatPrivateStore}=await f.load('private-store'),store=new CodexChatPrivateStore();
    const receipt={clientMessageId:'old-message',requestHash:'original-hash',turnId:'public-turn',nativeTurnId:'native-turn',startedAt:'2026-09-01T00:00:00Z'};
    mkdirSync(store.root,{recursive:true});
    const original=JSON.stringify({version:1,chats:{chat_legacy:{chatId:'chat_legacy',nativeThreadId:'native',providerId:'desktop_bundled',messageReceipts:{'old-message':receipt}}}});
    writeFileSync(store.registryPath,original);
    store.execution.reserveIntent('turn:chat_legacy:old-message','conflict',{kind:'turn'});
    await assert.rejects(store.patch('chat_legacy',{title:'Must not persist'}),{code:'codex_chat_registry_corrupt'});
    assert.equal(readFileSync(store.registryPath,'utf8'),original);
    assert.equal(store.execution.getIntent('migration:registry-execution-v1').state,'reserved');
  }finally{f.cleanup();}
});

test('queued delivery keeps its immutable payload through temporary resource and drain conflicts',async()=>{
  const f=await fixtureModules();let gateway;
  try {
    const {CodexChatGateway}=await f.load('gateway'),{CodexChatPrivateStore}=await f.load('private-store');
    gateway=Object.create(CodexChatGateway.prototype);gateway.store=new CodexChatPrivateStore();
    const binding=await gateway.store.put({chatId:'chat_wait',nativeThreadId:'native',stateIdentityHash:'storage-v2:fixture',providerId:'desktop_bundled'});
    gateway.requireBinding=async()=>binding;
    const db=gateway.store.execution,predecessorKey='turn:chat_wait:previous';
    db.reserveIntent(predecessorKey,'previous',{kind:'turn'});db.updateIntent(predecessorKey,{state:'completed'});
    const input={clientMessageId:'next',input:[{type:'text',text:'Captured once'}]},key='queued:chat_wait:next';
    db.reserveIntent(key,'hash',{kind:'queued-message',chatId:binding.chatId,nativeThreadId:binding.nativeThreadId,stateIdentityHash:binding.stateIdentityHash,predecessorKey,input},{initialState:'queued'});
    for(const code of ['workspace_busy','execution_draining','execution_metadata_busy']) {
      gateway.startTurn=async()=>{throw Object.assign(new Error(code),{code});};
      await gateway.drainQueue(binding.chatId);assert.equal(db.getIntent(key).state,'queued');assert.deepEqual(db.getIntent(key).input,input);
    }
    let deliveries=0;gateway.startTurn=async()=>{deliveries++;};
    await gateway.drainQueue(binding.chatId);await gateway.drainQueue(binding.chatId);
    assert.equal(deliveries,1);assert.equal(db.getIntent(key).state,'delivered');
  }finally{f.cleanup();}
});

test('native secret answers reach the original callback across HTTP workers exactly once',async()=>{
  const f=await fixtureModules(),previous=process.env.CODEX_HOME;process.env.CODEX_HOME=f.state;
  let child;
  try {
    const file=name=>pathToFileURL(path.join(f.tmp,`${name}.mjs`)).href;
    const source=`import {nativeExecutionCoordinator,nativeThreadLeaseKey} from ${JSON.stringify(file('native-turn-coordinator'))};
      import {captureNativeRequest,pendingNativeRequests,expireNativeRequests} from ${JSON.stringify(file('native-requests'))};
      import {registerNativeControl} from ${JSON.stringify(file('native-control'))};
      import {storageIdentity} from ${JSON.stringify(file('storage-identity'))};
      import {executionChannelView} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/lib/execution-channel.mjs')).href)};
      const db=nativeExecutionCoordinator(),storage=storageIdentity(process.env.CODEX_HOME),key=nativeThreadLeaseKey(storage,'remote-thread');
      const lease=db.claim([key],'remote-owner');let calls=0;
      const close=registerNativeControl({coordinator:db,key,owner:lease.owner,generation:lease.generation,turnId:()=> 'remote-turn',steer:true,request:async()=>({})});
      captureNativeRequest({id:1,method:'item/tool/requestUserInput',params:{threadId:'remote-thread',turnId:'remote-turn',questions:[{id:'secret',question:'Synthetic secret',isSecret:true}]}},storage,'remote-generation',async response=>{calls++;if(!response.answers.secret.answers[0])throw new Error('missing answer');});
      const row=pendingNativeRequests(storage,'remote-thread')[0];
      const timer=setInterval(()=>{if(executionChannelView(db,'native-answer:'+row.id)){clearInterval(timer);process.send({row,storage});}},10);
      process.on('message',()=>{process.send({calls});expireNativeRequests('remote-generation');close();lease.release();db.close();process.disconnect();});`;
    child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','ignore','pipe','ipc']});
    let error='';child.stderr.on('data',chunk=>error+=chunk);
    const [{row,storage}]=await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error(error);})]);
    const {answerNativeRequest}=await f.load('native-requests');
    const input={requestId:row.id,revision:row.revision,clientMessageId:'remote-response',answers:{secret:['Синтетический секрет 🪷 73159']}};
    assert.equal((await answerNativeRequest(storage,'remote-thread',input)).submitted,true);
    assert.equal((await answerNativeRequest(storage,'remote-thread',input)).replayed,true);
    const done=once(child,'exit'),reply=once(child,'message');child.send('finish');
    assert.equal((await reply)[0].calls,1);await done;
    const db=(await f.load('native-turn-coordinator')).nativeExecutionCoordinator();
    for(const name of [db.file,`${db.file}-wal`])assert.equal(readFileSync(name).includes(Buffer.from(input.answers.secret[0])),false);
  }finally{
    if(child && child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}
    if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;f.cleanup();
  }
});

test('new isolated chats narrow configured full access into independent workspaces while configured mode is preserved',async()=>{
  const f=await fixtureModules();
  try {
    const git=(...args)=>execFileSync('git',args,{cwd:f.root,stdio:'ignore'});
    git('init');git('config','user.name','Workspace fixture');git('config','user.email','fixture@example.invalid');
    writeFileSync(path.join(f.root,'file.txt'),'base');git('add','.');git('commit','-m','base');
    let native={id:'initial',cwd:f.root,status:'idle',turns:[]},count=0;const requests=[];
    const connection={markThreadLoaded:()=>{},request:async(method,params)=>{if(method==='thread/start'){requests.push(params);Object.assign(native,{id:'native-'+(++count),cwd:params.cwd});return {thread:native};}return {};}};
    const gateway=await coordinatedGateway(f,connection,native);
    gateway.runtime.threadDefaults=()=>({cwd:f.root,sandbox:'danger-full-access'});
    const first=await gateway.createThread({clientThreadId:randomUUID(),source:'chat',workspace:{mode:'isolated'}});
    const second=await gateway.createThread({clientThreadId:randomUUID(),source:'chat',workspace:{mode:'isolated'}});
    const a=await gateway.store.get(first.detail.thread.chatId),b=await gateway.store.get(second.detail.thread.chatId);
    assert.equal(a.sandbox,'workspace-write');assert.equal(b.sandbox,'workspace-write');assert.notEqual(a.workspace.cwd,b.workspace.cwd);
    assert.ok(requests.slice(0,2).every(request=>request.sandbox==='workspace-write' && request.cwd!==f.root));
    const configured=await gateway.createThread({clientThreadId:randomUUID(),source:'chat',workspace:{mode:'configured'}});
    assert.equal((await gateway.store.get(configured.detail.thread.chatId)).sandbox,'danger-full-access');assert.equal(requests.at(-1).cwd,a.workspace.source);
  }finally{f.cleanup();}
});

test('separate paginated history cannot interrupt a live turn or release its resource claims',async()=>{
 const f=await fixtureModules();let gateway;
 try {
  const native={id:'history-live-native',cwd:f.root,status:'idle',turns:[]};
  const connection={generation:'fixture',isRunning:()=>true,markThreadLoaded:()=>{},ensureThreadLoaded:async()=>{},request:async(method,params)=>{
   if(method==='thread/start')return {thread:native};
   if(method==='turn/start'){const turn={id:'history-live-turn',status:'inProgress',items:[{id:'user',type:'userMessage',clientId:params.clientUserMessageId,content:params.input}]};native.turns=[turn];native.status='active';return {turn};}return {};
  }};
  gateway=await coordinatedGateway(f,connection,native);
  const created=await gateway.createThreadWithFirstTurn({clientThreadId:randomUUID(),source:'chat',initialTurn:{clientMessageId:randomUUID(),input:[{type:'text',text:'still running'}]}});
  const chatId=created.data.detail.thread.chatId,binding=await gateway.store.get(chatId);
  const {HistoryReader}=await f.load('history-reader');gateway.historyReader=new HistoryReader();
  gateway.runtime.provider=async()=>({view:{stateIdentityHash:'storage-v2:fixture',availability:'ready',version:'test',capabilities:{fullChat:true,historyPagination:true}}});
  const interrupted={...native.turns[0],status:'interrupted'};
  native.cwd=binding.workspace.cwd;
  gateway.runtime.historyRequest=async (_provider,method)=>method==='thread/read'?{thread:{...native,status:{type:'notLoaded'},turns:undefined}}:{data:[interrupted],nextCursor:null};
  const owners=gateway.store.execution.claims().filter(row=>row.kind!=='metadata').length;
  assert.ok(owners>0);
  const page=await gateway.historyPage(chatId,undefined,1);
  assert.equal(page.data[0].status,'in_progress');
  assert.equal(gateway.store.execution.claims().filter(row=>row.kind!=='metadata').length,owners);
  await gateway.reconcileExecutions(binding,{...native,status:{type:'notLoaded'},turns:[interrupted]});
  assert.equal(gateway.store.execution.claims().filter(row=>row.kind!=='metadata').length,owners);
  native.turns[0].status='completed';native.status='idle';await gateway.reconcileExecutions(binding,native);
  assert.equal(gateway.store.execution.claims().filter(row=>row.kind!=='metadata').length,0);
 }finally{if(gateway){gateway.queueStopped=true;clearTimeout(gateway.queueTimer);for(const id of gateway.activeTurns.keys())gateway.releaseActiveTurn(id);}f.cleanup();}
});
