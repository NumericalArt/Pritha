import test from 'node:test';
import assert from 'node:assert/strict';
import { runAsyncProbe, createProbeCache } from '../scripts/lib/async-probe.mjs';
import { projectAgentCardIdentity } from '../scripts/agents-mother/card-projection.mjs';

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
