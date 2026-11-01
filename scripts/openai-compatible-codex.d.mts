import type {ProviderRunOptions,ProviderLaunch} from './lib/provider-task-runtime.mjs';
export function startCompatibleRun(options:ProviderRunOptions,dependencies?:{dispatcher?:unknown}):ReturnType<ProviderLaunch>;
export function buildCompatibleCodexArgs(options:ProviderRunOptions):string[];
