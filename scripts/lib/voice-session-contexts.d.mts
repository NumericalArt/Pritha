import type { ExecutionCoordinator } from './execution-coordinator.mjs';
import type { ProviderConnectorId, ProviderPreset } from './provider-profile.mjs';
export type VoiceContextConfig = {
  connectorId:ProviderConnectorId; preset:ProviderPreset; engine:'openai'|'neuraldeep'; voiceApi:'live'|'realtime'|'neuraldeep';
  voiceModel:string; voice:string; serviceTier:'standard'|'fast';
};
export type VoiceContext = VoiceContextConfig & {id:string;owner:string;instance:string;createdAt:string;expiresAt:number};
export class VoiceContextError extends Error {code:string;status:number;constructor(code:string);}
export class VoiceSessionContexts {
  constructor(options:{coordinator:ExecutionCoordinator;stateRoot:string;now?:()=>number;ttlMs?:number;maxContexts?:number;maxPerOwner?:number});
  create(owner:string,input:VoiceContextConfig):VoiceContext;
  get(id:string,owner:string):VoiceContext;
  close(id:string,owner:string):{closed:true};
}
