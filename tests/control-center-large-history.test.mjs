import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
const temporary = mkdtempSync(path.join(os.tmpdir(), "pritha-large-history-tests-"));
for (const file of ["history-reader", "normalize", "history-stream"]) {
  const source = readFileSync(`interfaces/control-center/src/lib/codex-chat/${file}.ts`, "utf8");
  writeFileSync(path.join(temporary, `${file}.mjs`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"./normalize"', '"./normalize.mjs"'));
}
const { HistoryReader, HISTORY_PAGE_BYTES } = await import(pathToFileURL(path.join(temporary, "history-reader.mjs")));
const { compactHistoryEvent } = await import(pathToFileURL(path.join(temporary, "history-stream.mjs")));
function turn(n, text = `Answer ${n}`) { return { id: `native-${n}`, startedAt: 1700000000 + n, completedAt: 1700000001 + n, status: "completed", items: [ { type: "userMessage", id: `user-${n}`, content: [{ type: "text", text: `Question ${n}` }] }, { type: "agentMessage", id: `answer-${n}`, text } ] }; }
function context(turns, pagination = true, providerId = "desktop_bundled") {
  const calls = [];
  const c = { root: "/fixture", version: "test", pagination, binding: { chatId: "chat_fixture", nativeThreadId: "thread", stateIdentityHash: "storage-v2:fixture", providerId, messageReceipts: {}, taskLinks: [], createdAt: new Date(0).toISOString() },
    read: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") return { thread: { id: "thread", cwd: "/fixture", turns } };
      if (method === "thread/turns/list") {
        const end = params.cursor ? turns.findIndex(x => x.id === params.cursor) : turns.length;
        const found = turns.slice(Math.max(0, end - params.limit), end).reverse();
        // Summary deliberately omits commands: it is not complete native history.
        return { data: found.map(row => ({ ...row, itemsView: "summary", items: row.items.filter(x => ["userMessage", "agentMessage"].includes(x.type)) })), nextCursor: end > params.limit ? found.at(-1).id : null };
      }
      if (method === "thread/items/list") {
        const row = turns.find(x => x.id === params.turnId); let items = [...row.items];
        if (params.sortDirection === "desc") items.reverse();
        const start = Number(params.cursor || 0), data = items.slice(start, start + params.limit).map(item => ({ turnId: row.id, item }));
        return { data, nextCursor: start + data.length < items.length ? String(start + data.length) : null };
      }
      throw new Error(`Unexpected write method: ${method}`);
    } };
  return { c, calls };
}
for (const provider of ["desktop_bundled", "standalone_cli"]) test(`${provider}: native first page stays small for 10,000 turns and survives appends`, async () => {
  const turns = Array.from({ length: 10000 }, (_, i) => turn(i));
  const { c, calls } = context(turns, true, provider); const reader = new HistoryReader();
  const page = await reader.page(c);
  assert.equal(page.data.length, 20); assert.equal(page.data[0].userMessage.markdown, "Question 9980");
  assert.ok(Buffer.byteLength(JSON.stringify(page)) < HISTORY_PAGE_BYTES);
  assert.equal(calls.filter(x => x.method === "thread/read").length, 0);
  turns.push(turn(10000));
  const older = await reader.page(c, page.olderCursor);
  assert.equal(older.data.at(-1).userMessage.markdown, "Question 9979");
  assert.equal(new Set([...page.data, ...older.data].map(x => x.turnId)).size, 40);
  await assert.rejects(reader.page({ ...c, binding: { ...c.binding, stateIdentityHash: "foreign" } }, page.olderCursor), e => e.code === "history_cursor_expired");
  await assert.rejects(reader.page(c, page.olderCursor + "x"), e => e.code === "history_cursor_expired");
});
test("a huge turn loads its answer first and exposes every activity without gaps", async () => {
  const row = turn(1); row.items.splice(1, 0, ...Array.from({ length: 1500 }, (_, i) => ({ id: `cmd${i}`, type: "commandExecution", command: `echo ${i}`, aggregatedOutput: "stdout ".repeat(2000), status: "completed", exitCode: 0 })));
  const { c } = context([row]); const reader = new HistoryReader();
  const page = await reader.page(c); const latest = page.data[0];
  assert.equal(latest.items.length, 1); assert.equal(latest.history.itemsState, "not_loaded");
  assert.ok(JSON.stringify(page).length < 20_000);
  const all = []; let cursor = latest.history.itemsRef;
  while (cursor) { const p = await reader.items(c, latest.turnId, cursor); assert.ok(Buffer.byteLength(JSON.stringify(p)) < HISTORY_PAGE_BYTES); all.push(...p.data); cursor = p.nextCursor; }
  assert.equal(all.filter(x => x.kind === "command").length, 1500);
  assert.equal(new Set(all.map(x => x.id)).size, all.length);
  const cmd = all.find(x => x.kind === "command");
  const body = await reader.content(c, cmd.id, cmd.contentRef);
  assert.ok(body.text.startsWith("echo 0\n\nstdout"));
});
test("10 MiB messages and Unicode are reconstructed exactly, never copied as a preview", async () => {
  const original = "🙂 Привет\n```js\nconst a = 1;\n```\n".repeat(300000);
  assert.ok(Buffer.byteLength(original) > 10 * 1024 * 1024);
  const { c } = context([turn(1, original)]); const reader = new HistoryReader();
  const message = (await reader.page(c)).data[0].items[0].message;
  assert.ok(Buffer.byteLength(message.markdown) <= 4096); assert.ok(message.contentRef);
  let cursor = message.contentRef, rebuilt = "";
  while (cursor) { const page = await reader.content(c, message.id, cursor); assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 64 * 1024); rebuilt += page.text; cursor = page.nextCursor; }
  assert.equal(rebuilt, original);
});
test("compatibility snapshots deduplicate reads and preserve older pages during new turns", async () => {
  const turns = Array.from({ length: 50 }, (_, i) => turn(i)); const { c, calls } = context(turns, false); const reader = new HistoryReader();
  const [first, duplicate] = await Promise.all([reader.page(c), reader.page(c)]);
  assert.equal(calls.length, 1); assert.deepEqual(first.data, duplicate.data);
  reader.invalidateChat(c.binding.chatId); turns.push(turn(50));
  const fresh = await reader.page(c); assert.equal(fresh.data.at(-1).userMessage.markdown, "Question 50");
  const older = await reader.page(c, first.olderCursor); assert.equal(older.data.at(-1).userMessage.markdown, "Question 29");
  reader.clear(); await assert.rejects(reader.page(c, first.olderCursor), e => e.code === "history_cursor_expired");
});
test("compatibility detail chunk positions do not overwrite item positions", async () => {
  const text = "Привет🙂".repeat(20000); const { c } = context([turn(1, text)], false); const reader = new HistoryReader();
  const row = (await reader.page(c)).data[0]; const items = await reader.items(c, row.turnId, row.history.itemsRef); const item = items.data.find(x => x.kind === "assistant_message");
  let cursor = item.message.contentRef, result = "";
  while (cursor) { const page = await reader.content(c, item.id, cursor); result += page.text; cursor = page.nextCursor; }
  assert.equal(result, text);
});
test("unsupported pagination falls back once; permission errors never do", async () => {
  const { c, calls } = context([turn(1)]); const read = c.read;
  c.read = async (method, params) => { if (method === "thread/turns/list") throw Object.assign(new Error("unknown method"), { rpcCode: -32601 }); return read(method, params); };
  const reader = new HistoryReader(); assert.equal((await reader.page(c)).sourceMode, "compatibility"); assert.equal(calls.length, 1);
  const bad = context([turn(1)]).c; bad.read = async () => { throw new Error("permission denied"); };
  await assert.rejects(new HistoryReader().page(bad), /permission denied/);
});
test("SSE compact projection excludes full history and command output", () => {
  const record = { event: "turn.completed", data: { eventId: "e", payload: { turn: turn(1, "x".repeat(100000)) } } };
  assert.deepEqual(compactHistoryEvent(record).data.payload, {}); assert.ok(record.data.payload.turn);
  assert.equal(compactHistoryEvent({ ...record, event: "item.completed" }).event, "history.changed");
});

test("expired compatibility cursors and changed native content fail explicitly", async () => {
  const realNow = Date.now;
  try {
    const { c } = context(Array.from({ length: 30 }, (_, i) => turn(i)), false);
    const reader = new HistoryReader(), first = await reader.page(c);
    Date.now = () => realNow() + 31000;
    await assert.rejects(reader.page(c, first.olderCursor), e => e.code === "history_cursor_expired");
    Date.now = realNow;
    const row = turn(1, "🙂".repeat(40000)), native = context([row]).c;
    const message = (await reader.page(native)).data[0].items[0].message;
    const part = await reader.content(native, message.id, message.contentRef);
    row.items[1].text += "edited";
    Date.now = () => realNow() + 31000;
    await assert.rejects(reader.content(native, message.id, part.nextCursor), e => e.code === "history_content_changed");
  } finally { Date.now = realNow; }
});
test("oversized compatibility histories recommend pagination without mutating storage", async () => {
  const { c, calls } = context([turn(1, "x".repeat(64 * 1024 * 1024))], false);
  await assert.rejects(new HistoryReader().page(c), e => e.code === "history_response_too_large");
  assert.deepEqual(calls.map(x => x.method), ["thread/read"]);
});
test("full user requests and plans remain accessible when summaries omit them", async () => {
  const row = turn(1); row.items.splice(1, 0, { type: "plan", id: "plan", text: "step\n".repeat(20000) });
  const { c } = context([row]); const read = c.read;
  c.read = async (method, params, deadline) => {
    const response = await read(method, params, deadline);
    if (method === "thread/turns/list") for (const turn of response.data) turn.items = [];
    return response;
  };
  const reader = new HistoryReader(), page = await reader.page(c), turnView = page.data[0];
  const items = await reader.items(c, turnView.turnId, turnView.history.itemsRef);
  const user = items.data.find(x => x.kind === "user_message");
  assert.equal((await reader.content(c, user.id, user.message.contentRef)).text, "Question 1");
  const plan = items.data.find(x => x.kind === "plan");
  let text = "", cursor = plan.contentRef;
  while (cursor) { const part = await reader.content(c, plan.id, cursor); text += part.text; cursor = part.nextCursor; }
  assert.equal(text, row.items[1].text);
});

test("byte-bound activity pages retain neighbours and defer oversized labels", async () => {
  const row = turn(1);
  row.items.splice(1, 0, ...Array.from({ length: 100 }, (_, i) => ({ id: `files${i}`, type: "fileChange", changes: Array.from({ length: 10 }, () => ({ path: "x".repeat(10000), kind: "add", diff: "original diff" })) })));
  const { c } = context([row]), reader = new HistoryReader();
  const view = (await reader.page(c)).data[0]; let cursor = view.history.itemsRef, files = 0;
  while (cursor) { const page = await reader.items(c, view.turnId, cursor); assert.ok(Buffer.byteLength(JSON.stringify(page)) < HISTORY_PAGE_BYTES); files += page.data.filter(x => x.kind === "file_change").length; cursor = page.nextCursor; }
  assert.equal(files, 100);
});
