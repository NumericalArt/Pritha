import type {ProviderAttachmentTransport} from '../lib/provider-task-runtime.mjs';
import type {ProviderChatBinding} from '../lib/provider-chat-registry.mjs';
export type AttachmentTransportOptions={root:string;stateRoot:string;privateRoot:string;cliVersion?:string};
export function attachmentTransportHash(root:string):string;
export function readAttachmentTransport(options:AttachmentTransportOptions):Record<string,any>|null;
export function saveAttachmentTransport(options:AttachmentTransportOptions,evidence:{model:unknown;cliVersion:string;imageFormats:string[];verifiedAt?:string}):Record<string,any>;
export function neuralDeepImageContext(snapshot:any,modelId:string,transport:unknown,path?:'initial'|'resume'):Record<string,any>;
export function neuralDeepAttachmentTransport(options:AttachmentTransportOptions & {snapshot:(binding:ProviderChatBinding)=>Promise<any>}):ProviderAttachmentTransport;
