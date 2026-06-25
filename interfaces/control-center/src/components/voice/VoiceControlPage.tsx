"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  Code2,
  Database,
  MemoryStick,
  Mic,
  MicOff,
  Paperclip,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import type { ControlCenterStatus } from "@/lib/control-center/types";
import { PrithaStarScene } from "./PrithaStarScene";
import {
  usePrithaRealtime,
  type CodexTaskState,
  type CodexTaskThreadScope,
  type CodexTaskVoiceFeedback,
  type MicGainRuntimeState,
  type PrithaRealtimeStatus,
  type RealtimePhase,
  type SessionMemoryPromotionState,
  type VoiceSessionEvent,
} from "./usePrithaRealtime";

type CodexTaskDetail = {
  ok: boolean;
  task_id?: string;
  status?: string;
  complete?: boolean;
  phase?: string;
  elapsed_ms?: number;
  last_activity_at?: string;
  last_activity?: string;
  stale?: boolean;
  operator_brief?: string;
  voice_handoff_required?: boolean;
  latest_voice_feedback?: CodexTaskVoiceFeedback | null;
  speakable_events?: CodexTaskVoiceFeedback[];
  request?: Record<string, unknown> | null;
  status_detail?: Record<string, unknown> | null;
  approval?: Record<string, unknown> | null;
  telemetry?: Array<Record<string, unknown>>;
  result_available?: boolean;
  result_excerpt?: string;
  stdout_excerpt?: string;
  stderr_excerpt?: string;
  progress_timeline?: Array<Record<string, unknown>>;
  thread_scope?: CodexTaskThreadScope | null;
  codex_app_thread_routing_mode?: string;
  paths?: Record<string, string>;
  error?: string;
};

function formatElapsed(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `00:${mins}:${secs}`;
}

function phaseIsActive(phase: RealtimePhase) {
  return phase === "connecting" || phase === "listening" || phase === "speaking" || phase === "working";
}

function stateLabel(phase: RealtimePhase) {
  return {
    idle: "Ready",
    connecting: "Connecting",
    listening: "Listening",
    speaking: "Speaking",
    working: "Working",
    error: "Connection issue",
  }[phase];
}

function subtitleForState(phase: RealtimePhase) {
  return {
    idle: "Ready when you are.",
    connecting: "Connecting microphone and Realtime...",
    listening: "Listening for you...",
    speaking: "Pritha is answering...",
    working: "Running a tool...",
    error: "Reconnect to continue.",
  }[phase];
}

function keyStatusLabel(status: PrithaRealtimeStatus | null, error?: string | null) {
  if (error) return error;
  if (!status) return "Checking key...";
  return status.openai_key_configured ? "Ready" : "Key missing";
}

function keyIsMissing(status: PrithaRealtimeStatus | null) {
  return status !== null && !status.openai_key_configured;
}

function primaryButtonLabel(phase: RealtimePhase, status: PrithaRealtimeStatus | null) {
  if (phase === "idle" && keyIsMissing(status)) return "Missing API Key";
  if (phase === "idle") return "Start Listening";
  if (phase === "connecting") return "Connecting...";
  if (phase === "error") return "Reconnect";
  return "Stop Listening";
}

function formatTaskElapsed(createdAt: string, completedAt?: string) {
  const start = Date.parse(createdAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Unknown";
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function taskStatusTone(task: CodexTaskState) {
  if (task.stale) return "orange";
  if (task.status.startsWith("failed")) return "orange";
  if (task.status === "decision_required" || task.approval?.status === "pending") return "orange";
  if (task.status === "rejected" || task.approval?.status === "rejected") return "orange";
  if (task.status === "complete") return "green";
  if (task.status === "running") return "blue";
  return "";
}

function taskNeedsApproval(task: CodexTaskState) {
  return task.status === "decision_required" || task.approval?.status === "pending";
}

function taskIsTerminal(task: CodexTaskState) {
  return task.status === "complete" || task.status === "rejected" || task.status.startsWith("failed");
}

function formatThreadScope(scope?: CodexTaskThreadScope | null) {
  if (!scope?.kind || !scope.id) return "thread: pending";
  const generation = Number(scope.generation || 1);
  return `thread: ${scope.kind}:${scope.id}${generation > 1 ? ` g${generation}` : ""}`;
}

function VoiceWave({ mobile = false }: { mobile?: boolean }) {
  return (
    <svg className={mobile ? "mobile-voice-wave" : "voice-wave"} viewBox="0 0 900 180" aria-hidden="true">
      <path className="wave wave-1" d="M0 94 C80 62 116 62 180 94 S300 126 370 92 S510 58 600 94 S735 130 900 82" />
      <path className="wave wave-2" d="M0 98 C96 118 148 28 228 84 S360 136 446 88 S570 48 668 94 S782 136 900 92" />
      <path className="wave wave-3" d="M0 90 C116 82 142 124 232 98 S350 64 448 96 S588 126 704 86 S804 58 900 96" />
    </svg>
  );
}

function VoiceVisualization({ phase, mobile = false }: { phase: RealtimePhase; mobile?: boolean }) {
  return (
    <div className={mobile ? "mobile-voice-visual" : "voice-visualization"}>
      <VoiceWave mobile={mobile} />
      <PrithaStarScene phase={phase} mobile={mobile} />
    </div>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const iconProps = { size: 20 };
  if (tool.includes("memory")) return <BookOpen {...iconProps} />;
  if (tool.includes("codex")) return <Code2 {...iconProps} />;
  return <Database {...iconProps} />;
}

function activeToolNames(status: PrithaRealtimeStatus | null) {
  return status?.tools?.length
    ? status.tools
    : ["full_pritha_memory", "inspect_pritha_files", "inspect_codex_task", "recall_rolling_summary", "answer_codex_task", "run_codex_task"];
}

const CLIENT_INTAKE_MAX_FILES = 8;
const CLIENT_INTAKE_MAX_FILE_BYTES = 10 * 1024 * 1024;
const CLIENT_INTAKE_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function fileSizeLabel(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function textHasUrl(value: string) {
  return /https?:\/\/[^\s<>"')\]]+/i.test(value);
}

function ContextCard({
  status,
  stickyContextEnabled,
  sessionEventCount,
  onResetVoiceContext,
  mobile = false,
}: {
  status: PrithaRealtimeStatus | null;
  stickyContextEnabled: boolean;
  sessionEventCount: number;
  onResetVoiceContext: () => boolean;
  mobile?: boolean;
}) {
  const tools = activeToolNames(status);
  const memoryReady = Boolean(status?.memory.sqlite && status.memory.sqlite_cli);
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <section className={mobile ? "mobile-info-card" : "side-card voice-context-card"}>
      <div className="card-title-row">
        <h2>Voice Context</h2>
        <span className={`inline-status ${stickyContextEnabled ? "green" : ""}`}>{stickyContextEnabled ? "Sticky" : "Off"}</span>
      </div>
      <div className="detail-block">
        <span className="muted-label">Sticky Focus</span>
        <strong className="accent-focus">
          <MemoryStick size={18} />
          {stickyContextEnabled ? "Auto session context" : "Disabled in settings"}
        </strong>
        <p>{memoryReady ? `${sessionEventCount} current-session events available to pin.` : "Pritha memory fallback is available."}</p>
      </div>
      <div className="detail-block">
        <span className="muted-label">Active Tools</span>
        <div className={mobile ? "mobile-tool-row" : "tool-chip-row"}>
          {tools.map((tool) => (
            <span className={mobile ? "mobile-tool-chip" : "tool-chip"} key={tool} title={tool}>
              <ToolIcon tool={tool} />
            </span>
          ))}
          <span className="tool-count">{tools.length} active</span>
        </div>
      </div>
      {confirmingReset ? (
        <div className="reset-confirmation">
          <p>Reset current voice context for this session?</p>
          <div>
            <button
              className="decline-button"
              type="button"
              onClick={() => setConfirmingReset(false)}
            >
              Cancel
            </button>
            <button
              className="approve-button"
              type="button"
              onClick={() => {
                if (onResetVoiceContext()) setConfirmingReset(false);
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      ) : (
        <button className="rail-link-button" type="button" disabled={!stickyContextEnabled} onClick={() => setConfirmingReset(true)}>
          Reset Voice Context
          <span>⌄</span>
        </button>
      )}
    </section>
  );
}

function TaskListCard({
  tasks,
  toolStatus,
  onOpenTask,
  onRefreshTask,
  onApproveTask,
  onRejectTask,
}: {
  tasks: CodexTaskState[];
  toolStatus: string;
  onOpenTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
  onApproveTask: (taskId: string) => void;
  onRejectTask: (taskId: string) => void;
}) {
  const activeCount = tasks.filter((task) => !taskIsTerminal(task)).length;

  return (
    <section className="side-card task-list-card">
      <div className="card-title-row">
        <h2>Codex Tasks</h2>
        <span className={`inline-status ${activeCount ? "blue" : ""}`}>{activeCount ? `${activeCount} active` : "Idle"}</span>
      </div>
      {tasks.length ? (
        <div className="task-list">
          {tasks.map((task) => (
            <article className="task-list-row" key={task.id}>
              <div className="task-row-top">
                <strong>{task.title}</strong>
                <span className={`inline-status ${taskStatusTone(task)}`}>{task.status}</span>
              </div>
              <div className="task-progress-row" title={task.progressDetail || undefined}>
                <div className="task-progress-track">
                  <span className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                </div>
                <span>{task.progress}%</span>
              </div>
              <p>{task.resultExcerpt || task.summary}</p>
              {task.latestVoiceFeedback?.voice_text ? (
                <div className={`task-row-note ${task.latestVoiceFeedback.priority === "high" ? "" : "neutral"}`}>
                  Voice: {task.latestVoiceFeedback.voice_text}
                </div>
              ) : null}
              <div className="task-phase-row">
                <span>{task.phase ? `phase: ${task.phase}` : "phase: unknown"}</span>
                <span>{formatThreadScope(task.threadScope)}</span>
                {task.threadRoutingMode ? <span>{`routing: ${task.threadRoutingMode}`}</span> : null}
                {task.stale ? <strong>possibly stale</strong> : null}
              </div>
              {task.lastActivity ? <div className="task-row-note neutral">Last activity: {task.lastActivity}</div> : null}
              {taskNeedsApproval(task) ? (
                <div className="task-approval-note">
                  <strong>{task.approval?.action_type || "Approval required"}</strong>
                  <span>{task.approval?.summary || "Approve this task before Codex starts."}</span>
                </div>
              ) : null}
              <div className="task-row-meta">
                <span>{formatTaskElapsed(task.createdAt, task.completedAt)}</span>
                <span>{task.handoffStatus ? `handoff: ${task.handoffStatus}` : "handoff: pending"}</span>
              </div>
              {task.handoffReason ? <div className="task-row-note">Reason: {task.handoffReason}</div> : null}
              <div className="task-row-actions">
                <button className="outline-button compact" type="button" onClick={() => onOpenTask(task.id)}>
                  Details
                </button>
                <button className="secondary-button compact" type="button" onClick={() => onRefreshTask(task.id)}>
                  Refresh
                </button>
                {taskNeedsApproval(task) ? (
                  <>
                    <button className="decline-button compact" type="button" onClick={() => onRejectTask(task.id)}>
                      <X size={16} />
                      Reject
                    </button>
                    <button className="approve-button compact" type="button" onClick={() => onApproveTask(task.id)}>
                      <Check size={16} />
                      Approve
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>{toolStatus}</p>
      )}
      <p className="task-limit-note">Voice queue target: up to 5 parallel Codex tasks.</p>
    </section>
  );
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return "None";
  return JSON.stringify(value, null, 2);
}

function TaskDetailDrawer({
  detail,
  loading,
  onClose,
  onRefresh,
}: {
  detail: CodexTaskDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  if (!detail && !loading) return null;
  const paths = detail?.paths ? Object.entries(detail.paths) : [];
  const telemetry = detail?.telemetry || [];

  return (
    <div className="voice-drawer-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? onClose() : undefined)}>
      <aside className="voice-drawer" role="dialog" aria-modal="true" aria-label="Codex task details">
        <div className="voice-drawer-header">
          <div>
            <span className="muted-label">Codex Task</span>
            <h2>{detail?.task_id || "Loading..."}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close task details" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {loading ? <p className="drawer-muted">Loading task details...</p> : null}
        {detail?.error ? <p className="drawer-error">{detail.error}</p> : null}
        {detail ? (
          <div className="drawer-stack">
            <div className="drawer-kv">
              <span>Status</span>
              <strong>{detail.status || "unknown"}</strong>
              <span>Phase</span>
              <strong>{detail.phase || "unknown"}</strong>
              <span>Complete</span>
              <strong>{detail.complete ? "yes" : "no"}</strong>
              <span>Result</span>
              <strong>{detail.result_available ? "available" : "not yet"}</strong>
              <span>Thread</span>
              <strong>{formatThreadScope(detail.thread_scope)}</strong>
              <span>Routing</span>
              <strong>{detail.codex_app_thread_routing_mode || "unknown"}</strong>
              <span>Last activity</span>
              <strong>{detail.last_activity_at || "unknown"}</strong>
            </div>
            <section>
              <h3>Operator Brief</h3>
              <pre>{detail.operator_brief || detail.last_activity || "No brief available yet."}</pre>
            </section>
            <section>
              <h3>Voice Feedback</h3>
              <pre>{detail.latest_voice_feedback?.voice_text || formatJson(detail.latest_voice_feedback)}</pre>
            </section>
            <section>
              <h3>Request</h3>
              <pre>{formatJson(detail.request)}</pre>
            </section>
            <section>
              <h3>Status Detail</h3>
              <pre>{formatJson(detail.status_detail)}</pre>
            </section>
            {detail.approval ? (
              <section>
                <h3>Approval</h3>
                <pre>{formatJson(detail.approval)}</pre>
              </section>
            ) : null}
            <section>
              <h3>Result Excerpt</h3>
              <pre>{detail.result_excerpt || "No result excerpt yet."}</pre>
            </section>
            {detail.stderr_excerpt ? (
              <section>
                <h3>Stderr Excerpt</h3>
                <pre>{detail.stderr_excerpt}</pre>
              </section>
            ) : null}
            <section>
              <h3>Safe Paths</h3>
              <div className="drawer-path-list">
                {paths.length ? paths.map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <code>{value}</code>
                  </div>
                )) : <p className="drawer-muted">No paths available.</p>}
              </div>
            </section>
            <section>
              <h3>Telemetry</h3>
              <div className="drawer-event-list">
                {telemetry.length ? telemetry.slice(-12).map((event, index) => (
                  <div key={`${event.kind || "event"}-${index}`}>
                    <strong>{String(event.kind || "event")}</strong>
                    <span>{String(event.timestamp || "")}</span>
                    {event.reason ? <em>{String(event.reason)}</em> : null}
                  </div>
                )) : <p className="drawer-muted">No telemetry events for this task yet.</p>}
              </div>
            </section>
            <section>
              <h3>Progress Timeline</h3>
              <div className="drawer-event-list">
                {detail.progress_timeline?.length ? detail.progress_timeline.slice(-12).map((event, index) => (
                  <div key={`${event.phase || "progress"}-${index}`}>
                    <strong>{String(event.phase || "progress")}</strong>
                    <span>{String(event.timestamp || "")}</span>
                    {event.message ? <em>{String(event.message)}</em> : null}
                  </div>
                )) : <p className="drawer-muted">No progress events for this task yet.</p>}
              </div>
            </section>
          </div>
        ) : null}
        <div className="drawer-actions">
          <button className="secondary-button compact" type="button" onClick={onRefresh} disabled={!detail?.task_id}>
            Refresh
          </button>
          <button className="outline-button compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function SessionCard({
  events,
  phase,
  memoryPromotion,
  onSendRecap,
  onOpenRecall,
  onPromoteMemory,
}: {
  events: VoiceSessionEvent[];
  phase: RealtimePhase;
  memoryPromotion: SessionMemoryPromotionState;
  onSendRecap: () => boolean;
  onOpenRecall: () => void;
  onPromoteMemory: () => void;
}) {
  const canSend = phaseIsActive(phase);
  const taskEvents = events.filter((event) => event.kind === "task").length;
  const latest = events.at(-1);
  const memoryLabel = memoryPromotion.status === "idle" ? "waiting" : memoryPromotion.status;

  return (
    <section className="side-card session-card">
      <div className="card-title-row">
        <h2>Current Session</h2>
        <span className="inline-status green">Private</span>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Journal</dt>
          <dd>{events.length} events</dd>
        </div>
        <div>
          <dt>Tasks</dt>
          <dd>{taskEvents}</dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>{memoryLabel}</dd>
        </div>
      </dl>
      <p>{latest ? `Latest: ${latest.kind} at ${latest.timestamp}` : "Session journal is ready."}</p>
      {memoryPromotion.path ? <p className="session-memory-path">Saved: {memoryPromotion.path}</p> : null}
      {memoryPromotion.reason ? <p className="session-memory-path">Decision: {memoryPromotion.reason}</p> : null}
      <button className="rail-link-button" type="button" disabled={!events.length} onClick={onOpenRecall}>
        Earlier This Session
        <span>⌄</span>
      </button>
      <button className="rail-link-button" type="button" disabled={!events.length || memoryPromotion.status === "checking"} onClick={onPromoteMemory}>
        Promote Memory
        <span>⌄</span>
      </button>
      <button className="rail-link-button" type="button" disabled={!canSend || !events.length} onClick={onSendRecap}>
        Send Recap To Pritha
        <span>⌄</span>
      </button>
    </section>
  );
}

function buildSessionRecap(events: VoiceSessionEvent[]) {
  const taskEvents = events.filter((event) => event.kind === "task");
  const recent = events.slice(-8);
  const lines = [
    `Session events: ${events.length}`,
    `Task events: ${taskEvents.length}`,
    "Recent details:",
    ...recent.map((event) => `- ${event.timestamp} ${event.kind}${event.taskId ? ` ${event.taskId}` : ""}: ${event.text}`),
  ];
  return lines.join("\n");
}

function SessionRecallDrawer({
  events,
  open,
  phase,
  onClose,
  onSendRecap,
}: {
  events: VoiceSessionEvent[];
  open: boolean;
  phase: RealtimePhase;
  onClose: () => void;
  onSendRecap: () => boolean;
}) {
  const [query, setQuery] = useState("");
  if (!open) return null;

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? events.filter((event) => `${event.kind} ${event.status || ""} ${event.taskId || ""} ${event.text}`.toLowerCase().includes(normalized))
    : events;
  const canSend = phaseIsActive(phase) && events.length > 0;
  const recap = buildSessionRecap(events);

  return (
    <div className="voice-drawer-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? onClose() : undefined)}>
      <aside className="voice-drawer" role="dialog" aria-modal="true" aria-label="Earlier this session">
        <div className="voice-drawer-header">
          <div>
            <span className="muted-label">Current Session</span>
            <h2>Earlier This Session</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close session recall" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-stack">
          <section>
            <h3>Search</h3>
            <input
              className="drawer-search-input"
              value={query}
              placeholder="Search current-session events, task ids, or result snippets"
              onChange={(event) => setQuery(event.target.value)}
            />
          </section>
          <section>
            <h3>Compact Recap</h3>
            <pre>{recap}</pre>
          </section>
          <section>
            <h3>Events</h3>
            <div className="drawer-session-list">
              {filtered.length ? filtered.slice(-60).reverse().map((event) => (
                <article key={event.id}>
                  <div>
                    <strong>{event.kind}</strong>
                    <span>{event.timestamp}</span>
                  </div>
                  {event.taskId ? <code>{event.taskId}</code> : null}
                  <p>{event.text}</p>
                </article>
              )) : <p className="drawer-muted">No matching session events.</p>}
            </div>
          </section>
        </div>
        <div className="drawer-actions">
          <button className="secondary-button compact" type="button" disabled={!canSend} onClick={onSendRecap}>
            Send Recap To Pritha
          </button>
          <button className="outline-button compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function PasteCommandPanel({
  sendText,
  phase,
  sessionId,
  onCodexTaskCreated,
}: {
  sendText: (text: string) => boolean;
  phase: RealtimePhase;
  sessionId: string;
  onCodexTaskCreated: (taskId: string) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canSend = phaseIsActive(phase);
  const routesToCodex = files.length > 0 || textHasUrl(text);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const canSubmit = !busy && (routesToCodex ? Boolean(text.trim() || files.length) : canSend && Boolean(text.trim()));

  function addFiles(nextFiles: Iterable<File>) {
    setNote("");
    setFiles((current) => {
      const merged = [...current];
      for (const file of nextFiles) {
        if (merged.length >= CLIENT_INTAKE_MAX_FILES) {
          setNote(`Too many files. Max ${CLIENT_INTAKE_MAX_FILES}.`);
          break;
        }
        if (file.size > CLIENT_INTAKE_MAX_FILE_BYTES) {
          setNote(`${file.name} is too large. Max ${fileSizeLabel(CLIENT_INTAKE_MAX_FILE_BYTES)}.`);
          continue;
        }
        if (merged.reduce((sum, item) => sum + item.size, 0) + file.size > CLIENT_INTAKE_MAX_TOTAL_BYTES) {
          setNote(`Files are too large. Max ${fileSizeLabel(CLIENT_INTAKE_MAX_TOTAL_BYTES)} total.`);
          continue;
        }
        merged.push(file);
      }
      return merged;
    });
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submitCodexIntake() {
    const form = new FormData();
    form.set("text", text.trim());
    form.set("session_id", sessionId);
    for (const file of files) form.append("files", file, file.name);
    const response = await fetch("/api/realtime/intake", { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({ ok: false, error: "intake returned non-json" }))) as {
      ok?: boolean;
      task_id?: string;
      error?: string;
      operator_note?: string;
      max_file_label?: string;
      max_total_label?: string;
    };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Intake failed with status ${response.status}`);
    }
    if (payload.task_id) {
      onCodexTaskCreated(payload.task_id);
      if (canSend) sendText(`Codex intake task ${payload.task_id} created for the pasted files or links. Summarize its result when it completes.`);
    }
    setText("");
    setFiles([]);
    setNote(payload.operator_note || "Sent to Codex.");
  }

  function submit() {
    if (!canSubmit) return;
    setNote("");
    if (routesToCodex) {
      setBusy(true);
      void submitCodexIntake()
        .catch((error) => setNote(error instanceof Error ? error.message : "Could not send intake to Codex."))
        .finally(() => setBusy(false));
      return;
    }
    const sent = sendText(text);
    if (sent) setText("");
  }

  return (
    <section
      className={`command-panel ${routesToCodex ? "codex-intake" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="card-title-row">
        <h2>Paste Command</h2>
        <span className={`inline-status ${routesToCodex ? "blue" : canSend ? "green" : ""}`}>
          {busy ? "Sending" : routesToCodex ? "Codex" : canSend ? "Live" : "Start voice"}
        </span>
      </div>
      <div className="command-input-row large">
        <textarea
          value={text}
          placeholder="Paste a command, link, screenshot, file, or context."
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            const pastedFiles = Array.from(event.clipboardData.files || []);
            if (pastedFiles.length) addFiles(pastedFiles);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
          }}
        />
        <div className="command-button-stack">
          <button type="button" aria-label="Attach files" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <Paperclip size={20} />
          </button>
          <button type="button" aria-label="Send command" onClick={submit} disabled={!canSubmit}>
            <SendHorizontal size={22} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.currentTarget.files) addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {files.length ? (
        <div className="command-file-list">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="command-file-chip">
              <span>{file.name}</span>
              <small>{fileSizeLabel(file.size)}</small>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)} disabled={busy}>
                <X size={14} />
              </button>
            </div>
          ))}
          <span className="command-file-total">{fileSizeLabel(totalBytes)} total</span>
        </div>
      ) : null}
      {note ? <p className="command-intake-note">{note}</p> : null}
    </section>
  );
}

function MicInputLevelControl({
  value,
  active,
  runtime,
  onChange,
}: {
  value: number;
  active: boolean;
  runtime: MicGainRuntimeState;
  onChange: (value: number) => void;
}) {
  function updateValue(event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) {
    onChange(Number(event.currentTarget.value));
  }

  const statusText = !runtime.available
    ? "Unavailable on this device"
    : active && runtime.active
      ? "Live attenuation"
      : "Saved for next start";

  return (
    <label className="mic-gain-control" title={runtime.fallbackReason || runtime.audioContextState || undefined}>
      <span>Voice input level</span>
      <input
        aria-label="Voice input level"
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onInput={updateValue}
        onChange={updateValue}
      />
      <strong>{Math.round(value)}%</strong>
      <small>{statusText}</small>
    </label>
  );
}

function ConnectionCard({
  status,
  phase,
  latencyMs,
  remoteAudioReady,
  onReconnect,
}: {
  status: PrithaRealtimeStatus | null;
  phase: RealtimePhase;
  latencyMs: number | null;
  remoteAudioReady: boolean;
  onReconnect: () => void;
}) {
  const connected = phase === "listening" || phase === "speaking" || phase === "working";
  const statusLoaded = status !== null;
  const keyReady = status?.openai_key_configured === true;
  const headerTone = connected || keyReady ? "green" : statusLoaded ? "orange" : "";
  const headerLabel = connected ? "Good" : keyReady ? "Ready" : statusLoaded ? "Needs key" : "Checking";
  const realtimeLabel = connected ? "Connected" : keyReady ? "Configured" : statusLoaded ? "Missing key" : "Checking";
  const codexLabel = status ? (status.codex.available ? `${status.codex.mode} ready` : "Queue fallback") : "Checking";

  return (
    <section className="side-card connection-card">
      <div className="card-title-row">
        <h2>Connection</h2>
        <span className={`inline-status ${headerTone}`}>{headerLabel}</span>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Realtime</dt>
          <dd className={connected || keyReady ? "good" : ""}>{realtimeLabel}</dd>
        </div>
        <div>
          <dt>Codex</dt>
          <dd className={status?.codex.available ? "good" : ""}>{codexLabel}</dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{remoteAudioReady ? "Remote ready" : "Remote idle"}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{typeof latencyMs === "number" ? `${latencyMs} ms` : "Unknown"}</dd>
        </div>
      </dl>
      <button className="secondary-button compact" type="button" onClick={onReconnect}>
        Reconnect
      </button>
    </section>
  );
}

function VoiceSessionPanel({
  phase,
  elapsedSec,
  status,
  isMuted,
  micInputLevel,
  micGainRuntime,
  error,
  onPrimary,
  onMute,
  onMicInputLevelChange,
  mobile = false,
}: {
  phase: RealtimePhase;
  elapsedSec: number;
  status: PrithaRealtimeStatus | null;
  isMuted: boolean;
  micInputLevel: number;
  micGainRuntime: MicGainRuntimeState;
  error: string | null;
  onPrimary: () => void;
  onMute: () => void;
  onMicInputLevelChange: (value: number) => void;
  mobile?: boolean;
}) {
  const model = status?.model || "gpt-realtime-2";
  const active = phaseIsActive(phase);
  const keyMissing = keyIsMissing(status);
  const primaryDisabled = phase === "connecting" || (phase === "idle" && keyMissing);
  const muteDisabled = !active || phase === "connecting";
  const muteTitle = muteDisabled ? "Mute becomes available after Start Listening connects the microphone." : "Toggle microphone mute.";
  const gainActive = phase === "listening" || phase === "speaking" || phase === "working";

  if (mobile) {
    return (
      <section className="mobile-voice-card">
        <div className="mobile-voice-card-header">
          <h1 className="mobile-voice-title">Voice Control</h1>
          <div className="mobile-model-block">
            <span>Model</span>
            <strong className="mobile-model-name">{model}</strong>
            <span className="connection-quality">{keyStatusLabel(status, error)}</span>
          </div>
        </div>
        <VoiceVisualization phase={phase} mobile />
        <div className="mobile-voice-timer">{formatElapsed(elapsedSec)}</div>
        <div className="mobile-voice-subtitle">{subtitleForState(phase)}</div>
        <button className="mobile-voice-primary" type="button" onClick={onPrimary} disabled={primaryDisabled}>
          <Square size={17} fill="currentColor" />
          {primaryButtonLabel(phase, status)}
        </button>
        <div className="mobile-voice-secondary-row">
          <button className="mobile-voice-secondary" type="button" onClick={onMute} disabled={muteDisabled} title={muteTitle}>
            {isMuted ? <Mic size={20} /> : <MicOff size={20} />}
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
        <MicInputLevelControl value={micInputLevel} active={gainActive} runtime={micGainRuntime} onChange={onMicInputLevelChange} />
      </section>
    );
  }

  return (
    <section className="voice-session-panel">
      <div className="voice-panel-top">
        <div>
          <span className="muted-label">Status</span>
          <strong className={`voice-state-label ${phase}`}>
            {stateLabel(phase)}
            <span className="tiny-wave" aria-hidden="true" />
          </strong>
        </div>
        <div className="voice-model-block">
          <span className="muted-label">Model</span>
          <strong>{model}</strong>
          <span className="connection-quality">{keyStatusLabel(status, error)}</span>
        </div>
      </div>
      <VoiceVisualization phase={phase} />
      <div className="voice-timer">{formatElapsed(elapsedSec)}</div>
      <div className="voice-subtitle">{subtitleForState(phase)}</div>
      <div className="voice-controls">
        <button className="voice-secondary-control" type="button" onClick={onMute} disabled={muteDisabled} title={muteTitle}>
          {isMuted ? <Mic size={22} /> : <MicOff size={22} />}
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button className="voice-primary-button" type="button" onClick={onPrimary} disabled={primaryDisabled}>
          <Square size={18} fill="currentColor" />
          {primaryButtonLabel(phase, status)}
        </button>
      </div>
      <MicInputLevelControl value={micInputLevel} active={gainActive} runtime={micGainRuntime} onChange={onMicInputLevelChange} />
    </section>
  );
}

function MobileStatusChips({ status }: { status: PrithaRealtimeStatus | null }) {
  const codexReady = status?.codex.available === true;
  const realtimeReady = status?.openai_key_configured === true;

  return (
    <div className="mobile-status-grid">
      <div className="mobile-status-chip">
        <span className="mobile-status-title">
          Pritha <span className="dot green" />
        </span>
        <strong className="mobile-status-value">Ready</strong>
      </div>
      <div className="mobile-status-chip">
        <span className="mobile-status-title">
          Codex <span className={`dot ${codexReady ? "green" : status ? "orange" : ""}`} />
        </span>
        <strong className={`mobile-status-value ${codexReady ? "" : "muted"}`}>{status ? (codexReady ? "Connected" : "Queue") : "Checking"}</strong>
      </div>
      <div className="mobile-status-chip">
        <span className="mobile-status-title">
          Realtime <span className={`dot ${realtimeReady ? "green" : status ? "orange" : ""}`} />
        </span>
        <strong className={`mobile-status-value ${realtimeReady ? "" : "muted"}`}>{status ? (realtimeReady ? "Ready" : "Key") : "Checking"}</strong>
      </div>
    </div>
  );
}

export function VoiceControlPage({ status }: { status: ControlCenterStatus }) {
  const realtime = usePrithaRealtime();
  const [elapsedSec, setElapsedSec] = useState(0);
  const [taskDetail, setTaskDetail] = useState<CodexTaskDetail | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [sessionRecallOpen, setSessionRecallOpen] = useState(false);
  const isActive = phaseIsActive(realtime.phase);
  const primaryAction = useMemo(
    () => () => {
      if (isActive) realtime.stop();
      else void realtime.start();
    },
    [isActive, realtime],
  );

  useEffect(() => {
    if (!isActive) {
      setElapsedSec(0);
      return undefined;
    }
    const interval = window.setInterval(() => setElapsedSec((value) => value + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  async function openTaskDetails(taskId: string) {
    setTaskDetailLoading(true);
    try {
      const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}`, { cache: "no-store" });
      const detail = (await response.json().catch(() => ({ ok: false, error: "Task details returned non-json" }))) as CodexTaskDetail;
      setTaskDetail(detail);
      void realtime.refreshCodexTask(taskId).catch(() => undefined);
    } finally {
      setTaskDetailLoading(false);
    }
  }

  async function refreshVisibleTask(taskId: string) {
    const snapshot = await realtime.refreshCodexTask(taskId).catch(() => null);
    if (taskDetail?.task_id === taskId || snapshot?.task_id === taskDetail?.task_id) await openTaskDetails(taskId);
  }

  async function decideCodexTask(taskId: string, action: "approve" | "reject") {
    const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = (await response.json().catch(() => ({ ok: false, error: "approval returned non-json" }))) as CodexTaskDetail;
    if (response.ok) {
      await realtime.refreshCodexTask(taskId);
      if (action === "approve") realtime.watchCodexTask(taskId);
      if (taskDetail?.task_id === taskId || result.task_id === taskDetail?.task_id) setTaskDetail(result);
    } else {
      setTaskDetail(result);
    }
  }

  function handleCodexTaskCreated(taskId: string) {
    realtime.watchCodexTask(taskId);
    void realtime.refreshCodexTask(taskId).catch(() => undefined);
  }

  return (
    <>
      <div className="mobile-voice-screen">
        <MobileStatusChips status={realtime.status} />
        <VoiceSessionPanel
          phase={realtime.phase}
          elapsedSec={elapsedSec}
          status={realtime.status}
          isMuted={realtime.isMuted}
          micInputLevel={realtime.micInputLevel}
          micGainRuntime={realtime.micGainRuntime}
          error={realtime.error}
          onPrimary={primaryAction}
          onMute={realtime.toggleMute}
          onMicInputLevelChange={realtime.setMicInputLevel}
          mobile
        />
        <PasteCommandPanel
          sendText={realtime.sendTextMessage}
          phase={realtime.phase}
          sessionId={realtime.sessionId}
          onCodexTaskCreated={handleCodexTaskCreated}
        />
        <TaskListCard
          tasks={realtime.codexTasks}
          toolStatus={realtime.toolStatus}
          onOpenTask={openTaskDetails}
          onRefreshTask={(taskId) => void refreshVisibleTask(taskId)}
          onApproveTask={(taskId) => void decideCodexTask(taskId, "approve")}
          onRejectTask={(taskId) => void decideCodexTask(taskId, "reject")}
        />
        <SessionCard
          events={realtime.sessionEvents}
          phase={realtime.phase}
          memoryPromotion={realtime.sessionMemoryPromotion}
          onSendRecap={realtime.sendSessionRecap}
          onOpenRecall={() => setSessionRecallOpen(true)}
          onPromoteMemory={() => void realtime.promoteSessionMemory("manual")}
        />
        <ContextCard
          status={realtime.status}
          stickyContextEnabled={realtime.stickyContextEnabled}
          sessionEventCount={realtime.sessionEvents.length}
          onResetVoiceContext={realtime.resetVoiceContext}
          mobile
        />
      </div>
      <div className="voice-desktop-content">
        <PageHeader title="Voice Control" subtitle="Talk to Pritha. Give commands. Get things done." variant="voice" status={status} />
        <div className="voice-layout">
          <main className="voice-main">
            <VoiceSessionPanel
              phase={realtime.phase}
              elapsedSec={elapsedSec}
              status={realtime.status}
              isMuted={realtime.isMuted}
              micInputLevel={realtime.micInputLevel}
              micGainRuntime={realtime.micGainRuntime}
              error={realtime.error}
              onPrimary={primaryAction}
              onMute={realtime.toggleMute}
              onMicInputLevelChange={realtime.setMicInputLevel}
            />
            <PasteCommandPanel
              sendText={realtime.sendTextMessage}
              phase={realtime.phase}
              sessionId={realtime.sessionId}
              onCodexTaskCreated={handleCodexTaskCreated}
            />
          </main>
          <aside className="voice-rail">
            <TaskListCard
              tasks={realtime.codexTasks}
              toolStatus={realtime.toolStatus}
              onOpenTask={openTaskDetails}
              onRefreshTask={(taskId) => void refreshVisibleTask(taskId)}
              onApproveTask={(taskId) => void decideCodexTask(taskId, "approve")}
              onRejectTask={(taskId) => void decideCodexTask(taskId, "reject")}
            />
            <SessionCard
              events={realtime.sessionEvents}
              phase={realtime.phase}
              memoryPromotion={realtime.sessionMemoryPromotion}
              onSendRecap={realtime.sendSessionRecap}
              onOpenRecall={() => setSessionRecallOpen(true)}
              onPromoteMemory={() => void realtime.promoteSessionMemory("manual")}
            />
            <ConnectionCard
              status={realtime.status}
              phase={realtime.phase}
              latencyMs={realtime.lastLatencyMs}
              remoteAudioReady={realtime.remoteAudioReady}
              onReconnect={() => {
                realtime.stop();
                void realtime.start();
              }}
            />
            <ContextCard
              status={realtime.status}
              stickyContextEnabled={realtime.stickyContextEnabled}
              sessionEventCount={realtime.sessionEvents.length}
              onResetVoiceContext={realtime.resetVoiceContext}
            />
          </aside>
        </div>
      </div>
      <TaskDetailDrawer
        detail={taskDetail}
        loading={taskDetailLoading}
        onClose={() => setTaskDetail(null)}
        onRefresh={() => {
          if (taskDetail?.task_id) void refreshVisibleTask(taskDetail.task_id);
        }}
      />
      <SessionRecallDrawer
        events={realtime.sessionEvents}
        open={sessionRecallOpen}
        phase={realtime.phase}
        onClose={() => setSessionRecallOpen(false)}
        onSendRecap={realtime.sendSessionRecap}
      />
    </>
  );
}
