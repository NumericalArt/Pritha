import type { TaskProviderHealth } from '../../interfaces/control-center/src/lib/codex-chat/driver-types';
export type NeuralDeepServiceSnapshot = TaskProviderHealth & {models:Array<{id:string;tools:boolean;inputModalities:string[]|null}>;account:Record<string,any>|null;billing:Record<string,any>|null};
export class NeuralDeepProviderService {
  constructor(options:{root:string;stateRoot:string;privateRoot:string;codexBin?:string;env?:NodeJS.ProcessEnv;requireCli?:boolean});
  snapshot(modelId:string):Promise<NeuralDeepServiceSnapshot>;
  require(modelId:string):Promise<Record<string,unknown>>;
}
