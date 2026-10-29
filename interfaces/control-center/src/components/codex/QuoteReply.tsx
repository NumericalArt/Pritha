"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Selection = { source: HTMLElement; text: string };
const Context = createContext<{ selected: Selection | null; reply: (source: HTMLElement | null) => void }>({ selected: null, reply: () => {} });

export function QuoteReplyProvider({ chatId, enabled, onQuote, children }: { chatId: string | null; enabled: boolean; onQuote: (text: string) => void; children: ReactNode }) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = useRef(chatId);
  // Render-time identity guard prevents even a pre-effect click quoting another chat.
  const current = owner.current === chatId ? selected : null;
  useEffect(() => { owner.current = chatId; setSelected(null); setError(null); }, [chatId]);
  useEffect(() => {
    const read = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const element = (node: Node) => node instanceof Element ? node : node.parentElement;
      const start = element(range.startContainer)?.closest<HTMLElement>("[data-quote-body]");
      const end = element(range.endContainer)?.closest<HTMLElement>("[data-quote-body]");
      const startText = element(range.startContainer)?.closest(".codex-markdown"), endText = element(range.endContainer)?.closest(".codex-markdown");
      if (!start || start !== end || !startText || startText !== endText || start.dataset.quoteChat !== chatId || !selection.toString().trim()) { setSelected(null); return; }
      setSelected({ source: start, text: selection.toString() }); setError(null);
    };
    const clear = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-quote-button]")) setSelected(null);
    };
    document.addEventListener("selectionchange", read);
    document.addEventListener("pointerdown", clear);
    return () => { document.removeEventListener("selectionchange", read); document.removeEventListener("pointerdown", clear); };
  }, [chatId]);
  function reply(source: HTMLElement | null) {
    if (!enabled || !current || source !== current.source || !source?.isConnected || source.dataset.quoteChat !== chatId) return;
    try { onQuote(current.text); setSelected(null); setError(null); window.getSelection()?.removeAllRanges(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The quote could not be added. Your draft was kept."); }
  }
  return <Context.Provider value={{ selected: enabled ? current : null, reply }}>{children}{error ? <p className="codex-quote-error" role="status">{error}</p> : null}</Context.Provider>;
}

export function QuoteAnswer({ chatId, eligible, children }: { chatId: string; eligible: boolean; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const { selected, reply } = useContext(Context);
  return <><div ref={body} {...(eligible ? { "data-quote-body": "", "data-quote-chat": chatId } : {})}>{children}</div>{eligible ? <button type="button" data-quote-button className="codex-text-action codex-quote-button" disabled={!selected || selected.source !== body.current} onMouseDown={event => event.preventDefault()} onClick={() => reply(body.current)}>Цитировать</button> : null}</>;
}
