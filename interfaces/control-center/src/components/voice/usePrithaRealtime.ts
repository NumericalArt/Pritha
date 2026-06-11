"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RealtimePhase = "idle" | "connecting" | "listening" | "speaking" | "working" | "error";

export type VoiceTranscriptItem = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  timestamp: string;
};

export type PrithaRealtimeStatus = {
  ok: boolean;
  model: string;
  voice: string;
  transcription_model: string;
  tools: string[];
  openai_key_configured: boolean;
  memory: {
    sqlite: boolean;
    sqlite_cli: boolean;
    stats: unknown[];
  };
  codex: {
    mode: string;
    available: boolean;
    detail: string;
    write_enabled: boolean;
  };
  private_root: string;
};

type SessionErrorPayload = {
  error?: string;
  code?: string;
};

type RealtimeSessionPayload = {
  client_secret: { value: string };
  model: string;
  voice: string;
  tools: string[];
};

type RealtimeCallResponse = {
  answerSdp: string;
};

type RealtimeFunctionCallItem = {
  id?: string;
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  text?: string;
  item?: RealtimeFunctionCallItem;
  response?: {
    output?: RealtimeFunctionCallItem[];
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type ActiveCodexTask = {
  title: string;
  status: string;
  summary: string;
  progress: number;
  resultPath?: string;
  statusPath?: string;
  resultExcerpt?: string;
};

type CodexTaskSnapshot = {
  ok: boolean;
  task_id?: string;
  status?: string;
  complete?: boolean;
  result_available?: boolean;
  result_excerpt?: string;
  paths?: {
    status?: string;
    result?: string;
  };
  error?: string;
};

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function itemId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function usePrithaRealtime() {
  const [phase, setPhase] = useState<RealtimePhase>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PrithaRealtimeStatus | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscriptItem[]>([
    {
      id: "initial-ready",
      role: "assistant",
      text: "Ready. Start listening and talk to Pritha.",
      timestamp: "ready",
    },
  ]);
  const [toolStatus, setToolStatus] = useState<string>("No tool calls yet.");
  const [remoteAudioReady, setRemoteAudioReady] = useState(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveCodexTask | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const eventsChannelRef = useRef<RTCDataChannel | null>(null);
  const assistantDraftRef = useRef("");
  const responseInProgressRef = useRef(false);
  const responseQueuedRef = useRef(false);
  const processingToolBatchRef = useRef(false);
  const pendingToolCallsRef = useRef(new Map<string, RealtimeFunctionCallItem>());
  const handledToolCallsRef = useRef(new Set<string>());
  const codexTaskPollTimersRef = useRef(new Map<string, number>());
  const reportedCodexTaskResultsRef = useRef(new Set<string>());

  const addTranscript = useCallback((role: VoiceTranscriptItem["role"], text: string) => {
    const compact = text.replace(/\s+/g, " ").trim();
    if (!compact) return;
    setTranscript((items) => [
      ...items.slice(-40),
      {
        id: itemId(),
        role,
        text: compact,
        timestamp: nowTime(),
      },
    ]);
  }, []);

  const logClientEvent = useCallback((kind: string, payload: Record<string, unknown> = {}) => {
    void fetch("/api/realtime/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload }),
    }).catch(() => undefined);
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/realtime/status", { cache: "no-store" });
    const payload = (await response.json()) as PrithaRealtimeStatus;
    setStatus(payload);
    return payload;
  }, []);

  useEffect(() => {
    void loadStatus().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load realtime status");
    });
  }, [loadStatus]);

  const bindRemoteAudioElement = useCallback((element: HTMLAudioElement | null) => {
    remoteAudioRef.current = element;
  }, []);

  const closeConnection = useCallback(() => {
    if (localTrackRef.current) {
      localTrackRef.current.stop();
      localTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (eventsChannelRef.current) {
      eventsChannelRef.current.close();
      eventsChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    responseInProgressRef.current = false;
    responseQueuedRef.current = false;
    processingToolBatchRef.current = false;
    pendingToolCallsRef.current.clear();
    handledToolCallsRef.current.clear();
    reportedCodexTaskResultsRef.current.clear();
    assistantDraftRef.current = "";
    setRemoteAudioReady(false);
    setIsMuted(false);
  }, []);

  const requestResponse = useCallback((reason = "") => {
    const channel = eventsChannelRef.current;
    if (!channel || channel.readyState !== "open") return;
    if (responseInProgressRef.current || processingToolBatchRef.current) {
      responseQueuedRef.current = true;
      setToolStatus(`Response queued${reason ? `: ${reason}` : ""}`);
      return;
    }
    responseInProgressRef.current = true;
    channel.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const flushQueuedResponse = useCallback(() => {
    if (!responseQueuedRef.current || responseInProgressRef.current || processingToolBatchRef.current) return;
    responseQueuedRef.current = false;
    requestResponse("queued");
  }, [requestResponse]);

  const rememberToolCall = useCallback((item: RealtimeFunctionCallItem) => {
    if (!item.name || !item.call_id) return;
    const callKey = item.call_id || item.id || `${item.name}:${item.arguments || ""}`;
    if (handledToolCallsRef.current.has(callKey) || pendingToolCallsRef.current.has(callKey)) return;
    pendingToolCallsRef.current.set(callKey, item);
    setToolStatus(`Pending tool: ${item.name}`);
    setPhase("working");
  }, []);

  const clearCodexTaskPolling = useCallback((taskId?: string) => {
    if (taskId) {
      const timer = codexTaskPollTimersRef.current.get(taskId);
      if (timer !== undefined) {
        window.clearInterval(timer);
        codexTaskPollTimersRef.current.delete(taskId);
      }
      return;
    }

    for (const timer of codexTaskPollTimersRef.current.values()) {
      window.clearInterval(timer);
    }
    codexTaskPollTimersRef.current.clear();
  }, []);

  const applyCodexTaskSnapshot = useCallback(
    (snapshot: CodexTaskSnapshot) => {
      if (!snapshot.ok || !snapshot.task_id) {
        setToolStatus(JSON.stringify(snapshot, null, 2));
        return false;
      }

      const statusText = snapshot.status || "unknown";
      const terminal = Boolean(snapshot.complete);
      const failed = statusText.startsWith("failed");
      const resultText = snapshot.result_excerpt?.trim();
      const progress = terminal ? 100 : snapshot.result_available ? 75 : statusText === "running" ? 45 : 15;
      const summary = terminal
        ? resultText || (failed ? "Codex task failed. Open task logs for details." : "Codex task completed.")
        : snapshot.paths?.status
          ? `Codex task ${statusText}. Status: ${snapshot.paths.status}`
          : `Codex task ${statusText}.`;

      setActiveTask({
        title: snapshot.task_id,
        status: statusText,
        summary,
        progress,
        resultPath: snapshot.paths?.result,
        statusPath: snapshot.paths?.status,
        resultExcerpt: resultText,
      });
      setToolStatus(JSON.stringify(snapshot, null, 2));

      if (terminal) {
        addTranscript("tool", `Codex task ${statusText}: ${resultText ? resultText.slice(0, 900) : snapshot.task_id}`);
      }
      return terminal;
    },
    [addTranscript],
  );

  const startCodexTaskPolling = useCallback(
    (taskId: string) => {
      const safeTaskId = taskId.trim();
      if (!safeTaskId) return;
      clearCodexTaskPolling(safeTaskId);
      logClientEvent("codex_task_polling_started", { task_id: safeTaskId });
      let attempts = 0;
      let stopped = false;

      const stopPolling = () => {
        stopped = true;
        clearCodexTaskPolling(safeTaskId);
      };

      const poll = async () => {
        if (stopped) return;
        attempts += 1;
        const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(safeTaskId)}`, { cache: "no-store" });
        const snapshot = (await response.json().catch(() => ({ ok: false, error: "task status returned non-json" }))) as CodexTaskSnapshot;
        const terminal = applyCodexTaskSnapshot(snapshot);
        if (terminal && snapshot.task_id && !reportedCodexTaskResultsRef.current.has(snapshot.task_id)) {
          reportedCodexTaskResultsRef.current.add(snapshot.task_id);
          const channel = eventsChannelRef.current;
          const resultText = snapshot.result_excerpt?.trim();
          const channelState = channel?.readyState || "missing";
          const responseBusy = responseInProgressRef.current || processingToolBatchRef.current;
          logClientEvent("codex_task_terminal_snapshot", {
            task_id: snapshot.task_id,
            status: snapshot.status || "unknown",
            result_available: Boolean(resultText),
            result_chars: resultText?.length || 0,
            channel_state: channelState,
            response_busy: responseBusy,
          });
          if (channel?.readyState === "open" && resultText) {
            channel.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `Codex sidecar task ${snapshot.task_id} finished with status ${snapshot.status || "complete"}.\n\nResult:\n${resultText}`,
                    },
                  ],
                },
              }),
            );
            requestResponse("codex_task_complete");
            logClientEvent("codex_task_result_handoff_sent", {
              task_id: snapshot.task_id,
              status: snapshot.status || "unknown",
              result_chars: resultText.length,
              response_queued: responseBusy,
            });
          } else {
            logClientEvent("codex_task_result_handoff_skipped", {
              task_id: snapshot.task_id,
              status: snapshot.status || "unknown",
              reason: resultText ? `channel_${channelState}` : "empty_result",
              channel_state: channelState,
            });
          }
        }
        if (terminal || attempts >= 180) stopPolling();
      };

      const timer = window.setInterval(() => {
        void poll().catch((err) => {
          setToolStatus(err instanceof Error ? err.message : "Could not poll Codex task");
        });
      }, 4_000);
      codexTaskPollTimersRef.current.set(safeTaskId, timer);
      void poll().catch((err) => {
        setToolStatus(err instanceof Error ? err.message : "Could not poll Codex task");
      });
    },
    [applyCodexTaskSnapshot, clearCodexTaskPolling, logClientEvent, requestResponse],
  );

  const runToolCall = useCallback(
    async (item: RealtimeFunctionCallItem) => {
      let args: Record<string, unknown> = {};
      try {
        args = item.arguments ? (JSON.parse(item.arguments) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }

      const label = `${item.name || "tool"}(${JSON.stringify(args).slice(0, 180)})`;
      addTranscript("tool", `Tool call: ${label}`);
      setToolStatus(`Running ${item.name || "tool"}...`);

      const response = await fetch("/api/realtime/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, arguments: args }),
      });
      const output = (await response.json().catch(() => ({ ok: false, error: "tool returned non-json" }))) as Record<string, unknown>;
      setToolStatus(JSON.stringify(output, null, 2));

      if (item.name === "run_codex_task") {
        const taskId = typeof output.task_id === "string" ? output.task_id : "";
        setActiveTask({
          title: taskId || "Codex task",
          status: String(output.status || output.mode || "queued"),
          summary: String(output.operator_note || "Codex handoff created."),
          progress: output.status === "running" ? 35 : 10,
          resultPath: typeof output.result_path === "string" ? output.result_path : undefined,
          statusPath: typeof output.status_path === "string" ? output.status_path : undefined,
        });
        if (taskId) startCodexTaskPolling(taskId);
      }

      return output;
    },
    [addTranscript, startCodexTaskPolling],
  );

  const processPendingToolCalls = useCallback(async () => {
    const channel = eventsChannelRef.current;
    if (processingToolBatchRef.current || responseInProgressRef.current || !pendingToolCallsRef.current.size || !channel || channel.readyState !== "open") {
      return;
    }

    processingToolBatchRef.current = true;
    const batch = Array.from(pendingToolCallsRef.current.entries());
    pendingToolCallsRef.current.clear();
    let sentOutput = false;

    try {
      for (const [callKey, item] of batch) {
        if (handledToolCallsRef.current.has(callKey)) continue;
        handledToolCallsRef.current.add(callKey);
        const output = await runToolCall(item);
        if (channel.readyState === "open") {
          channel.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: item.call_id,
                output: JSON.stringify(output),
              },
            }),
          );
          sentOutput = true;
        }
      }
    } finally {
      processingToolBatchRef.current = false;
    }

    if (sentOutput) requestResponse("tool_outputs");
    else flushQueuedResponse();
  }, [flushQueuedResponse, requestResponse, runToolCall]);

  const markResponseDone = useCallback(
    (event: RealtimeEvent) => {
      responseInProgressRef.current = false;
      if (event.response && Array.isArray(event.response.output)) {
        for (const item of event.response.output) {
          if (item && item.type === "function_call") rememberToolCall(item);
        }
      }
      if (pendingToolCallsRef.current.size) void processPendingToolCalls();
      else {
        if (phase === "working") setPhase("listening");
        flushQueuedResponse();
      }
    },
    [flushQueuedResponse, phase, processPendingToolCalls, rememberToolCall],
  );

  const handleRealtimeEvent = useCallback(
    (raw: string) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(raw) as RealtimeEvent;
      } catch {
        return;
      }

      if (event.type === "response.created") responseInProgressRef.current = true;
      if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
        addTranscript("user", event.transcript);
      }
      if (event.type === "response.audio_transcript.delta" && event.delta) {
        assistantDraftRef.current += event.delta;
        setPhase("speaking");
      }
      if (event.type === "response.audio_transcript.done") {
        const text = event.transcript || assistantDraftRef.current;
        assistantDraftRef.current = "";
        if (text) addTranscript("assistant", text);
      }
      if (event.type === "response.output_text.delta" && event.delta) {
        assistantDraftRef.current += event.delta;
        setPhase("speaking");
      }
      if (event.type === "response.output_text.done") {
        const text = event.text || assistantDraftRef.current;
        assistantDraftRef.current = "";
        if (text) addTranscript("assistant", text);
      }
      if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
        rememberToolCall(event.item);
      }
      if (event.type === "response.done") {
        markResponseDone(event);
      }
      if (event.type === "error") {
        const code = event.error?.code;
        if (code === "conversation_already_has_active_response") {
          responseInProgressRef.current = true;
          responseQueuedRef.current = true;
          setToolStatus("Realtime response is active. Tool output response will retry after response.done.");
          return;
        }
        const message = event.error?.message || code || "Realtime error";
        setError(message);
        addTranscript("tool", message);
      }
    },
    [addTranscript, markResponseDone, rememberToolCall],
  );

  const start = useCallback(async () => {
    if (phase === "connecting") return;
    setError(null);
    setPhase("connecting");
    const t0 = performance.now();

    try {
      const sessionResponse = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!sessionResponse.ok) {
        const payload = (await sessionResponse.json().catch(() => ({}))) as SessionErrorPayload;
        throw new Error(payload.error || `Realtime session failed with status ${sessionResponse.status}`);
      }
      const sessionData = (await sessionResponse.json()) as RealtimeSessionPayload;
      setStatus((current) =>
        current
          ? { ...current, model: sessionData.model, voice: sessionData.voice, tools: sessionData.tools }
          : current,
      );

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("No local audio track available.");
      localTrackRef.current = track;

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;
      peerConnection.addTrack(track, stream);
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") setPhase("listening");
        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "disconnected") {
          setPhase("error");
          setError("Realtime connection lost. Reconnect to continue.");
        }
      };
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play();
          setRemoteAudioReady(true);
          setLastLatencyMs(Math.round(performance.now() - t0));
        }
      };

      const channel = peerConnection.createDataChannel("oai-events");
      eventsChannelRef.current = channel;
      channel.onopen = () => {
        setPhase("listening");
        setToolStatus("Realtime data channel connected. Tools: search_pritha_memory, run_codex_task.");
      };
      channel.onmessage = (event) => handleRealtimeEvent(String(event.data));
      channel.onclose = () => {
        if (phase !== "idle") setToolStatus("Realtime data channel closed.");
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const callResponse = await fetch("/api/realtime/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerSdp: offer.sdp || "",
          ephemeralKey: sessionData.client_secret.value,
        }),
      });
      if (!callResponse.ok) {
        const payload = (await callResponse.json().catch(() => ({}))) as SessionErrorPayload;
        throw new Error(payload.error || `Realtime call failed with status ${callResponse.status}`);
      }
      const callPayload = (await callResponse.json()) as RealtimeCallResponse;
      await peerConnection.setRemoteDescription({ type: "answer", sdp: callPayload.answerSdp });
    } catch (err) {
      closeConnection();
      setPhase("error");
      const message = err instanceof Error ? err.message : "Unknown realtime call error";
      setError(message);
      addTranscript("tool", message);
    }
  }, [addTranscript, closeConnection, handleRealtimeEvent, phase]);

  const stop = useCallback(() => {
    closeConnection();
    setPhase("idle");
  }, [closeConnection]);

  const toggleMute = useCallback(() => {
    if (!localTrackRef.current) return;
    const nextMuted = !isMuted;
    localTrackRef.current.enabled = !nextMuted;
    setIsMuted(nextMuted);
  }, [isMuted]);

  const sendTextMessage = useCallback(
    (text: string) => {
      const compact = text.trim();
      const channel = eventsChannelRef.current;
      if (!compact || !channel || channel.readyState !== "open") return false;

      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: compact }],
          },
        }),
      );
      addTranscript("user", compact);
      requestResponse("text_message");
      return true;
    },
    [addTranscript, requestResponse],
  );

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  useEffect(() => {
    return () => {
      clearCodexTaskPolling();
      closeConnection();
    };
  }, [clearCodexTaskPolling, closeConnection]);

  return {
    phase,
    isMuted,
    error,
    status,
    transcript,
    toolStatus,
    remoteAudioReady,
    lastLatencyMs,
    activeTask,
    bindRemoteAudioElement,
    loadStatus,
    start,
    stop,
    toggleMute,
    sendTextMessage,
    clearTranscript,
  };
}
