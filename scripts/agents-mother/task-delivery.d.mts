import type { CatalogOptions } from "./identity.mjs";
export type DeliveryTask = { chatId: string; nativeThreadId: string; providerId: "desktop_bundled" | "standalone_cli"; stateIdentityHash: string | null };
export type TaskDeliveryRequest = { runId: string; requestId: string; expectedRevision: string; action: "bind" | "verify" | "prepare_handoff" };
export type TaskDeliveryView = {
  runId: string; agentId: string; agentName: string; status: string; specId: string;
  bindingStatus: "unbound" | "bound" | "other_task"; revision: string;
  budget: { tokensUsed: number; maxTokens: number; scope: "build-executor"; usageStatus: "complete" | "unknown" | "legacy-unknown" };
  actions: { verify: boolean; prepareHandoff: boolean };
  plan: { backend: string; commands: Array<{ id: string; argv: string[]; cwd: string; timeoutMs: number; isolation: string }>;
    outputBytesCap: number; concurrency: number; maxVerificationPasses: number; effects: string };
  receipts: Array<{ requestId: string; action: TaskDeliveryRequest["action"]; status: "started" | "completed" | "failed" | "interrupted";
    request: TaskDeliveryRequest | null;
    result: { status?: string; code?: string; handoff?: string | null; retry?: string } | null }>;
  acceptance: "accepted_by_user" | "not_accepted";
  preparation: { preparedAt: string; demo: string[]; head: string | null; verification: string; acceptance: string } | null;
};
export class TaskDeliveryError extends Error { code: string; status: number }
export function readTaskDelivery(runId: string, task: DeliveryTask, options?: CatalogOptions): TaskDeliveryView;
export function listTaskDeliveries(task: DeliveryTask, options?: CatalogOptions): Array<{ runId: string; status: string }>;
export function performTaskDeliveryAction(task: DeliveryTask, input: TaskDeliveryRequest, options?: CatalogOptions): Promise<{ run: TaskDeliveryView; replayed: boolean }>;
