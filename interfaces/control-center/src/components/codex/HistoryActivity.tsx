"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { controlCenterRequest } from "@/lib/control-center-request";
import type { ChatItemView, HistoryItemsPage, TurnView } from "@/lib/codex-chat/types";
import { ActivityFeed } from "./ActivityFeed";
import { HistoryText } from "./HistoryText";
import { inReadPool } from "./history-text-request";

function HistoryAction({ chatId, item }: { chatId: string; item: ChatItemView }) {
  const [open, setOpen] = useState(false);
  const label = item.kind === "command" ? `Command · ${item.status}` : item.kind === "file_change" ? "Files changed" : item.kind === "reasoning_summary" ? "Reasoning summary" : item.kind.replaceAll("_", " ");
  const preview = item.kind === "command" ? item.commandPreview : item.kind === "reasoning_summary" ? item.markdown : item.kind === "notice" ? item.text : item.kind === "tool" ? item.displayName : item.kind === "web_search" ? item.query : item.kind === "plan" ? item.steps.map(x => `${x.status}: ${x.label}`).join("\n") : item.kind === "file_change" ? item.changes.map(x => `${x.operation}: ${x.path}`).join("\n") : "";
  return <div className="codex-history-action">
    <div className="codex-history-action-label">{label}</div>
    {preview ? <div className="codex-activity-preview">{preview}</div> : null}
    {item.contentRef ? <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Details</summary>
      {open ? <HistoryText chatId={chatId} id={item.id} preview={preview} contentRef={item.contentRef} code={item.kind === "command" || item.kind === "file_change"} /> : null}
    </details> : null}
  </div>;
}

export function HistoryActivity({ chatId, turn, reference }: { chatId: string; turn: TurnView; reference: string | null }) {
  const anchor = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null), expanded = useRef(false);
  const followBottom = useRef<Element | null>(null);
  const [visible, setVisible] = useState(false), [items, setItems] = useState<ChatItemView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const read = async (ref: string, earlier = false) => {
    const transcript = anchor.current?.closest(".codex-transcript");
    const initialTop = transcript?.scrollTop || 0;
    const wasAtBottom = Boolean(transcript && transcript.scrollHeight - initialTop - transcript.clientHeight < 80);
    controller.current?.abort();
    const request = new AbortController(); controller.current = request; setBusy(true); setError(null);
    try {
      const page = await inReadPool(request.signal, async () => (await controlCenterRequest<HistoryItemsPage>(
        `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/history/turns/${encodeURIComponent(turn.turnId)}/items?cursor=${encodeURIComponent(ref)}&view=activity`,
        { signal: request.signal }, { timeoutMs: 35_000, maxBodyBytes: 256 * 1024 },
      )).data);
      if (request.signal.aborted) return;
      if (page.nextCursor === ref) throw new Error("Activity returned a repeated position.");
      if (!earlier && !expanded.current && transcript && transcript.scrollTop >= initialTop &&
        (wasAtBottom || transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 80)) followBottom.current = transcript;
      const chronological = page.data.filter(item => item.kind !== "assistant_message" && String(item.kind) !== "user_message").reverse();
      setItems(old => [...new Map((earlier ? [...chronological, ...old] : expanded.current ? [...old, ...chronological] : chronological).map(item => [item.id, item])).values()]);
      setCursor(page.nextCursor);
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Activity could not load."); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  useLayoutEffect(() => {
    const transcript = followBottom.current;
    if (transcript) { transcript.scrollTop = transcript.scrollHeight; followBottom.current = null; }
  }, [items]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: "100px" });
    if (anchor.current) observer.observe(anchor.current);
    return () => { observer.disconnect(); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (visible && reference) void read(reference);
    return () => controller.current?.abort();
    // Turn updates refresh the visible tail; expanded older actions stay available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reference, turn]);
  return <div ref={anchor} className="codex-history-activity">
    <ActivityFeed status={turn.status} items={items} hasEarlier={Boolean(cursor)} busy={busy} error={error}
      renderItem={item => <HistoryAction chatId={chatId} item={item} />}
      onEarlier={() => { if (cursor) { expanded.current = true; void read(cursor, true); } }}
      onRetry={() => { expanded.current = false; if (reference) void read(reference); }} />
  </div>;
}
