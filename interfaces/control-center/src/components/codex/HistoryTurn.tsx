"use client";
import { useEffect, useRef, useState } from "react";
import { controlCenterRequest } from "@/lib/control-center-request";
import type { ChatItemView, HistoryContentPage, HistoryItemsPage, MessageView, TurnView } from "@/lib/codex-chat/types";
import { CodexMarkdown } from "./CodexMarkdown";
import { AttachmentLinks } from "./ChatAttachments";

const requestOptions = { timeoutMs: 35_000, maxBodyBytes: 256 * 1024 };
function base(chatId: string) { return `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/history`; }
async function content(chatId: string, id: string, cursor: string, signal: AbortSignal) {
  return (await controlCenterRequest<HistoryContentPage>(`${base(chatId)}/items/${encodeURIComponent(id)}/content?cursor=${encodeURIComponent(cursor)}`, { signal }, requestOptions)).data;
}
async function fullContent(chatId: string, id: string, cursor: string, signal: AbortSignal) {
  let text = "", next: string | null = cursor;
  const seen = new Set<string>();
  while (next) {
    if (seen.has(next)) throw new Error("History returned a repeated position."); seen.add(next);
    const page = await content(chatId, id, next, signal);
    text += page.text; next = page.nextCursor;
    if (text.length > 64 * 1024 * 1024) throw new Error("This response is too large to copy in the browser.");
  }
  return text;
}
function HistoryText({ chatId, id, preview, contentRef, code = false }: { chatId: string; id: string; preview: string; contentRef?: string; code?: boolean }) {
  const [text, setText] = useState<string | null>(null), [cursor, setCursor] = useState<string | null>(contentRef || null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { controller.current?.abort(); setText(null); setCursor(contentRef || null); setError(null); setBusy(false); }, [contentRef]);
  async function more() {
    if (!cursor || busy) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setError(null);
    try {
      const page = await content(chatId, id, cursor, request.signal);
      if (!request.signal.aborted) { setText(old => (old || "") + page.text); setCursor(page.nextCursor); }
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Details could not load."); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  const shown = text ?? preview;
  return <div className="codex-history-text">
    {code ? <pre>{shown}</pre> : <CodexMarkdown markdown={shown} />}
    {cursor ? <button type="button" className="codex-text-action" disabled={busy} onClick={() => void more()}>{busy ? "Loading text…" : text == null ? "Read original text" : "Read more text"}</button> : null}
    {error ? <span role="status">{error} <button type="button" onClick={() => { setCursor(contentRef || null); setText(null); setError(null); }}>Reset detail position</button></span> : null}
  </div>;
}
function HistoryItem({ chatId, item }: { chatId: string; item: ChatItemView }) {
  const [open, setOpen] = useState(false);
  if (item.kind === "assistant_message") return <HistoryText chatId={chatId} id={item.id} preview={item.message.markdown} contentRef={item.message.contentRef} />;
  const label = item.kind === "command" ? `Command · ${item.status}` : item.kind === "file_change" ? "Files changed" : item.kind === "reasoning_summary" ? "Reasoning summary" : item.kind.replaceAll("_", " ");
  const preview = item.kind === "command" ? item.commandPreview : item.kind === "reasoning_summary" ? item.markdown : item.kind === "notice" ? item.text : item.kind === "tool" ? item.displayName : item.kind === "web_search" ? item.query : item.kind === "plan" ? item.steps.map(x => `${x.status}: ${x.label}`).join("\n") : item.kind === "file_change" ? item.changes.map(x => `${x.operation}: ${x.path}`).join("\n") : "";
  return <details className="codex-activity" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{label}</summary>
    {open ? <HistoryText chatId={chatId} id={item.id} preview={preview} contentRef={item.contentRef} code={item.kind === "command" || item.kind === "file_change"} /> : null}
  </details>;
}
export function HistoryTurn({ chatId, turn }: { chatId: string; turn: TurnView }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<ChatItemView[]>([]);
  const [cursor, setCursor] = useState<string | null>(turn.history?.itemsRef || null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [copyState, setCopyState] = useState("");
  const controller = useRef<AbortController | null>(null), copyController = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); copyController.current?.abort(); }, []);
  async function readItems(ref: string, signal: AbortSignal) {
    return (await controlCenterRequest<HistoryItemsPage>(`${base(chatId)}/turns/${encodeURIComponent(turn.turnId)}/items?cursor=${encodeURIComponent(ref)}`, { signal }, requestOptions)).data;
  }
  async function more(ref = cursor) {
    if (!ref || busy) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setError(null);
    try {
      const page = await readItems(ref, request.signal);
      if (!request.signal.aborted) {
        setItems(old => [...new Map([...old, ...page.data].map(item => [item.id, item])).values()]); setCursor(page.nextCursor);
      }
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Activity could not load."); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  async function copy() {
    if (copyState === "Copying…" || !turn.history) return;
    const request = new AbortController(); copyController.current = request; setCopyState("Copying…");
    try {
      const gather = async () => {
      let ref: string | null = turn.history!.itemsRef;
      const messages: string[] = [], seen = new Set<string>();
      while (ref) {
        if (seen.has(ref)) throw new Error("History returned a repeated position."); seen.add(ref);
        const page = await readItems(ref, request.signal);
        for (const item of page.data) if (item.kind === "assistant_message") messages.push(item.message.contentRef ? await fullContent(chatId, item.id, item.message.contentRef, request.signal) : item.message.markdown);
        ref = page.nextCursor;
      }
      if (request.signal.aborted) throw new Error("Copy cancelled.");
      return messages.join("\n\n");
      };
      const gathered = gather();
      void gathered.catch(() => undefined);
      // Start clipboard permission inside the user gesture (including Safari).
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": gathered.then(text => new Blob([text], { type: "text/plain" })) })]);
      } else await navigator.clipboard.writeText(await gathered);
      if (!request.signal.aborted) setCopyState("Copied");
    } catch (cause) { if (!request.signal.aborted) setCopyState(cause instanceof Error ? cause.message : "Copy failed. Retry to copy the complete response."); }
  }
  const message = (value: MessageView, id: string, label: string) => <article className={`codex-message ${label === "You" ? "codex-user-message" : "codex-assistant-message"}`}>
    <div className="codex-message-label">{label}</div>
    <HistoryText chatId={chatId} id={id} preview={value.markdown} contentRef={value.contentRef} />
    {value.attachments?.length ? <AttachmentLinks files={value.attachments} /> : null}
  </article>;
  return <section className="codex-turn" aria-label={`Turn ${turn.status}`}>
    {message(turn.userMessage, "user", "You")}
    {turn.items.filter(item => item.kind === "assistant_message").map(item => item.kind === "assistant_message" ? <div key={item.id}>{message(item.message, item.id, "Pritha")}</div> : null)}
    <details className="codex-activity" open={open} onToggle={event => { const next = event.currentTarget.open; setOpen(next); if (next && !items.length) void more(); }}>
      <summary>Activity · {turn.status.replaceAll("_", " ")}</summary>
      {open ? <div>
        {items.map(item => <HistoryItem key={item.id} chatId={chatId} item={item} />)}
        {error ? <p role="status">{error}</p> : null}
        {cursor ? <button type="button" className="codex-text-action" disabled={busy} onClick={() => void more()}>{busy ? "Loading activity…" : error ? "Retry activity" : "Load more activity"}</button> : null}
        {error ? <button type="button" onClick={() => void more(turn.history?.itemsRef)}>Refresh activity position</button> : null}
      </div> : null}
    </details>
    <button type="button" className="codex-text-action" aria-label="Copy response" disabled={!["completed", "failed", "interrupted"].includes(turn.status) || copyState === "Copying…"} onClick={() => void copy()}>{copyState === "Copying…" ? copyState : "Copy response"}</button>
    {copyState && copyState !== "Copying…" ? <span role="status">{copyState}</span> : null}
    {turn.error ? <p role="status">{turn.error.message}</p> : null}
  </section>;
}
