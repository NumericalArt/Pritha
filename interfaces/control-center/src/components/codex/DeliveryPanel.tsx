"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OperationDecisions } from "./OperationDecisions";
import { controlCenterRequest, ControlCenterRequestError } from "@/lib/control-center-request";
import type { DeliveryBudgetChange, TaskDeliveryRequest, TaskDeliveryView } from "@/lib/codex-chat/delivery-types";

const statusLabel: Record<string, string> = { created: "Created", preparing: "Preparation", building: "Building agent", correcting: "Ready to continue", paused: "Paused", blocked: "Needs attention", verifying: "Verifying", verified: "Verified", awaiting_acceptance: "Awaiting acceptance", accepted: "Accepted", failed: "Needs review", abandoned: "Ended without a result", cancelled: "Cancelled" };
type Explanation = NonNullable<TaskDeliveryView["explanation"]>;
function RunExplanation({run,showAcceptance=true}:{run:Explanation;showAcceptance?:boolean}) {
  return <div aria-label="Build status">
    {run.blockers.map(b=><div key={b.code}><strong>{b.title}</strong><p>{b.explanation}</p><p>{b.nextStep}</p><p>{b.question}</p>
      <ul>{b.options.map(o=><li key={o.id}>{o.label}: {o.effect}</li>)}</ul></div>)}
    {showAcceptance && ["verified","awaiting_acceptance","accepted"].includes(run.status)?<p>{run.acceptance==="accepted"?"The user accepted the result.":"Automated checks passed. Awaiting your acceptance."}</p>:null}
    <p>Build: {run.budget.tokensUsed} / {run.budget.maxTokens} tokens · {run.iteration} / {run.budget.maxIterations} attempts.</p>
    {run.budget.usageStatus!=="complete"?<p>Some usage is still unknown. Pritha must confirm usage from the previous call before another build.</p>:null}
    {run.budget.overrun>0?<p>The builder exceeded the agreed limit by {run.budget.overrun} tokens. Pritha retains the actual usage. Another build requires a separate budget decision.</p>:null}
  </div>;
}
export function FactoryProgress({view}:{view:NonNullable<import("@/lib/codex-chat/types").ThreadDetail["factoryControl"]>}) {
  if(!view.available)return <aside role="status">Build status could not be read. The existing task is preserved. Restore access to its state before continuing.</aside>;
  const d=view.delivery,b=view.workflowBudget;
  return <aside className="codex-factory-context" aria-label="Building agent"><strong>{view.milestone.label} · {view.slug}</strong><span>Builder: {view.builder.provider} / {view.builder.modelId}</span>
    {d?.blockers.length?null:<p role="status">{view.milestone.summary}</p>}{d?<RunExplanation run={d} showAcceptance={false}/>:null}
    {b?<details><summary>Preparation and build usage</summary><p>{b.observedTokens.toLocaleString('en-US')} of {b.maxTokens.toLocaleString('en-US')} tokens · active work {Math.ceil(b.activeMs/60000)} min.</p>
      <p>Preparation: {b.preparationTokens.toLocaleString('en-US')} · build: {b.buildTokens.toLocaleString('en-US')}. Waiting for approvals does not count as active time.</p>
      {!b.usageKnown?<p>Some usage is not yet confirmed. Additional reservation: {b.reservationTokens.toLocaleString('en-US')} tokens; earlier unknown usage is retained separately.</p>:null}
      {b.progressReview?<p>No progress has been confirmed for some time. Pritha needs to review the result and adjust the approach.</p>:null}</details>:null}
    {view.firstUse?<div><strong>Try the verified version</strong><p>{view.firstUse.disposition==='applied-local-project'?'Agent project folder: ':'Build directory: '}<code>{view.firstUse.directory}</code> · version <code>{view.firstUse.commit.slice(0,12)}</code>. {view.firstUse.disposition==='applied-local-project'?<a href="/agents">Launch from the agent card</a>:'The main project is updated separately.'}</p>
      {view.firstUse.commands.cli?<><pre>{view.firstUse.commands.cli}</pre><p>Observed: <code>{JSON.stringify(view.firstUse.observed.cli)}</code></p></>:null}
      <details><summary>Try over HTTP</summary><p>Start the server in the build directory. Run the request in a second terminal. Press Ctrl+C to stop.</p><pre>{view.firstUse.commands.server}</pre><pre>{view.firstUse.commands.http}</pre><p>Observed: <code>{JSON.stringify(view.firstUse.observed.http)}</code></p></details></div>:null}
    </aside>;
}
export function DeliveryPanel({ chatId, active, editable, refreshKey = 0, onSelectedRun, budgetResult }: { chatId: string; active: boolean; editable: boolean; refreshKey?: number; onSelectedRun?: (chatId: string, runId: string | null) => void; budgetResult?: TaskDeliveryView | null }) {
  const [runId, setRunId] = useState("");
  const [links, setLinks] = useState<Array<{ runId: string; status: string }>>([]);
  const [run, setRun] = useState<TaskDeliveryView | null>(null);
  const [pending, setPending] = useState<TaskDeliveryRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [budgetMode, setBudgetMode] = useState<"add" | "set">("add");
  const [tokens, setTokens] = useState("");
  const [extraIterations, setExtraIterations] = useState("");
  const [extraMinutes, setExtraMinutes] = useState("");
  const [resume, setResume] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true), busyRef = useRef(false);
  const pendingRef = useRef<TaskDeliveryRequest | null>(null);
  const keepPending = useCallback((request: TaskDeliveryRequest | null) => { pendingRef.current = request; setPending(request); }, []);
  const url = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/delivery`;
  const remember = useCallback((value: TaskDeliveryView) => {
    setRun(value); setRunId(value.runId);
    onSelectedRun?.(chatId, value.runId); // selection is explicit; the host separately verifies ownership
    const current = pendingRef.current;
    const matched = current && value.receipts.find(receipt => receipt.requestId === current.requestId);
    if (current && !matched) return; // the server may still be preparing this request
    keepPending(value.receipts.find(receipt => receipt.status === "started")?.request || null);
  }, [chatId, keepPending, onSelectedRun]);
  const refresh = useCallback(async (id: string, signal?: AbortSignal) => {
    try {
      const { data } = await controlCenterRequest<{ run: TaskDeliveryView }>(`${url}?runId=${encodeURIComponent(id)}`, { signal });
      if (!mounted.current || signal?.aborted) return;
      remember(data.run); setError("");
    } catch (cause) {
      if (mounted.current && !signal?.aborted) setError(cause instanceof ControlCenterRequestError ? cause.message : "Build status is currently unavailable. You can check the saved action again.");
    }
  }, [remember, url]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (budgetResult) remember(budgetResult); }, [budgetResult, remember]);
  useEffect(() => {
    const controller = new AbortController();
    void controlCenterRequest<{ runs: Array<{ runId: string; status: string }> }>(url, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted || !mounted.current) return;
      if (!data || !Array.isArray(data.runs) || data.runs.some(row => !row || typeof row.runId !== "string" || typeof row.status !== "string")) {
        throw new Error("invalid_delivery_discovery");
      }
      setLinks(data.runs);
      if (data.runs.length === 1) void refresh(data.runs[0].runId, controller.signal);
    }).catch(() => {
      if (!controller.signal.aborted && mounted.current) setError("The build list is currently unavailable. Chat remains available.");
    });
    return () => controller.abort();
  }, [refresh, url]);
  const loadedRunId = run?.runId;
  useEffect(() => {
    if (!loadedRunId) return;
    const controller = new AbortController();
    void refresh(loadedRunId, controller.signal);
    return () => controller.abort();
  }, [loadedRunId, refresh, refreshKey]);
  useEffect(() => {
    if (!run || (!busy && !pending)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(run.runId, controller.signal), 3000);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [run, busy, pending, refresh]);

  async function act(action: TaskDeliveryRequest["action"], budget?: DeliveryBudgetChange) {
    if (!run || busyRef.current || active || !editable || (!pending && runId.trim() !== run.runId)) return;
    const request = pending || { requestId: crypto.randomUUID(), runId: run.runId, expectedRevision: run.revision, action, ...(budget ? { budget } : {}) };
    busyRef.current = true; setBusy(true); keepPending(request); setError("");
    try {
      const { data } = await controlCenterRequest<TaskDeliveryView>(url, {
        method: "POST", headers: { "Idempotency-Key": request.requestId }, body: JSON.stringify(request),
      }, { timeoutMs: 30_000 });
      if (mounted.current) { keepPending(null); remember(data); }
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof ControlCenterRequestError && ["delivery_changed", "delivery_task_mismatch", "delivery_binding_exists", "delivery_verify_unavailable", "delivery_not_verified", "delivery_budget_invalid", "delivery_budget_complete", "delivery_usage_unknown", "idempotency_conflict"].includes(cause.code)) keepPending(null);
        setError("Confirmation has not arrived. Refresh the status or check the saved action; repeating the request will not rerun verification.");
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const disabled = busy || active || !editable || (!pending && runId.trim() !== run?.runId);
  const latest = run?.receipts.at(-1);
  return <details className="codex-goal-panel codex-delivery-panel">
    <summary><strong>Agent build</strong><span>{run ? `${run.agentName} · ${statusLabel[run.status] || run.status}` : links.length ? `Linked builds: ${links.length}` : "Link a delivery run"}</span></summary>
    <div className="codex-goal-body">
      <p>Link a specific build to this task to run approved checks and prepare a handoff after the task Goal reaches its limit.</p>
      {links.length > 1 ? <label>Linked builds<select value={run?.runId || ""} disabled={busy || Boolean(pending)} onChange={event => void refresh(event.target.value)}><option value="">Select a build</option>{links.map(row => <option key={row.runId} value={row.runId}>{row.runId} · {statusLabel[row.status] || row.status}</option>)}</select></label> : null}
      <form onSubmit={event => { event.preventDefault(); if (runId.trim()) void refresh(runId.trim()); }}>
        <label>Delivery run ID<input value={runId} onChange={event => { setRunId(event.target.value); onSelectedRun?.(chatId, event.target.value.trim() || null); }} disabled={busy || Boolean(pending)} autoComplete="off" spellCheck={false} /></label>
        <button className="outline-button compact" disabled={!runId.trim() || busy || Boolean(pending)} type="submit">Show build</button>
      </form>
      {run ? <>
        {run.explanation?<RunExplanation run={run.explanation}/>:null}
        <p><strong>{run.agentName}</strong> · {run.runId}<br />Outcome Spec: {run.specId}</p>
        <p>Verification: {statusLabel[run.status] || run.status}. Acceptance: {run.acceptance === "accepted_by_user" ? "confirmed by the user" : "not yet confirmed"}.</p>
        <p>Confirmed builder usage: {run.budget.tokensUsed.toLocaleString("en-US")} / {run.budget.maxTokens.toLocaleString("en-US")} tokens. {run.budget.usageStatus !== "complete" ? "Some usage is still unknown. " : ""}The task Goal and usage within verification are tracked separately.</p>
        <p>Build iterations: {run.budget.iterations} / {run.budget.maxIterations}. Time since the build started: {Math.floor(run.budget.elapsedMs / 60000)} / {Math.ceil(run.budget.maxElapsedMs / 60000)} min. When extending time after the previous deadline has passed, the additional time starts now.</p>
        {run.usage ? <details><summary>Usage by phase</summary>
          <p>Conversation: {run.usage.parent.observedTokens === null ? "usage is still unknown" : `observed ${run.usage.parent.observedTokens.toLocaleString("en-US")} tokens`}. This is the cumulative counter for the entire native task; it is not allocated across builds and may contain incomplete observations.</p>
          <p>Builder: {run.usage.build.tokensUsed.toLocaleString("en-US")} confirmed tokens; {run.usage.build.measuredTurns} recorded steps. {run.usage.build.coverage !== "complete" ? "Accounting is incomplete." : ""}</p>
          <p>Verification: {run.usage.trials.attempts} saved runs; model usage within commands is not measured. {run.usage.trials.unconfirmedTerminals ? `Completion of ${run.usage.trials.unconfirmedTerminals} runs is not yet confirmed.` : ""}</p>
          <p>The total across all phases is not yet known. Unknown usage and the overall task counter are not added to the build budget.</p>
        </details> : null}
        {run.bindingStatus === "bound" && run.actions.budget ? <form onSubmit={event => {
          event.preventDefault();
          const number = (value: string) => { const raw = value.replace(/\s/g, ""); return raw === "" ? 0 : /^\d+$/.test(raw) ? Number(raw) : NaN; };
          const amount = number(tokens), addIterations = number(extraIterations), addElapsedMs = number(extraMinutes) * 60000;
          if ([amount, addIterations, addElapsedMs].some(value => !Number.isSafeInteger(value) || value < 0) || (!amount && (budgetMode === "set" || (!addIterations && !addElapsedMs)))) {
            setError("Enter a positive whole-number budget change. Setting a total limit requires a token amount."); return;
          }
          void act("budget", { mode: budgetMode, tokens: amount, resume, ...(addIterations ? { addIterations } : {}), ...(addElapsedMs ? { addElapsedMs } : {}) });
        }}>
          <label>Build budget change<select value={budgetMode} disabled={disabled || Boolean(pending)} onChange={event => setBudgetMode(event.target.value as "add" | "set")}><option value="add">Add tokens</option><option value="set">Set total limit</option></select></label>
          <label>Build tokens<input inputMode="numeric" value={tokens} disabled={disabled || Boolean(pending)} onChange={event => setTokens(event.target.value)} /></label>
          <label>Add build iterations<input inputMode="numeric" value={extraIterations} disabled={disabled || Boolean(pending)} onChange={event => setExtraIterations(event.target.value)} /></label>
          <label>Add minutes<input inputMode="numeric" value={extraMinutes} disabled={disabled || Boolean(pending)} onChange={event => setExtraMinutes(event.target.value)} /></label>
          <label className="codex-goal-resume"><input type="checkbox" checked={resume} disabled={disabled || Boolean(pending)} onChange={event => setResume(event.target.checked)} />Continue building the agent after changing the budget</label>
          <button className="outline-button compact" disabled={disabled || Boolean(pending)}>Apply build budget</button>
        </form> : null}
        <details><summary>Approved verification plan</summary>
          <p>Commands run sequentially in this build workspace. Up to {run.plan.maxVerificationPasses} passes; output from each command is capped at {run.plan.outputBytesCap.toLocaleString("en-US")} bytes. Backend: {run.plan.backend}.</p>
          <p>Commands may use the network, models, and other side effects within the approved plan. The isolation mode is listed for each check.</p>
          <ul>{run.plan.commands.map(command => <li key={command.id}><strong>{command.id}</strong><pre>{JSON.stringify(command.argv)}</pre>Directory: {command.cwd}; timeout: {command.timeoutMs / 1000} s; isolation: {command.isolation}.</li>)}</ul>
        </details>
        {run.bindingStatus === "unbound" ? <button className="outline-button compact" disabled={disabled || Boolean(pending)} onClick={() => void act("bind")}>Link this build to the task</button>
          : run.bindingStatus === "other_task" ? <p>This build is already linked to another task. Open the original task to use host actions.</p>
          : <div className="codex-goal-fields">
            <button className="outline-button compact" disabled={disabled || Boolean(pending) || !run.actions.verify} onClick={() => void act("verify")}>Run approved checks</button>
            <button className="outline-button compact" disabled={disabled || Boolean(pending) || !run.actions.prepareHandoff} onClick={() => void act("prepare_handoff")}>Prepare handoff</button>
          </div>}
        {pending ? <button className="outline-button compact" disabled={disabled} onClick={() => void act(pending.action)}>Check saved action</button> : null}
        {latest && latest.action !== "bind" ? <p role="status">{latest.status === "started" ? "Checking action progress…" : latest.status === "interrupted" ? "The previous action was interrupted. Check build status before starting again." : latest.status === "failed" ? "The action needs review; previous results are preserved." : latest.action === "budget" ? `Build budget reconciled.${latest.request?.budget?.resume ? " Continuation requested; the current status is shown above." : " Continuation is available as a separate action."}` : latest.result?.handoff === "prepared_for_review" ? "Handoff materials are ready for review. Acceptance, merge, and deployment are separate actions." : "Checks finished. The current build status is shown above."}</p> : null}
        {run.bindingStatus === "bound" ? <OperationDecisions key={`${chatId}:${run.runId}`} chatId={chatId} runId={run.runId} disabled={disabled || Boolean(pending)} /> : null}
        {run.preparation ? <details><summary>Prepared demo scenario</summary><p>Prepared: {run.preparation.preparedAt}{run.preparation.head ? `; revision ${run.preparation.head.slice(0, 12)}` : ""}. The current revision is checked again when preparing the handoff.</p><ol>{run.preparation.demo.map((step, index) => <li key={index}>{step}</li>)}</ol></details> : null}
        <button className="codex-text-action" onClick={() => void refresh(run.runId)}>Refresh build status</button>
      </> : null}
      {active ? <p>Host actions are available after the active step and pending approvals are complete.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </details>;
}
