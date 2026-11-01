import type { ProviderRunOptions, ProviderLaunch } from './lib/provider-task-runtime.mjs';
export function startClaudeCodeRun(options:ProviderRunOptions,dependencies?:Record<string,unknown>):ReturnType<ProviderLaunch>;
