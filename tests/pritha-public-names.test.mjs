import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import { prithaEnvValue, PRITHA_ENV_LEGACY_ALIASES } from '../scripts/lib/pritha-env.mjs';
import { currentNameReferences, checkNameReferences } from '../scripts/lib/pritha-name-guard.mjs';

test('all declared option aliases preserve legacy configuration while explicit primary values win', () => {
  for (const [name, legacy] of Object.entries(PRITHA_ENV_LEGACY_ALIASES)) {
    assert.equal(prithaEnvValue(name, 'default', {}), 'default');
    assert.equal(prithaEnvValue(name, 'default', { [legacy]: 'legacy-value' }), 'legacy-value');
    for (const value of ['current-value', '0', '']) {
      const environment = Object.freeze({ [name]: value, [legacy]: 'legacy-value' });
      assert.equal(prithaEnvValue(name, 'default', environment), value || 'default');
      assert.equal(prithaEnvValue(legacy, 'default', environment), value || 'default');
    }
  }
  assert.equal(prithaEnvValue('PRITHA_UNKNOWN_OPTION', 'default', { TECHSCOPE_UNKNOWN_OPTION: 'not-an-alias' }), 'default');
  const keys = readFileSync('.env.example', 'utf8').split(/\r?\n/).map(line => line.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1]).filter(Boolean);
  assert.equal(new Set(keys).size, keys.length, 'renamed options must not shadow an existing primary option in fresh configuration');
});

test('name guard accepts only reviewed lines and rejects new, moved or duplicated legacy runtime references', () => {
  const root = path.resolve('.'), references = currentNameReferences(root);
  const allowlist = JSON.parse(readFileSync(path.join(root, 'config/pritha-name-compatibility.json'), 'utf8'));
  assert.equal(checkNameReferences(references, allowlist).ok, true);
  const existing = references[0]; assert.ok(existing);
  assert.equal(checkNameReferences([...references, existing], allowlist).ok, false);
  assert.equal(checkNameReferences([{ ...existing, path: 'scripts/new-module.mjs' }], allowlist).ok, false);
  assert.equal(checkNameReferences([{ ...existing, sha256: '0'.repeat(64) }], allowlist).ok, false);
  assert.equal(checkNameReferences([], allowlist).ok, true);
});

async function port() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const number = server.address().port; await new Promise(resolve => server.close(resolve)); return number;
}
for (const file of ['pritha-web.mjs', 'techscope-web.mjs', 'pritha_web.py', 'techscope_web.py']) {
  test(`${file} serves the Pritha UI from an isolated root without creating memory`, async t => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pritha-web-alias-')), state = path.join(root, 'state'); mkdirSync(state);
    const number = await port(), binary = file.endsWith('.py') ? 'python3' : process.execPath;
    const child = spawn(binary, [path.resolve('scripts', file)], {
      cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, TECHSCOPE_ROOT: root,
        PRITHA_STATE_ROOT: state, HOST: '127.0.0.1', PORT: String(number) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ended = once(child, 'exit');
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await ended; rmSync(root, { recursive: true, force: true }); });
    let html = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      try { const response = await fetch(`http://127.0.0.1:${number}/`, { signal: AbortSignal.timeout(250) }); html = await response.text(); if (response.ok) break; } catch { /* bounded fixture startup */ }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    assert.match(html, /<title>Pritha Web<\/title>/);
    const { readdirSync } = await import('node:fs'); assert.deepEqual(readdirSync(state), []);
  });
}
