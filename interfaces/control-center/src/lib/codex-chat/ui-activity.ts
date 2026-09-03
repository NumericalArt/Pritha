import { createHash } from "node:crypto";
import { appendPrivateAuditEvent } from "@/lib/private-json";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { CodexChatGatewayError } from "./gateway";
import { CodexChatPrivateStore } from "./private-store";

const EVENTS = new Set(["thread_selected", "navigation_started", "history_loaded", "history_failed"]);
const SOURCES = new Set(["voice_task_card", "history_row", "direct_link", "group_restore", "retry"]);
const STAGES = new Set(["navigation", "metadata", "history"]);
const CLIENT_CLASSES = new Set(["mobile", "tablet", "desktop", "unknown"]);
const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ERROR_CODE = /^[a-z0-9_]{1,64}$/;

export type TaskChatUiActivityInput = {
  event: string;
  chatId: string;
  interactionId: string;
  source: string;
  stage?: string;
  durationMs?: number;
  errorCode?: string;
  clientClass?: string;
};

function boundedDuration(value: unknown) {
  if (value == null) return null;
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0 || duration > 120_000) {
    throw new CodexChatGatewayError("invalid_request", "Telemetry duration must be between 0 and 120000 milliseconds.", 400);
  }
  return Math.round(duration);
}

export async function recordTaskChatUiActivity(input: TaskChatUiActivityInput) {
  if (!EVENTS.has(input.event) || !SAFE_ID.test(input.chatId) || !SAFE_ID.test(input.interactionId)) {
    throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry identifiers are invalid.", 400);
  }
  if (!SOURCES.has(input.source)) {
    throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry source is invalid.", 400);
  }
  const stage = input.stage || "navigation";
  if (!STAGES.has(stage)) throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry stage is invalid.", 400);
  const clientClass = input.clientClass || "unknown";
  if (!CLIENT_CLASSES.has(clientClass)) throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry client class is invalid.", 400);
  const errorCode = String(input.errorCode || "");
  if (errorCode && !SAFE_ERROR_CODE.test(errorCode)) {
    throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry error code is invalid.", 400);
  }

  const store = new CodexChatPrivateStore();
  const binding = await store.get(input.chatId);
  if (!binding) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);

  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  await appendPrivateAuditEvent({
    stateRoot,
    filePath: resolvePrithaStatePath("audit", "task-chat-ui-actions.jsonl"),
    event: {
      schema: "pritha-task-chat-ui-activity-v1",
      timestamp: new Date().toISOString(),
      event: input.event,
      interaction_id: input.interactionId,
      chat_ref: createHash("sha256").update(input.chatId).digest("hex").slice(0, 24),
      group: binding.group,
      origin: binding.origin,
      source: input.source,
      stage,
      client_class: clientClass,
      duration_ms: boundedDuration(input.durationMs),
      error_code: errorCode || null,
    },
  });
  return { recorded: true };
}
