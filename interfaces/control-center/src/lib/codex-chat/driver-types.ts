import type { CodexChatGateway } from "./native-gateway";
import type { ProviderConnectorId,ProviderPreset } from "../settings/provider-profile";
import type {RuntimeStatus} from './types';

/** Host protocol stays stable while each backend owns its execution and history. */
export type TaskChatBackend = Pick<CodexChatGateway, keyof CodexChatGateway> & {
  voiceTaskBackend?: () => import('../../../../../scripts/lib/voice-task-bridge.mjs').VoiceTaskBackend;
};
export type TaskProviderCapabilities = {
  steer: boolean; interrupt: boolean; approvals: boolean; tools: boolean;
  attachments: { files: boolean; images: boolean };
  usage: "observed" | "partial" | "unavailable";
  resume: boolean; sandbox: "host-enforced" | "runtime-enforced" | "unavailable";
  offline: boolean;
};
export type TaskProviderHealth = {
  connectorId: ProviderConnectorId;
  status: "ready" | "configured" | "not-configured" | "pending-auth" | "unavailable" | "error" | "rate-limited" | "billing-required";
  capabilities: TaskProviderCapabilities;
  version: string | null;
  checkedAt: string;
  error: { code: string; message: string } | null;
};
export type ProviderUsageView = { available: boolean; source: "provider" | "runtime" | "unavailable"; limits: Record<string, number | string | boolean | null> | null };

export interface TaskChatBackendDriver {
  readonly connectorId: ProviderConnectorId;
  readonly backend: TaskChatBackend;
  listThreads: TaskChatBackend["listThreads"];
  getThreadHistory: TaskChatBackend["historyPage"];
  startTurn: TaskChatBackend["startTurn"];
  resumeTurn: TaskChatBackend["startTurn"];
  cancelTurn: TaskChatBackend["controlTurn"];
  resolveApproval: TaskChatBackend["answerRequest"];
  getRuntimeHealth(): Promise<TaskProviderHealth>;
  getSettingsSnapshot?(): Promise<TaskProviderHealth & Record<string,unknown>>;
  previewRuntime?(preset:ProviderPreset):Promise<RuntimeStatus>;
  getRateLimitsAndUsage(): Promise<ProviderUsageView>;
}
