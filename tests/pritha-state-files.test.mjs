import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { inspectPrithaStateFiles, resolvePrithaMemoryDatabase, resolvePrithaSetupFile } from '../scripts/lib/state-files.mjs';

function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'pritha-state-names-')), root = path.join(base, 'Code with spaces'), stateRoot = path.join(base, 'state');
  mkdirSync(root); mkdirSync(stateRoot);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return { base, root, stateRoot, env: {} };
}
function put(file, value = 'preserved fixture bytes') { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value, { mode: 0o600 }); }
function resolve(kind, options) {
  try { return { path: (kind === 'memory' ? resolvePrithaMemoryDatabase : resolvePrithaSetupFile)(options) }; }
  catch (error) { return { code: error.code }; }
}
function python(kind, options) {
  const script = `import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom pritha_state_files import resolve_pritha_state_file,PrithaStateFileError\na=json.load(sys.stdin)\ntry: print(json.dumps({'path':str(resolve_pritha_state_file(**a))}))\nexcept PrithaStateFileError as e: print(json.dumps({'code':e.code}))`;
  const result = spawnSync('python3', ['-c', script, path.resolve('scripts')], { encoding: 'utf8', input: JSON.stringify({ kind, root: options.root, state_root: options.stateRoot, env: {} }) });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

for (const external of [false, true]) for (const kind of ['memory', 'setup']) {
  test(`${kind} ${external ? 'external' : 'checkout'} selection is read-only and Node/Python agree through fresh, old, new and conflict states`, t => {
    const f = fixture(t), options = { root: f.root, stateRoot: external ? f.stateRoot : f.root, env: {} };
    const fresh = inspectPrithaStateFiles(kind, options);
    assert.equal(fresh.status, 'fresh');
    assert.equal(path.basename(fresh.current), kind === 'memory' ? 'pritha.sqlite' : external ? 'setup.json' : '.pritha-setup.json');
    const before = readdirSync(f.base, { recursive: true });
    assert.deepEqual(resolve(kind, options), { path: fresh.current });
    assert.deepEqual(python(kind, options), resolve(kind, options));
    assert.deepEqual(readdirSync(f.base, { recursive: true }), before, 'resolution must not bootstrap directories/files');
    if (fresh.legacy) {
      put(fresh.legacy);
      assert.equal(inspectPrithaStateFiles(kind, options).status, 'legacy');
      assert.deepEqual(resolve(kind, options), { path: fresh.legacy });
      assert.deepEqual(python(kind, options), resolve(kind, options));
      put(fresh.current);
      assert.equal(inspectPrithaStateFiles(kind, options).status, 'conflict');
      assert.deepEqual(resolve(kind, options), { code: 'pritha_state_conflict' });
      assert.deepEqual(python(kind, options), resolve(kind, options));
      assert.equal(readFileSync(fresh.legacy, 'utf8'), readFileSync(fresh.current, 'utf8'), 'identical bytes still mean two writable sources; never choose by mtime or equality');
      rmSync(fresh.legacy);
    } else put(fresh.current);
    assert.equal(inspectPrithaStateFiles(kind, options).status, 'canonical');
    assert.deepEqual(resolve(kind, options), { path: fresh.current });
    assert.deepEqual(python(kind, options), resolve(kind, options));
  });
}

test('state symlinks, hardlinks and non-files fail without leaking or changing the target', t => {
  for (const variant of ['file-symlink', 'dangling-symlink', 'directory-symlink', 'hardlink', 'directory']) {
    const f = fixture(t), file = path.join(f.stateRoot, 'memory', 'pritha.sqlite'), target = path.join(f.base, 'PRIVATE_CANARY');
    put(target); mkdirSync(path.dirname(file));
    if (variant === 'file-symlink') symlinkSync(target, file);
    if (variant === 'dangling-symlink') symlinkSync(target + '-missing', file);
    if (variant === 'hardlink') linkSync(target, file);
    if (variant === 'directory') mkdirSync(file);
    if (variant === 'directory-symlink') { rmSync(path.dirname(file), { recursive: true }); symlinkSync(f.base, path.dirname(file)); }
    assert.deepEqual(resolve('memory', f), { code: 'pritha_state_path_invalid' }, variant);
    assert.deepEqual(python('memory', f), resolve('memory', f));
    assert.throws(() => resolvePrithaMemoryDatabase(f), error => !error.message.includes('PRIVATE_CANARY'));
    assert.equal(readFileSync(target, 'utf8'), 'preserved fixture bytes');
  }
});

test('the configured state alias is valid, but an unfinished migration fences both readers', t => {
  const f = fixture(t), alias = path.join(f.base, 'state alias'); symlinkSync(f.stateRoot, alias);
  const options = { ...f, stateRoot: alias };
  assert.deepEqual(resolve('memory', options), { path: path.join(alias, 'memory', 'pritha.sqlite') });
  assert.deepEqual(python('memory', options), resolve('memory', options));
  const barrier = path.join(f.stateRoot, 'private', 'state-migration', 'active.json'); put(barrier, '{"recovery":"required"}\n');
  for (const kind of ['memory', 'setup']) {
    assert.equal(inspectPrithaStateFiles(kind, options).migrationPending, true);
    assert.deepEqual(resolve(kind, options), { code: 'pritha_state_migration_pending' });
    assert.deepEqual(python(kind, options), resolve(kind, options));
  }
  assert.equal(readFileSync(barrier, 'utf8'), '{"recovery":"required"}\n');
});

test('stateRoot equal to the code directory through an alias keeps the checkout layout', t => {
  const f = fixture(t), alias = path.join(f.base, 'code alias'); symlinkSync(f.root, alias);
  const options = { root: f.root, stateRoot: alias, env: {} };
  assert.deepEqual(resolve('setup', options), { path: path.join(f.root, '.pritha-setup.json') });
  assert.deepEqual(python('setup', options), resolve('setup', options));
  assert.deepEqual(resolve('memory', options), { path: path.join(f.root, '.memory', 'pritha.sqlite') });
  assert.deepEqual(python('memory', options), resolve('memory', options));
});
