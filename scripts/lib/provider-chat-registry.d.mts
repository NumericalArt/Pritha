import type { ProviderConnectorId,ProviderPreset } from './provider-profile.mjs';
import type {ChatSubject} from './chat-subject.mjs';
import type { TaskWorkspace } from './task-workspace.mjs';
import type { AttachmentView, ChatEventRecord, ChatItemView, ExternalRuntimeProviderId, HistoryContentPage, HistoryItemsPage, TaskLinkView, ThreadGroup, ThreadOrigin, ThreadStatus, TurnView } from '../../interfaces/control-center/src/lib/codex-chat/types';
export type ProviderChatBinding = {
  subject?:ChatSubject;
  voiceTopicId?:string;voiceTopicGeneration?:number;
  chatId:string;clientThreadId:string;createHash:string;connectorId:Exclude<ProviderConnectorId,'codex'>;providerId:ExternalRuntimeProviderId;
  modelId:string;effortId:string|null;timeoutMs:number;workspacePath:string;workspace:TaskWorkspace;nativeThreadId:string;profileIdentity:string|null;stateIdentityHash:string;
  title:string;preview:string;createdAt:string;updatedAt:string;group:ThreadGroup;origin:ThreadOrigin;continuationEnabled:boolean;pinned:boolean;archived:boolean;lastStatus:ThreadStatus;taskLinks:TaskLinkView[];
  capabilitySnapshot:Record<string,unknown>|null;executionConfig:ProviderPreset & {sandbox:string};messageReceipts:Record<string,unknown>;turns:TurnView[];
};
export type StoredProviderTurn = Omit<TurnView,'history'> & {history?:{activityState:string;itemCount:number;itemsCursor:string|null}};
export class ProviderChatRegistry {
  readonly scope:string;
  constructor(options:{stateRoot:string;privateRoot:string;connectorId:Exclude<ProviderConnectorId,'codex'>});
  readonly history:{chatForTask(taskId:string):string|null};
  close():void;
  hasAttachments(chatId:string):boolean;
  attachmentReference(chatId:string,id:string):(AttachmentView & {sha256:string})|null;
  imageReference(chatId:string,sha256:string,mediaType:string,size:number):(AttachmentView & {sha256:string})|null;
  require(chatId:string):ProviderChatBinding;
  get(chatId:string):ProviderChatBinding|null;
  findByClient(clientThreadId:string):ProviderChatBinding|null;
  mutate(chatId:string,update:(binding:ProviderChatBinding)=>ProviderChatBinding):ProviderChatBinding;
  pinSession(chatId:string,sessionId:string,profileIdentity:string):ProviderChatBinding;
  list(input?:{cursor?:string;limit?:number;group?:ThreadGroup|'all';search?:string;archived?:boolean}):{data:ProviderChatBinding[];nextCursor:string|null};
  turn(chatId:string,turnId:string):StoredProviderTurn|null;
  turnsPage(chatId:string,input?:{cursor?:string;limit?:number}):{data:StoredProviderTurn[];olderCursor:string|null;newerCursor:null;hasOlder:boolean;hasNewer:false;snapshotAt:string};
  itemsPage(chatId:string,turnId:string,cursor:string,activity?:boolean):HistoryItemsPage;
  content(chatId:string,itemId:string,cursor:string):HistoryContentPage;
  appendEvent(chatId:string,event:string,payload?:Record<string,unknown>,refs?:{turnId?:string;itemId?:string;requestId?:string}):ChatEventRecord;
  eventsAfter(chatId:string,eventId?:string|null):{events:ChatEventRecord[];reset:boolean};
  latestEventId(chatId:string):string;
}
