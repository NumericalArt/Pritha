"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { controlCenterRequest, ControlCenterRequestError } from "@/lib/control-center-request";
import type { TaskDeliveryRequest, TaskDeliveryView } from "@/lib/codex-chat/delivery-types";

const statusLabel: Record<string, string> = { created: "Создана", blocked: "Нужен контроль", verifying: "Проверяем", verified: "Проверено", awaiting_acceptance: "Ожидает приёмки", accepted: "Принято", failed: "Нужен разбор", abandoned: "Завершена без результата" };
export function DeliveryPanel({ chatId, active, editable }: { chatId: string; active: boolean; editable: boolean }) {
  const [runId, setRunId] = useState("");
  const [links, setLinks] = useState<Array<{ runId: string; status: string }>>([]);
  const [run, setRun] = useState<TaskDeliveryView | null>(null);
  const [pending, setPending] = useState<TaskDeliveryRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true), busyRef = useRef(false);
  const pendingRef = useRef<TaskDeliveryRequest | null>(null);
  const keepPending = useCallback((request: TaskDeliveryRequest | null) => { pendingRef.current = request; setPending(request); }, []);
  const url = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/delivery`;
  const remember = useCallback((value: TaskDeliveryView) => {
    setRun(value); setRunId(value.runId);
    const current = pendingRef.current;
    const matched = current && value.receipts.find(receipt => receipt.requestId === current.requestId);
    if (current && !matched) return; // the server may still be preparing this request
    keepPending(value.receipts.find(receipt => receipt.status === "started")?.request || null);
  }, [keepPending]);
  const refresh = useCallback(async (id: string, signal?: AbortSignal) => {
    try {
      const { data } = await controlCenterRequest<{ run: TaskDeliveryView }>(`${url}?runId=${encodeURIComponent(id)}`, { signal });
      if (!mounted.current || signal?.aborted) return;
      remember(data.run); setError("");
    } catch (cause) {
      if (mounted.current && !signal?.aborted) setError(cause instanceof ControlCenterRequestError ? cause.message : "Состояние сборки пока недоступно. Сохранённое действие можно проверить повторно.");
    }
  }, [remember, url]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void controlCenterRequest<{ runs: Array<{ runId: string; status: string }> }>(url, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted || !mounted.current) return;
      setLinks(data.runs);
      if (data.runs.length === 1) void refresh(data.runs[0].runId, controller.signal);
    }).catch(() => { /* Opening a chat must never depend on delivery discovery. */ });
    return () => controller.abort();
  }, [refresh, url]);
  useEffect(() => {
    if (!run || (!busy && !pending)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(run.runId, controller.signal), 3000);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [run, busy, pending, refresh]);

  async function act(action: TaskDeliveryRequest["action"]) {
    if (!run || busyRef.current || active || !editable) return;
    const request = pending || { requestId: crypto.randomUUID(), runId: run.runId, expectedRevision: run.revision, action };
    busyRef.current = true; setBusy(true); keepPending(request); setError("");
    try {
      const { data } = await controlCenterRequest<TaskDeliveryView>(url, {
        method: "POST", headers: { "Idempotency-Key": request.requestId }, body: JSON.stringify(request),
      }, { timeoutMs: 30_000 });
      if (mounted.current) { keepPending(null); remember(data); }
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof ControlCenterRequestError && ["delivery_changed", "delivery_task_mismatch", "delivery_binding_exists", "delivery_verify_unavailable", "delivery_not_verified", "idempotency_conflict"].includes(cause.code)) keepPending(null);
        setError("Подтверждение пока не получено. Обновите состояние или проверьте сохранённое действие; повтор запроса не запускает проверки заново.");
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const disabled = busy || active || !editable;
  const latest = run?.receipts.at(-1);
  return <details className="codex-goal-panel codex-delivery-panel">
    <summary><strong>Сборка агента</strong><span>{run ? `${run.agentName} · ${statusLabel[run.status] || run.status}` : links.length ? `Связанных сборок: ${links.length}` : "Связь с delivery run"}</span></summary>
    <div className="codex-goal-body">
      <p>Свяжите конкретную сборку с этой задачей, чтобы запустить одобренные проверки и подготовить передачу результата после лимита Goal.</p>
      {links.length > 1 ? <label>Связанные сборки<select value={run?.runId || ""} disabled={busy || Boolean(pending)} onChange={event => void refresh(event.target.value)}><option value="">Выберите сборку</option>{links.map(row => <option key={row.runId} value={row.runId}>{row.runId} · {statusLabel[row.status] || row.status}</option>)}</select></label> : null}
      <form onSubmit={event => { event.preventDefault(); if (runId.trim()) void refresh(runId.trim()); }}>
        <label>Идентификатор delivery run<input value={runId} onChange={event => setRunId(event.target.value)} disabled={busy || Boolean(pending)} autoComplete="off" spellCheck={false} /></label>
        <button className="outline-button compact" disabled={!runId.trim() || busy || Boolean(pending)} type="submit">Показать сборку</button>
      </form>
      {run ? <>
        <p><strong>{run.agentName}</strong> · {run.runId}<br />Outcome Spec: {run.specId}</p>
        <p>Проверка: {statusLabel[run.status] || run.status}. Приёмка: {run.acceptance === "accepted_by_user" ? "подтверждена пользователем" : "ещё не подтверждена"}.</p>
        <p>Подтверждённый расход сборочного исполнителя: {run.budget.tokensUsed.toLocaleString("ru-RU")} / {run.budget.maxTokens.toLocaleString("ru-RU")} токенов. {run.budget.usageStatus !== "complete" ? "Часть расхода ещё не установлена. " : ""}Goal задачи и расход внутри проверок учитываются отдельно.</p>
        <details><summary>Одобренный план проверок</summary>
          <p>Команды выполняются последовательно в рабочей копии этой сборки. До {run.plan.maxVerificationPasses} проходов, вывод каждой команды ограничен {run.plan.outputBytesCap.toLocaleString("ru-RU")} байтами. Backend: {run.plan.backend}.</p>
          <p>Команды могут использовать сеть, модели и другие побочные эффекты в пределах одобренного плана. Режим изоляции указан для каждой проверки.</p>
          <ul>{run.plan.commands.map(command => <li key={command.id}><strong>{command.id}</strong><pre>{JSON.stringify(command.argv)}</pre>Каталог: {command.cwd}; срок: {command.timeoutMs / 1000} с; изоляция: {command.isolation}.</li>)}</ul>
        </details>
        {run.bindingStatus === "unbound" ? <button className="outline-button compact" disabled={disabled || Boolean(pending)} onClick={() => void act("bind")}>Связать эту сборку с задачей</button>
          : run.bindingStatus === "other_task" ? <p>Сборка уже связана с другой задачей. Откройте исходную задачу для host actions.</p>
          : <div className="codex-goal-fields">
            <button className="outline-button compact" disabled={disabled || Boolean(pending) || !run.actions.verify} onClick={() => void act("verify")}>Запустить одобренные проверки</button>
            <button className="outline-button compact" disabled={disabled || Boolean(pending) || !run.actions.prepareHandoff} onClick={() => void act("prepare_handoff")}>Подготовить передачу результата</button>
          </div>}
        {pending ? <button className="outline-button compact" disabled={disabled} onClick={() => void act(pending.action)}>Проверить сохранённое действие</button> : null}
        {latest && latest.action !== "bind" ? <p role="status">{latest.status === "started" ? "Проверяем ход действия…" : latest.status === "interrupted" ? "Предыдущее действие прервалось. Проверьте состояние сборки перед новым запуском." : latest.status === "failed" ? "Действие требует разбора; прежние результаты сохранены." : latest.result?.handoff === "prepared_for_review" ? "Материалы передачи подготовлены для проверки. Приёмка, merge и deployment выполняются отдельно." : "Проверки завершились. Текущее состояние сборки показано выше."}</p> : null}
        {run.preparation ? <details><summary>Подготовленный сценарий демонстрации</summary><p>Подготовлено: {run.preparation.preparedAt}{run.preparation.head ? `; ревизия ${run.preparation.head.slice(0, 12)}` : ""}. Текущая ревизия повторно сверяется при подготовке передачи.</p><ol>{run.preparation.demo.map((step, index) => <li key={index}>{step}</li>)}</ol></details> : null}
        <button className="codex-text-action" onClick={() => void refresh(run.runId)}>Обновить состояние сборки</button>
      </> : null}
      {active ? <p>Host actions доступны после завершения активного шага и ожидающих подтверждений.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </details>;
}
