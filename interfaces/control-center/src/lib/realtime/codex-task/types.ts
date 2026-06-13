export type PrithaCodexTaskStatus = "ok" | "error" | "timeout" | "unavailable" | "decision_required";

export type PrithaCodexTaskType = "analysis" | "research" | "implementation" | "review" | "agent_creation" | "system_change";

export type PrithaCodexTaskPayload = {
  requestId: string;
  userId: string;
  taskType: PrithaCodexTaskType;
  userIntent: string;
  projectContext: {
    project: "Techscope";
    cwd: string;
    interface: "realtime";
    focus: string[];
  };
  ids?: Record<string, string | string[] | number | number[] | null>;
  data?: Record<string, unknown>;
  constraints: string[];
  expectedResponse: {
    format: "json";
    schema: Record<string, unknown>;
  };
};

export type PrithaCodexTaskResult = {
  requestId: string;
  status: PrithaCodexTaskStatus;
  text?: string;
  data?: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  startedAt: string;
  finishedAt: string;
  transport?: string;
};

export type PrithaCodexTaskRunOptions = {
  timeoutMs: number;
  userId: string;
};

export type PrithaCodexTaskClient = {
  runTask(payload: PrithaCodexTaskPayload, options: PrithaCodexTaskRunOptions): Promise<unknown>;
};
