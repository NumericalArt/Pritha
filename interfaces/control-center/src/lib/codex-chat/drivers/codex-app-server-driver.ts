import { CodexChatGateway } from "../native-gateway";
import type { TaskChatBackend, TaskChatBackendDriver, TaskProviderHealth, ProviderUsageView } from "../driver-types";

/** Native history, App Server leases, approvals and Goal control stay together. */
export class CodexAppServerDriver implements TaskChatBackendDriver {
  readonly connectorId = "codex" as const;
  constructor(readonly backend: TaskChatBackend = new CodexChatGateway()) {}
  listThreads: TaskChatBackend["listThreads"] = (...args) => this.backend.listThreads(...args);
  getThreadHistory: TaskChatBackend["historyPage"] = (...args) => this.backend.historyPage(...args);
  startTurn: TaskChatBackend["startTurn"] = (...args) => this.backend.startTurn(...args);
  resumeTurn: TaskChatBackend["startTurn"] = (...args) => this.backend.startTurn(...args);
  cancelTurn: TaskChatBackend["controlTurn"] = (...args) => this.backend.controlTurn(...args);
  resolveApproval: TaskChatBackend["answerRequest"] = (...args) => this.backend.answerRequest(...args);
  async getRuntimeHealth(): Promise<TaskProviderHealth> {
    const status = await this.backend.runtimeStatus();
    const provider = status.providers.find(row => row.providerId === status.effectiveProvider);
    const capabilities = provider?.capabilities;
    return {
      connectorId: this.connectorId,
      status: status.availability === "ready" ? "ready" : status.availability === "degraded" ? "error" : "unavailable",
      version: provider?.version || null, checkedAt: status.probedAt,
      error: status.availability === "ready" ? null : { code: "native_runtime_unavailable", message: "Check Codex authentication and its installed runtime in Settings." },
      capabilities: {
        steer: capabilities?.steerTurn === true, interrupt: capabilities?.interruptTurn === true,
        approvals: capabilities?.permissionApprovals === true || capabilities?.commandApprovals === true,
        tools: capabilities?.fullChat === true,
        attachments: { files: capabilities?.fileMetadata === true, images: capabilities?.imageInput === true },
        usage: "partial", resume: capabilities?.readThread === true,
        sandbox: status.availability === "ready" && status.selected.sandboxMode !== "danger_full_access" ? "runtime-enforced" : "unavailable",
        offline: false,
      },
    };
  }
  async getRateLimitsAndUsage(): Promise<ProviderUsageView> {
    // Per-turn usage is recorded by the existing native ledger. Do not invent an
    // account balance from a runtime that has not supplied one.
    return { available: false, source: "unavailable", limits: null };
  }
}
