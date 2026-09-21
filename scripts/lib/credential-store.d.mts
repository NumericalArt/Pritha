export function normalizeCredentialTarget(target?: unknown): string | null;
export function credentialFilePath(projectRoot: string, target?: string): string;
export function readCredentialFile(projectRoot: string, target?: string): string;
export function updateCredentialFile(projectRoot: string, target: string, transform: (current: string) => string): void;
