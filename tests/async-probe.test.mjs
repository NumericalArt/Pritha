import test from 'node:test';
import assert from 'node:assert/strict';
import { runAsyncProbe, createProbeCache, createAsyncProbeRunner } from '../scripts/lib/async-probe.mjs';
import { projectAgentCardIdentity } from '../scripts/agents-mother/card-projection.mjs';

test('separate host bundles share an in-flight cache without mixing instance keys', async () => {
  const first = await import('../scripts/lib/async-probe.mjs?bundle=api');
  const second = await import('../scripts/lib/async-probe.mjs?bundle=ssr');
  const namespace = `test-status-${Date.now()}`;
  const a = first.sharedProbeCache(namespace, { ttlMs: 1000, maxEntries: 8 });
  const b = second.sharedProbeCache(namespace, { ttlMs: 1000, maxEntries: 8 });
  let finish, calls = 0;
  const one = a.get('instance-a', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const duplicate = b.get('instance-a', () => { throw new Error('duplicate status scan'); });
  assert.equal(await b.get('instance-b', () => 'other instance'), 'other instance');
  finish('first instance');
  assert.deepEqual(await Promise.all([one, duplicate]), ['first instance', 'first instance']);
  assert.equal(calls, 1);
  assert.equal(await b.get('instance-a', () => 'fresh evidence', { fresh: true }), 'fresh evidence');
  assert.equal(await a.get('instance-a', () => 'unexpected stale read'), 'fresh evidence');
});

test('async diagnostics release the event loop and bound queue, output and stubborn execution', async () => {
  let ticked = false;
  setTimeout(() => { ticked = true; }, 10);
  const calls = Array.from({ length: 8 }, () => runAsyncProbe(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { timeout: 200 }));
  const start = Date.now(), results = await Promise.all(calls);
  assert.equal(ticked, true); assert.ok(Date.now() - start < 2000);
  assert.equal(results.every(result => result.error?.code === 'ETIMEDOUT'), true);
  const oversized = await runAsyncProbe(process.execPath, ['-e', "process.stdout.write('x'.repeat(300000))"], { timeout: 1000 });
  assert.equal(oversized.error.code, 'OUTPUT_LIMIT'); assert.equal(oversized.stdout.length, 256_000);
  assert.throws(() => runAsyncProbe(process.execPath, ['--version'], { timeout: 0 }), /integer between/);
  const failed = await runAsyncProbe(process.execPath, ['-e', 'process.exit(7)'], { timeout: 1000 });
  assert.equal(failed.status, 7);
});

test('diagnostic deadline does not wait for late OS reaping or release occupied worker slots', async () => {
  const reaped = [];
  const run = createAsyncProbeRunner({ execute: () => new Promise(resolve => reaped.push(resolve)) });
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: 8 }, () => run('fixture', [], { timeout: 80 })));
  assert.ok(Date.now() - started < 1000);
  assert.ok(results.every(result => result.error?.code === 'ETIMEDOUT'));
  assert.equal(reaped.length, 4, 'timed-out but unreaped processes retain all four slots');
  const queued = await run('fixture', [], { timeout: 80 });
  assert.equal(queued.error?.code, 'ETIMEDOUT');
  assert.equal(reaped.length, 4, 'expired callers cannot cause additional process creation');
  const ok = { exitCode: 0, stdout: 'late', stderr: '' };
  reaped.forEach(resolve => resolve(ok));
  await new Promise(resolve => setImmediate(resolve));
  const next = run('fixture', [], { timeout: 1000 });
  assert.equal(reaped.length, 5, 'a slot becomes available only after backend cleanup');
  reaped[4]({ ...ok, stdout: 'fresh' });
  assert.equal((await next).stdout, 'fresh');
});

test('access cache deduplicates requests, expires, invalidates and cannot resurrect an old in-flight value', async () => {
  let now = 0, calls = 0, release;
  const cache = createProbeCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  const slow = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const a = cache.get('instance-a', slow), b = cache.get('instance-a', slow);
  await Promise.resolve(); assert.equal(calls, 1);
  cache.invalidate('instance-a');
  assert.equal(await cache.get('instance-a', () => 'new'), 'new');
  release('old'); assert.deepEqual(await Promise.all([a, b]), ['old','old']);
  assert.equal(await cache.get('instance-a', () => 'wrong'), 'new');
  now = 101; assert.equal(await cache.get('instance-a', () => 'expired'), 'expired');
  assert.equal(await cache.get('instance-a', () => 'fresh', { fresh: true }), 'fresh');
  cache.invalidate(); assert.equal(await cache.get('instance-a', () => 'cleared'), 'cleared');
});

test('card projection preserves exact instance identity for duplicate display names', () => {
  const a = projectAgentCardIdentity({ id: 'a', agentId: 'one', instanceKey: 'first', name: 'Shared name', identityStatus: 'exact', diagnostics: [], routeAliases: ['old'] }, 'Authored mission');
  const b = projectAgentCardIdentity({ id: 'b', agentId: 'two', instanceKey: 'second', name: 'Shared name' }, 'Other mission');
  assert.notDeepEqual(a.identity, b.identity); assert.equal(a.mission, 'Authored mission'); assert.equal(a.id, 'a');
});
