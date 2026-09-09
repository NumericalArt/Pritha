import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";
import { renderScaffoldTemplate } from "../scripts/agents-mother/scaffold/template.mjs";
import { scaffoldTemplateCases } from "./helpers/scaffold-template-fixtures.mjs";

// Captured before template extraction. Update individual hashes only after
// reviewing an intentional change to generated child-agent behavior.
const snapshot = JSON.parse(readFileSync(new URL("./snapshots/scaffold-template-hashes.json", import.meta.url), "utf8"));

function withCaptureDate(render) {
  const RealDate = globalThis.Date;
  const captureTime = RealDate.parse("2026-09-08T12:00:00Z");
  // Keep Node 20 compatibility; only the synchronous fixture render sees this clock.
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [captureTime])); }
    static now() { return captureTime; }
  };
  try { return render(); } finally { globalThis.Date = RealDate; }
}

function fileHashes(files) {
  return files.map(({ path, content }) => ({
    path, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex"),
  })).sort((a, b) => a.path.localeCompare(b.path));
}

for (const [name, data] of scaffoldTemplateCases()) {
  test(`extracted scaffold templates preserve ${name} output bytes`, () => {
    const files = withCaptureDate(() => generatedAgentFiles(data, { voiceCopyTarget: "sibling:template-fixture" }));
    assert.deepEqual(fileHashes(files), snapshot.cases[name]);
  });
}

test("fixed scaffold clock restores Date and does not hide content changes", () => {
  const realDate = globalThis.Date;
  assert.throws(() => withCaptureDate(() => { throw new Error("render failed"); }), /render failed/);
  assert.equal(globalThis.Date, realDate);
  const data = scaffoldTemplateCases().find(([name]) => name === "cli")[1];
  const files = withCaptureDate(() => generatedAgentFiles(data, { voiceCopyTarget: "sibling:template-fixture" }));
  assert.equal(globalThis.Date, realDate);
  const changed = files.map(file => file.path === "README.md" ? { ...file, content: `${file.content}\nUnexpected instruction\n` } : file);
  assert.notDeepEqual(fileHashes(changed), snapshot.cases.cli);
});

test("template values remain literal and required slots fail visibly", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-template-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const url = pathToFileURL(path.join(root, "fixture.tmpl"));
  writeFileSync(url, "Hello {{pritha:name}} / {{pritha:other}}\n");
  const literal = "${process.exit(1)} {{pritha:other}} `quotes` $&";
  assert.equal(renderScaffoldTemplate(url, { name: literal, other: "end" }), `Hello ${literal} / end\n`);
  assert.throws(() => renderScaffoldTemplate(url, { name: "incomplete" }), /Missing scaffold template value: other/);
  assert.throws(() => renderScaffoldTemplate(url, Object.create({ name: "inherited", other: "inherited" })), /Missing scaffold template value: name/);
});
