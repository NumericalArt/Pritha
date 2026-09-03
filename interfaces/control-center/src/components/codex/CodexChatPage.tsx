"use client";

import {
  AlertTriangle,
  Bot,
  ChevronDown,
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
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
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
import {
  consumeTaskChatHandoff,
  createTaskChatNavigation,
  reportControlCenterUiActivity,
  reportTaskChatUiActivity,
  type TaskChatNavigationContext,
  type TaskChatUiActivitySource,
} from "@/lib/codex-chat/ui-activity-client";
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
type HistoryState = "idle" | "loading" | "slow" | "ready" | "error";
type ChatGroup = "my_chats" | "voice_work";
type ChatFailure = {
  message: string;
  source: "bootstrap" | "history" | "mutation" | "turn";
  kind: "backend_offline" | "runtime_unavailable" | "stream_reconnecting" | "turn_failed" | "request_failed";
  chatId?: string | null;
  code?: string;
  retryable?: boolean;
  replacementAllowed?: boolean;
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

const HISTORY_SLOW_MS = 2_500;
const HISTORY_TIMEOUT_MS = 12_000;
const TURN_START_TIMEOUT_MS = 30_000;
const VOICE_LIST_REFRESH_MS = 30_000;
const NEW_CHAT_DRAFT_KEY = "__new_chat__";

function requestErrorCode(cause: unknown) {
  if (cause instanceof ControlCenterRequestError && /^[a-z0-9_]{1,64}$/.test(cause.code)) return cause.code;
  return "unknown_error";
}

function failure(cause: unknown, fallback: string, source: ChatFailure["source"], chatId?: string | null): ChatFailure {
  const requestError = cause instanceof ControlCenterRequestError ? cause : null;
  const runtimeUnavailable = requestError?.code === "runtime_unavailable" || requestError?.code === "runtime_incompatible";
  return {
    message: requestError?.message || fallback,
    source,
    chatId,
    code: requestError?.code,
    retryable: requestError?.retryable ?? true,
    replacementAllowed: requestError?.details?.replacementAllowed === true,
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

async function loadThreadPage(group: ChatGroup, options: { cursor?: string | null; search?: string; view?: "current" | "legacy" } = {}) {
  const query = new URLSearchParams({ group, limit: "50", view: options.view || "current" });
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.search) query.set("search", options.search);
  const response = await api<ThreadPage>(`/api/codex-chat/v1/threads?${query.toString()}`);
  return response.data;
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
  const activeGroupRef = useRef<ChatGroup>("my_chats");
  const selectedByGroupRef = useRef<Record<ChatGroup, string | null>>({ my_chats: null, voice_work: null });
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [draftsByChat, setDraftsByChat] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [nextCursorByGroup, setNextCursorByGroup] = useState<Record<ChatGroup, string | null>>({ my_chats: null, voice_work: null });
  const [listLoading, setListLoading] = useState(true);
  const [listPageLoading, setListPageLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [voiceSync, setVoiceSync] = useState<ThreadPage["sync"]>(undefined);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyThreads, setLegacyThreads] = useState<ThreadSummary[]>([]);
  const [legacyCursor, setLegacyCursor] = useState<string | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatFailure | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryState>("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyIssue, setHistoryIssue] = useState<{ code: string; retryable: boolean; replacementAllowed: boolean } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [streamRevision, setStreamRevision] = useState(0);
  const [pendingDeliveries, setPendingDeliveries] = useState<Record<string, PendingDelivery>>({});
  const [dictation, setDictation] = useState<DictationState>("idle");
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictationLanguage, setDictationLanguage] = useState<DictationLanguage>("browser");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const listSentinelRef = useRef<HTMLDivElement | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);
  const displayedChatIdRef = useRef<string | null>(null);
  const draftsByChatRef = useRef<Record<string, string>>({});
  const pendingDeliveriesRef = useRef<Record<string, PendingDelivery>>({});
  const detailRequestRef = useRef<{ chatId: string; token: symbol; controller: AbortController } | null>(null);
  const historyRequestRef = useRef<{ chatId: string; token: symbol; controller: AbortController } | null>(null);
  const navigationRef = useRef<TaskChatNavigationContext | null>(null);
  const completedInteractionsRef = useRef<Set<string>>(new Set());
  const listRefreshMountedRef = useRef(false);
  const connectionRef = useRef<ConnectionState>("idle");
  selectedChatIdRef.current = selectedChatId;
  activeGroupRef.current = activeGroup;
  connectionRef.current = connection;

  const draftKey = selectedChatId || NEW_CHAT_DRAFT_KEY;
  const draft = draftsByChat[draftKey] || "";
  const pendingDelivery = selectedChatId ? pendingDeliveries[selectedChatId] || null : null;

  const updateDraftForChat = useCallback((chatId: string | null, value: SetStateAction<string>) => {
    const key = chatId || NEW_CHAT_DRAFT_KEY;
    const current = draftsByChatRef.current[key] || "";
    const nextValue = typeof value === "function" ? value(current) : value;
    const next = { ...draftsByChatRef.current };
    if (nextValue) next[key] = nextValue;
    else delete next[key];
    draftsByChatRef.current = next;
    setDraftsByChat(next);
  }, []);

  const setDraft = useCallback((value: SetStateAction<string>) => {
    updateDraftForChat(selectedChatIdRef.current, value);
  }, [updateDraftForChat]);

  const setPendingForChat = useCallback((chatId: string, value: PendingDelivery | null) => {
    const next = { ...pendingDeliveriesRef.current };
    if (value) next[chatId] = value;
    else delete next[chatId];
    pendingDeliveriesRef.current = next;
    setPendingDeliveries(next);
  }, []);

  const selectedSummary = useMemo(
    () => threads.find((thread) => thread.chatId === selectedChatId) || null,
    [selectedChatId, threads],
  );

  const refreshRuntime = useCallback(async () => {
    const response = await api<RuntimeStatus>("/api/codex-chat/v1/runtime");
    setRuntime(response.data);
    return response.data;
  }, []);

  const refreshThreads = useCallback(async () => {
    const requestedGroup = activeGroup;
    const interactionId = crypto.randomUUID();
    const startedAt = Date.now();
    reportControlCenterUiActivity({ event: "thread_list_started", interactionId, source: "thread_list", durationMs: 0, group: requestedGroup, view: "current" });
    setListLoading(true);
    setListError(null);
    try {
      const page = await loadThreadPage(requestedGroup, { search: debouncedSearch });
      const groupRows = page.data.filter((thread) => thread.group === requestedGroup);
      setThreads((current) => [...current.filter((thread) => thread.group !== requestedGroup), ...groupRows]);
      setNextCursorByGroup((current) => ({ ...current, [requestedGroup]: page.nextCursor }));
      if (requestedGroup === "voice_work") setVoiceSync(page.sync);
      reportControlCenterUiActivity({ event: "thread_list_first_page_loaded", interactionId, source: "thread_list", durationMs: Date.now() - startedAt, group: requestedGroup, view: "current", count: Math.min(50, groupRows.length) });
      if (activeGroupRef.current !== requestedGroup) return groupRows;
      setSelectedChatId((current) => {
        const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chat") : null;
        const next = requested || [current, selectedByGroupRef.current[requestedGroup], groupRows[0]?.chatId]
          .find((candidate) => candidate && groupRows.some((thread) => thread.chatId === candidate)) || null;
        selectedByGroupRef.current[requestedGroup] = next;
        return next;
      });
      return groupRows;
    } catch (cause) {
      setListError(cause instanceof ControlCenterRequestError ? cause.message : "Task Chat list could not load.");
      reportControlCenterUiActivity({ event: "thread_list_page_failed", interactionId, source: "thread_list", durationMs: Date.now() - startedAt, group: requestedGroup, view: "current", errorCode: requestErrorCode(cause) });
      throw cause;
    } finally {
      if (activeGroupRef.current === requestedGroup) setListLoading(false);
    }
  }, [activeGroup, debouncedSearch]);

  const loadMoreThreads = useCallback(async () => {
    const group = activeGroupRef.current;
    const cursor = nextCursorByGroup[group];
    if (!cursor || listLoading || listPageLoading) return;
    setListPageLoading(true);
    setListError(null);
    try {
      const page = await loadThreadPage(group, { cursor, search: debouncedSearch });
      setThreads((current) => {
        const ids = new Set(current.map((row) => row.chatId));
        return [...current, ...page.data.filter((row) => !ids.has(row.chatId))];
      });
      setNextCursorByGroup((current) => ({ ...current, [group]: page.nextCursor }));
      if (group === "voice_work") setVoiceSync(page.sync);
    } catch (cause) {
      setListError(cause instanceof ControlCenterRequestError ? cause.message : "More chats could not load.");
    } finally {
      setListPageLoading(false);
    }
  }, [debouncedSearch, listLoading, listPageLoading, nextCursorByGroup]);

  const loadMoreLegacy = useCallback(async () => {
    if (!legacyCursor || legacyLoading) return;
    setLegacyLoading(true);
    try {
      const page = await loadThreadPage("voice_work", { cursor: legacyCursor, search: debouncedSearch, view: "legacy" });
      setLegacyThreads((current) => {
        const ids = new Set(current.map((row) => row.chatId));
        return [...current, ...page.data.filter((row) => !ids.has(row.chatId))];
      });
      setLegacyCursor(page.nextCursor);
    } catch {
      setListError("More legacy Voice tasks could not load.");
    } finally {
      setLegacyLoading(false);
    }
  }, [debouncedSearch, legacyCursor, legacyLoading]);

  const completeNavigation = useCallback((
    context: TaskChatNavigationContext | null,
    event: "history_loaded" | "history_failed",
    options: { stage: "navigation" | "metadata" | "history"; durationMs: number; errorCode?: string },
  ) => {
    if (!context || completedInteractionsRef.current.has(context.interactionId)) return;
    if (completedInteractionsRef.current.size >= 500) completedInteractionsRef.current.clear();
    completedInteractionsRef.current.add(context.interactionId);
    reportTaskChatUiActivity(context, event, options);
  }, []);

  const beginNavigation = useCallback((
    chatId: string,
    source: TaskChatUiActivitySource,
    options: { selected?: boolean; context?: TaskChatNavigationContext | null } = {},
  ) => {
    const context = options.context || createTaskChatNavigation(chatId, source);
    const previous = navigationRef.current;
    if (previous && previous.interactionId !== context.interactionId) {
      completeNavigation(previous, "history_failed", {
        stage: "navigation",
        durationMs: Math.max(0, Date.now() - previous.startedAt),
        errorCode: "navigation_superseded",
      });
    }
    navigationRef.current = context;
    if (options.selected) reportTaskChatUiActivity(context, "thread_selected", { stage: "navigation", durationMs: 0 });
    if (!options.context) reportTaskChatUiActivity(context, "navigation_started", { stage: "navigation", durationMs: 0 });
    return context;
  }, [completeNavigation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const group: ChatGroup = params.get("group") === "voice_work" ? "voice_work" : "my_chats";
    const requested = params.get("chat");
    setActiveGroup(group);
    if (requested) {
      selectedByGroupRef.current[group] = requested;
      beginNavigation(requested, "direct_link", { context: consumeTaskChatHandoff(requested) });
      setSelectedChatId(requested);
    }
  }, [beginNavigation]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const sentinel = listSentinelRef.current;
    if (!sentinel || !nextCursorByGroup[activeGroup]) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMoreThreads();
    }, { rootMargin: "160px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeGroup, loadMoreThreads, nextCursorByGroup]);

  useEffect(() => {
    if (!legacyOpen || activeGroup !== "voice_work") return;
    let cancelled = false;
    setLegacyLoading(true);
    void loadThreadPage("voice_work", { search: debouncedSearch, view: "legacy" })
      .then((page) => {
        if (cancelled) return;
        setLegacyThreads(page.data);
        setLegacyCursor(page.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setListError("Legacy Voice tasks could not load.");
      })
      .finally(() => {
        if (!cancelled) setLegacyLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeGroup, debouncedSearch, legacyOpen]);

  useEffect(() => {
    if (activeGroup !== "voice_work") return;
    let stopped = false;
    let timer: number | null = null;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!stopped && document.visibilityState === "visible") await refreshThreads().catch(() => undefined);
        if (!stopped) schedule();
      }, VOICE_LIST_REFRESH_MS);
    };
    schedule();
    return () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [activeGroup, refreshThreads]);

  useEffect(() => {
    if (activeGroup !== "voice_work" || voiceSync?.state !== "refreshing") return;
    const timer = window.setTimeout(() => void refreshThreads().catch(() => undefined), 1_000);
    return () => window.clearTimeout(timer);
  }, [activeGroup, refreshThreads, voiceSync?.state]);

  const loadThreadDetail = useCallback(async (chatId: string) => {
    detailRequestRef.current?.controller.abort();
    const token = Symbol(chatId);
    const controller = new AbortController();
    detailRequestRef.current = { chatId, token, controller };
    if (selectedChatIdRef.current === chatId) setDetailLoading(true);
    try {
      const response = await api<ThreadDetail>(
        `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}`,
        { signal: controller.signal },
        { timeoutMs: HISTORY_TIMEOUT_MS },
      );
      if (detailRequestRef.current?.token === token && selectedChatIdRef.current === chatId) {
        setDetail(response.data);
        setError((currentError) => currentError?.source === "history" ? null : currentError);
      }
      return response.data;
    } finally {
      if (detailRequestRef.current?.token === token) {
        detailRequestRef.current = null;
        if (selectedChatIdRef.current === chatId) setDetailLoading(false);
      }
    }
  }, []);

  const loadThreadHistory = useCallback(async (
    chatId: string,
    threadDetail: ThreadDetail,
    context: TaskChatNavigationContext | null = null,
  ) => {
    historyRequestRef.current?.controller.abort();
    const token = Symbol(chatId);
    const controller = new AbortController();
    historyRequestRef.current = { chatId, token, controller };
    if (selectedChatIdRef.current === chatId) {
      setHistoryState("loading");
      setHistoryError(null);
      setHistoryIssue(null);
    }
    const slowTimer = window.setTimeout(() => {
      if (historyRequestRef.current?.token === token && selectedChatIdRef.current === chatId) setHistoryState("slow");
    }, HISTORY_SLOW_MS);
    try {
      const historyBlocked = threadDetail.continuationState === "blocked_runtime_mismatch"
        || threadDetail.continuationState === "blocked_history_unavailable";
      const rows = historyBlocked
        ? []
        : (await api<TurnPage>(
          `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/turns?limit=50`,
          { signal: controller.signal },
          { timeoutMs: HISTORY_TIMEOUT_MS },
        )).data.data;
      if (historyRequestRef.current?.token !== token) return false;
      if (selectedChatIdRef.current === chatId) {
        setTurns(rows);
        setHistoryState("ready");
        setHistoryError(null);
        setHistoryIssue(null);
        setError((currentError) => currentError?.source === "history" ? null : currentError);
      }
      const pending = pendingDeliveriesRef.current[chatId];
      if (pending && rows.some((turn) => turn.clientMessageId === pending.clientMessageId)) {
        setPendingForChat(chatId, null);
        updateDraftForChat(chatId, (current) => current.trim() === pending.text ? "" : current);
        setError((current) => current?.source === "turn" && current.chatId === chatId ? null : current);
      }
      completeNavigation(context, "history_loaded", {
        stage: "history",
        durationMs: context ? Math.max(0, Date.now() - context.startedAt) : 0,
      });
      return true;
    } catch (cause) {
      if (historyRequestRef.current?.token !== token) return false;
      const code = requestErrorCode(cause);
      if (selectedChatIdRef.current === chatId) {
        setHistoryState("error");
        const requestError = cause instanceof ControlCenterRequestError ? cause : null;
        const missing = code === "native_thread_missing";
        setHistoryIssue({ code, retryable: requestError?.retryable ?? true, replacementAllowed: requestError?.details?.replacementAllowed === true });
        setHistoryError(missing
          ? "This chat is no longer available in the selected runtime. It may have been created before the runtime restarted."
          : code === "request_timeout" || code === "history_timeout"
            ? "History took too long to load. The thread is safe; retry when the connection is ready."
            : "History could not load. Retry without leaving this thread.");
      }
      completeNavigation(context, "history_failed", {
        stage: "history",
        durationMs: context ? Math.max(0, Date.now() - context.startedAt) : 0,
        errorCode: code,
      });
      return false;
    } finally {
      window.clearTimeout(slowTimer);
      if (historyRequestRef.current?.token === token) historyRequestRef.current = null;
    }
  }, [completeNavigation, setPendingForChat, updateDraftForChat]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let attempt = 0;
    let firstAttempt = true;

    const load = async () => {
      try {
        await checkControlCenterHealth();
        await Promise.all([refreshRuntime(), refreshThreads()]);
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
  }, [refreshRuntime]);

  useEffect(() => {
    if (!listRefreshMountedRef.current) {
      listRefreshMountedRef.current = true;
      return;
    }
    void refreshThreads().catch(() => undefined);
  }, [activeGroup, debouncedSearch, refreshThreads]);

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
    detailRequestRef.current?.controller.abort();
    historyRequestRef.current?.controller.abort();
    setDetail(null);
    setTurns([]);
    setDetailLoading(Boolean(selectedChatId));
    setHistoryState(selectedChatId ? "loading" : "idle");
    setHistoryError(null);
    setHistoryIssue(null);
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
    let streamUrl = "";
    const existingContext = navigationRef.current?.chatId === selectedChatId ? navigationRef.current : null;
    const requested = new URLSearchParams(window.location.search).get("chat");
    const context = existingContext || beginNavigation(selectedChatId, requested === selectedChatId ? "direct_link" : "group_restore");

    setConnection("connecting");

    const reload = async () => {
      try {
        const nextDetail = await loadThreadDetail(selectedChatId);
        if (!cancelled) await loadThreadHistory(selectedChatId, nextDetail);
      } catch (cause) {
        if (!cancelled) {
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
        if (streamUrl) attachStream(streamUrl);
      }, delay);
    };

    const connect = async () => {
      try {
        const nextDetail = await loadThreadDetail(selectedChatId);
        if (cancelled) return;
        streamUrl = nextDetail.streamUrl;
        attachStream(streamUrl);
        void loadThreadHistory(selectedChatId, nextDetail, context);
      } catch (cause) {
        if (cancelled) return;
        setConnection("reconnecting");
        setError(failure(cause, "Chat history could not load.", "history"));
        setHistoryState("error");
        const code = requestErrorCode(cause);
        const requestError = cause instanceof ControlCenterRequestError ? cause : null;
        setHistoryIssue({ code, retryable: requestError?.retryable ?? true, replacementAllowed: requestError?.details?.replacementAllowed === true });
        setHistoryError(code === "native_thread_missing"
          ? "This chat is no longer available in the selected runtime. It may have been created before the runtime restarted."
          : code === "request_timeout" || code === "history_timeout"
            ? "The thread took too long to open. Retry when the connection is ready."
            : "The thread could not be opened. Retry without leaving Task Chat.");
        completeNavigation(context, "history_failed", {
          stage: "metadata",
          durationMs: Math.max(0, Date.now() - context.startedAt),
          errorCode: requestErrorCode(cause),
        });
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [beginNavigation, completeNavigation, loadThreadDetail, loadThreadHistory, refreshThreads, selectedChatId, streamRevision]);

  const selectionChanging = displayedChatIdRef.current !== selectedChatId;
  const displayedTurns = selectionChanging ? [] : turns;
  const lastTranscriptText = displayedTurns.at(-1)?.items.at(-1);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [displayedTurns.length, lastTranscriptText]);

  const visibleThreads = useMemo(() => threads.filter((thread) => thread.group === activeGroup), [activeGroup, threads]);

  const hasActiveTurn = displayedTurns.some((turn) => turn.status === "queued" || turn.status === "in_progress" || turn.status === "waiting_for_approval" || turn.status === "waiting_for_input");
  const displayedDetail = selectionChanging ? null : detail;
  const displayedThread = displayedDetail?.thread || selectedSummary;
  const effectiveProvider = runtime?.providers.find((provider) => provider.providerId === (displayedThread?.runtime.providerId || runtime.effectiveProvider));
  const visibleError = error && (error.chatId == null || error.chatId === selectedChatId) ? error : null;
  const backendOffline = visibleError?.kind === "backend_offline";
  const threadUnavailable = historyIssue?.code === "native_thread_missing";
  const transcriptStale = backendOffline || connection === "reconnecting";
  const historyBusy = selectionChanging || detailLoading || historyState === "loading" || historyState === "slow";

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      const chatId = selectedChatIdRef.current;
      if (chatId && (detailRequestRef.current?.chatId === chatId || historyRequestRef.current?.chatId === chatId)) return;
      void (async () => {
        await checkControlCenterHealth();
        const shellRefresh = Promise.allSettled([refreshRuntime(), refreshThreads()]);
        if (chatId) {
          const nextDetail = await loadThreadDetail(chatId);
          await loadThreadHistory(chatId, nextDetail);
        }
        await shellRefresh;
        if (!cancelled && chatId && connectionRef.current === "reconnecting") setStreamRevision((current) => current + 1);
      })().catch((cause) => {
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
  }, [loadThreadDetail, loadThreadHistory, refreshRuntime, refreshThreads]);

  const retryNow = useCallback(async () => {
    const restartStream = Boolean(selectedChatIdRef.current && connection !== "ready");
    setRecovering(true);
    setError(null);
    if (restartStream) setConnection("connecting");
    try {
      await checkControlCenterHealth();
      await refreshRuntime();
      const chatId = selectedChatIdRef.current;
      if (chatId) {
        const context = beginNavigation(chatId, "retry");
        const nextDetail = await loadThreadDetail(chatId);
        await loadThreadHistory(chatId, nextDetail, context);
        if (restartStream) setStreamRevision((current) => current + 1);
      } else {
        await refreshThreads();
      }
    } catch (cause) {
      setConnection(selectedChatIdRef.current ? "reconnecting" : "idle");
      setError(failure(cause, "Task Chat could not reconnect.", "history"));
    } finally {
      setRecovering(false);
    }
  }, [beginNavigation, connection, loadThreadDetail, loadThreadHistory, refreshRuntime, refreshThreads]);

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

  const startNewDraft = useCallback(() => {
    selectedByGroupRef.current.my_chats = null;
    setActiveGroup("my_chats");
    setSelectedChatId(null);
    setDetail(null);
    setTurns([]);
    setHistoryState("idle");
    setError(null);
    setDrawerOpen(false);
    window.history.replaceState(null, "", "/task-chat?group=my_chats");
  }, []);

  const backToThreadList = useCallback(() => {
    selectedByGroupRef.current[activeGroupRef.current] = null;
    setSelectedChatId(null);
    setDetail(null);
    setTurns([]);
    setHistoryState("idle");
    setHistoryIssue(null);
    setError(null);
    setDrawerOpen(true);
    window.history.replaceState(null, "", `/task-chat?group=${activeGroupRef.current}`);
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
    if (next) beginNavigation(next, "group_restore");
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
      }, { timeoutMs: TURN_START_TIMEOUT_MS });
      setPendingForChat(delivery.chatId, null);
      updateDraftForChat(delivery.chatId, (current) => current.trim() === delivery.text ? "" : current);
      if (selectedChatIdRef.current === delivery.chatId) setTurns((rows) => upsertTurn(rows, response.data.turn));
      void refreshThreads();
    } catch (cause) {
      if (deliveryMayBeUnknown(cause)) {
        const unknown = { ...delivery, status: "delivery_unknown" as const };
        setPendingForChat(delivery.chatId, unknown);
        setError({
          message: "The connection ended before delivery could be confirmed. Check history before retrying the same message.",
          source: "turn",
          kind: cause instanceof ControlCenterRequestError && cause.kind !== "api" ? "backend_offline" : "turn_failed",
          chatId: delivery.chatId,
        });
      } else {
        setPendingForChat(delivery.chatId, null);
        setError(failure(cause, "Message could not be sent.", "turn", delivery.chatId));
      }
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending || hasActiveTurn || (selectedChatId && pendingDeliveriesRef.current[selectedChatId])) return;
    let chatId = selectedChatId;
    if (!chatId) {
      chatId = (await createChat())?.thread.chatId || null;
      if (chatId) {
        updateDraftForChat(chatId, text);
        updateDraftForChat(null, "");
      }
    }
    if (!chatId) return;
    const delivery: PendingDelivery = {
      chatId,
      clientMessageId: crypto.randomUUID(),
      text,
      status: "sending",
    };
    setPendingForChat(chatId, delivery);
    await deliverMessage(delivery);
  }

  async function retryUnknownDelivery() {
    const chatId = selectedChatIdRef.current;
    const delivery = chatId ? pendingDeliveriesRef.current[chatId] : null;
    if (!delivery || delivery.status !== "delivery_unknown" || sending) return;
    setRecovering(true);
    try {
      await checkControlCenterHealth();
      await refreshRuntime();
      const nextDetail = await loadThreadDetail(delivery.chatId);
      await loadThreadHistory(delivery.chatId, nextDetail);
      const unresolved = pendingDeliveriesRef.current[delivery.chatId];
      if (!unresolved || unresolved.clientMessageId !== delivery.clientMessageId) return;
      if ((draftsByChatRef.current[delivery.chatId] || "").trim() !== delivery.text) {
        setError({
          message: "The draft changed. Restore the original message before retrying its delivery.",
          source: "turn",
          kind: "turn_failed",
          chatId: delivery.chatId,
        });
        return;
      }
      await deliverMessage(delivery);
    } catch (cause) {
      setError(failure(cause, "Delivery could not be reconciled.", "turn", delivery.chatId));
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
      {activeGroup === "my_chats" ? <button className="codex-new-chat" type="button" onClick={startNewDraft} disabled={creating || runtime?.availability === "unavailable"}>
        <Plus size={17} /> New chat
      </button> : null}
      <label className="codex-search">
        <Search size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeGroup === "voice_work" ? "Search Voice tasks…" : "Search chats…"} aria-label="Search Task Chat" />
      </label>
      <section className="codex-thread-group">
        {listLoading && visibleThreads.length === 0 ? <div className="codex-list-loading"><LoaderCircle className="spin" size={20} /><span>Loading {activeGroup === "voice_work" ? "Voice tasks" : "chats"}…</span></div> : null}
        {visibleThreads.length ? visibleThreads.map((thread) => (
          <ThreadRow key={thread.chatId} thread={thread} active={thread.chatId === selectedChatId} onSelect={() => {
            if (thread.chatId !== selectedChatId) {
              beginNavigation(thread.chatId, "history_row", { selected: true });
              setSelectedChatId(thread.chatId);
              selectedByGroupRef.current[activeGroup] = thread.chatId;
              const params = new URLSearchParams({ group: activeGroup, chat: thread.chatId });
              window.history.replaceState(null, "", `/task-chat?${params.toString()}`);
            }
            setDrawerOpen(false);
          }} />
        )) : !listLoading && !(activeGroup === "voice_work" && voiceSync?.state === "refreshing") ? <p className="codex-history-empty">{debouncedSearch ? "No matching items" : activeGroup === "voice_work" ? "Persistent Voice task threads will appear here after their work environment is resolved." : "Create a chat to start working with Pritha."}</p> : null}
        {listError ? <div className="codex-list-error"><span>{listError}</span><button type="button" onClick={() => void refreshThreads()}>Retry</button></div> : null}
        {nextCursorByGroup[activeGroup] ? <button className="codex-load-more" type="button" onClick={() => void loadMoreThreads()} disabled={listPageLoading}>{listPageLoading ? "Loading…" : "Load more"}</button> : null}
        <div ref={listSentinelRef} aria-hidden="true" />
      </section>
      {activeGroup === "voice_work" ? (
        <section className="codex-legacy-section">
          {voiceSync?.state !== "ready" ? <p className={`codex-index-state ${voiceSync?.state || "refreshing"}`}>{voiceSync?.state === "degraded" ? "Voice index update failed; showing saved tasks." : "Updating Voice tasks…"}</p> : null}
          <button className="codex-legacy-toggle" type="button" aria-expanded={legacyOpen} onClick={() => setLegacyOpen((value) => !value)}>
            <ChevronDown size={16} className={legacyOpen ? "open" : ""} /> Legacy
          </button>
          {legacyOpen ? <div className="codex-legacy-list">
            {legacyThreads.map((thread) => <ThreadRow key={thread.chatId} thread={thread} active={thread.chatId === selectedChatId} onSelect={() => {
              beginNavigation(thread.chatId, "history_row", { selected: true });
              setSelectedChatId(thread.chatId);
              selectedByGroupRef.current.voice_work = thread.chatId;
              window.history.replaceState(null, "", `/task-chat?group=voice_work&chat=${encodeURIComponent(thread.chatId)}`);
              setDrawerOpen(false);
            }} />)}
            {legacyLoading ? <div className="codex-list-loading"><LoaderCircle className="spin" size={18} /><span>Loading legacy tasks…</span></div> : null}
            {!legacyLoading && legacyThreads.length === 0 ? <p className="codex-history-empty">No legacy bindings.</p> : null}
            {legacyCursor ? <button className="codex-load-more" type="button" onClick={() => void loadMoreLegacy()} disabled={legacyLoading}>Load more legacy</button> : null}
          </div> : null}
        </section>
      ) : null}
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
              <h1>{displayedThread?.title || (selectedChatId ? "Opening thread…" : "Task Chat")}</h1>
              <span className={`codex-runtime-pill ${backendOffline || threadUnavailable ? "unavailable" : runtime?.availability || "unavailable"}`}>{threadUnavailable ? "Thread unavailable" : backendOffline ? "Offline" : runtime?.availability === "ready" ? "Ready" : runtime?.availability || "Checking"}</span>
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
        {visibleError ? (
          <div className="codex-error-banner">
            <AlertTriangle size={17} />
            <span>{visibleError.message}</span>
            <div className="codex-error-actions">
              {visibleError.retryable !== false ? <button type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry"}</button> : null}
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}

        <div className={`codex-transcript ${transcriptStale ? "stale" : ""}`} role="log" aria-live="polite" aria-label="Task Chat messages" aria-busy={historyBusy || connection === "connecting"}>
          {loading && !selectedChatId ? <div className="codex-empty-state"><LoaderCircle className="spin" size={28} /><h2>Loading Task Chat</h2></div> : null}
          {!loading && !selectedChatId ? (
            <div className="codex-empty-state">
              <Bot size={34} />
              <h2>{activeGroup === "voice_work" ? "Voice task threads" : "Work directly with Pritha"}</h2>
              <p>Start a persistent conversation with the runtime selected in Settings.</p>
              {activeGroup === "my_chats" ? <button className="codex-new-chat codex-empty-action" type="button" onClick={startNewDraft} disabled={creating || runtime?.availability !== "ready"}><Plus size={17} /> New chat</button> : null}
            </div>
          ) : null}
          {selectedChatId && displayedTurns.length === 0 && historyBusy ? (
            <div className="codex-empty-state compact codex-history-loading">
              <LoaderCircle className="spin" size={28} />
              <h2>{historyState === "slow" ? "Still loading history…" : detailLoading ? "Opening thread…" : "Loading conversation history…"}</h2>
              <p>{historyState === "slow" ? "This is taking longer than expected. You can retry without leaving the selected thread." : "The selected thread is ready; messages are loading separately."}</p>
              {historyState === "slow" ? <button className="outline-button compact" type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry now"}</button> : null}
            </div>
          ) : null}
          {selectedChatId && displayedTurns.length === 0 && historyState === "error" ? (
            <div className="codex-empty-state compact codex-history-failed">
              <AlertTriangle size={28} />
              <h2>History did not load</h2>
              <p>{historyError || "Retry without leaving the selected thread."}</p>
              <div className="codex-empty-actions">
                {historyIssue?.retryable !== false ? <button className="outline-button compact" type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry history"}</button> : null}
                {historyIssue?.replacementAllowed ? <button className="primary-action-button compact" type="button" onClick={startNewDraft}>Start replacement draft</button> : null}
                {historyIssue?.retryable === false && !historyIssue.replacementAllowed ? <button className="outline-button compact" type="button" onClick={backToThreadList}>Back to list</button> : null}
              </div>
            </div>
          ) : null}
          {selectedChatId && displayedTurns.length === 0 && historyState === "ready" ? (
            <div className="codex-empty-state compact"><Bot size={30} /><h2>{activeGroup === "voice_work" ? "Voice task thread" : "What should Pritha do?"}</h2><p>Messages and activity remain attached to this native task thread.</p></div>
          ) : null}
          {selectedChatId && displayedTurns.length > 0 && historyState === "error" ? (
            <div className="codex-inline-notice warning codex-history-refresh-error">
              <span>{historyError || "History refresh failed. The last loaded messages remain visible."}</span>
              {historyIssue?.retryable !== false ? <button type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry history"}</button> : null}
            </div>
          ) : null}
          {displayedTurns.map((turn) => (
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
          {selectedChatId && !displayedDetail ? (
            <div className="codex-composer-status"><LoaderCircle className="spin" size={17} /><span>Opening thread controls…</span></div>
          ) : displayedDetail?.thread.origin === "voice" && displayedDetail.continuationState !== "continuation_enabled" ? (
            <div className="codex-continuation-gate">
              <div><strong>{displayedDetail.continuationState === "blocked_active_turn" ? "Voice task is running" : "Voice task history is read-only"}</strong><p>{displayedDetail.continuationState === "blocked_active_turn" ? "Wait for the active Voice turn to finish before continuing here." : "Enable continuation only when you want to add a typed turn to this same task thread."}</p></div>
              <button className="codex-new-chat" type="button" onClick={() => void continueInTaskChat()} disabled={recovering || historyState !== "ready" || displayedDetail.continuationState !== "read_only"}>{recovering ? "Checking…" : historyBusy ? "Loading history…" : "Continue in Task Chat"}</button>
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
              placeholder={pendingDelivery?.status === "delivery_unknown"
                ? "Delivery confirmation is pending…"
                : selectedChatId && historyState === "error"
                  ? "Retry history before sending…"
                  : selectedChatId && historyState !== "ready"
                    ? "Loading history…"
                    : hasActiveTurn ? "Pritha is working…" : "Ask Pritha…"}
              rows={3}
              maxLength={64_000}
              disabled={Boolean(selectedChatId && historyState !== "ready")}
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
                <button className="codex-send" type="button" onClick={() => void sendMessage()} disabled={!draft.trim() || sending || hasActiveTurn || Boolean(pendingDelivery) || Boolean(selectedChatId && historyState !== "ready") || backendOffline || runtime?.availability !== "ready"}>
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
