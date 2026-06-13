"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  Code2,
  Database,
  MemoryStick,
  Mic,
  MicOff,
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
  request?: Record<string, unknown> | null;
  status_detail?: Record<string, unknown> | null;
  telemetry?: Array<Record<string, unknown>>;
  result_available?: boolean;
  result_excerpt?: string;
  stdout_excerpt?: string;
  stderr_excerpt?: string;
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
  if (task.status.startsWith("failed")) return "orange";
  if (task.status === "complete") return "green";
  if (task.status === "running") return "blue";
  return "";
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
  return status?.tools?.length ? status.tools : ["search_pritha_memory", "deep_pritha_memory", "run_codex_task"];
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
      <button className="rail-link-button" type="button" disabled={!stickyContextEnabled} onClick={onResetVoiceContext}>
        Reset Voice Context
        <span>⌄</span>
      </button>
    </section>
  );
}

function TaskListCard({
  tasks,
  toolStatus,
  onOpenTask,
  onRefreshTask,
}: {
  tasks: CodexTaskState[];
  toolStatus: string;
  onOpenTask: (taskId: string) => void;
  onRefreshTask: (taskId: string) => void;
}) {
  const activeCount = tasks.filter((task) => task.status !== "complete" && !task.status.startsWith("failed")).length;

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
              <div className="task-progress-row">
                <div className="task-progress-track">
                  <span className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                </div>
                <span>{task.progress}%</span>
              </div>
              <p>{task.resultExcerpt || task.summary}</p>
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
              <span>Complete</span>
              <strong>{detail.complete ? "yes" : "no"}</strong>
              <span>Result</span>
              <strong>{detail.result_available ? "available" : "not yet"}</strong>
            </div>
            <section>
              <h3>Request</h3>
              <pre>{formatJson(detail.request)}</pre>
            </section>
            <section>
              <h3>Status Detail</h3>
              <pre>{formatJson(detail.status_detail)}</pre>
            </section>
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

function PasteCommandPanel({ sendText, phase }: { sendText: (text: string) => boolean; phase: RealtimePhase }) {
  const [text, setText] = useState("");
  const canSend = phaseIsActive(phase);

  function submit() {
    const sent = sendText(text);
    if (sent) setText("");
  }

  return (
    <section className="command-panel">
      <div className="card-title-row">
        <h2>Paste Command</h2>
        <span className={`inline-status ${canSend ? "green" : ""}`}>{canSend ? "Live" : "Start voice"}</span>
      </div>
      <div className="command-input-row large">
        <textarea
          value={text}
          placeholder="Paste a link, file note, long command, or context for the live voice session."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
          }}
        />
        <button type="button" aria-label="Send command" onClick={submit} disabled={!canSend || !text.trim()}>
          <SendHorizontal size={22} />
        </button>
      </div>
    </section>
  );
}

function MicGainControl({ value, active, onChange }: { value: number; active: boolean; onChange: (value: number) => void }) {
  function updateValue(event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) {
    onChange(Number(event.currentTarget.value));
  }

  return (
    <label className="mic-gain-control">
      <span>Mic sensitivity</span>
      <input
        aria-label="Microphone sensitivity"
        type="range"
        min="0"
        max="2"
        step="0.05"
        value={value}
        onInput={updateValue}
        onChange={updateValue}
      />
      <strong>{Math.round(value * 100)}%</strong>
      <small>{active ? "Live mic gain" : "Saved for next start"}</small>
    </label>
  );
}

function DecisionCard() {
  return (
    <section className="side-card decision-card">
      <div className="card-title-row">
        <h2>Decision Gate</h2>
        <span className="inline-status">Idle</span>
      </div>
      <p>Voice confirmation gates are reserved for deletion and service install. No pending decision.</p>
      <div className="decision-buttons">
        <button className="approve-button" type="button" disabled>
          <Check size={18} />
          Approve
        </button>
        <button className="decline-button" type="button" disabled>
          <X size={18} />
          Decline
        </button>
      </div>
      <button className="rail-link-button" type="button" disabled>
        View Details
        <span>⌄</span>
      </button>
    </section>
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
  micGain,
  error,
  onPrimary,
  onMute,
  onMicGainChange,
  mobile = false,
}: {
  phase: RealtimePhase;
  elapsedSec: number;
  status: PrithaRealtimeStatus | null;
  isMuted: boolean;
  micGain: number;
  error: string | null;
  onPrimary: () => void;
  onMute: () => void;
  onMicGainChange: (value: number) => void;
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
        <MicGainControl value={micGain} active={gainActive} onChange={onMicGainChange} />
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
      <MicGainControl value={micGain} active={gainActive} onChange={onMicGainChange} />
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
        <span className="mobile-status-title">Realtime</span>
        <strong className={`mobile-status-value ${realtimeReady ? "" : "muted"}`}>{status ? (realtimeReady ? "Ready" : "Key") : "Checking"}</strong>
      </div>
    </div>
  );
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function VoiceControlPage({ status }: { status: ControlCenterStatus }) {
  const realtime = usePrithaRealtime();
  const [elapsedSec, setElapsedSec] = useState(0);
  const isMobile = useIsMobileViewport();
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

  return (
    <>
      {isMobile ? (
        <div className="mobile-voice-screen">
          <MobileStatusChips status={realtime.status} />
          <VoiceSessionPanel
            phase={realtime.phase}
            elapsedSec={elapsedSec}
            status={realtime.status}
            isMuted={realtime.isMuted}
            micGain={realtime.micGain}
            error={realtime.error}
            onPrimary={primaryAction}
            onMute={realtime.toggleMute}
            onMicGainChange={realtime.setMicGain}
            mobile
          />
          <PasteCommandPanel sendText={realtime.sendTextMessage} phase={realtime.phase} />
          <TaskListCard tasks={realtime.codexTasks} toolStatus={realtime.toolStatus} onOpenTask={openTaskDetails} onRefreshTask={(taskId) => void refreshVisibleTask(taskId)} />
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
          <DecisionCard />
        </div>
      ) : (
        <div className="voice-desktop-content">
          <PageHeader title="Voice Control" subtitle="Talk to Pritha. Give commands. Get things done." variant="voice" status={status} />
          <div className="voice-layout">
            <main className="voice-main">
              <VoiceSessionPanel
                phase={realtime.phase}
                elapsedSec={elapsedSec}
                status={realtime.status}
                isMuted={realtime.isMuted}
                micGain={realtime.micGain}
                error={realtime.error}
                onPrimary={primaryAction}
                onMute={realtime.toggleMute}
                onMicGainChange={realtime.setMicGain}
              />
              <PasteCommandPanel sendText={realtime.sendTextMessage} phase={realtime.phase} />
            </main>
            <aside className="voice-rail">
              <TaskListCard tasks={realtime.codexTasks} toolStatus={realtime.toolStatus} onOpenTask={openTaskDetails} onRefreshTask={(taskId) => void refreshVisibleTask(taskId)} />
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
              <DecisionCard />
            </aside>
          </div>
        </div>
      )}
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
