"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { controlCenterRequest, ControlCenterRequestError } from "@/lib/control-center-request";
import type { GoalBudgetRequest, ThreadGoalView } from "@/lib/codex-chat/types";

const labels: Record<string, string> = { active: "В работе", paused: "Пауза", blocked: "Нужен контроль", budgetLimited: "Нужно продлить бюджет", usageLimited: "Лимит аккаунта", complete: "Готово" };
function number(value: number | null) { return value === null ? "не задан" : value.toLocaleString("ru-RU"); }
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
        if (pendingRef.current && !data.pendingRequest) setNotice("Изменение сверено с текущим Goal.");
        keepPending(data.pendingRequest);
      }
      setError("");
    } catch {
      if (!signal?.aborted && mounted.current) setError("Бюджет пока недоступен. История и прогресс задачи сохранены.");
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
    if (!pendingRef.current && parsed === null) { setError("Введите положительное целое число токенов."); return; }
    const request = pendingRef.current || { requestId: crypto.randomUUID(), expectedRevision: goal.revision, mode, tokens: parsed!, resume };
    keepPending(request); busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const { data } = await controlCenterRequest<ThreadGoalView>(url, { method: "POST", body: JSON.stringify(request) });
      if (!mounted.current) return;
      setGoal(data); keepPending(data.pendingRequest); setTokens("");
      setNotice(data.status === "active" ? "Бюджет подтверждён. Goal активен в этой же задаче." : "Бюджет подтверждён. Текущее состояние Goal показано выше.");
    } catch (cause) {
      if (!mounted.current) return;
      const known = cause instanceof ControlCenterRequestError;
      if (known && ["goal_budget_invalid", "goal_changed", "idempotency_conflict", "goal_missing", "goal_complete", "account_usage_limited"].includes(cause.code)) {
        keepPending(null);
        setError(cause.message);
      } else setError("Подтверждение не получено. Проверьте это же изменение — бюджет не будет добавлен повторно.");
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };

  if (goal?.availability === "none") return null;
  const visible = goal?.availability === "available";
  const disabled = !visible || !editable || active || busy || goal.status === "complete";
  const needsControl = ["budgetLimited", "paused", "blocked", "usageLimited"].includes(goal?.status || "");
  return <details className="codex-goal-panel" open={needsControl || Boolean(pending) || undefined}>
    <summary><strong>Бюджет этой задачи</strong><span>{visible ? `${number(goal.tokensUsed)} / ${number(goal.tokenBudget)} · ${labels[goal.status || ""] || goal.status}` : goal?.availability === "unsupported" ? "Goal недоступен в этом runtime" : "Проверяем Goal…"}</span></summary>
    <div className="codex-goal-body">
      {visible ? <>
        <p className="codex-goal-objective">{goal.objective}</p>
        <p>Это лимит Goal текущей задачи. Бюджет создания агента и лимиты аккаунта учитываются отдельно.</p>
        {goal.status === "usageLimited" ? <p role="status">Достигнут лимит аккаунта. Продолжение доступно после восстановления квоты; новый бюджет Goal не меняет квоту.</p> : null}
        {active ? <p role="status">Изменение бюджета доступно после завершения текущего шага и ожидающих подтверждений.</p> : null}
        <form onSubmit={event => void submit(event)}>
          <div className="codex-goal-fields">
            <label>Изменение<select value={mode} disabled={disabled || Boolean(pending)} onChange={event => setMode(event.target.value as "add" | "set")}><option value="add">Добавить токены</option><option value="set">Задать общий лимит</option></select></label>
            <label>Токены<input inputMode="numeric" value={tokens} placeholder="Например, 50 000" disabled={disabled || Boolean(pending)} onChange={event => { setTokens(event.target.value); setError(""); }} /></label>
          </div>
          <label className="codex-goal-resume"><input type="checkbox" checked={resume} disabled={disabled || Boolean(pending)} onChange={event => setResume(event.target.checked)} />Продолжить этот Goal после изменения лимита</label>
          <button className="outline-button compact" type="submit" disabled={disabled || (goal.status === "usageLimited" && resume)}>{busy ? "Проверяем…" : pending ? "Проверить изменение" : "Применить бюджет"}</button>
        </form>
      </> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="codex-text-action" type="button" disabled={busy} onClick={() => void refresh()}>Обновить состояние</button>
    </div>
  </details>;
}
