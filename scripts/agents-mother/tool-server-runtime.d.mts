export function resolveToolServerManifest<T>(manifest: T, parent?: Record<string, string | undefined>): T;
export function toolServerRuntimeBinding(manifest: unknown, parent?: Record<string, string | undefined>): string | undefined;
export function toolServerLaunchEnvironment(manifest: unknown, command: unknown, parent?: Record<string, string | undefined>): Record<string, string>;
