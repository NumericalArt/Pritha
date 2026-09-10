"use client";
import { useEffect, useRef, useState } from "react";
import { CodexMarkdown } from "./CodexMarkdown";
import { readVisibleHistoryText } from "./history-text-request";

type Props = { chatId: string; id: string; preview: string; contentRef?: string; code?: boolean };
export function HistoryText(props: Props) {
  return <ProgressiveText key={`${props.chatId}:${props.id}:${props.contentRef || ""}`} {...props} />;
}
function ProgressiveText({ chatId, id, preview, contentRef, code = false }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(contentRef || null);
  const [nearEnd, setNearEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLSpanElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!cursor || error || !end.current) return;
    const marker = end.current;
    // One observer turn per cursor prevents a still-visible old marker from
    // eagerly draining an entire large message after its height changes.
    const observer = new IntersectionObserver(entries => {
      setNearEnd(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: "80px 0px", threshold: 0 });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [cursor, error]);
  useEffect(() => {
    if (!nearEnd || !cursor || error || request.current) return;
    if (seen.current.has(cursor)) { setError("This text returned a repeated history position."); return; }
    const controller = new AbortController();
    request.current = controller;
    setNearEnd(false); setBusy(true);
    void readVisibleHistoryText(chatId, id, cursor, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      seen.current.add(cursor);
      setText(current => (current ?? "") + page.text);
      setCursor(page.nextCursor);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Text could not load.");
    }).finally(() => {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    });
  }, [chatId, id, cursor, nearEnd, error]);
  const shown = text ?? preview;
  return <div className="codex-history-text" aria-busy={busy}>
    {code ? <pre>{shown}</pre> : <CodexMarkdown markdown={shown} />}
    {cursor ? <span ref={end} aria-hidden="true" style={{ display: "block", height: 1 }} /> : null}
    {busy ? <span role="status">Loading text…</span> : null}
    {error ? <span role="status">{error} <button type="button" className="codex-text-action" onClick={() => setError(null)}>Retry loading text</button></span> : null}
  </div>;
}
