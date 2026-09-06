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
  Paperclip,
  Search,
  Send,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useChatAttachments } from "./useChatAttachments";
import { AttachmentLinks, DraftAttachments } from "./ChatAttachments";
import { CopyResponse } from "./CopyResponse";
import { GoalBudgetPanel } from "./GoalBudgetPanel";
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
  CreatedThreadTurn,
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
  attachments?: string[];
  modelId?: string;
  chatId: string;
  clientMessageId: string;
  text: string;
  status: "sending" | "delivery_unknown";
};

type PendingNewChatDelivery = {
  attachments?: string[];
  modelId?: string;
  clientThreadId: string;
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

async function loadThreadPage(group: ChatGroup, options: { cursor?: string | null; search?: string; view?: "current" | "legacy" | "all"; archived?: boolean } = {}) {
  const query = new URLSearchParams({ group, limit: "50", view: options.view || "all", archived: String(options.archived === true) });
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

function ThreadRow({ thread, active, onSelect, onArchive, busy }: { thread: ThreadSummary; active: boolean; onSelect: () => void; onArchive: () => void; busy: boolean }) {
  return (
    <div className="codex-thread-entry"><button className={`codex-thread-row ${active ? "active" : ""}`} type="button" onClick={onSelect}>
      <span className="codex-thread-title">{thread.title}</span>
      <span className="codex-thread-meta">
        <span>{thread.status === "active" ? "Working" : thread.preview || "No messages yet"}</span>
        <time>{relativeTime(thread.updatedAt)}</time>
      </span>
      {thread.taskLinks.length ? <span className="codex-thread-task-links">{thread.taskLinks.slice(-3).map((link) => `#${link.shortId || link.taskId.slice(-6)}`).join(" · ")}</span> : null}
      {thread.runtime.compatibility === "mismatch" ? <span className="codex-thread-status">Needs attention</span> : null}
    </button>
    {active ? <button type="button" className="codex-text-action codex-archive-action" onClick={onArchive} disabled={busy}>{thread.archived ? "Restore from archive" : "Archive"}</button> : null}
    </div>
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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatFailure | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [goalRevision, setGoalRevision] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState>("idle");
  const [historyHasImages, setHistoryHasImages] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const expandedHistoryRef = useRef(false);
  const olderRequestRef = useRef<AbortController | null>(null);
  const olderScrollRef = useRef<{ element: HTMLElement; height: number; top: number } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyIssue, setHistoryIssue] = useState<{ code: string; retryable: boolean; replacementAllowed: boolean } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const archiveViewRef = useRef(false);
  archiveViewRef.current = showArchived;
  const listRequestVersion = useRef(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [streamRevision, setStreamRevision] = useState(0);
  const [pendingDeliveries, setPendingDeliveries] = useState<Record<string, PendingDelivery>>({});
  const [pendingNewChatDelivery, setPendingNewChatDelivery] = useState<PendingNewChatDelivery | null>(null);
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
  const pendingNewChatDeliveryRef = useRef<PendingNewChatDelivery | null>(null);
  const newChatDraftActiveRef = useRef(false);
  const detailRequestRef = useRef<{ chatId: string; token: symbol; controller: AbortController } | null>(null);
  const historyRequestRef = useRef<{ chatId: string; token: symbol; controller: AbortController } | null>(null);
  const navigationRef = useRef<TaskChatNavigationContext | null>(null);
  const completedInteractionsRef = useRef<Set<string>>(new Set());
  const listRefreshMountedRef = useRef(false);
  const connectionRef = useRef<ConnectionState>("idle");
  selectedChatIdRef.current = selectedChatId;
  activeGroupRef.current = activeGroup;
  connectionRef.current = connection;
  pendingNewChatDeliveryRef.current = pendingNewChatDelivery;

  const draftKey = selectedChatId || NEW_CHAT_DRAFT_KEY;
  const draft = draftsByChat[draftKey] || "";
  const attachmentDraft = useChatAttachments(draftKey);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const attachmentIds = attachmentDraft.items.flatMap(file => file.state === "ready" ? [file.id] : []);
  const attachmentsIncomplete = attachmentDraft.items.some(file => file.state !== "ready");
  const selectedModalities = runtime?.models.find(model => model.id === runtime.selected.modelId)?.inputModalities;
  const imageCapabilityMissing = attachmentDraft.items.some(file => file.view?.kind === "image") && !selectedModalities?.includes("image");
  const pendingDelivery = selectedChatId ? pendingDeliveries[selectedChatId] || null : pendingNewChatDelivery;

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
    if (showArchived !== archiveViewRef.current) return [];
    const requestedGroup = activeGroup;
    const requestVersion = ++listRequestVersion.current;
    const interactionId = crypto.randomUUID();
    const startedAt = Date.now();
    reportControlCenterUiActivity({ event: "thread_list_started", interactionId, source: "thread_list", durationMs: 0, group: requestedGroup, view: "current" });
    setListLoading(true);
    setListError(null);
    try {
      const page = await loadThreadPage(requestedGroup, { search: debouncedSearch, archived: showArchived });
      if (requestVersion !== listRequestVersion.current) return [];
      const groupRows = page.data.filter((thread) => thread.group === requestedGroup);
      setThreads((current) => [...current.filter((thread) => thread.group !== requestedGroup), ...groupRows]);
      setNextCursorByGroup((current) => ({ ...current, [requestedGroup]: page.nextCursor }));
      if (requestedGroup === "voice_work") setVoiceSync(page.sync);
      reportControlCenterUiActivity({ event: "thread_list_first_page_loaded", interactionId, source: "thread_list", durationMs: Date.now() - startedAt, group: requestedGroup, view: "current", count: Math.min(50, groupRows.length) });
      if (activeGroupRef.current !== requestedGroup) return groupRows;
      setSelectedChatId((current) => {
        if (requestedGroup === "my_chats" && (newChatDraftActiveRef.current || pendingNewChatDeliveryRef.current)) return null;
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
      if (requestVersion === listRequestVersion.current) setListLoading(false);
    }
  }, [activeGroup, debouncedSearch, showArchived]);

  const loadMoreThreads = useCallback(async () => {
    const group = activeGroupRef.current;
    const cursor = nextCursorByGroup[group];
    if (!cursor || listLoading || listPageLoading) return;
    setListPageLoading(true);
    setListError(null);
    try {
      const version = listRequestVersion.current;
      const page = await loadThreadPage(group, { cursor, search: debouncedSearch, archived: archiveViewRef.current });
      if (version !== listRequestVersion.current) return;
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
      const historyPage = (await api<TurnPage>(
        `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/turns?limit=50`,
        { signal: controller.signal },
        { timeoutMs: HISTORY_TIMEOUT_MS, maxBodyBytes: 16 * 1024 * 1024 },
      )).data;
      const rows = historyPage.data;
      if (historyRequestRef.current?.token !== token) return false;
      if (selectedChatIdRef.current === chatId) {
        setTurns(current => expandedHistoryRef.current ? rows.reduce(upsertTurn, current) : rows);
        if (!expandedHistoryRef.current) setOlderCursor(historyPage.olderCursor || null);
        setHistoryHasImages(historyPage.hasImageInputs === true);
        setHistoryState("ready");
        setHistoryError(null);
        setHistoryIssue(null);
        setError((currentError) => currentError?.source === "history" ? null : currentError);
      }
      const pending = pendingDeliveriesRef.current[chatId];
      if (pending && rows.some((turn) => turn.clientMessageId === pending.clientMessageId)) {
        setPendingForChat(chatId, null);
        attachmentDraft.clear(chatId, pending.attachments);
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
          ? "The original thread was not found in the selected storage. The chat record has been preserved."
          : code === "request_timeout" || code === "history_timeout"
            ? "History took too long to load. The thread is safe; retry when the connection is ready."
            : requestError?.message || "History could not load. Retry without leaving this thread.");
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

  const loadOlderHistory = async () => {
    const chatId = selectedChatIdRef.current;
    if (!chatId || !olderCursor || olderRequestRef.current) return;
    const controller = new AbortController();
    olderRequestRef.current = controller;
    setOlderLoading(true);
    setOlderError(null);
    try {
      const page = (await api<TurnPage>(`/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/turns?limit=50&cursor=${encodeURIComponent(olderCursor)}`, { signal: controller.signal }, { timeoutMs: HISTORY_TIMEOUT_MS, maxBodyBytes: 16 * 1024 * 1024 })).data;
      if (controller.signal.aborted || selectedChatIdRef.current !== chatId) return;
      const element = transcriptEndRef.current?.parentElement;
      if (element) olderScrollRef.current = { element, height: element.scrollHeight, top: element.scrollTop };
      expandedHistoryRef.current = true;
      setTurns(current => current.reduce(upsertTurn, page.data));
      setOlderCursor(page.olderCursor || null);
    } catch (cause) {
      if (!controller.signal.aborted && selectedChatIdRef.current === chatId) setOlderError(cause instanceof Error ? cause.message : "Earlier messages could not load. Retry below.");
    } finally {
      if (olderRequestRef.current === controller) { olderRequestRef.current = null; setOlderLoading(false); }
    }
  };

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
    olderRequestRef.current?.abort();
    olderRequestRef.current = null;
    olderScrollRef.current = null;
    expandedHistoryRef.current = false;
    setOlderCursor(null);
    setOlderLoading(false);
    setOlderError(null);
    setDetail(null);
    setTurns([]);
    setDetailLoading(Boolean(selectedChatId));
    setHistoryState(selectedChatId ? "loading" : "idle");
    setHistoryHasImages(false);
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
      if (message.type === "goal.updated" || message.type === "connection.ready") setGoalRevision(value => value + 1);
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
      if (message.type === "thread.archived" || message.type === "thread.unarchived") { void reload(); void refreshThreads(); }
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
        "connection.ready", "stream.reset", "thread.updated", "thread.archived", "thread.unarchived", "turn.started", "turn.completed", "turn.interrupted", "turn.failed",
        "message.delta", "message.completed", "item.started", "item.completed", "goal.updated",
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
    const position = olderScrollRef.current;
    if (position) {
      position.element.scrollTop = position.top + position.element.scrollHeight - position.height;
      olderScrollRef.current = null;
      return;
    }
    transcriptEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [displayedTurns.length, lastTranscriptText]);

  const visibleThreads = useMemo(() => threads.filter((thread) => thread.group === activeGroup && thread.archived === showArchived), [activeGroup, threads, showArchived]);

  const hasActiveTurn = displayedTurns.some((turn) => turn.status === "queued" || turn.status === "in_progress" || turn.status === "waiting_for_approval" || turn.status === "waiting_for_input");
  const displayedDetail = selectionChanging ? null : detail;
  const displayedThread = displayedDetail?.thread || selectedSummary;
  const effectiveProvider = runtime?.providers.find((provider) => provider.providerId === (displayedThread?.runtime.providerId || runtime.effectiveProvider));
  const visibleError = error && (error.chatId == null || error.chatId === selectedChatId) ? error : null;
  const backendOffline = visibleError?.kind === "backend_offline";
  const threadUnavailable = Boolean(historyIssue && !historyIssue.retryable);
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

  const startNewDraft = useCallback(() => {
    newChatDraftActiveRef.current = true;
    selectedChatIdRef.current = null;
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

  const startReplacementDraft = useCallback(() => {
    const chatId = selectedChatIdRef.current;
    const pending = chatId ? pendingDeliveriesRef.current[chatId] : null;
    const replacementText = chatId ? draftsByChatRef.current[chatId] || pending?.text || "" : "";
    if (chatId) {
      updateDraftForChat(chatId, "");
      setPendingForChat(chatId, null);
    }
    updateDraftForChat(null, replacementText);
    startNewDraft();
  }, [setPendingForChat, startNewDraft, updateDraftForChat]);

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
    const next = group === "my_chats" && (newChatDraftActiveRef.current || pendingNewChatDeliveryRef.current)
      ? null
      : selectedByGroupRef.current[group] || threads.find((thread) => thread.group === group)?.chatId || null;
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
        body: JSON.stringify({ clientMessageId: delivery.clientMessageId, input: [{ type: "text", text: delivery.text }], ...(delivery.attachments?.length || delivery.modelId ? { attachments: delivery.attachments, settings: { modelId: delivery.modelId } } : {}) }),
      }, { timeoutMs: TURN_START_TIMEOUT_MS });
      setPendingForChat(delivery.chatId, null);
      attachmentDraft.clear(delivery.chatId, delivery.attachments);
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

  async function deliverNewChatMessage(delivery: PendingNewChatDelivery) {
    setSending(true);
    setError(null);
    setPendingNewChatDelivery({ ...delivery, status: "sending" });
    try {
      const response = await api<CreatedThreadTurn>("/api/codex-chat/v1/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": delivery.clientThreadId },
        body: JSON.stringify({
          clientThreadId: delivery.clientThreadId,
          source: "chat",
          initialTurn: {
            clientMessageId: delivery.clientMessageId,
            input: [{ type: "text", text: delivery.text }],
            ...(delivery.attachments?.length || delivery.modelId ? { attachments: delivery.attachments, settings: { modelId: delivery.modelId } } : {}),
          },
        }),
      }, { timeoutMs: TURN_START_TIMEOUT_MS });
      const { detail: nextDetail, accepted } = response.data;
      newChatDraftActiveRef.current = false;
      setPendingNewChatDelivery(null);
      updateDraftForChat(null, "");
      attachmentDraft.clear(NEW_CHAT_DRAFT_KEY, delivery.attachments);
      setThreads((rows) => [nextDetail.thread, ...rows.filter((thread) => thread.chatId !== nextDetail.thread.chatId)]);
      setActiveGroup("my_chats");
      selectedByGroupRef.current.my_chats = nextDetail.thread.chatId;
      setSelectedChatId(nextDetail.thread.chatId);
      setDetail(nextDetail);
      setTurns((rows) => upsertTurn(rows, accepted.turn));
      setDrawerOpen(false);
      window.history.replaceState(null, "", `/task-chat?group=my_chats&chat=${encodeURIComponent(nextDetail.thread.chatId)}`);
    } catch (cause) {
      if (deliveryMayBeUnknown(cause)) {
        setPendingNewChatDelivery({ ...delivery, status: "delivery_unknown" });
        setError({
          message: "The connection ended before the first message could be confirmed. Check and retry the same request safely.",
          source: "turn",
          kind: cause instanceof ControlCenterRequestError && cause.kind !== "api" ? "backend_offline" : "turn_failed",
          chatId: null,
        });
      } else {
        setPendingNewChatDelivery(null);
        setError(failure(cause, "The new chat was not created because its first message was not accepted.", "turn"));
      }
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if ((!text && !attachmentIds.length) || attachmentsIncomplete || imageCapabilityMissing || sending || hasActiveTurn || pendingNewChatDelivery || (selectedChatId && pendingDeliveriesRef.current[selectedChatId])) return;
    const chatId = selectedChatId;
    if (!chatId) {
      await deliverNewChatMessage({
        clientThreadId: crypto.randomUUID(),
        clientMessageId: crypto.randomUUID(),
        text,
        attachments: attachmentIds,
        modelId: attachmentIds.length || historyHasImages ? runtime?.selected.modelId || undefined : undefined,
        status: "sending",
      });
      return;
    }
    const delivery: PendingDelivery = {
      chatId,
      clientMessageId: crypto.randomUUID(),
      text,
      attachments: attachmentIds,
      modelId: attachmentIds.length || historyHasImages ? runtime?.selected.modelId || undefined : undefined,
      status: "sending",
    };
    setPendingForChat(chatId, delivery);
    await deliverMessage(delivery);
  }

  async function retryUnknownDelivery() {
    const chatId = selectedChatIdRef.current;
    if (!chatId) {
      const delivery = pendingNewChatDelivery;
      if (!delivery || delivery.status !== "delivery_unknown" || sending) return;
      if ((draftsByChatRef.current[NEW_CHAT_DRAFT_KEY] || "").trim() !== delivery.text) {
        setError({
          message: "The draft changed. Restore the original message before retrying its delivery.",
          source: "turn",
          kind: "turn_failed",
          chatId: null,
        });
        return;
      }
      setRecovering(true);
      try {
        await checkControlCenterHealth();
        await refreshRuntime();
        await deliverNewChatMessage(delivery);
      } catch (cause) {
        setError(failure(cause, "First-message delivery could not be reconciled.", "turn"));
      } finally {
        setRecovering(false);
      }
      return;
    }
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

  const restoreAccess = async () => {
    if (!selectedChatId || recovering) return;
    const chatId = selectedChatId;
    setRecovering(true);
    try {
      await api<ThreadDetail>(`/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/restore-access`, { method: "POST", body: "{}" });
      if (selectedChatIdRef.current === chatId) await retryNow();
    } catch (cause) {
      if (selectedChatIdRef.current === chatId) setHistoryError(cause instanceof Error ? cause.message : "Access could not be restored.");
    } finally { setRecovering(false); }
  };

  const changeArchiveView = () => {
    listRequestVersion.current++;
    newChatDraftActiveRef.current = false;
    setShowArchived(value => !value);
    setThreads([]);
    setNextCursorByGroup({ my_chats: null, voice_work: null });
    selectedByGroupRef.current = { my_chats: null, voice_work: null };
    selectedChatIdRef.current = null;
    setSelectedChatId(null);
    window.history.replaceState(null, "", `/task-chat?group=${activeGroup}`);
  };

  const archiveChat = async (thread: ThreadSummary) => {
    if (archiveBusy) return;
    setArchiveBusy(true);
    try {
      await api<ThreadSummary>(`/api/codex-chat/v1/threads/${encodeURIComponent(thread.chatId)}/${thread.archived ? "unarchive" : "archive"}`, { method: "POST", body: "{}" });
      if (selectedChatIdRef.current === thread.chatId) {
        selectedChatIdRef.current = null;
        selectedByGroupRef.current[activeGroup] = null;
        setSelectedChatId(null);
        window.history.replaceState(null, "", `/task-chat?group=${activeGroup}`);
      }
      setThreads(rows => rows.filter(row => row.chatId !== thread.chatId));
      await refreshThreads();
    } catch (cause) { setListError(cause instanceof Error ? cause.message : "Archive could not be updated."); }
    finally { setArchiveBusy(false); }
  };

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
      {activeGroup === "my_chats" ? <button className="codex-new-chat" type="button" onClick={startNewDraft} disabled={Boolean(pendingNewChatDelivery) || runtime?.availability === "unavailable"}>
        <Plus size={17} /> New chat
      </button> : null}
      <button type="button" className="codex-text-action" onClick={changeArchiveView}>{showArchived ? "Show active" : "Show archived"}</button>
      <label className="codex-search">
        <Search size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeGroup === "voice_work" ? "Search Voice tasks…" : "Search chats…"} aria-label="Search Task Chat" />
      </label>
      <section className="codex-thread-group">
        {listLoading && visibleThreads.length === 0 ? <div className="codex-list-loading"><LoaderCircle className="spin" size={20} /><span>Loading {activeGroup === "voice_work" ? "Voice tasks" : "chats"}…</span></div> : null}
        {visibleThreads.length ? visibleThreads.map((thread) => (
          <ThreadRow key={thread.chatId} thread={thread} active={thread.chatId === selectedChatId} onArchive={() => void archiveChat(thread)} busy={archiveBusy} onSelect={() => {
            if (thread.chatId !== selectedChatId) {
              if (thread.group === "my_chats") newChatDraftActiveRef.current = false;
              beginNavigation(thread.chatId, "history_row", { selected: true });
              setSelectedChatId(thread.chatId);
              selectedByGroupRef.current[activeGroup] = thread.chatId;
              const params = new URLSearchParams({ group: activeGroup, chat: thread.chatId });
              window.history.replaceState(null, "", `/task-chat?${params.toString()}`);
            }
            setDrawerOpen(false);
          }} />
        )) : !listLoading && !(activeGroup === "voice_work" && voiceSync?.state === "refreshing") ? <p className="codex-history-empty">{debouncedSearch ? "No matching items" : showArchived ? "No archived chats." : activeGroup === "voice_work" ? "Persistent Voice task threads will appear here after their work environment is resolved." : "Create a chat to start working with Pritha."}</p> : null}
        {listError ? <div className="codex-list-error"><span>{listError}</span><button type="button" onClick={() => void refreshThreads()}>Retry</button></div> : null}
        {nextCursorByGroup[activeGroup] ? <button className="codex-load-more" type="button" onClick={() => void loadMoreThreads()} disabled={listPageLoading}>{listPageLoading ? "Loading…" : "Load more"}</button> : null}
        <div ref={listSentinelRef} aria-hidden="true" />
      </section>
      {activeGroup === "voice_work" && voiceSync?.state !== "ready" ? <p className="codex-history-empty">{voiceSync?.state === "degraded" ? "Voice index update failed; showing saved tasks." : "Updating Voice tasks…"}</p> : null}
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
              {visibleError.retryable !== false && pendingDelivery?.status !== "delivery_unknown" ? <button type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry"}</button> : null}
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}

        {displayedDetail ? <GoalBudgetPanel key={displayedDetail.thread.chatId} chatId={displayedDetail.thread.chatId} refreshKey={goalRevision}
          active={displayedDetail.thread.status === "active" || Boolean(displayedDetail.activeTurnId) || sending}
          editable={!displayedDetail.thread.archived && displayedDetail.continuationState === "continuation_enabled"} /> : null}
        <div className={`codex-transcript ${transcriptStale ? "stale" : ""}`} role="log" aria-live="polite" aria-label="Task Chat messages" aria-busy={historyBusy || connection === "connecting"}>
          {loading && !selectedChatId ? <div className="codex-empty-state"><LoaderCircle className="spin" size={28} /><h2>Loading Task Chat</h2></div> : null}
          {!loading && !selectedChatId ? (
            <div className="codex-empty-state">
              <Bot size={34} />
              <h2>{activeGroup === "voice_work" ? "Voice task threads" : "Work directly with Pritha"}</h2>
              <p>Start a persistent conversation with the runtime selected in Settings.</p>
              {activeGroup === "my_chats" ? <button className="codex-new-chat codex-empty-action" type="button" onClick={startNewDraft} disabled={Boolean(pendingNewChatDelivery) || runtime?.availability !== "ready"}><Plus size={17} /> New chat</button> : null}
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
                {historyIssue?.code === "history_recovery_available" ? <button className="primary-action-button compact" type="button" onClick={() => void restoreAccess()} disabled={recovering}>{recovering ? "Restoring…" : "Restore access"}</button> : null}
                {historyIssue?.replacementAllowed ? <button className="primary-action-button compact" type="button" onClick={startReplacementDraft}>Start replacement draft</button> : null}
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
          {selectedChatId && olderCursor ? <div className="codex-inline-notice">
            {olderError ? <span role="status">{olderError}</span> : null}
            <button type="button" className="codex-text-action" onClick={() => void loadOlderHistory()} disabled={olderLoading}>{olderLoading ? "Loading earlier messages…" : "Load earlier messages"}</button>
          </div> : null}
          {displayedTurns.map((turn) => (
            <section className="codex-turn" key={turn.turnId} aria-label={`Turn ${turn.status}`}>
              <article className="codex-message codex-user-message">
                <div className="codex-message-label">You</div>
                <CodexMarkdown markdown={turn.userMessage.markdown} />
                {turn.userMessage.attachments?.length ? <AttachmentLinks files={turn.userMessage.attachments} /> : null}
              </article>
              <div className="codex-turn-items">
                {turn.items.map((item) => <ActivityItem item={item} key={item.id} />)}
                {turn.status === "in_progress" && !turn.items.some((item) => item.kind === "assistant_message") ? (
                  <div className="codex-thinking"><LoaderCircle className="spin" size={16} /> Pritha is working…</div>
                ) : null}
                <CopyResponse turn={turn} />
                {turn.error ? <div className="codex-inline-notice error">{turn.error.message}</div> : null}
              </div>
            </section>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        <div className="codex-composer-wrap">
          {pendingDelivery?.status === "delivery_unknown" ? (
            <div className="codex-inline-notice warning codex-delivery-unknown">
              {pendingNewChatDelivery
                ? "First-message delivery is unknown. The same idempotent create request will be reconciled before anything new is sent."
                : "Delivery is unknown. History will be checked first; Task Chat will never replay this turn automatically."}
              <button type="button" onClick={() => void retryUnknownDelivery()} disabled={recovering || sending || draft.trim() !== pendingDelivery.text}>
                {recovering ? "Checking…" : "Check and retry same message"}
              </button>
            </div>
          ) : null}
          {selectedChatId && !displayedDetail ? (
            <div className="codex-composer-status"><LoaderCircle className="spin" size={17} /><span>Opening thread controls…</span></div>
          ) : displayedDetail?.thread.archived ? (
            <div className="codex-continuation-gate"><p>This chat is archived. Restore it to continue.</p><button type="button" className="codex-text-action" onClick={() => void archiveChat(displayedDetail.thread)} disabled={archiveBusy}>Restore from archive</button></div>
          ) : displayedDetail?.thread.origin === "voice" && displayedDetail.continuationState !== "continuation_enabled" ? (
            <div className="codex-continuation-gate">
              <div><strong>{displayedDetail.continuationState === "blocked_active_turn" ? "Voice task is running" : "Voice task history is read-only"}</strong><p>{displayedDetail.continuationState === "blocked_active_turn" ? "Wait for the active Voice turn to finish before continuing here." : "Enable continuation only when you want to add a typed turn to this same task thread."}</p></div>
              <button className="codex-new-chat" type="button" onClick={() => void continueInTaskChat()} disabled={recovering || historyState !== "ready" || displayedDetail.continuationState !== "read_only"}>{recovering ? "Checking…" : historyBusy ? "Loading history…" : "Continue in Task Chat"}</button>
            </div>
          ) : <div className="codex-composer" role="group" aria-label="Message composer" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => {
            if (event.dataTransfer.files.length) { event.preventDefault(); if (!pendingDelivery && !sending) attachmentDraft.add(Array.from(event.dataTransfer.files)); }
          }}>
            <span id="codex-message-label">Message Pritha</span>
            <DraftAttachments items={attachmentDraft.items} locked={Boolean(pendingDelivery) || sending} remove={attachmentDraft.remove} retry={attachmentDraft.retry} />
            {attachmentDraft.notice ? <span role="status" className="codex-attachment-notice">{attachmentDraft.notice}</span> : null}
            {imageCapabilityMissing ? <span role="status" className="codex-attachment-notice">Image support for the selected model is unavailable or unverified. Choose an image-capable model before sending.</span> : null}
            <textarea
              aria-labelledby="codex-message-label"
              onPaste={event => {
                const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
                if (images.length) { event.preventDefault(); if (!pendingDelivery && !sending) attachmentDraft.add(images); }
              }}
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
              disabled={Boolean(pendingDelivery) || Boolean(selectedChatId && historyState !== "ready")}
            />
            <div className="codex-composer-actions">
              <small>
                {dictationSupported
                  ? "Enter to send · Dictation stays editable · browser speech may use an online service"
                  : "Enter to send · Browser dictation unavailable; use system dictation"}
              </small>
              <div className="codex-composer-controls">
                <input ref={filePickerRef} type="file" multiple hidden aria-label="Attach files" onChange={event => { attachmentDraft.add(Array.from(event.target.files || [])); event.target.value = ""; }} />
                <button type="button" className="codex-text-action" title="Up to 10 files; 100 MiB each, 250 MiB per message. Originals are processed on request." disabled={Boolean(pendingDelivery) || sending} onClick={() => filePickerRef.current?.click()}><Paperclip size={16} /> Attach files</button>
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
                <button className="codex-send" type="button" onClick={() => void sendMessage()} disabled={(!draft.trim() && !attachmentIds.length) || attachmentsIncomplete || imageCapabilityMissing || sending || hasActiveTurn || Boolean(pendingDelivery) || Boolean(pendingNewChatDelivery) || Boolean(selectedChatId && historyState !== "ready") || backendOffline || runtime?.availability !== "ready"}>
                  {sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Send
                </button>
              </div>
            </div>
            <small className="codex-attachment-limits">Up to 10 files · 100 MiB each · 250 MiB total</small>
          </div>}
        </div>
      </section>
    </div>
  );
}
