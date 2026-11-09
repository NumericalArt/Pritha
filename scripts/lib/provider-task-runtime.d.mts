import type { ProviderChatBinding, ProviderChatRegistry, StoredProviderTurn } from './provider-chat-registry.mjs';
import type { ExecutionCoordinator, ExecutionIntent } from './execution-coordinator.mjs';
import type { ProviderConnectorId, ProviderPreset } from './provider-profile.mjs';
import type { ChatEventRecord, ChatItemView, TurnView, AcceptedTurn, ThreadDetail, TaskLinkView } from '../../interfaces/control-center/src/lib/codex-chat/types';
import type { CreateThreadInput, StartTurnInput } from '../../interfaces/control-center/src/lib/codex-chat/native-gateway';
import type { TaskChatBackend } from '../../interfaces/control-center/src/lib/codex-chat/driver-types';
import type { ImmutableAttachmentStore, PreparedAttachment, AttachmentView } from './chat-attachment-store.mjs';
import type {ProviderFileAttachments} from './provider-file-attachments.mjs';
type Queued = Awaited<ReturnType<TaskChatBackend['queuedMessages']>>;
export type ProviderAttempt = {chat:string;turnId:string;clientMessageId:string;key:string;identity:string|null};
export class ProviderTaskError extends Error {code:string;status:number;retryable:false;constructor(code:string,message?:string,status?:number);}
export type ProviderRunOptions = Record<string,any> & {root:string;stateRoot:string;privateRoot:string;cwd:string;model:string;timeoutMs:number;prompt:string;resume?:string;signal:AbortSignal};
export type ProviderRunResult = {ok:boolean;processTreeExited:boolean;errorCode?:string|null;sessionId?:string|null;identity?:string;usage?:Record<string,number>|null;providerError?:any};
export type ProviderLaunch = (options:ProviderRunOptions)=>Promise<{stop:()=>boolean;completion:Promise<ProviderRunResult>}>;
export type ProviderAttachmentReceipt = {version:1;originals:Array<AttachmentView & {sha256:string}>};
export type ProviderAttachmentDeliveryReceipt={protocol:string;chatId:string;turnId:string;nonce:string};
export type ProviderAttachmentTransport = {
  validate:(context:{binding:ProviderChatBinding;files:PreparedAttachment[];historicalImages:boolean;historicalAttachments:boolean;path:'initial'|'resume';phase:'queue'|'turn'|'dispatch'})=>Promise<void>|void;
  prepare:(context:{binding:ProviderChatBinding;files:PreparedAttachment[];receipt:ProviderAttachmentReceipt;turnId:string;store:ImmutableAttachmentStore;registry:ProviderChatRegistry;check:()=>void})=>Promise<{prompt:string;images?:string[];attachmentManifest?:string;hostAttachments?:ProviderFileAttachments;receipt?:ProviderAttachmentDeliveryReceipt}>;
  cleanup?:(context:{receipt:ProviderAttachmentDeliveryReceipt;store:ImmutableAttachmentStore})=>Promise<'complete'>;
};
export type ProviderTaskOptions = {
  connectorId:Exclude<ProviderConnectorId,'codex'>;root:string;stateRoot:string;privateRoot:string;executionDirectory:string;agentParent?:string;
  configuration:()=>ProviderPreset & {sandbox:string};preflight:(binding:Partial<ProviderChatBinding>,context:{phase:'create'|'turn'})=>Promise<Record<string,unknown>>;
  resolveConfiguration?:(configuration:ProviderPreset & {sandbox:string})=>Promise<ProviderPreset & {sandbox:string}>;
  launch:ProviderLaunch;validateText?:(text:string)=>void;
  attachmentStore?:ImmutableAttachmentStore;
  attachmentTransport?:ProviderAttachmentTransport;
  beforeRequest?:(binding:ProviderChatBinding,attempt:ProviderAttempt)=>Promise<unknown>|unknown;
  normalizeEvent?:(attempt:ProviderAttempt,event:Record<string,any>,binding:ProviderChatBinding)=>{item:ChatItemView;originalText?:string}|null;
  recordUsage?:(binding:ProviderChatBinding,attempt:ProviderAttempt,result:ProviderRunResult)=>Promise<void>|void;
};
export function providerTurnText(input:StartTurnInput):string;
export function providerTurnView(turn:StoredProviderTurn):TurnView;
export class ProviderTaskRuntime {
  constructor(options:ProviderTaskOptions);
  readonly registry:ProviderChatRegistry;readonly execution:ExecutionCoordinator;
  require(chatId:string):ProviderChatBinding;
  factoryConversation(slug:string):ProviderChatBinding|null;
  isTypedFactory(binding:ProviderChatBinding):boolean;
  voiceTaskChat(taskId:string):string|null;
  voiceTaskLinks(chatId:string):TaskLinkView[];
  activeIntent(chatId:string):ExecutionIntent|null;
  create(input:CreateThreadInput,host?:{voice:{topicId:string;generation:number;preset:ProviderPreset}}):Promise<{binding:ProviderChatBinding;replayed:boolean}>;
  voiceReceipt(chatId:string,clientMessageId:string):import('./voice-task-bridge.mjs').VoiceBackendReceipt|null;
  start(chatId:string,input:StartTurnInput,options?:{fromQueue?:string}):Promise<{accepted:AcceptedTurn;replayed:boolean}>;
  control(chatId:string,input:{action:'steer'|'interrupt';expectedTurnId:string;clientMessageId:string;text?:string}):Promise<{status:string;action:'steer'|'interrupt';replayed:boolean}>;
  pendingRequests(chatId:string):ThreadDetail['pendingRequests'];
  answerRequest:TaskChatBackend['answerRequest'];
  queued(chatId:string):Promise<Queued>;
  enqueue(chatId:string,input:StartTurnInput):Promise<Queued>;
  cancelQueued(chatId:string,id:string,revision:number):Promise<Queued>;
  reconcile(chatId:string):Promise<void>;
  scheduleQueues():void;
  emit(chatId:string,event:string,payload?:Record<string,unknown>,refs?:{turnId?:string;itemId?:string;requestId?:string}):ChatEventRecord;
  subscribe(chatId:string,send:(event:ChatEventRecord)=>void,close?:(()=>void)|null):()=>void;
  dispose():Promise<void>;
}
