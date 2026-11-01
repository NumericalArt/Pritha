import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const repo = path.resolve('.');
function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'pritha-state-reader-')), root = path.join(base, 'Code with spaces'); mkdirSync(root);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const env = Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  env.PRITHA_ROOT = root;
  const run = (script, args = []) => spawnSync(script.endsWith('.py') ? 'python3' : process.execPath, [path.join(repo, 'scripts', script), ...args], { cwd: base, env, encoding: 'utf8', timeout: 20_000 });
  return { base, root, env, run };
}
const setupArgs = ['--non-interactive', '--skip-quality', '--json', '--config', path.join(repo, 'tests/fixtures/setup-minimal.json')];
const success = result => { assert.equal(result.status, 0, result.stderr || result.stdout); return result; };
function sql(file, statement) { return success(spawnSync('sqlite3', [file, statement], { encoding: 'utf8' })).stdout.trim(); }

test('fresh setup uses the Pritha name, remains private, and an old completed setup is read without rewriting', t => {
  for (const legacy of [false, true]) {
    const f = fixture(t), current = path.join(f.root, '.pritha-setup.json'), old = path.join(f.root, '.techscope-setup.json');
    const original = { schema: 'techscope-setup-state-v1', version: 1, status: 'completed', profile: 'operator-fixture', warnings: ['accepted-fixture-warning'], pointer: 'retained-fixture-pointer', modules: {} };
    if (legacy) writeFileSync(old, JSON.stringify(original) + '\n', { mode: 0o600 });
    const result = JSON.parse(success(f.run('setup.mjs', setupArgs)).stdout);
    assert.equal(existsSync(legacy ? old : current), true);
    assert.equal(existsSync(legacy ? current : old), false);
    const selected = legacy ? old : current, bytes = readFileSync(selected);
    assert.equal(statSync(selected).mode & 0o777, 0o600);
    if (legacy) { assert.deepEqual(result, original); assert.equal(existsSync(path.join(f.root, '.env.local')), false); }
    else {
      assert.equal(result.schema, 'techscope-setup-state-v1', 'persisted schema IDs are versioned compatibility, not branding labels');
      const env = readFileSync(path.join(f.root, '.env.local'), 'utf8'); assert.match(env, /^PRITHA_ROOT=/m); assert.match(env, /^TECHSCOPE_ROOT=/m);
    }
    success(f.run('setup-status.mjs', ['--json']));
    success(f.run('setup.mjs', setupArgs));
    assert.deepEqual(readFileSync(selected), bytes);
    writeFileSync(legacy ? current : old, bytes);
    const names = readdirSync(f.root).sort();
    assert.notEqual(f.run('setup.mjs', setupArgs).status, 0);
    assert.notEqual(f.run('setup-status.mjs', ['--json']).status, 0);
    assert.deepEqual(readFileSync(current), bytes); assert.deepEqual(readFileSync(old), bytes);
    assert.deepEqual(readdirSync(f.root).sort(), names);
  }
});

test('memory readers cannot create an empty database in a fresh checkout', t => {
  const f = fixture(t);
  mkdirSync(path.join(f.root, '.memory'));
  const before = readdirSync(f.root, { recursive: true });
  assert.notEqual(f.run('query-memory.mjs', ['stats']).status, 0);
  assert.notEqual(f.run('memory-retrieve.py', ['fixture', '--json']).status, 0);
  assert.deepEqual(readdirSync(f.root, { recursive: true }), before);
});

test('direct setup commands follow the checkout state pointer without importing unrelated credentials', t => {
  const f = fixture(t), state = path.join(f.base, 'external state'); mkdirSync(path.join(state, 'setup'), { recursive: true });
  const source = JSON.stringify({ schema: 'techscope-setup-state-v1', version: 1, status: 'completed', profile: 'external-fixture', modules: {}, warnings: [] }) + '\n';
  writeFileSync(path.join(state, 'setup/setup.json'), source, { mode: 0o600 });
  const pointer = `PRITHA_STATE_ROOT="${state}"\nUNRELATED_PRIVATE_CANARY=must-not-load\n`;
  writeFileSync(path.join(f.root, '.env.local'), pointer, { mode: 0o600 });
  for (const [script, args] of [['setup-status.mjs', ['--json']], ['setup.mjs', setupArgs]]) {
    const result = success(f.run(script, args));
    assert.equal(JSON.parse(result.stdout).profile, 'external-fixture'); assert.doesNotMatch(result.stdout, /must-not-load/);
  }
  assert.equal(readFileSync(path.join(f.root, '.env.local'), 'utf8'), pointer);
  assert.equal(readFileSync(path.join(state, 'setup/setup.json'), 'utf8'), source);
  assert.equal(existsSync(path.join(f.root, '.pritha-setup.json')), false);
});

test('fresh rebuild, FTS and Python retrieval use the same file; legacy upgrade preserves IDs and embeddings', t => {
  const f = fixture(t), dir = path.join(f.root, '.memory'), current = path.join(dir, 'pritha.sqlite'), old = path.join(dir, 'techscope.sqlite');
  mkdirSync(dir); mkdirSync(path.join(f.root, '04_standards'));
  writeFileSync(path.join(dir, 'schema.sql'), readFileSync(path.join(repo, '.memory/schema.sql')));
  writeFileSync(path.join(f.root, '04_standards/fixture.md'), '---\nid: fixture-standard\ntype: standard\nstatus: accepted\ncreated: 2026-11-01\nupdated: 2026-11-01\nmemory_domain: agent-building-knowledge\ntopics: [fixture]\ntools: []\nsources: []\nrelated: {}\n---\n\n# Verified fixture\n\nDurable evidence protects exact identity in a restart.\n');
  success(f.run('rebuild-memory.mjs'));
  assert.equal(existsSync(current), true); assert.equal(existsSync(old), false);
  const chunk = sql(current, "SELECT id FROM chunks LIMIT 1;");
  assert.ok(chunk);
  sql(current, `INSERT INTO embeddings(id,owner_type,owner_id,provider,model,dimensions,vector_json,created_at) VALUES('fixture-embedding','chunk','${chunk}','sentence-transformers','fixture-model',2,'[0.5,0.5]','2026-11-01');`);
  const before = sql(current, 'SELECT id,owner_id,dimensions,vector_json FROM embeddings;');
  for (const legacy of [false, true]) {
    if (legacy) renameSync(current, old);
    success(f.run('rebuild-memory.mjs'));
    const selected = legacy ? old : current;
    assert.equal(sql(selected, 'SELECT id,owner_id,dimensions,vector_json FROM embeddings;'), before);
    assert.match(success(f.run('query-memory.mjs', ['stats'])).stdout, /embeddings\s+1/);
    assert.match(success(f.run('query-memory.mjs', ['search', 'durable evidence'])).stdout, /04_standards\/fixture\.md/);
    const retrieved = JSON.parse(success(f.run('memory-retrieve.py', ['durable evidence', '--json'])).stdout);
    assert.ok(retrieved.results.some(item => item.document_id === 'fixture-standard'));
    assert.equal(existsSync(legacy ? current : old), false);
  }
  const bytes = readFileSync(old); writeFileSync(current, bytes);
  assert.notEqual(f.run('rebuild-memory.mjs').status, 0);
  assert.notEqual(f.run('query-memory.mjs', ['stats']).status, 0);
  assert.notEqual(f.run('memory-retrieve.py', ['durable evidence', '--json']).status, 0);
  assert.deepEqual(readFileSync(current), bytes); assert.deepEqual(readFileSync(old), bytes);
});
