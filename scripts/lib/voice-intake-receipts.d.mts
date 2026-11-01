import type {ExecutionCoordinator} from './execution-coordinator.mjs';
import type {ImmutableAttachmentStore} from './chat-attachment-store.mjs';
export type VoiceIntakeIdentity={key:string;hash:string;taskId:string;intakeId:string;contextId:string;attachmentIds:string[];files:Array<{name:string;type:string;size:number;sha256:string}>;totalBytes:number};
export type VoiceIntakeReceiptInput={contextId:string;sourceIntakeId:string;sessionId:string;text:string;confirmation:Record<string,unknown>;selection:Record<string,unknown>;files:Array<{name:string;type:string;size:number;bytes:Uint8Array}>};
export function voiceIntakeIdentity(input:VoiceIntakeReceiptInput):VoiceIntakeIdentity;
export function voiceIntakeAttachmentIds(intake:unknown,store:ImmutableAttachmentStore):Promise<string[]>;
export class VoiceIntakeReceipts {
  constructor(options:{coordinator:ExecutionCoordinator});
  submit(input:VoiceIntakeReceiptInput,callbacks:{prepare?:(identity:VoiceIntakeIdentity)=>Promise<void>;create:(identity:VoiceIntakeIdentity)=>Promise<Record<string,any>>;recover?:(identity:VoiceIntakeIdentity)=>Promise<Record<string,any>|null>}):Promise<Record<string,any>>;
}
