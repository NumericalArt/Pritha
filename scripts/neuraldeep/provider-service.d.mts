import type { TaskProviderHealth } from '../../interfaces/control-center/src/lib/codex-chat/driver-types';
export type NeuralDeepServiceSnapshot = TaskProviderHealth & {models:Array<{id:string;provider:'neuraldeep';capabilitiesKnown:boolean;tools:boolean;toolsAdvertised:boolean|null;visionAdvertised:boolean|null;inputModalities:string[]|null}>;catalog?:{source:string;refreshedAt:string};imageSupport?:{image:string;imageFormats:string[];reason:string};account:Record<string,any>|null;billing:Record<string,any>|null};
export class NeuralDeepProviderService {
  constructor(options:{root:string;stateRoot:string;privateRoot:string;codexBin?:string;env?:NodeJS.ProcessEnv;requireCli?:boolean});
  snapshot(modelId:string):Promise<NeuralDeepServiceSnapshot>;
  require(modelId:string):Promise<Record<string,unknown>>;
  verifyAttachments(modelId:string,options?:{signal?:AbortSignal}):Promise<Record<string,unknown>>;
}
