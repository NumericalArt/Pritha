import type {TaskProviderHealth} from '../../interfaces/control-center/src/lib/codex-chat/driver-types';
import type {ProviderPreset} from '../lib/provider-profile.mjs';
export type CompatibleModel={id:string;tools:boolean;responses:boolean;efforts:string[];contextTokens:number|null;outputTokens:number|null;inputModalities:string[];cloud?:boolean};
export type CompatibleSnapshot=TaskProviderHealth & {models:CompatibleModel[];account:Record<string,any>|null;shortlist:Array<{id:string;available:boolean}>;endpoint:string|null;discovery?:Array<{endpoint:string;status:string;models:CompatibleModel[]}>};
export class CompatibleProviderService {
 constructor(options:{connectorId:'openrouter'|'local';root:string;stateRoot:string;privateRoot:string;codexBin?:string;env?:NodeJS.ProcessEnv});
 snapshot(preset:ProviderPreset):Promise<CompatibleSnapshot>;
 require(preset:ProviderPreset):Promise<CompatibleSnapshot>;
 discover():Promise<Array<{endpoint:string;status:string;models:CompatibleModel[]}>>;
}
