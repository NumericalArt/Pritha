import type {ProviderAttachmentTransport} from '../lib/provider-task-runtime.mjs';
import type {ProviderChatBinding} from '../lib/provider-chat-registry.mjs';
import {ProviderFileAttachments} from '../lib/provider-file-attachments.mjs';
import type {AttachmentView} from '../lib/chat-attachment-store.mjs';
export const CLAUDE_IMAGE_FORMATS:readonly string[];
export const CLAUDE_IMAGE_LIMITS:Readonly<{imageBytes:number;messageBytes:number;requestBytes:number}>;
export function claudeImageAttachmentsVerified(version:string|null,model:{imageInput?:boolean}|null):boolean;
export function assertNoClaudeImageInputs(payload:unknown):void;
export class ClaudeImageAttachments extends ProviderFileAttachments {
  constructor(options:ConstructorParameters<typeof ProviderFileAttachments>[0] & {context:()=>Promise<any>;imageLookup:(sha256:string,mediaType:string,size:number)=>(AttachmentView & {sha256:string})|null});
  assertReady(version?:string):Promise<any>;
  imageContent(input:{bytes:Buffer;attachment:AttachmentView & {sha256:string;uri:string}}):{content:Array<{type:'text';text:string}|{type:'image';data:string;mimeType:string}>};
  validateInputs(payload:unknown):Promise<{images:number;bytes:number;restored:number}>;
}
export function claudeAttachmentTransport(options:{stateRoot:string;privateRoot:string;snapshot:(binding:ProviderChatBinding)=>Promise<any>}):ProviderAttachmentTransport;
