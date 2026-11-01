import type { TaskProviderHealth } from '../../interfaces/control-center/src/lib/codex-chat/driver-types';
import type { ProviderPreset } from '../lib/provider-profile.mjs';
export type ClaudeServiceSnapshot=TaskProviderHealth & {models:Array<{id:string;label:string;line:string|null;efforts:string[]}>;model:{id:string;efforts:string[]}|null};
export class ClaudeProviderService {
 constructor(options:{root:string;stateRoot:string;privateRoot:string;claudeBin?:string;env?:NodeJS.ProcessEnv});
 snapshot(preset:ProviderPreset):Promise<ClaudeServiceSnapshot>;
 require(preset:ProviderPreset):Promise<ClaudeServiceSnapshot>;
 resolveConfiguration<T extends ProviderPreset>(preset:T):Promise<T>;
}
