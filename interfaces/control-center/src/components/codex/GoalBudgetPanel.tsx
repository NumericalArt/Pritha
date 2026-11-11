"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { controlCenterRequest, ControlCenterRequestError } from "@/lib/control-center-request";
import type { GoalBudgetRequest, ThreadGoalView } from "@/lib/codex-chat/types";

const labels: Record<string, string> = { active: "Active", paused: "Paused", blocked: "Needs attention", budgetLimited: "Budget extension needed", usageLimited: "Account limit", complete: "Complete" };
function number(value: number | null) { return value === null ? "not set" : value.toLocaleString("en-US"); }
function amount(value: string) {
  const compact = value.replace(/\s/g, "");
  const parsed = /^\d+$/.test(compact) ? Number(compact) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function GoalBudgetPanel({ chatId, active, editable, refreshKey }: { chatId: string; active: boolean; editable: boolean; refreshKey: number }) {
  const [goal, setGoal] = useState<ThreadGoalView | null>(null);
  const [mode, setMode] = useState<"add" | "set">("add");
  const [tokens, setTokens] = useState("");
  const [resume, setResume] = useState(true);
  const [pending, setPending] = useState<GoalBudgetRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const pendingRef = useRef<GoalBudgetRequest | null>(null);
  const mounted = useRef(true);
  const url = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/goal`;
  const keepPending = useCallback((request: GoalBudgetRequest | null) => {
    pendingRef.current = request; setPending(request);
    if (request) { setMode(request.mode); setTokens(String(request.tokens)); setResume(request.resume); }
  }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await controlCenterRequest<ThreadGoalView>(url, { signal });
      if (signal?.aborted || !mounted.current) return;
      setGoal(data);
      if (!busyRef.current) {
        if (pendingRef.current && !data.pendingRequest) setNotice("The change has been reconciled with the current Goal.");
        keepPending(data.pendingRequest);
      }
      setError("");
    } catch {
      if (!signal?.aborted && mounted.current) setError("The budget is currently unavailable. Task history and progress are preserved.");
    }
  }, [keepPending, url]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), active ? 500 : 100);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [active, refresh, refreshKey]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current || !goal?.revision || !editable || active) return;
    const parsed = amount(tokens);
    if (!pendingRef.current && parsed === null) { setError("Enter a positive whole number of tokens."); return; }
    const request = pendingRef.current || { requestId: crypto.randomUUID(), expectedRevision: goal.revision, mode, tokens: parsed!, resume };
    keepPending(request); busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const { data } = await controlCenterRequest<ThreadGoalView>(url, { method: "POST", body: JSON.stringify(request) });
      if (!mounted.current) return;
      setGoal(data); keepPending(data.pendingRequest); setTokens("");
      setNotice(data.status === "active" ? "Budget confirmed. The Goal is active in this task." : "Budget confirmed. The current Goal status is shown above.");
    } catch (cause) {
      if (!mounted.current) return;
      const known = cause instanceof ControlCenterRequestError;
      if (known && ["goal_budget_invalid", "goal_changed", "idempotency_conflict", "goal_missing", "goal_complete", "account_usage_limited"].includes(cause.code)) {
        keepPending(null);
        setError(cause.message);
      } else setError("Confirmation has not arrived. Check the same change; the budget will not be added twice.");
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };

  const exhausted = goal?.availability === "available" && goal.status !== "complete" &&
    (goal.status === "budgetLimited" || (goal.tokenBudget !== null && goal.tokensUsed !== null && goal.tokensUsed >= goal.tokenBudget));
  // Keep an unconfirmed budget change reachable until its receipt is reconciled.
  if (!exhausted && !pending) return null;
  const visible = goal?.availability === "available";
  const disabled = !visible || !editable || active || busy || goal.status === "complete";
  return <details className="codex-goal-panel codex-goal-warning">
    <summary><AlertTriangle size={16} aria-hidden="true" /><strong>Task budget</strong><span>{pending ? "Checking budget change · " : "Budget exhausted · "}</span><span>{visible ? `${number(goal.tokensUsed)} / ${number(goal.tokenBudget)} · ${labels[goal.status || ""] || goal.status}` : goal?.availability === "unsupported" ? "Goal is unavailable in this runtime" : "Checking Goal…"}</span></summary>
    <div className="codex-goal-body">
      {visible ? <>
        <p className="codex-goal-objective">{goal.objective}</p>
        <p>This is the Goal limit for the current task. The agent build budget and account limits are tracked separately.</p>
        {goal.status === "usageLimited" ? <p role="status">The account limit has been reached. Work can continue when the quota is restored; a new Goal budget does not change the quota.</p> : null}
        {active ? <p role="status">Budget changes are available after the current step and pending approvals are complete.</p> : null}
        <form onSubmit={event => void submit(event)}>
          <div className="codex-goal-fields">
            <label>Change<select value={mode} disabled={disabled || Boolean(pending)} onChange={event => setMode(event.target.value as "add" | "set")}><option value="add">Add tokens</option><option value="set">Set total limit</option></select></label>
            <label>Tokens<input inputMode="numeric" value={tokens} placeholder="For example, 50000" disabled={disabled || Boolean(pending)} onChange={event => { setTokens(event.target.value); setError(""); }} /></label>
          </div>
          <label className="codex-goal-resume"><input type="checkbox" checked={resume} disabled={disabled || Boolean(pending)} onChange={event => setResume(event.target.checked)} />Continue this Goal after changing the limit</label>
          <button className="outline-button compact" type="submit" disabled={disabled || (goal.status === "usageLimited" && resume)}>{busy ? "Checking…" : pending ? "Check change" : "Apply budget"}</button>
        </form>
      </> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="codex-text-action" type="button" disabled={busy} onClick={() => void refresh()}>Refresh status</button>
    </div>
  </details>;
}
