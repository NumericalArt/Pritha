"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { responseComplete, responseMarkdown } from "@/lib/codex-chat/copy-response";
import type { TurnView } from "@/lib/codex-chat/types";

export function CopyResponse({ turn }: { turn: TurnView }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const text = responseMarkdown(turn);
  if (!text) return null;
  return <div className="codex-copy-response">
    <button type="button" className="codex-text-action" disabled={!responseComplete(turn)} aria-label="Copy response" title="Copy response" onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setState("copied");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 2000);
      } catch { setState("error"); }
    }}>{state === "copied" ? <Check size={14} /> : <Copy size={14} />}{state === "copied" ? "Copied" : "Copy response"}</button>
    {state === "error" ? <span role="status">Clipboard access was denied. Select the response text to copy it.</span> : null}
  </div>;
}
