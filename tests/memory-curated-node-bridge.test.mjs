import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { searchCuratedMemory } from "../scripts/lib/curated-memory.mjs";

test("Node curated entrypoint uses the explicit instance and cannot fall back to private or historical rows", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-curated-bridge-"));
  const root = path.join(base, "code"), state = path.join(base, "state");
  const original = process.env.PRITHA_STATE_ROOT;
  try {
    mkdirSync(root); mkdirSync(path.join(state, "memory"), { recursive: true });
    const db = path.join(state, "memory/techscope.sqlite");
    execFileSync("sqlite3", [db, `
      CREATE TABLE documents(id TEXT,path TEXT,title TEXT,type TEXT,status TEXT);
      CREATE TABLE chunks(id TEXT,document_id TEXT,heading TEXT,text TEXT);
      CREATE VIRTUAL TABLE chunks_fts USING fts5(text,heading,document_id UNINDEXED,chunk_id UNINDEXED);
      CREATE TABLE entities(id TEXT,type TEXT,name TEXT);
      CREATE TABLE relations(source_type TEXT,source_id TEXT,relation_type TEXT,target_id TEXT);
      INSERT INTO entities VALUES ('a','memory-domain','agent-building-knowledge'),('u','memory-domain','user-model');
      INSERT INTO documents VALUES ('good','02_briefs/public.md','Public facts','brief','reviewed'),('old','03_reviews/old.md','Old','review','outdated'),('private','.private/user-memory/private.md','Private','brief','reviewed');
      INSERT INTO chunks VALUES ('g','good','Facts','plugin listener cleanup'),('o','old','Facts','plugin listener cleanup'),('p','private','Facts','plugin listener SYNTHETIC_PRIVATE_VIOLET_729');
      INSERT INTO chunks_fts SELECT text,heading,document_id,id FROM chunks;
      INSERT INTO relations VALUES ('document','good','IN_DOMAIN','a'),('document','old','IN_DOMAIN','a'),('document','private','IN_DOMAIN','u');
    `]);
    const before = readFileSync(db);
    process.env.PRITHA_STATE_ROOT = state;
    const result = searchCuratedMemory("подписки плагина", { root });
    assert.deepEqual(result.results.map(x => x.document_id), ["good"]);
    assert.equal(result.mode, "fts");
    assert.throws(() => searchCuratedMemory("plugin", { root, domain: "user-model" }), /Invalid/);
    const cli = spawnSync(process.execPath, [path.resolve("scripts/query-memory.mjs"), "curated", "подписки плагина"], {
      env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: state }, encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout).results.map(x => x.document_id), ["good"]);
    assert.deepEqual(readFileSync(db), before);
  } finally {
    if (original === undefined) delete process.env.PRITHA_STATE_ROOT; else process.env.PRITHA_STATE_ROOT = original;
    rmSync(base, { recursive: true, force: true });
  }
});
