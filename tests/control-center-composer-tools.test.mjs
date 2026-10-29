import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-composer-tools-"));
const modules = {};
for (const name of ["quote-reply", "image-annotation"]) {
  const source = readFileSync(`interfaces/control-center/src/lib/codex-chat/${name}.ts`, "utf8");
  const file = path.join(tmp, `${name}.mjs`);
  writeFileSync(file, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
  modules[name] = await import(pathToFileURL(file).href);
}
test.after(() => rmSync(tmp, { recursive: true, force: true }));
const q = modules["quote-reply"], a = modules["image-annotation"];
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2qYIAAAAASUVORK5CYII=", "base64");

test("quotes preserve draft whitespace, code, Unicode and every line without truncation", () => {
  const draft = "Keep my draft  ";
  assert.equal(q.appendQuote(draft, "Привет 🪷\r\n```js\r\nx()\n```"), `${draft}\n\n> **Из ответа Pritha:**\n> Привет 🪷\n> \`\`\`js\n> x()\n> \`\`\`\n\n`);
  assert.equal(q.appendQuote(draft, "  \n"), draft);
  assert.equal(q.appendQuote("draft\n\n", "line"), "draft\n\n> **Из ответа Pritha:**\n> line\n\n");
  const empty = q.appendQuote("", "x");
  assert.equal(q.appendQuote("a".repeat(64_000 - empty.length - 2), "x").length, 64_000);
  assert.throws(() => q.appendQuote("a".repeat(64_000 - empty.length - 1), "x"), /limit/);
  assert.equal(q.appendQuote(q.appendQuote("", "first"), "second").match(/Из ответа/g).length, 2);
});
test("image coordinates clamp and scale independently of viewport and DPR", () => {
  assert.deepEqual(a.imagePoint(110, 70, { left: 10, top: 20, width: 200, height: 100 }, 800, 400), { x: 400, y: 200 });
  assert.deepEqual(a.imagePoint(-1, 1000, { left: 0, top: 0, width: 200, height: 100 }, 800, 400), { x: 0, y: 400 });
});
test("undo and redo operate on complete strokes and new actions clear redo", () => {
  const one = { tool: "pen", points: [{ x: 1, y: 2 }, { x: 4, y: 5 }], color: "#ef4444", width: 6 };
  let state = a.emptyAnnotationHistory();
  state = a.annotationHistory(state, { type: "add", value: one });
  const complete = state;
  state = a.annotationHistory(state, { type: "undo" }); assert.deepEqual(state.present, []);
  state = a.annotationHistory(state, { type: "redo" }); assert.deepEqual(state.present, complete.present);
  state = a.annotationHistory(state, { type: "undo" });
  state = a.annotationHistory(state, { type: "add", value: { ...one, tool: "arrow" } });
  assert.deepEqual(state.future, []); assert.equal(complete.present[0].tool, "pen");
});
test("compressed headers reject huge or animated images before decoding", () => {
  assert.deepEqual(a.annotationImageInfo(pixel), { width: 1, height: 1, type: "image/png" });
  const huge = Buffer.from(pixel); huge.writeUInt32BE(8193, 16);
  assert.throws(() => a.annotationImageInfo(huge), /8192/);
  const many = Buffer.from(pixel); many.writeUInt32BE(5000, 16); many.writeUInt32BE(4000, 20);
  assert.throws(() => a.annotationImageInfo(many), /megapixels/);
  const animated = Buffer.from(pixel); animated.write("acTL", 37);
  assert.throws(() => a.annotationImageInfo(animated), /Animated/);
  assert.throws(() => a.annotationImageInfo(Buffer.from("GIF89a")), /static/);
  assert.throws(() => a.annotationImageInfo(pixel.subarray(0, 40)), /incomplete/);
  const webp = Buffer.alloc(30); webp.write("RIFF"); webp.writeUInt32LE(22, 4); webp.write("WEBPVP8X", 8); webp.writeUInt32LE(10, 16); webp[20] = 2;
  assert.throws(() => a.annotationImageInfo(webp), /Animated/);
  webp[20] = 0; webp[24] = 9; webp[27] = 19;
  assert.deepEqual(a.annotationImageInfo(webp), { width: 10, height: 20, type: "image/webp" });
  const jpeg = Buffer.from([255,216,255,192,0,11,8,0,20,0,10,1,1,0x11,0]);
  assert.deepEqual(a.annotationImageInfo(jpeg), { width: 10, height: 20, type: "image/jpeg" });
});
test("all tools draw without mutating the source actions", () => {
  const calls = [], ctx = new Proxy({}, { set: () => true, get: (_o, name) => (...args) => calls.push([name, ...args]) });
  const actions = ["pen", "arrow", "rectangle", "text"].map(tool => ({ tool, points: [{ x: 1, y: 2 }, { x: 30, y: 40 }], width: 3, color: "red", text: "Привет\n🪷", fontSize: 24 }));
  const before = JSON.stringify(actions);
  a.drawAnnotations(ctx, "source", 80, 60, actions);
  assert.equal(JSON.stringify(actions), before);
  assert.equal(calls.filter(c => c[0] === "drawImage").length, 1);
  assert.equal(calls.filter(c => c[0] === "fillText").length, 2);
  assert.equal(calls.filter(c => c[0] === "strokeRect").length, 1);
});
test("future Claude fixtures document unverified capabilities, never enable a runtime", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/composer-tools/claude-compatibility.json", "utf8"));
  assert.equal(fixture.status, "not-verified"); assert.equal(fixture.runtimeEnabled, false);
  assert.ok(fixture.required.quote.includes("ui.selection"));
  assert.ok(fixture.required.annotation.includes("edited-image-delivery"));
  // The offline contract checks the portable output only; there is no Claude SDK call.
  assert.match(q.appendQuote("", fixture.quote.selection), /> Первая строка\n> Вторая строка/);
  assert.equal(a.annotationImageInfo(pixel).type, fixture.annotation.outputType);
  assert.equal(fixture.annotation.overwriteOriginal, false);
});

test("real private attachment storage accepts an immutable copy and preserves the original", async () => {
  for (const [name, sourcePath] of [["private-json", "interfaces/control-center/src/lib/private-json.ts"], ["attachment-store", "interfaces/control-center/src/lib/codex-chat/attachment-store.ts"]]) {
    const source = readFileSync(sourcePath, "utf8");
    writeFileSync(path.join(tmp, `${name}.mjs`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"@/lib/private-json"', '"./private-json.mjs"'));
  }
  const { ChatAttachmentStore } = await import(pathToFileURL(path.join(tmp, "attachment-store.mjs")).href);
  const state = path.join(tmp, "state"), store = new ChatAttachmentStore(state, path.join(state, "chat"));
  const originalId = randomUUID(), editedId = randomUUID();
  const edited = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const request = bytes => new Request("http://fixture/upload", { method: "PUT", body: bytes });
  await store.upload(originalId, "original.png", request(pixel));
  await assert.rejects(store.upload(originalId, "original.png", request(edited)), error => error.code === "attachment_conflict");
  const copy = await store.upload(editedId, "original.annotated.png", request(edited));
  assert.equal(copy.kind, "image"); assert.equal(copy.mediaType, "image/png");
  const before = await store.resolve(originalId); assert.deepEqual(readFileSync(before.filePath), pixel);
  assert.equal(a.annotationImageInfo(readFileSync((await store.resolve(editedId)).filePath)).width, 1);
  const prepared = await store.prepare([editedId]); assert.deepEqual(prepared.map(file => file.view.id), [editedId]);
  await store.retain([editedId]); assert.deepEqual(await store.upload(editedId, "original.annotated.png", request(edited)), copy);
  assert.deepEqual(readFileSync(before.filePath), pixel);
});
