#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePrithaRoot } from './lib/paths.mjs';
import { currentNameReferences, checkNameReferences } from './lib/pritha-name-guard.mjs';
try {
  const root = resolvePrithaRoot();
  const result = checkNameReferences(currentNameReferences(root), JSON.parse(readFileSync(path.join(root, 'config/pritha-name-compatibility.json'), 'utf8')));
  console.log(JSON.stringify({ schema: 'pritha-name-check-v1', ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ ok: false, error: 'name_guard_unavailable' }));
  process.exitCode = 1;
}
