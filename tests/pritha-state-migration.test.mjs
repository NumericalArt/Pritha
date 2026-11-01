import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { executionDirectory } from '../scripts/lib/execution-lifecycle.mjs';

const script = path.resolve('scripts/pritha-state-migrate.mjs');
function executable(file, source) { writeFileSync(file, source); chmodSync(file, 0o755); }
function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'pritha-state-cli-'));
  const root = path.join(base, 'Code with spaces'), bin = path.join(base, 'bin'), home = path.join(base, 'home');
  for (const directory of [root, bin, home]) mkdirSync(directory);
  executable(path.join(bin, 'launchctl'), '#!/bin/sh\nif [ "$1" != print ]; then exit 90; fi\nprintf "Could not find service\\n" >&2\nexit 113\n');
  executable(path.join(bin, 'lsof'), '#!/bin/sh\nexit 1\n');
  writeFileSync(path.join(root, '.techscope-setup.json'), '{"schema":"techscope-setup-state-v1","status":"completed","profile":"fixture"}\n');
  const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: home, PRITHA_ROOT: root,
    PRITHA_STATE_ROOT: root, PRITHA_INSTANCE_ID: 'migration-fixture', PRITHA_CONTROL_CENTER_PORT: '64621' };
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const run = (command, ...args) => spawnSync(process.execPath, [script, command, '--root', root, '--json', ...args], { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
  return { root, bin, env, run };
}
function successful(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); }

test('offline migration transaction passes 29 interruption, rollback, WAL and isolation cases', () => {
  const result = spawnSync('python3', [path.resolve('tests/python/test_pritha_state_migration.py'), '-v'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 29 tests/);
});

test('state CLI plan/status are read-only; apply pins the plan and requires --yes; recovery is idempotent', t => {
  const f = fixture(t), before = readdirSync(f.root, { recursive: true });
  const plan = successful(f.run('plan'));
  assert.equal(plan.ready, true); assert.equal(plan.actions.length, 1);
  assert.equal(successful(f.run('status')).status, 'idle');
  assert.deepEqual(readdirSync(f.root, { recursive: true }), before);
  assert.equal(JSON.parse(f.run('apply', '--plan-hash', plan.plan_hash).stderr).error, 'explicit_yes_required');
  assert.equal(JSON.parse(f.run('apply', '--yes').stderr).error, 'plan_hash_required');
  const receipt = successful(f.run('apply', '--yes', '--plan-hash', plan.plan_hash));
  assert.equal(receipt.status, 'complete');
  assert.equal(successful(f.run('status', '--id', receipt.id)).status, 'complete');
  assert.equal(existsSync(path.join(f.root, '.pritha-setup.json')), true);
  assert.equal(successful(f.run('apply', '--yes', '--plan-hash', plan.plan_hash)).status, 'already_complete');
  assert.equal(successful(f.run('rollback', '--yes', '--id', receipt.id)).status, 'rolled_back');
  assert.equal(existsSync(path.join(f.root, '.techscope-setup.json')), true);
  assert.equal(existsSync(path.join(f.root, '.pritha-setup.json')), false);
});

test('loaded or unobservable service blocks migration before any private manifest or backup exists', { skip: process.platform !== 'darwin' }, t => {
  const f = fixture(t);
  for (const [code, expected] of [[0, 'managed_runtime_loaded'], [1, 'runtime_status_unavailable']]) {
    executable(path.join(f.bin, 'launchctl'), `#!/bin/sh\nexit ${code}\n`);
    const plan = successful(f.run('plan'));
    assert.equal(plan.ready, false); assert.deepEqual(plan.runtime_blockers, [expected]);
    assert.equal(JSON.parse(f.run('apply', '--yes', '--plan-hash', plan.plan_hash).stderr).error, expected);
    assert.equal(existsSync(path.join(f.root, '.private')), false);
  }
});

test('active execution lease blocks migration without draining admission or altering task ownership', t => {
  const f = fixture(t), db = new ExecutionCoordinator({ stateRoot: f.root, directory: executionDirectory(f.root, f.root) });
  try {
    const lease = db.claim(['native:migration-fixture'], 'fixture-owner');
    const admission = db.admission();
    const plan = successful(f.run('plan'));
    assert.deepEqual(plan.runtime_blockers, ['active_or_unknown_executions']);
    assert.equal(JSON.parse(f.run('apply', '--yes', '--plan-hash', plan.plan_hash).stderr).error, 'active_or_unknown_executions');
    assert.deepEqual(db.admission(), admission); lease.assertOwned(); lease.release();
    assert.equal(existsSync(path.join(f.root, '.private/state-migration')), false);
  } finally { db.close(); }
});

test('corrupt setup errors are sanitized and private status supports rollback of unfinished preparation', t => {
  const f = fixture(t), legacy = path.join(f.root, '.techscope-setup.json');
  writeFileSync(legacy, 'PRIVATE_CANARY_invalid_setup');
  const plan = successful(f.run('plan'));
  const failed = f.run('apply', '--yes', '--plan-hash', plan.plan_hash);
  assert.equal(failed.status, 2); assert.doesNotMatch(failed.stderr + failed.stdout, /PRIVATE_CANARY/);
  const state = successful(f.run('status')); assert.equal(state.recovery_required, true);
  assert.equal(successful(f.run('rollback', '--yes', '--id', state.id)).status, 'rolled_back');
  assert.equal(readFileSync(legacy, 'utf8'), 'PRIVATE_CANARY_invalid_setup');
});
