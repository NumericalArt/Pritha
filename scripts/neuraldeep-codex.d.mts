import type { ProviderRunOptions, ProviderLaunch } from './lib/provider-task-runtime.mjs';
export function startNeuralDeepRun(options:ProviderRunOptions,dependencies?:{createDispatcher?:(timeout:number)=>unknown}):ReturnType<ProviderLaunch>;
export function buildCodexExecArgs(options:ProviderRunOptions):string[];
