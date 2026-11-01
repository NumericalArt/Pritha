import type { VoiceTaskBinding, VoiceTopicBinding, VoiceTopicBindings } from './voice-topic-bindings.mjs';
import type { StartTurnInput, CreateThreadInput } from '../../interfaces/control-center/src/lib/codex-chat/native-gateway';
import type { PendingRequestView, TurnView } from '../../interfaces/control-center/src/lib/codex-chat/types';
export type VoiceDispatchRequest = { chat: Omit<CreateThreadInput, 'clientThreadId' | 'source'>; turn: Omit<StartTurnInput, 'clientMessageId'> };
export type VoiceBackendReceipt = { chatId: string; clientMessageId: string; sessionId?: string | null } & (
  { kind: 'turn'; turnId: string; turn: TurnView } | { kind: 'queue'; queueId: string; revision: number } | { kind: 'cancelled'; queueId: string }
);
export type VoiceTaskView = { task: VoiceTaskBinding; topic: VoiceTopicBinding; receipt: VoiceBackendReceipt | null; stop?: unknown };
export type VoiceTaskBackend = {
  create(topic: VoiceTopicBinding, request: VoiceDispatchRequest): Promise<{ chatId: string; modelId?: string }>;
  receipt(topic: VoiceTopicBinding, clientMessageId: string): Promise<VoiceBackendReceipt | null>;
  detail(topic: VoiceTopicBinding): Promise<{ activeTurnId: string | null; queued: unknown[]; pendingRequests: PendingRequestView[] }>;
  start(topic: VoiceTopicBinding, input: StartTurnInput): Promise<unknown>;
  enqueue(topic: VoiceTopicBinding, input: StartTurnInput): Promise<unknown>;
  cancelQueued(topic: VoiceTopicBinding, queueId: string, revision: number): Promise<unknown>;
  control(topic: VoiceTopicBinding, input: { action: 'interrupt'; expectedTurnId: string; clientMessageId: string }): Promise<unknown>;
  answer(topic: VoiceTopicBinding, input: Record<string, unknown>): Promise<unknown>;
  answeredRequest?(topic: VoiceTopicBinding, requestId: string): Promise<{requestId:string;turnId:string;revision:number}|null>;
};
export function voiceTaskRequestHash(request: VoiceDispatchRequest): string;
export class VoiceTaskBridge {
  constructor(options: { bindings: VoiceTopicBindings; backend: VoiceTaskBackend });
  readonly bindings: VoiceTopicBindings;
  bound(taskId: string): { task: VoiceTaskBinding; topic: VoiceTopicBinding };
  reconcile(taskId: string): Promise<VoiceTaskView>;
  dispatch(taskId: string, request: VoiceDispatchRequest): Promise<VoiceTaskView>;
  stop(taskId: string, context: { generation: number; revision: number; clientMessageId: string }): Promise<VoiceTaskView>;
  answer(taskId: string, context: { generation: number; requestId: string; revision: number; clientMessageId: string; response: Record<string, unknown> }): Promise<unknown>;
}
