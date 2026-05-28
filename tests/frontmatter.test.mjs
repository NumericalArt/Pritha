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

test("yamlList emits project-compatible block lists", () => {
  assert.equal(yamlList([]), "[]");
  assert.equal(yamlList(["Codex", "Codex", "sqlite3"]), "\n  - Codex\n  - sqlite3");
});
