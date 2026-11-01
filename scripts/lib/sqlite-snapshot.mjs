import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePrithaPython } from './python-runtime.mjs';

export function snapshotPrithaDatabase(source, destination, {root, env = process.env} = {}) {
  const script = fileURLToPath(new URL('../pritha_sqlite_snapshot.py', import.meta.url));
  const result = spawnSync(resolvePrithaPython({root, env}), [script, '--source', source, '--destination', destination], {
    cwd: root, env, encoding: 'utf8', timeout: 35_000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024,
  });
  let receipt;
  try { receipt = JSON.parse(result.stdout); } catch { /* Do not echo file paths or corrupt source contents. */ }
  if (result.status !== 0 || receipt?.schema !== 'pritha-sqlite-snapshot-v1' || receipt.integrity !== 'ok') {
    throw Object.assign(new Error('The SQLite snapshot could not be verified or its destination conflicts. Existing files were preserved.'), {code: 'pritha_snapshot_unavailable'});
  }
  return receipt;
}
