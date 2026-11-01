import type { ExecutionCoordinator } from './execution-coordinator.mjs';
import type { ProviderConnectorId, ProviderPreset } from './provider-profile.mjs';
export type VoiceTopicScope = { kind: 'agent' | 'pritha' | 'task' | 'control'; id: string; label?: string };
export type VoiceTopicBinding = {
  topicId: string; scope: VoiceTopicScope & { generation: number }; connectorId: ProviderConnectorId;
  preset: ProviderPreset; workspace: {mode:'read-only'|'isolated';baseRevision?:string;agentId?:string}; resolvedModelId: string | null; stateIdentity: string; chatId: string | null; sessionId: string | null;
  clientThreadId: string; revision: number; createdAt: string; updatedAt: string;
};
export type VoiceTaskBinding = {
  taskId: string; topicId: string; requestHash: string; reservationHash: string; clientMessageId: string;
  state: 'reserved' | 'dispatching' | 'accepted' | 'queued' | 'unknown' | 'blocked' | 'cancelled';
  turnId: string | null; queueId: string | null; errorCode: string | null;
  revision: number; createdAt: string; updatedAt: string;
};
export class VoiceBindingError extends Error { code: string; constructor(code: string); }
export class VoiceTopicBindings {
  constructor(options: { coordinator: ExecutionCoordinator; stateRoot: string });
  readonly coordinator: ExecutionCoordinator;
  readonly stateIdentity: string;
  topic(topicId: string): VoiceTopicBinding | null;
  latest(scope: VoiceTopicScope): VoiceTopicBinding | null;
  task(taskId: string): VoiceTaskBinding | null;
  tasksForTopic(topicId:string,limit?:number):VoiceTaskBinding[];
  reserve(input: { taskId: string; scope: VoiceTopicScope; connectorId: ProviderConnectorId; preset: ProviderPreset;
    workspace?:VoiceTopicBinding['workspace'];requestHash: string; reset?: boolean; continueTopicId?: string; expectedGeneration?: number }):
    { task: VoiceTaskBinding; topic: VoiceTopicBinding; replayed: boolean };
  bindChat(topicId: string, chatId: string, expectedRevision: number, resolvedModelId?: string): VoiceTopicBinding;
  pinSession(topicId: string, sessionId: string, expectedRevision: number): VoiceTopicBinding;
  transition(taskId: string, expectedRevision: number, patch: { state: VoiceTaskBinding['state']; turnId?: string | null; queueId?: string | null; errorCode?: string | null }): VoiceTaskBinding;
}
