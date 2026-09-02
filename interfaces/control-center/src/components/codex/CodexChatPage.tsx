"use client";

import {
  AlertTriangle,
  Bot,
  ChevronRight,
  FileCode2,
  Globe2,
  ListChecks,
  LoaderCircle,
  Menu,
  Mic,
  Plus,
  Search,
  Send,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodexMarkdown } from "./CodexMarkdown";
import {
  checkControlCenterHealth,
  ControlCenterRequestError,
  controlCenterRequest as api,
  deliveryMayBeUnknown,
} from "@/lib/control-center-request";
import {
  DICTATION_LANGUAGE_CHANGED_EVENT,
  DICTATION_LANGUAGE_OPTIONS,
  type DictationLanguage,
  readStoredDictationLanguage,
  recognitionLanguageTag,
  writeStoredDictationLanguage,
} from "@/lib/codex-chat/dictation-preferences";
import type {
  AcceptedTurn,
  ChatEvent,
  ChatItemView,
  RuntimeStatus,
  ThreadDetail,
  ThreadPage,
  ThreadSummary,
  TurnPage,
  TurnView,
} from "@/lib/codex-chat/types";

type ConnectionState = "idle" | "connecting" | "ready" | "reconnecting";
type DictationState = "idle" | "listening" | "error";
type ChatGroup = "my_chats" | "voice_work";
type ChatFailure = {
  message: string;
  source: "bootstrap" | "history" | "mutation" | "turn";
  kind: "backend_offline" | "runtime_unavailable" | "stream_reconnecting" | "turn_failed" | "request_failed";
};

type PendingDelivery = {
  chatId: string;
  clientMessageId: string;
  text: string;
  status: "sending" | "delivery_unknown";
};

type RecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => RecognitionLike;
  webkitSpeechRecognition?: new () => RecognitionLike;
};

function failure(cause: unknown, fallback: string, source: ChatFailure["source"]): ChatFailure {
  const requestError = cause instanceof ControlCenterRequestError ? cause : null;
  const runtimeUnavailable = requestError?.code === "runtime_unavailable" || requestError?.code === "runtime_incompatible";
  return {
    message: requestError?.message || fallback,
    source,
    kind: requestError && (requestError.kind === "network" || requestError.kind === "gateway" || requestError.kind === "invalid_response")
      ? "backend_offline"
      : runtimeUnavailable
        ? "runtime_unavailable"
        : source === "turn"
          ? "turn_failed"
          : source === "history"
            ? "stream_reconnecting"
            : "request_failed",
  };
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

async function loadThreadGroup(group: ChatGroup) {
  const rows: ThreadSummary[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ group, limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const response = await api<ThreadPage>(`/api/codex-chat/v1/threads?${query.toString()}`);
    rows.push(...response.data.data.filter((thread) => thread.group === group));
    cursor = response.data.nextCursor;
    if (!cursor) return rows;
    if (seenCursors.has(cursor)) throw new Error("Task Chat history returned a repeated cursor.");
    seenCursors.add(cursor);
  }
  throw new Error("Task Chat history exceeds the safe pagination limit.");
}

function upsertTurn(rows: TurnView[], turn: TurnView) {
  const index = rows.findIndex((row) => row.turnId === turn.turnId);
  if (index < 0) return [...rows, turn].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  const next = [...rows];
  next[index] = turn;
  return next;
}

function upsertItem(rows: TurnView[], turnId: string, item: ChatItemView) {
  return rows.map((turn) => {
    if (turn.turnId !== turnId) return turn;
    const index = turn.items.findIndex((row) => row.id === item.id);
    const items = [...turn.items];
    if (index < 0) items.push(item);
    else items[index] = item;
    return { ...turn, items };
  });
}

function appendDelta(rows: TurnView[], event: ChatEvent): TurnView[] {
  if (!event.turnId) return rows;
  const delta = String(event.payload.delta || "");
  if (!delta) return rows;
  return rows.map((turn) => {
    if (turn.turnId !== event.turnId) return turn;
    const itemId = event.itemId || `${turn.turnId}-assistant`;
    const existingIndex = turn.items.findIndex((item) => item.id === itemId && item.kind === "assistant_message");
    const items = [...turn.items];
    if (existingIndex >= 0) {
      const item = items[existingIndex];
      if (item.kind === "assistant_message") {
        items[existingIndex] = {
          ...item,
          status: "in_progress",
          message: { ...item.message, markdown: `${item.message.markdown}${delta}`, status: "streaming" },
        };
      }
    } else {
      items.push({
        id: itemId,
        kind: "assistant_message",
        status: "in_progress",
        startedAt: event.occurredAt,
        completedAt: null,
        message: { id: itemId, role: "assistant", markdown: delta, status: "streaming", createdAt: event.occurredAt },
      });
    }
    return { ...turn, status: "in_progress" as const, items };
  });
}

function ActivityItem({ item }: { item: ChatItemView }) {
  if (item.kind === "assistant_message") {
    return (
      <article className={`codex-message codex-assistant-message ${item.message.status === "streaming" ? "streaming" : ""}`}>
        <div className="codex-message-label"><Bot size={15} /> Pritha</div>
        <CodexMarkdown markdown={item.message.markdown || "…"} />
      </article>
    );
  }
  if (item.kind === "reasoning_summary") {
    return <details className="codex-activity"><summary><ChevronRight size={15} /> Reasoning summary</summary><CodexMarkdown markdown={item.markdown} /></details>;
  }
  if (item.kind === "command") {
    return (
      <details className="codex-activity">
        <summary><Terminal size={15} /> Command <span>{item.status.replace("_", " ")}</span></summary>
        <code>{item.commandPreview}</code>
        {item.cwdLabel ? <small>in {item.cwdLabel}</small> : null}
        {item.outputPreview ? <pre>{item.outputPreview}</pre> : null}
      </details>
    );
  }
  if (item.kind === "file_change") {
    return (
      <details className="codex-activity">
        <summary><FileCode2 size={15} /> Files changed <span>{item.changes.length}</span></summary>
        <ul>{item.changes.map((change, index) => <li key={`${change.path}-${index}`}><strong>{change.operation}</strong> {change.path}</li>)}</ul>
        {item.diffPreview ? <pre>{item.diffPreview}</pre> : null}
      </details>
    );
  }
  if (item.kind === "tool") return <div className="codex-activity-row"><Wrench size={15} /><span>{item.displayName}</span><small>{item.summary}</small></div>;
  if (item.kind === "web_search") return <div className="codex-activity-row"><Globe2 size={15} /><span>Web search</span><small>{item.query}</small></div>;
  if (item.kind === "plan") {
    return (
      <details className="codex-activity">
        <summary><ListChecks size={15} /> Plan <span>{item.steps.length} steps</span></summary>
        <ol>{item.steps.map((step, index) => <li key={index}>{step.label}</li>)}</ol>
      </details>
    );
  }
  if (item.kind === "notice") return <div className={`codex-inline-notice ${item.tone}`}>{item.text}</div>;
  if (item.kind === "task_link") return <div className="codex-inline-notice info">Linked task: {item.task.label}</div>;
  return <div className="codex-activity-row"><Wrench size={15} /><span>{item.label}</span></div>;
}

function ThreadRow({ thread, active, onSelect }: { thread: ThreadSummary; active: boolean; onSelect: () => void }) {
  return (
    <button className={`codex-thread-row ${active ? "active" : ""}`} type="button" onClick={onSelect}>
      <span className="codex-thread-title">{thread.title}</span>
      <span className="codex-thread-meta">
        <span>{thread.status === "active" ? "Working" : thread.preview || "No messages yet"}</span>
        <time>{relativeTime(thread.updatedAt)}</time>
      </span>
      {thread.taskLinks.length ? <span className="codex-thread-task-links">{thread.taskLinks.slice(-3).map((link) => `#${link.shortId || link.taskId.slice(-6)}`).join(" · ")}</span> : null}
    </button>
  );
}

export function CodexChatPage() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeGroup, setActiveGroup] = useState<ChatGroup>("my_chats");
  const selectedByGroupRef = useRef<Record<ChatGroup, string | null>>({ my_chats: null, voice_work: null });
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatFailure | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [streamRevision, setStreamRevision] = useState(0);
  const [pendingDelivery, setPendingDelivery] = useState<PendingDelivery | null>(null);
  const [dictation, setDictation] = useState<DictationState>("idle");
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictationLanguage, setDictationLanguage] = useState<DictationLanguage>("browser");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);
  const displayedChatIdRef = useRef<string | null>(null);
  const pendingDeliveryRef = useRef<PendingDelivery | null>(null);
  const synchronizationRef = useRef<{ chatId: string | null; promise: Promise<ThreadDetail | null> } | null>(null);
  const reconcileRequestRef = useRef<{
    chatId: string;
    token: symbol;
    promise: Promise<ThreadDetail>;
  } | null>(null);
  const connectionRef = useRef<ConnectionState>("idle");
  selectedChatIdRef.current = selectedChatId;
  pendingDeliveryRef.current = pendingDelivery;
  connectionRef.current = connection;

  const refreshRuntime = useCallback(async () => {
    const response = await api<RuntimeStatus>("/api/codex-chat/v1/runtime");
    setRuntime(response.data);
    return response.data;
  }, []);

  const refreshThreads = useCallback(async () => {
    const groupRows = await loadThreadGroup(activeGroup);
    setThreads((current) => [...current.filter((thread) => thread.group !== activeGroup), ...groupRows]);
    setSelectedChatId((current) => {
      const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chat") : null;
      const next = [requested, current, selectedByGroupRef.current[activeGroup], groupRows[0]?.chatId]
        .find((candidate) => candidate && groupRows.some((thread) => thread.chatId === candidate)) || null;
      selectedByGroupRef.current[activeGroup] = next;
      return next;
    });
    return groupRows;
  }, [activeGroup]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("group") === "voice_work") setActiveGroup("voice_work");
  }, []);

  useEffect(() => {
    if (activeGroup !== "voice_work") return;
    let stopped = false;
    let timer: number | null = null;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!stopped && document.visibilityState === "visible") await refreshThreads().catch(() => undefined);
        if (!stopped) schedule();
      }, 4_000);
    };
    schedule();
    return () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [activeGroup, refreshThreads]);

  const reconcileChat = useCallback((chatId: string) => {
    const current = reconcileRequestRef.current;
    if (current?.chatId === chatId) return current.promise;

    const token = Symbol(chatId);
    const request = api<ThreadDetail>(`/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}`).then(async (detailResponse) => {
      const historyBlocked = detailResponse.data.continuationState === "blocked_runtime_mismatch"
        || detailResponse.data.continuationState === "blocked_history_unavailable";
      const turnsResponse = historyBlocked ? { data: { data: [] } as Pick<TurnPage, "data"> } : await api<TurnPage>(`/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/turns?limit=50`);
      if (selectedChatIdRef.current === chatId) {
        setDetail(detailResponse.data);
        setTurns(turnsResponse.data.data);
        setError((currentError) => currentError?.source === "history" ? null : currentError);
      }
      const pending = pendingDeliveryRef.current;
      if (pending?.chatId === chatId && turnsResponse.data.data.some((turn) => turn.clientMessageId === pending.clientMessageId)) {
        pendingDeliveryRef.current = null;
        setPendingDelivery(null);
        setDraft((current) => current.trim() === pending.text ? "" : current);
        setError((current) => current?.source === "turn" ? null : current);
      }
      return detailResponse.data;
    }).finally(() => {
      if (reconcileRequestRef.current?.token === token) reconcileRequestRef.current = null;
    });

    reconcileRequestRef.current = { chatId, token, promise: request };
    return request;
  }, []);

  const synchronize = useCallback((chatId: string | null, checkHealth = false) => {
    const current = synchronizationRef.current;
    if (current?.chatId === chatId) return current.promise;
    const previous = current?.promise.catch(() => null) || Promise.resolve(null);
    let entry: { chatId: string | null; promise: Promise<ThreadDetail | null> };
    const request = (async () => {
      await previous;
      if (checkHealth) await checkControlCenterHealth();
      await refreshRuntime();
      await refreshThreads();
      const reconciled = chatId ? await reconcileChat(chatId) : null;
      setError((currentError) => currentError?.source === "mutation" || currentError?.source === "turn" ? currentError : null);
      return reconciled;
    })().finally(() => {
      if (synchronizationRef.current === entry) synchronizationRef.current = null;
    });
    entry = { chatId, promise: request };
    synchronizationRef.current = entry;
    return request;
  }, [reconcileChat, refreshRuntime, refreshThreads]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let attempt = 0;
    let firstAttempt = true;

    const load = async () => {
      try {
        await synchronize(null, true);
        if (!cancelled) setError((current) => current?.source === "bootstrap" ? null : current);
      } catch (cause) {
        if (cancelled) return;
        setError(failure(cause, "Task Chat could not load.", "bootstrap"));
        const schedule = [1_000, 2_000, 5_000, 10_000, 30_000];
        const base = schedule[Math.min(attempt, schedule.length - 1)];
        const delay = Math.round(base * (0.8 + Math.random() * 0.4));
        attempt += 1;
        retryTimer = window.setTimeout(() => void load(), delay);
      } finally {
        if (!cancelled && firstAttempt) {
          firstAttempt = false;
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
    };
  }, [synchronize]);

  useEffect(() => {
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    setDictationSupported(Boolean(SpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    const synchronizeDictationLanguage = () => setDictationLanguage(readStoredDictationLanguage());
    synchronizeDictationLanguage();
    window.addEventListener("storage", synchronizeDictationLanguage);
    window.addEventListener(DICTATION_LANGUAGE_CHANGED_EVENT, synchronizeDictationLanguage);
    return () => {
      window.removeEventListener("storage", synchronizeDictationLanguage);
      window.removeEventListener(DICTATION_LANGUAGE_CHANGED_EVENT, synchronizeDictationLanguage);
    };
  }, []);

  useEffect(() => {
    if (displayedChatIdRef.current === selectedChatId) return;
    displayedChatIdRef.current = selectedChatId;
    setDetail(null);
    setTurns([]);
    setConnection(selectedChatId ? "connecting" : "idle");
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) {
      setDetail(null);
      setTurns([]);
      setConnection("idle");
      return;
    }
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let retryAttempt = 0;

    setConnection("connecting");

    const reload = async () => {
      try {
        await synchronize(selectedChatId);
      } catch (cause) {
        if (!cancelled) {
          setConnection("reconnecting");
          setError(failure(cause, "Chat history could not be synchronized.", "history"));
        }
      }
    };

    const event = (message: MessageEvent<string>) => {
      let payload: ChatEvent;
      try { payload = JSON.parse(message.data) as ChatEvent; } catch { return; }
      if (message.type === "connection.ready") {
        retryAttempt = 0;
        setConnection("ready");
      }
      if (message.type === "stream.reset") void reload();
      if (message.type === "message.delta") setTurns((rows) => appendDelta(rows, payload));
      if (message.type === "turn.started" || message.type === "turn.completed" || message.type === "turn.interrupted" || message.type === "turn.failed") {
        const turn = payload.payload.turn as TurnView | undefined;
        if (turn) setTurns((rows) => upsertTurn(rows, turn));
        if (message.type !== "turn.started") {
          void refreshThreads();
          window.setTimeout(() => void reload(), 150);
        }
      }
      if (message.type === "item.started" || message.type === "item.completed") {
        const item = payload.payload.item as ChatItemView | undefined;
        if (item && payload.turnId) setTurns((rows) => upsertItem(rows, payload.turnId || "", item));
      }
      if (message.type === "message.completed") void reload();
      if (message.type === "thread.updated") {
        const thread = payload.payload.thread as ThreadSummary | undefined;
        if (thread) {
          setThreads((rows) => rows.some((row) => row.chatId === thread.chatId)
            ? rows.map((row) => row.chatId === thread.chatId ? thread : row)
            : [thread, ...rows]);
          setDetail((current) => current && current.thread.chatId === thread.chatId ? { ...current, thread } : current);
        }
      }
    };

    const attachStream = (streamUrl: string) => {
      source?.close();
      source = new EventSource(streamUrl);
      source.onopen = () => {
        if (!cancelled) setConnection("connecting");
      };
      for (const name of [
        "connection.ready", "stream.reset", "thread.updated", "turn.started", "turn.completed", "turn.interrupted", "turn.failed",
        "message.delta", "message.completed", "item.started", "item.completed",
      ]) source.addEventListener(name, event as EventListener);
      source.onerror = () => {
        if (cancelled) return;
        source?.close();
        setConnection("reconnecting");
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled || retryTimer != null) return;
      const schedule = [1_000, 2_000, 5_000, 10_000, 30_000];
      const base = schedule[Math.min(retryAttempt, schedule.length - 1)];
      const delay = Math.round(base * (0.8 + Math.random() * 0.4));
      retryAttempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      try {
        const nextDetail = await synchronize(selectedChatId);
        if (cancelled) return;
        if (!nextDetail) throw new Error("Chat history is unavailable.");
        attachStream(nextDetail.streamUrl);
      } catch (cause) {
        if (cancelled) return;
        setConnection("reconnecting");
        setError(failure(cause, "Chat history could not load.", "history"));
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [selectedChatId, streamRevision, refreshThreads, synchronize]);

  const lastTranscriptText = turns.at(-1)?.items.at(-1);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, lastTranscriptText]);

  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    const grouped = threads.filter((thread) => thread.group === activeGroup);
    return query ? grouped.filter((thread) => `${thread.title} ${thread.preview} ${thread.taskLinks.map((link) => link.label).join(" ")}`.toLowerCase().includes(query)) : grouped;
  }, [activeGroup, search, threads]);

  const hasActiveTurn = turns.some((turn) => turn.status === "queued" || turn.status === "in_progress" || turn.status === "waiting_for_approval" || turn.status === "waiting_for_input");
  const effectiveProvider = runtime?.providers.find((provider) => provider.providerId === (detail?.thread.runtime.providerId || runtime.effectiveProvider));
  const backendOffline = error?.kind === "backend_offline";
  const transcriptStale = backendOffline || connection === "reconnecting";

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      void synchronize(selectedChatIdRef.current, true).then(() => {
        if (!cancelled && selectedChatIdRef.current && connectionRef.current === "reconnecting") {
          setStreamRevision((current) => current + 1);
        }
      }).catch((cause) => {
        if (!cancelled) setError(failure(cause, "Chat history could not be synchronized.", "history"));
      });
    };
    const onFocus = () => sync();
    const onOnline = () => sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [synchronize]);

  const retryNow = useCallback(async () => {
    const restartStream = Boolean(selectedChatIdRef.current && connection !== "ready");
    setRecovering(true);
    setError(null);
    if (restartStream) setConnection("connecting");
    try {
      await synchronize(selectedChatIdRef.current, true);
      if (restartStream) setStreamRevision((current) => current + 1);
    } catch (cause) {
      setConnection(selectedChatIdRef.current ? "reconnecting" : "idle");
      setError(failure(cause, "Task Chat could not reconnect.", "history"));
    } finally {
      setRecovering(false);
    }
  }, [connection, synchronize]);

  const createChat = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const clientThreadId = crypto.randomUUID();
      const response = await api<ThreadDetail>("/api/codex-chat/v1/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": clientThreadId },
        body: JSON.stringify({ clientThreadId, source: "chat" }),
      });
      setThreads((rows) => [response.data.thread, ...rows.filter((thread) => thread.chatId !== response.data.thread.chatId)]);
      setActiveGroup("my_chats");
      selectedByGroupRef.current.my_chats = response.data.thread.chatId;
      setSelectedChatId(response.data.thread.chatId);
      setDrawerOpen(false);
      return response.data;
    } catch (cause) {
      setError(failure(cause, "New chat could not be created.", "mutation"));
      return null;
    } finally {
      setCreating(false);
    }
  }, []);

  const continueInTaskChat = useCallback(async () => {
    if (!detail?.thread.taskLinks.length) return;
    const task = detail.thread.taskLinks.at(-1);
    if (!task) return;
    setRecovering(true);
    setError(null);
    try {
      const mode = "shared_thread" as const;
      const key = `${detail.thread.chatId}:${task.taskId}:${mode}`;
      const response = await api<ThreadDetail>(`/api/codex-chat/v1/threads/${encodeURIComponent(detail.thread.chatId)}/task-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ taskId: task.taskId, mode }),
      });
      setDetail(response.data);
      setThreads((rows) => rows.map((row) => row.chatId === response.data.thread.chatId ? response.data.thread : row));
    } catch (cause) {
      setError(failure(cause, "This Voice task cannot be continued safely yet.", "mutation"));
    } finally {
      setRecovering(false);
    }
  }, [detail]);

  function switchGroup(group: ChatGroup) {
    if (group === activeGroup) return;
    selectedByGroupRef.current[activeGroup] = selectedChatId;
    setActiveGroup(group);
    const next = selectedByGroupRef.current[group] || threads.find((thread) => thread.group === group)?.chatId || null;
    setSelectedChatId(next);
    setDetail(null);
    setTurns([]);
    setSearch("");
    const params = new URLSearchParams(window.location.search);
    params.set("group", group);
    if (next) params.set("chat", next); else params.delete("chat");
    window.history.replaceState(null, "", `/task-chat?${params.toString()}`);
  }

  async function deliverMessage(delivery: PendingDelivery) {
    setSending(true);
    setError(null);
    try {
      const response = await api<AcceptedTurn>(`/api/codex-chat/v1/threads/${encodeURIComponent(delivery.chatId)}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": delivery.clientMessageId },
        body: JSON.stringify({ clientMessageId: delivery.clientMessageId, input: [{ type: "text", text: delivery.text }] }),
      });
      pendingDeliveryRef.current = null;
      setPendingDelivery(null);
      setDraft((current) => current.trim() === delivery.text ? "" : current);
      setTurns((rows) => upsertTurn(rows, response.data.turn));
      void refreshThreads();
    } catch (cause) {
      if (deliveryMayBeUnknown(cause)) {
        const unknown = { ...delivery, status: "delivery_unknown" as const };
        pendingDeliveryRef.current = unknown;
        setPendingDelivery(unknown);
        setError({
          message: "The connection ended before delivery could be confirmed. Check history before retrying the same message.",
          source: "turn",
          kind: cause instanceof ControlCenterRequestError && cause.kind !== "api" ? "backend_offline" : "turn_failed",
        });
      } else {
        pendingDeliveryRef.current = null;
        setPendingDelivery(null);
        setError(failure(cause, "Message could not be sent.", "turn"));
      }
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending || hasActiveTurn || pendingDeliveryRef.current) return;
    let chatId = selectedChatId;
    if (!chatId) chatId = (await createChat())?.thread.chatId || null;
    if (!chatId) return;
    const delivery: PendingDelivery = {
      chatId,
      clientMessageId: crypto.randomUUID(),
      text,
      status: "sending",
    };
    pendingDeliveryRef.current = delivery;
    setPendingDelivery(delivery);
    await deliverMessage(delivery);
  }

  async function retryUnknownDelivery() {
    const delivery = pendingDeliveryRef.current;
    if (!delivery || delivery.status !== "delivery_unknown" || sending) return;
    setRecovering(true);
    try {
      await synchronize(delivery.chatId, true);
      const unresolved = pendingDeliveryRef.current;
      if (!unresolved || unresolved.clientMessageId !== delivery.clientMessageId) return;
      if (draft.trim() !== delivery.text) {
        setError({
          message: "The draft changed. Restore the original message before retrying its delivery.",
          source: "turn",
          kind: "turn_failed",
        });
        return;
      }
      await deliverMessage(delivery);
    } catch (cause) {
      setError(failure(cause, "Delivery could not be reconciled.", "turn"));
    } finally {
      setRecovering(false);
    }
  }

  function toggleDictation() {
    if (recognitionRef.current && dictation === "listening") {
      recognitionRef.current.stop();
      return;
    }
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setDictation("error");
      return;
    }
    const recognition = new SpeechRecognition();
    const languageTag = recognitionLanguageTag(dictationLanguage);
    if (languageTag) recognition.lang = languageTag;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const recognized: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) recognized.push(event.results[index][0].transcript);
      }
      const text = recognized.join(" ").trim();
      if (text) setDraft((current) => `${current}${current.trim() ? " " : ""}${text}`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setDictation("idle");
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setDictation("error");
    };
    recognitionRef.current = recognition;
    setDictation("listening");
    recognition.start();
  }

  function changeDictationLanguage(value: string) {
    const option = DICTATION_LANGUAGE_OPTIONS.find((candidate) => candidate.value === value);
    if (!option) return;
    setDictationLanguage(option.value);
    writeStoredDictationLanguage(option.value);
  }

  const history = (
    <div className="codex-history-content">
      <div className="codex-history-title-row">
        <h2>Task Chat</h2>
        <button type="button" className="codex-icon-button codex-drawer-close" aria-label="Close chat history" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
      </div>
      <div className="codex-history-tabs" role="tablist" aria-label="Task Chat sources">
        <button type="button" role="tab" aria-selected={activeGroup === "my_chats"} className={activeGroup === "my_chats" ? "active" : ""} onClick={() => switchGroup("my_chats")}>Direct Chats</button>
        <button type="button" role="tab" aria-selected={activeGroup === "voice_work"} className={activeGroup === "voice_work" ? "active" : ""} onClick={() => switchGroup("voice_work")}>Voice Tasks</button>
      </div>
      {activeGroup === "my_chats" ? <button className="codex-new-chat" type="button" onClick={() => void createChat()} disabled={creating || runtime?.availability === "unavailable"}>
        {creating ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />} New chat
      </button> : null}
      <label className="codex-search">
        <Search size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeGroup === "voice_work" ? "Search Voice tasks…" : "Search chats…"} aria-label="Search Task Chat" />
      </label>
      <section className="codex-thread-group">
        {visibleThreads.length ? visibleThreads.map((thread) => (
          <ThreadRow key={thread.chatId} thread={thread} active={thread.chatId === selectedChatId} onSelect={() => {
            setSelectedChatId(thread.chatId);
            selectedByGroupRef.current[activeGroup] = thread.chatId;
            const params = new URLSearchParams({ group: activeGroup, chat: thread.chatId });
            window.history.replaceState(null, "", `/task-chat?${params.toString()}`);
            setDrawerOpen(false);
          }} />
        )) : <p className="codex-history-empty">{search ? "No matching items" : activeGroup === "voice_work" ? "Persistent Voice task threads will appear here after their work environment is resolved." : "Create a chat to start working with Pritha."}</p>}
      </section>
    </div>
  );

  return (
    <div className="codex-page">
      <aside className="codex-history" aria-label="Task Chat history">{history}</aside>
      {drawerOpen ? <div className="codex-history-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDrawerOpen(false)}><aside className="codex-history-drawer" aria-label="Task Chat history drawer">{history}</aside></div> : null}

      <section className="codex-conversation" aria-label="Task Chat conversation">
        <header className="codex-conversation-header">
          <button className="codex-icon-button codex-history-open" type="button" aria-label="Open chat history" onClick={() => setDrawerOpen(true)}><Menu size={19} /></button>
          <div className="codex-conversation-heading">
            <div className="codex-title-line">
              <h1>{detail?.thread.title || "Task Chat"}</h1>
              <span className={`codex-runtime-pill ${backendOffline ? "unavailable" : runtime?.availability || "unavailable"}`}>{backendOffline ? "Offline" : runtime?.availability === "ready" ? "Ready" : runtime?.availability || "Checking"}</span>
            </div>
            <p>
              Pritha · {runtime?.selected.modelId || "Task runtime"} · {effectiveProvider?.locationLabel || "Resolving runtime"}
              {effectiveProvider?.protocol === "app_server" ? " · App Server" : ""}
              {runtime?.selected.sandboxMode ? ` · ${runtime.selected.sandboxMode.replaceAll("_", " ")}` : ""}
            </p>
          </div>
          <span className={`codex-connection ${connection}`} title={`Event stream: ${connection}`}><span /></span>
        </header>

        {runtime?.availability !== "ready" ? (
          <div className="codex-runtime-warning"><AlertTriangle size={17} /><span>{runtime?.availability === "degraded" ? "The task runtime is installed but the full chat capability probe did not pass." : "No compatible task runtime is available."}</span></div>
        ) : null}
        {connection === "reconnecting" && !backendOffline ? (
          <div className="codex-runtime-warning"><LoaderCircle className="spin" size={17} /><span>Event stream is reconnecting. The last synchronized history remains visible and read-only.</span></div>
        ) : null}
        {error ? (
          <div className="codex-error-banner">
            <AlertTriangle size={17} />
            <span>{error.message}</span>
            <div className="codex-error-actions">
              <button type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry"}</button>
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}

        <div className={`codex-transcript ${transcriptStale ? "stale" : ""}`} role="log" aria-live="polite" aria-label="Task Chat messages" aria-busy={connection === "connecting"}>
          {loading ? <div className="codex-empty-state"><LoaderCircle className="spin" size={28} /><h2>Loading Task Chat</h2></div> : null}
          {!loading && !selectedChatId ? (
            <div className="codex-empty-state">
              <Bot size={34} />
              <h2>{activeGroup === "voice_work" ? "Voice task threads" : "Work directly with Pritha"}</h2>
              <p>Start a persistent conversation with the runtime selected in Settings.</p>
              {activeGroup === "my_chats" ? <button className="codex-new-chat codex-empty-action" type="button" onClick={() => void createChat()} disabled={creating || runtime?.availability !== "ready"}><Plus size={17} /> New chat</button> : null}
            </div>
          ) : null}
          {selectedChatId && !loading && turns.length === 0 ? (
            <div className="codex-empty-state compact"><Bot size={30} /><h2>{activeGroup === "voice_work" ? "Voice task thread" : "What should Pritha do?"}</h2><p>Messages and activity remain attached to this native task thread.</p></div>
          ) : null}
          {turns.map((turn) => (
            <section className="codex-turn" key={turn.turnId} aria-label={`Turn ${turn.status}`}>
              <article className="codex-message codex-user-message">
                <div className="codex-message-label">You</div>
                <CodexMarkdown markdown={turn.userMessage.markdown} />
              </article>
              <div className="codex-turn-items">
                {turn.items.map((item) => <ActivityItem item={item} key={item.id} />)}
                {turn.status === "in_progress" && !turn.items.some((item) => item.kind === "assistant_message") ? (
                  <div className="codex-thinking"><LoaderCircle className="spin" size={16} /> Pritha is working…</div>
                ) : null}
                {turn.error ? <div className="codex-inline-notice error">{turn.error.message}</div> : null}
              </div>
            </section>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        <div className="codex-composer-wrap">
          {pendingDelivery?.status === "delivery_unknown" ? (
            <div className="codex-inline-notice warning codex-delivery-unknown">
              Delivery is unknown. History will be checked first; Task Chat will never replay this turn automatically.
              <button type="button" onClick={() => void retryUnknownDelivery()} disabled={recovering || sending || draft.trim() !== pendingDelivery.text}>
                {recovering ? "Checking…" : "Check and retry same message"}
              </button>
            </div>
          ) : null}
          {detail?.thread.origin === "voice" && detail.continuationState !== "continuation_enabled" ? (
            <div className="codex-continuation-gate">
              <div><strong>{detail.continuationState === "blocked_active_turn" ? "Voice task is running" : "Voice task history is read-only"}</strong><p>{detail.continuationState === "blocked_active_turn" ? "Wait for the active Voice turn to finish before continuing here." : "Enable continuation only when you want to add a typed turn to this same task thread."}</p></div>
              <button className="codex-new-chat" type="button" onClick={() => void continueInTaskChat()} disabled={recovering || detail.continuationState !== "read_only"}>{recovering ? "Checking…" : "Continue in Task Chat"}</button>
            </div>
          ) : <label className="codex-composer">
            <span>Message Pritha</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={pendingDelivery?.status === "delivery_unknown" ? "Delivery confirmation is pending…" : hasActiveTurn ? "Pritha is working…" : "Ask Pritha…"}
              rows={3}
              maxLength={64_000}
            />
            <div className="codex-composer-actions">
              <small>
                {dictationSupported
                  ? "Enter to send · Dictation stays editable · browser speech may use an online service"
                  : "Enter to send · Browser dictation unavailable; use system dictation"}
              </small>
              <div className="codex-composer-controls">
                <label
                  className="codex-dictation-language"
                  title="Auto uses the browser default. Choose one language when recognition guesses incorrectly."
                >
                  <Globe2 size={15} aria-hidden="true" />
                  <select
                    aria-label="Dictation language"
                    value={dictationLanguage}
                    onChange={(event) => changeDictationLanguage(event.target.value)}
                    disabled={!dictationSupported || dictation === "listening"}
                  >
                    {DICTATION_LANGUAGE_OPTIONS.map((option) => (
                      <option value={option.value} title={option.description} key={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  className={`codex-dictation ${dictation === "listening" ? "active" : ""}`}
                  type="button"
                  onClick={toggleDictation}
                  disabled={!dictationSupported}
                  aria-pressed={dictation === "listening"}
                  title={dictationSupported
                    ? "Dictate into the message. Audio processing is controlled by the browser and may use an online service."
                    : "This browser does not expose speech recognition. Use system dictation instead."}
                >
                  <Mic size={16} /> {!dictationSupported ? "Unavailable" : dictation === "listening" ? "Listening" : dictation === "error" ? "Try again" : "Dictate"}
                </button>
                <button className="codex-send" type="button" onClick={() => void sendMessage()} disabled={!draft.trim() || sending || hasActiveTurn || Boolean(pendingDelivery) || backendOffline || runtime?.availability !== "ready"}>
                  {sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Send
                </button>
              </div>
            </div>
          </label>}
        </div>
      </section>
    </div>
  );
}
