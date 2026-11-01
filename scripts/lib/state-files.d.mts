import type { PrithaPathOptions } from './paths.mjs';
export class PrithaStateFileError extends Error { code: string; constructor(code: string, message: string); }
export type StateFileInfo = { exists: false } | { exists: true; size: number; device: number; inode: number; modifiedMs: number; mode: number };
export type PrithaStateFileInspection = { kind: 'memory' | 'setup'; root: string; stateRoot: string; current: string; legacy: string | null; canonicalFile: StateFileInfo; legacyFile: StateFileInfo; status: 'conflict' | 'canonical' | 'legacy' | 'fresh'; migrationPending: boolean; selected: string | null };
export function inspectPrithaStateFiles(kind: 'memory' | 'setup', options?: PrithaPathOptions): PrithaStateFileInspection;
export function resolvePrithaMemoryDatabase(options?: PrithaPathOptions): string;
export function resolvePrithaSetupFile(options?: PrithaPathOptions): string;
