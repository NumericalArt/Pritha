export type RuntimeProviderId = "desktop_bundled" | "standalone_cli";
export type RuntimeProtocol = "app_server" | "exec_resume" | "queue";
export type Availability = "ready" | "degraded" | "unavailable";

export type RuntimeCapabilityMap = {
  imageInput?: boolean;
  fileMetadata?: boolean;
  fullChat: boolean;
  nativeHistory: boolean;
  listThreads: boolean;
  readThread: boolean;
  forkThread: boolean;
  archiveThread: boolean;
  unarchiveThread: boolean;
  renameThread: boolean;
  pinThread: boolean;
  steerTurn: boolean;
  interruptTurn: boolean;
  commandApprovals: boolean;
  fileChangeApprovals: boolean;
  permissionApprovals: boolean;
  requestUserInput: boolean;
  historyPagination: boolean;
  audioInput: boolean;
};

export type RuntimeModelOption = {
  inputModalities?: string[] | null;
  id: string;
  label: string;
  effortIds: string[];
  serviceTierIds: string[];
  defaultEffortId: string | null;
};

export type RuntimeProviderView = {
  providerId: RuntimeProviderId;
  label: string;
  availability: Availability;
  version: string | null;
  protocol: RuntimeProtocol | null;
  locationLabel: "Desktop bundled" | "Standalone CLI";
  stateIdentityHash: string | null;
  capabilities: RuntimeCapabilityMap;
  warning: string | null;
};

export type RuntimeStatus = {
  preferredProvider: "auto" | RuntimeProviderId;
  effectiveProvider: RuntimeProviderId | null;
  effectiveProtocol: RuntimeProtocol | null;
  availability: Availability;
  fallbackEnabled: boolean;
  providers: RuntimeProviderView[];
  models: RuntimeModelOption[];
  selected: {
    modelId: string | null;
    effortId: string | null;
    serviceTierId: string | null;
    sandboxMode: "read_only" | "workspace_write" | "danger_full_access";
    approvalMode: "untrusted" | "on_request" | "never";
  };
  probedAt: string;
};

export type ThreadGroup = "my_chats" | "voice_work" | "other_sessions";
export type ThreadOrigin = "chat" | "voice" | "external" | "exec_fallback";
export type HistoryKind = "native" | "mirrored" | "task_only";
export type ThreadStatus = "not_loaded" | "idle" | "active" | "system_error" | "archived";
export type ThreadContinuationState =
  | "read_only"
  | "continuation_enabled"
  | "blocked_active_turn"
  | "blocked_runtime_mismatch"
  | "blocked_history_unavailable";

export type RuntimeBindingView = {
  providerId: RuntimeProviderId | null;
  version: string | null;
  protocol: RuntimeProtocol;
  stateIdentityHash: string | null;
  compatibility: "bound" | "compatible" | "probe_required" | "mismatch";
};

export type TaskLinkView = {
  taskId: string;
  shortId: string | null;
  label: string;
  origin: "voice" | "chat";
  mode: "shared_thread" | "result_reference" | "degraded_no_thread";
  subjectScope: {
    kind: "agent" | "pritha" | "task" | "control";
    id: string;
    label: string;
    generation: number;
  } | null;
  status: string;
  linkedAt: string;
};

export type ThreadSummary = {
  chatId: string;
  title: string;
  preview: string;
  group: ThreadGroup;
  origin: ThreadOrigin;
  status: ThreadStatus;
  activeFlags: Array<"waiting_on_approval" | "waiting_on_input" | "streaming">;
  pinned: boolean;
  archived: boolean;
  historyKind: HistoryKind;
  createdAt: string;
  updatedAt: string;
  runtime: RuntimeBindingView;
  taskLinks: TaskLinkView[];
  continuationState: ThreadContinuationState;
};

export type TurnStatus =
  | "queued"
  | "in_progress"
  | "waiting_for_approval"
  | "waiting_for_input"
  | "completed"
  | "interrupted"
  | "failed";

export type AttachmentView = { id: string; name: string; size: number; kind: "image" | "file"; mediaType: string; href: string };

export type AttachmentMessage = { requestHash: string; attachments: AttachmentView[]; manifest: string };

export type MessageView = {
  attachments?: AttachmentView[];
  id: string;
  role: "user" | "assistant";
  markdown: string;
  status: "streaming" | "completed" | "failed";
  createdAt: string;
};

export type BaseItemView = {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "declined";
  startedAt: string | null;
  completedAt: string | null;
};

export type ChatItemView =
  | (BaseItemView & { kind: "assistant_message"; message: MessageView })
  | (BaseItemView & { kind: "reasoning_summary"; markdown: string })
  | (BaseItemView & {
      kind: "command";
      commandPreview: string;
      cwdLabel: string | null;
      outputPreview: string | null;
      exitCode: number | null;
    })
  | (BaseItemView & {
      kind: "file_change";
      changes: Array<{ path: string; operation: "add" | "modify" | "delete" | "rename" | "unknown" }>;
      diffPreview: string | null;
    })
  | (BaseItemView & { kind: "tool"; toolName: string; displayName: string; summary: string | null })
  | (BaseItemView & { kind: "web_search"; query: string; statusText: string | null })
  | (BaseItemView & { kind: "plan"; steps: Array<{ label: string; status: "pending" | "in_progress" | "completed" }> })
  | (BaseItemView & { kind: "task_link"; task: TaskLinkView })
  | (BaseItemView & { kind: "notice"; tone: "info" | "warning" | "error"; text: string })
  | (BaseItemView & { kind: "unsupported"; label: string });

export type TurnView = {
  turnId: string;
  clientMessageId?: string | null;
  status: TurnStatus;
  userMessage: MessageView;
  items: ChatItemView[];
  pendingRequestIds: string[];
  startedAt: string;
  completedAt: string | null;
  error: { code: string; message: string } | null;
};

export type PendingRequestView = {
  requestId: string;
  chatId: string;
  turnId: string;
  itemId: string | null;
  kind: "command_approval" | "file_change_approval" | "permission_approval" | "user_input" | "mcp_elicitation";
  title: string;
  reason: string | null;
  expiresAt: string | null;
  resolved: boolean;
  presentation: Record<string, unknown>;
};

export type ThreadDetail = {
  thread: ThreadSummary;
  activeTurnId: string | null;
  pendingRequests: PendingRequestView[];
  streamUrl: string;
  continuationState: ThreadContinuationState;
  history?: { state: "available" | "recovery_available" | "blocked"; code: string | null; recoverable: boolean };
};

export type CreateTaskLinkRequest = {
  taskId: string;
  mode: "shared_thread" | "result_reference";
};

export type ThreadPage = {
  data: ThreadSummary[];
  nextCursor: string | null;
  sync?: {
    state: "ready" | "refreshing" | "degraded";
    lastCompletedAt: string | null;
  };
};

export type TurnPage = {
  hasImageInputs?: boolean;
  data: TurnView[];
  olderCursor: string | null;
  newerCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
  snapshotAt: string;
};

export type AcceptedTurn = {
  turn: TurnView;
  streamUrl: string;
};

export type CreatedThreadTurn = {
  detail: ThreadDetail;
  accepted: AcceptedTurn;
};

export type ApiSuccess<T> = {
  apiVersion: "1";
  requestId: string;
  data: T;
  replayed?: boolean;
};

export type ApiErrorEnvelope = {
  apiVersion: "1";
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: Record<string, string | number | boolean | null>;
  };
};

export type ChatEvent<T = Record<string, unknown>> = {
  apiVersion: "1";
  eventId: string;
  occurredAt: string;
  chatId: string;
  turnId: string | null;
  itemId: string | null;
  requestId: string | null;
  payload: T;
};

export type ChatEventRecord = {
  event: string;
  data: ChatEvent;
};
