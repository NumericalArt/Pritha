import type { ImmutableAttachmentStore, AttachmentView } from './chat-attachment-store.mjs';
import type { ProviderAttachmentTransport,ProviderAttachmentDeliveryReceipt } from './provider-task-runtime.mjs';
import type { ProviderChatBinding } from './provider-chat-registry.mjs';
export const HOST_FILE_ATTACHMENT_PROTOCOL:string;
export const HOST_FILE_ATTACHMENT_CLI:Readonly<Record<string,string>>;
export function hostFileAttachmentVerified(connectorId:string,version:string|null):boolean;
export class ProviderFileAttachments {
  readonly receipt:ProviderAttachmentDeliveryReceipt;
  constructor(options:{store:ImmutableAttachmentStore;stateRoot:string;privateRoot:string;chatId:string;turnId:string;lookup:(id:string)=>(AttachmentView & {sha256:string})|null;check?:()=>void});
  read(uri:string):Promise<{bytes:Buffer|null;attachment:AttachmentView & {sha256:string;uri:string;readOnlyPath:string}}>;
  readOnlyPaths():Promise<string[]>;
  close():Promise<void>;
}
export function cleanupHostFileAttachments(options:{store:ImmutableAttachmentStore;stateRoot:string;privateRoot:string},receipt:ProviderAttachmentDeliveryReceipt):Promise<'complete'>;
export function hostFileAttachmentTransport(options:{stateRoot:string;privateRoot:string;snapshot:(binding:ProviderChatBinding)=>Promise<any>}):ProviderAttachmentTransport;
