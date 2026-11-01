import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { resolvePrithaRoot, resolvePrithaStateRoot, resolvePrithaStatePathFrom } from './paths.mjs';

export class PrithaStateFileError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalid = () => { throw new PrithaStateFileError('pritha_state_path_invalid', 'Pritha state must use regular files inside its selected state directory. Repair the path before continuing.'); };
const inside = (root, target) => target === root || target.startsWith(root + path.sep);

/** Inspect only. Even a missing parent is never created by a resolver. */
function inspectFile(stateRoot, file) {
  if (!inside(stateRoot, file)) invalid();
  let current = stateRoot;
  try {
    // The configured boundary may itself be a symlink. Descendants may not
    // redirect a memory/setup file outside that explicitly selected boundary.
    const physicalRoot = realpathSync(stateRoot);
    if (!lstatSync(physicalRoot).isDirectory()) invalid();
    const parts = path.relative(stateRoot, file).split(path.sep);
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !inside(physicalRoot, realpathSync(current))) invalid();
      if (index < parts.length - 1) { if (!stat.isDirectory()) invalid(); }
      else {
        if (!stat.isFile() || stat.nlink !== 1) invalid();
        return { exists: true, size: stat.size, device: stat.dev, inode: stat.ino, modifiedMs: stat.mtimeMs, mode: stat.mode & 0o777 };
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false };
    if (error instanceof PrithaStateFileError) throw error;
    invalid();
  }
  invalid();
}

/** Stable names, not schema IDs: existing DB tables and setup schemas stay valid. */
export function inspectPrithaStateFiles(kind, options = {}) {
  if (!['memory', 'setup'].includes(kind)) throw new PrithaStateFileError('pritha_state_kind_invalid', 'Choose memory or setup state.');
  const root = resolvePrithaRoot(options), stateRoot = resolvePrithaStateRoot({ ...options, root });
  const directory = kind === 'memory' ? resolvePrithaStatePathFrom({ ...options, root, stateRoot }, 'memory')
    : stateRoot === root ? root : path.join(stateRoot, 'setup');
  const current = path.join(directory, kind === 'memory' ? 'pritha.sqlite' : stateRoot === root ? '.pritha-setup.json' : 'setup.json');
  const legacy = kind === 'memory' ? path.join(directory, 'techscope.sqlite')
    : stateRoot === root ? path.join(root, '.techscope-setup.json') : null;
  const canonicalFile = inspectFile(stateRoot, current), legacyFile = legacy ? inspectFile(stateRoot, legacy) : { exists: false };
  const barrier = resolvePrithaStatePathFrom({ ...options, root, stateRoot }, 'private', 'state-migration', 'active.json');
  const migrationPending = inspectFile(stateRoot, barrier).exists;
  const status = canonicalFile.exists && legacyFile.exists ? 'conflict' : canonicalFile.exists ? 'canonical' : legacyFile.exists ? 'legacy' : 'fresh';
  return { kind, root, stateRoot, current, legacy, canonicalFile, legacyFile, status, migrationPending,
    selected: status === 'conflict' ? null : status === 'legacy' ? legacy : current };
}

function select(kind, options) {
  const state = inspectPrithaStateFiles(kind, options);
  if (state.migrationPending) throw new PrithaStateFileError('pritha_state_migration_pending', 'A Pritha state migration needs recovery. Complete or roll back that migration before opening state.');
  if (state.status === 'conflict') throw new PrithaStateFileError('pritha_state_conflict', `Both Pritha and legacy ${kind} files exist. Choose the source in a state migration plan; neither file was changed.`);
  return state.selected;
}
export const resolvePrithaMemoryDatabase = (options = {}) => select('memory', options);
export const resolvePrithaSetupFile = (options = {}) => select('setup', options);
