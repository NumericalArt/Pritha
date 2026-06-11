"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  Code2,
  Database,
  MemoryStick,
  Mic,
  MicOff,
  MoreHorizontal,
  Search,
  SendHorizontal,
  Square,
  UsersRound,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { usePrithaRealtime, type PrithaRealtimeStatus, type RealtimePhase, type VoiceTranscriptItem } from "./usePrithaRealtime";

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

function primaryButtonLabel(phase: RealtimePhase) {
  if (phase === "idle") return "Start Listening";
  if (phase === "connecting") return "Connecting...";
  if (phase === "error") return "Reconnect";
  return "Stop Listening";
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
      <div className={mobile ? "mobile-voice-orb" : "voice-orb"} data-state={phase}>
        <span />
      </div>
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
  return status?.tools?.length ? status.tools : ["search_pritha_memory", "run_codex_task"];
}

function ContextCard({ status, mobile = false }: { status: PrithaRealtimeStatus | null; mobile?: boolean }) {
  const tools = activeToolNames(status);
  const memoryReady = Boolean(status?.memory.sqlite && status.memory.sqlite_cli);

  return (
    <section className={mobile ? "mobile-info-card" : "side-card voice-context-card"}>
      <div className="card-title-row">
        <h2>Current Context</h2>
        <button className="text-action purple" type="button" disabled>
          Clear
        </button>
      </div>
      <div className="detail-block">
        <span className="muted-label">Memory Focus</span>
        <strong className="accent-focus">
          <MemoryStick size={18} />
          General (Global)
        </strong>
        <p>{memoryReady ? "Pritha memory index is available." : "Pritha memory fallback is available."}</p>
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
    </section>
  );
}

function ActiveTaskCard({
  activeTask,
  toolStatus,
}: {
  activeTask: { title: string; status: string; summary: string; progress: number } | null;
  toolStatus: string;
}) {
  const active = Boolean(activeTask);

  return (
    <section className="side-card active-task-card">
      <div className="card-title-row">
        <h2>Active Task</h2>
        <span className={`inline-status ${active ? "blue" : ""}`}>{active ? activeTask?.status || "Working" : "None"}</span>
      </div>
      <div className="task-meta">Task for Codex</div>
      <strong className="task-title">{activeTask?.title || "No Codex task running"}</strong>
      {active ? (
        <div className="task-progress-row">
          <div className="task-progress-track">
            <span className="task-progress-fill" style={{ width: `${activeTask?.progress || 0}%` }} />
          </div>
          <span>{activeTask?.progress || 0}%</span>
        </div>
      ) : null}
      <p>{activeTask?.summary || toolStatus}</p>
      <button className="rail-link-button" type="button" disabled>
        View Task Details
        <span>⌄</span>
      </button>
    </section>
  );
}

function DecisionCard() {
  return (
    <section className="side-card decision-card">
      <div className="card-title-row">
        <h2>Decision Gate</h2>
        <span className="inline-status">Idle</span>
      </div>
      <p>Approval gates stay manual for publication, deletion, deployment and broad system changes.</p>
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
  const keyReady = Boolean(status?.openai_key_configured);

  return (
    <section className="side-card connection-card">
      <div className="card-title-row">
        <h2>Connection</h2>
        <span className={`inline-status ${connected ? "green" : ""}`}>{connected ? "Good" : keyReady ? "Ready" : "Needs key"}</span>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Realtime</dt>
          <dd className={connected ? "good" : ""}>{connected ? "Connected" : keyReady ? "Configured" : "Missing key"}</dd>
        </div>
        <div>
          <dt>Codex</dt>
          <dd className={status?.codex.available ? "good" : ""}>{status?.codex.available ? `${status.codex.mode} ready` : "Queue fallback"}</dd>
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
  error,
  sendText,
  onPrimary,
  onMute,
  onCancel,
  mobile = false,
}: {
  phase: RealtimePhase;
  elapsedSec: number;
  status: PrithaRealtimeStatus | null;
  isMuted: boolean;
  error: string | null;
  sendText: (text: string) => boolean;
  onPrimary: () => void;
  onMute: () => void;
  onCancel: () => void;
  mobile?: boolean;
}) {
  const model = status?.model || "gpt-realtime-2";
  const active = phaseIsActive(phase);
  const muteDisabled = !active || phase === "connecting";

  if (mobile) {
    return (
      <section className="mobile-voice-card">
        <div className="mobile-voice-card-header">
          <h1 className="mobile-voice-title">Voice Control</h1>
          <div className="mobile-model-block">
            <span>Model</span>
            <strong className="mobile-model-name">{model}</strong>
            <span className="connection-quality">{error || (status?.openai_key_configured ? "Ready" : "Key missing")}</span>
          </div>
        </div>
        <VoiceVisualization phase={phase} mobile />
        <div className="mobile-voice-timer">{formatElapsed(elapsedSec)}</div>
        <div className="mobile-voice-subtitle">{subtitleForState(phase)}</div>
        <button className="mobile-voice-primary" type="button" onClick={onPrimary} disabled={phase === "connecting"}>
          <Square size={17} fill="currentColor" />
          {primaryButtonLabel(phase)}
        </button>
        <div className="mobile-voice-secondary-row">
          <button className="mobile-voice-secondary" type="button" onClick={onMute} disabled={muteDisabled}>
            {isMuted ? <Mic size={20} /> : <MicOff size={20} />}
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button className="mobile-voice-secondary" type="button" onClick={onCancel}>
            <X size={20} />
            Cancel
          </button>
        </div>
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
          <span className="connection-quality">{error || (status?.openai_key_configured ? "Ready" : "Key missing")}</span>
        </div>
      </div>
      <VoiceVisualization phase={phase} />
      <div className="voice-timer">{formatElapsed(elapsedSec)}</div>
      <div className="voice-subtitle">{subtitleForState(phase)}</div>
      <div className="voice-controls">
        <button className="voice-secondary-control" type="button" onClick={onMute} disabled={muteDisabled}>
          {isMuted ? <Mic size={22} /> : <MicOff size={22} />}
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button className="voice-primary-button" type="button" onClick={onPrimary} disabled={phase === "connecting"}>
          <Square size={18} fill="currentColor" />
          {primaryButtonLabel(phase)}
        </button>
        <button className="voice-secondary-control" type="button" onClick={onCancel}>
          <X size={24} />
          Cancel
        </button>
      </div>
      <QuickActions sendText={sendText} />
    </section>
  );
}

function QuickActions({ sendText }: { sendText: (text: string) => boolean }) {
  const actions = [
    { icon: UsersRound, label: "Check Agents", text: "Проверь состояние child agents через память и скажи краткий статус." },
    { icon: Search, label: "Run Manual Audit", text: "Запусти Codex task: проверить текущий Pritha Control Center voice runtime и отчитаться." },
    { icon: ArrowUp, label: "Show Updates", text: "Что нового или требующего внимания есть в памяти Pritha по UI и voice control?" },
    { icon: BookOpen, label: "Memory Summary", text: "Сделай краткую выжимку из памяти Pritha по realtime voice control." },
    { icon: MoreHorizontal, label: "More", text: "Какие следующие разумные действия по Pritha UI?" },
  ];

  return (
    <div className="quick-actions">
      <span className="quick-actions-title">Quick Actions</span>
      <div className="quick-action-list">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button key={action.label} type="button" onClick={() => sendText(action.text)}>
              <Icon size={17} />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConversationPanel({
  transcript,
  sendText,
  clearTranscript,
  phase,
}: {
  transcript: VoiceTranscriptItem[];
  sendText: (text: string) => boolean;
  clearTranscript: () => void;
  phase: RealtimePhase;
}) {
  const [text, setText] = useState("");
  const canSend = phaseIsActive(phase);

  function submit() {
    const sent = sendText(text);
    if (sent) setText("");
  }

  return (
    <section className="conversation-panel">
      <div className="card-title-row">
        <h2>Conversation</h2>
        <button className="text-action purple" type="button" onClick={clearTranscript}>
          Clear
        </button>
      </div>
      <div className="conversation-list">
        {transcript.length ? (
          transcript.map((item) => (
            <div className="conversation-row" key={item.id}>
              <span className={`speaker-badge ${item.role === "user" ? "user" : "pritha"}`}>{item.role === "user" ? "You" : item.role === "tool" ? "Tool" : "Pritha"}</span>
              <p>{item.text}</p>
              <time>{item.timestamp}</time>
            </div>
          ))
        ) : (
          <div className="conversation-row">
            <span className="speaker-badge pritha">Pritha</span>
            <p>Ready.</p>
            <time>{new Date().toLocaleTimeString("en-US", { hour12: false })}</time>
          </div>
        )}
      </div>
      <div className="command-input-row">
        <input
          type="text"
          value={text}
          placeholder='Type a command (e.g., "check memory", "run Codex task")'
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          disabled={!canSend}
        />
        <button type="button" aria-label="Send command" onClick={submit} disabled={!canSend || !text.trim()}>
          <SendHorizontal size={22} />
        </button>
      </div>
    </section>
  );
}

function MobileStatusChips({ status }: { status: PrithaRealtimeStatus | null }) {
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
          Codex <span className={`dot ${status?.codex.available ? "green" : "orange"}`} />
        </span>
        <strong className="mobile-status-value">{status?.codex.available ? "Connected" : "Queue"}</strong>
      </div>
      <div className="mobile-status-chip">
        <span className="mobile-status-title">Realtime</span>
        <strong className={`mobile-status-value ${status?.openai_key_configured ? "" : "muted"}`}>{status?.openai_key_configured ? "Ready" : "Key"}</strong>
      </div>
    </div>
  );
}

function MobileQuickActions({ sendText }: { sendText: (text: string) => boolean }) {
  const actions = [
    { icon: UsersRound, label: "Agents", text: "Проверь состояние child agents через память." },
    { icon: Search, label: "Audit", text: "Запусти Codex task для проверки voice runtime." },
    { icon: ArrowUp, label: "Updates", text: "Покажи обновления по Pritha UI." },
    { icon: BookOpen, label: "Memory", text: "Сделай краткую выжимку из памяти по voice control." },
    { icon: MoreHorizontal, label: "More", text: "Что делать дальше по Pritha UI?" },
  ];

  return (
    <section className="mobile-info-card mobile-quick-card">
      <h2>Quick Actions</h2>
      <div className="mobile-quick-actions">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button key={action.label} type="button" onClick={() => sendText(action.text)}>
              <Icon size={20} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function VoiceControlPage() {
  const realtime = usePrithaRealtime();
  const [elapsedSec, setElapsedSec] = useState(0);
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

  return (
    <>
      <audio ref={realtime.bindRemoteAudioElement} autoPlay hidden />
      <div className="voice-desktop-content">
        <PageHeader title="Voice Control" subtitle="Talk to Pritha. Give commands. Get things done." variant="voice" showCodexButton />
        <div className="voice-layout">
          <main className="voice-main">
            <VoiceSessionPanel
              phase={realtime.phase}
              elapsedSec={elapsedSec}
              status={realtime.status}
              isMuted={realtime.isMuted}
              error={realtime.error}
              sendText={realtime.sendTextMessage}
              onPrimary={primaryAction}
              onMute={realtime.toggleMute}
              onCancel={realtime.stop}
            />
            <ConversationPanel
              transcript={realtime.transcript}
              sendText={realtime.sendTextMessage}
              clearTranscript={realtime.clearTranscript}
              phase={realtime.phase}
            />
          </main>
          <aside className="voice-rail">
            <ContextCard status={realtime.status} />
            <ActiveTaskCard activeTask={realtime.activeTask} toolStatus={realtime.toolStatus} />
            <DecisionCard />
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
          </aside>
        </div>
      </div>
      <div className="mobile-voice-screen">
        <MobileStatusChips status={realtime.status} />
        <VoiceSessionPanel
          phase={realtime.phase}
          elapsedSec={elapsedSec}
          status={realtime.status}
          isMuted={realtime.isMuted}
          error={realtime.error}
          sendText={realtime.sendTextMessage}
          onPrimary={primaryAction}
          onMute={realtime.toggleMute}
          onCancel={realtime.stop}
          mobile
        />
        <ContextCard status={realtime.status} mobile />
        <ActiveTaskCard activeTask={realtime.activeTask} toolStatus={realtime.toolStatus} />
        <DecisionCard />
        <MobileQuickActions sendText={realtime.sendTextMessage} />
      </div>
    </>
  );
}
