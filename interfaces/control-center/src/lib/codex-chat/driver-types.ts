import type { CodexChatGateway } from "./native-gateway";
import type { ProviderConnectorId } from "../settings/provider-profile";

/** Host protocol stays stable while each backend owns its execution and history. */
export type TaskChatBackend = Pick<CodexChatGateway, keyof CodexChatGateway>;
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
  getRateLimitsAndUsage(): Promise<ProviderUsageView>;
}
