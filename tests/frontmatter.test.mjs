import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFrontmatter, parseFrontmatterData, yamlList } from "../scripts/lib/frontmatter.mjs";

test("parseFrontmatter preserves body and parses nested lists", () => {
  const text = readFileSync("tests/fixtures/frontmatter/basic.md", "utf8");
  const parsed = parseFrontmatter(text);
  assert.equal(parsed.data.id, "fixture-basic");
  assert.deepEqual(parsed.data.topics, ["agents", "tests"]);
  assert.deepEqual(parsed.data.tools, ["Codex", "sqlite3"]);
  assert.deepEqual(parsed.data.related.workflows, ["07_workflows/example.md"]);
  assert.match(parsed.body, /^# Fixture/m);
});

test("parseFrontmatterData returns null when frontmatter is absent", () => {
  assert.equal(parseFrontmatterData("# No frontmatter\n"), null);
});

test("frontmatter parser rejects prototype-pollution keys", () => {
  const parsed = parseFrontmatterData([
    "---",
    "__proto__:",
    "  polluted: yes",
    "constructor:",
    "  prototype: unsafe",
    "safe:",
    "  __proto__: ignored",
    "  value: retained",
    "---",
    "body",
  ].join("\n"));
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.hasOwn(parsed, "__proto__"), false);
  assert.equal(Object.hasOwn(parsed, "constructor"), false);
  assert.equal(Object.hasOwn(parsed.safe, "__proto__"), false);
  assert.equal(parsed.safe.value, "retained");
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(Object.getPrototypeOf(parsed.safe), null);
});

test("yamlList emits project-compatible block lists", () => {
  assert.equal(yamlList([]), "[]");
  assert.equal(yamlList(["Codex", "Codex", "sqlite3"]), "\n  - Codex\n  - sqlite3");
});

test("flow subject metadata matches block metadata without mutating private authored files", () => {
  const flow = parseFrontmatterData('---\nsubject: {kind: child-agent, id: "synthetic-agent"}\ntopics: ["commas, inside", nested]\nrelated: {workflows: [one, two]}\n---\n');
  const block = parseFrontmatterData('---\nsubject:\n  kind: child-agent\n  id: synthetic-agent\n---\n');
  assert.deepEqual(flow.subject, block.subject);
  assert.deepEqual(flow.topics, ["commas, inside", "nested"]);
  assert.deepEqual(flow.related.workflows, ["one", "two"]);
  assert.equal(Object.getPrototypeOf(flow.subject), null);
});

test("flow metadata rejects pollution, ambiguous keys and malformed structures", () => {
  const parsed = parseFrontmatterData('---\nsubject: {__proto__: {polluted: yes}, constructor: {prototype: unsafe}, kind: child-agent, id: safe}\n---\n');
  assert.equal(Object.hasOwn(parsed.subject, "__proto__"), false);
  assert.equal(Object.hasOwn(parsed.subject, "constructor"), false);
  assert.equal(({}).polluted, undefined);
  for (const value of ['{kind: agent, kind: other}', '{kind: "unclosed}', '{kind: [x}', '{kind: agent,, id: one}']) {
    assert.equal(typeof parseFrontmatterData(`---\nsubject: ${value}\n---\n`).subject, "string");
  }
  const nested = "[".repeat(1000) + "payload" + "]".repeat(1000);
  assert.doesNotThrow(() => parseFrontmatterData(`---\nsubject: ${nested}\n---\n`));
});
