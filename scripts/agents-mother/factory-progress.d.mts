import type {ThreadDetail} from '../../interfaces/control-center/src/lib/codex-chat/types';
export function readBoundFactoryProgress(options:{root:string;stateRoot:string;agentParent?:string;slug?:string;target?:string;chatId:string;connectorId:string;model?:string|null;effort?:string|null}):ThreadDetail['factoryControl'];

export function factoryVoiceDisplay(raw:string,turnComplete:boolean,product?:import('../../interfaces/control-center/src/lib/codex-chat/types').FactoryMilestone):{complete:boolean;status:string;ceiling:number};
