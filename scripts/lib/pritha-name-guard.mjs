import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';

export const nameGuardScopes = ['scripts', 'interfaces/control-center/src', 'interfaces/manifest.json', 'operations', 'launchd', '.githooks', 'package.json', '.env.example', 'README.md', 'README.ru.md', 'AGENTS.md'];
const relevant = file => /\.(?:mjs|mts|ts|tsx|py|sh|json|plist|template|tmpl)$/.test(file) || ['README.md', 'README.ru.md', 'AGENTS.md', 'scripts/lib/README.md', 'launchd/README.md', '.env.example'].includes(file) || file.startsWith('.githooks/');
export function currentNameReferences(root) {
  const filenames = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...nameGuardScopes], { cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 }).split('\0').filter(Boolean);
  const references = [];
  for (const file of [...new Set(filenames)].filter(relevant).sort()) {
    const full = path.join(root, file), info = lstatSync(full);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('name_guard_source_invalid');
    for (const [index, line] of readFileSync(full, 'utf8').split(/\r?\n/).entries()) {
      if (!/techscope/i.test(line)) continue;
      references.push({ path: file, line: index + 1, sha256: createHash('sha256').update(line.trim()).digest('hex') });
    }
  }
  return references;
}

export function checkNameReferences(references, allowlist) {
  if (allowlist.schema !== 'pritha-name-compatibility-v1' || !Array.isArray(allowlist.entries)) throw new Error('name_guard_allowlist_invalid');
  const remaining = new Map();
  for (const entry of allowlist.entries) {
    if (!entry.path || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.count) || entry.count < 1 || !entry.reason?.trim()) throw new Error('name_guard_allowlist_invalid');
    const key = `${entry.path}:${entry.sha256}`;
    if (remaining.has(key)) throw new Error('name_guard_allowlist_duplicate');
    remaining.set(key, entry.count);
  }
  const unexpected = [];
  for (const reference of references) {
    const key = `${reference.path}:${reference.sha256}`, available = remaining.get(key) || 0;
    if (!available) unexpected.push(reference);
    else remaining.set(key, available - 1);
  }
  // Removing compatibility references is safe for this naming guard; behavioral
  // compatibility is enforced separately by the old/new entrypoint tests.
  return { ok: unexpected.length === 0, checked: references.length, unexpected };
}
