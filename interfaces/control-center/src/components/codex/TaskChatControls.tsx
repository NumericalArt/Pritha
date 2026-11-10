"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { controlCenterRequest as api, ControlCenterRequestError } from "@/lib/control-center-request";
import type { AttachmentView, PendingRequestView, RuntimeStatus, ThreadDetail } from "@/lib/codex-chat/types";

type Action = "steer" | "interrupt" | "queue";
type QueuedMessage = NonNullable<ThreadDetail["queued"]>[number];
export type TaskChatComposerHandle = { send: (action: Action) => Promise<void> };
type Props = {
  canSend: boolean; canEditDraft: boolean; chatId: string | null; detail: ThreadDetail | null;
  draft: string; attachments: string[]; settings?: RuntimeStatus["selected"];
  composerControlRef: Ref<TaskChatComposerHandle>;
  onSent: (chatId: string, text: string, attachments: string[]) => void;
  onRestore: (chatId: string, text: string, attachments: AttachmentView[]) => boolean;
  onDraftLockChange?: (chatId: string, locked: boolean) => void;
  refresh: (chatId: string) => Promise<unknown>;
};
type Snapshot = { id: string; body: Record<string, unknown>; text: string; attachments: string[] };
type EditRecovery = { chatId: string; request: QueuedMessage; requestId: string; cancelled: boolean };
const RECOVERY_KEY = "pritha.task-chat.control-drafts.v1";
function rejectedBeforeDelivery(error: unknown) {
  return error instanceof ControlCenterRequestError && ["control_turn_changed", "control_rejected", "control_unsupported", "invalid_request", "queue_target_ended", "chat_archived", "model_image_unsupported", "attachment_inaccessible", "runtime_identity_mismatch", "native_answer_invalid", "native_request_changed", "voice_question_changed", "budget_control_required"].includes(error.code);
}
export function TaskChatControls({canSend, canEditDraft, chatId, detail, draft, attachments, settings, composerControlRef, onSent, onRestore, onDraftLockChange, refresh}: Props) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});
  const pending = useRef<Record<string, Snapshot>>({});
  const editing = useRef<Record<string, EditRecovery>>({});
  const active = useRef(new Set<string>());
  const [, renderRecovery] = useState(0);
  const persist = () => {
    try {
      const value = JSON.stringify({ pending: pending.current, editing: editing.current });
      if (value.length < 2_000_000) sessionStorage.setItem(RECOVERY_KEY, value);
    } catch { /* If browser storage is disabled, receipts remain available in this page. */ }
    renderRecovery(value => value + 1);
  };
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECOVERY_KEY);
      const saved = raw && raw.length < 2_000_000 ? JSON.parse(raw) : null;
      if (saved && typeof saved === "object") {
        for (const [key, entry] of Object.entries(saved.pending || {}).slice(0, 64)) {
          const row = entry as Snapshot;
          if (/^chat_[A-Za-z0-9_-]+:(queue|steer|interrupt)$/.test(key) && typeof row?.id === "string" && typeof row.text === "string" && row.text.length <= 64_000 && Array.isArray(row.attachments) && row.attachments.length <= 10 && row.body && typeof row.body === "object") pending.current[key] = row;
        }
        for (const [key, entry] of Object.entries(saved.editing || {}).slice(0, 64)) {
          const row = entry as EditRecovery;
          if (typeof row?.chatId === "string" && row.request?.id === key && typeof row.request.text === "string" && row.request.text.length <= 64_000 && Number.isSafeInteger(row.request.revision) && typeof row.requestId === "string") editing.current[key] = row;
        }
        for (const key of Object.keys(pending.current)) if (!key.endsWith(":interrupt")) onDraftLockChange?.(key.slice(0, key.lastIndexOf(":")), true);
        renderRecovery(value => value + 1);
      }
    } catch { /* Invalid browser drafts cannot authorize a server action. */ }
  }, [onDraftLockChange]);
  const id = chatId || "";
  const valid = Boolean(chatId && detail && detail.thread.chatId === chatId);
  const locked = busy[id] === true;
  const notice = (text: string) => setNotices(rows => ({ ...rows, [id]: text }));
  const send = async (action: Action, retry = false) => {
    if (!valid || active.current.has(id)) return;
    const key = `${id}:${action}`, previous = pending.current[key];
    if (retry && !previous) return;
    if (!retry && ((action !== "interrupt" && !canSend) || (action === "steer" && (!detail?.controls?.steer || attachments.length > 0)) || (action === "interrupt" && !detail?.controls?.interrupt))) return;
    const text = draft.trim();
    if (!retry && action !== "interrupt" && !text && !attachments.length) return;
    if (previous && !retry) { notice("Check the saved request first. Your draft has been kept."); return; }
    const snapshot = previous || { id: crypto.randomUUID(), text, attachments: [...attachments], body: action === "queue"
      ? {input: [{type: "text", text}], attachments: [...attachments], settings: {modelId: settings?.modelId, effortId: settings?.effortId, serviceTierId: settings?.serviceTierId}}
      : {action, text, expectedTurnId: detail?.controls?.turnId} };
    pending.current[key] = snapshot;
    active.current.add(id); setBusy(rows => ({...rows, [id]: true})); persist();
    if (action !== "interrupt") onDraftLockChange?.(id, true);
    try {
      await api(`/api/codex-chat/v1/threads/${encodeURIComponent(id)}/${action === "queue" ? "queue" : "control"}`, {method: "POST", headers: {"Content-Type": "application/json", "Idempotency-Key": snapshot.id}, body: JSON.stringify({...snapshot.body, clientMessageId: snapshot.id})});
      delete pending.current[key]; persist();
      if (action !== "interrupt") onSent(id, snapshot.text, action === "queue" ? snapshot.attachments : []);
      notice(action === "queue" ? "Message queued. It will run after the preceding task finishes." : action === "interrupt" ? "Stop requested. Waiting for the exact turn to finish." : "Clarification submitted to this turn.");
      await refresh(id);
    } catch (error) {
      if (rejectedBeforeDelivery(error)) { delete pending.current[key]; persist(); }
      notice(error instanceof Error ? error.message : "Check this request before repeating it.");
    } finally {
      active.current.delete(id); setBusy(rows => ({...rows, [id]: false}));
      onDraftLockChange?.(id, Object.keys(pending.current).some(key => key.startsWith(`${id}:`) && !key.endsWith(":interrupt")));
    }
  };
  useImperativeHandle(composerControlRef, () => ({send}), [send]);
  const restore = (recovery: EditRecovery) => {
    if (!onRestore(recovery.chatId, recovery.request.text, recovery.request.attachments || [])) {
      notice("Your current draft was kept. Clear it to restore the cancelled message and its files."); return;
    }
    delete editing.current[recovery.request.id]; persist();
  };
  const cancel = async (request: QueuedMessage, edit = false, recovery?: EditRecovery) => {
    if (!valid || active.current.has(id)) return;
    if (edit && !recovery && (!canEditDraft || request.attachmentsUnavailable)) { notice("Clear the draft before editing a queued message. Its original files must still be available."); return; }
    const saved = recovery || {chatId: id, request, requestId: crypto.randomUUID(), cancelled: false};
    if (edit) { editing.current[request.id] = saved; persist(); }
    active.current.add(id); setBusy(rows => ({...rows, [id]: true}));
    try {
      await api(`/api/codex-chat/v1/threads/${encodeURIComponent(id)}/queue`, {method: "POST", headers: {"Content-Type": "application/json", "Idempotency-Key": saved.requestId}, body: JSON.stringify({action: "cancel", id: request.id, revision: request.revision})});
      if (edit) { saved.cancelled = true; editing.current[request.id] = saved; persist(); restore(saved); }
      await refresh(id);
    } catch (error) {
      if (edit && error instanceof ControlCenterRequestError && ["queue_already_dispatching", "queue_not_found", "execution_revision_conflict"].includes(error.code)) { delete editing.current[request.id]; persist(); }
      notice(error instanceof Error ? error.message : "Queued message could not be cancelled.");
    } finally { active.current.delete(id); setBusy(rows => ({...rows, [id]: false})); }
  };
  if (!valid || !detail) return null;
  return <section className="codex-task-controls" aria-label="Running task controls">
    {detail.voiceWorkflow && <VoiceQuestion key={`${id}:${detail.voiceWorkflow.questionId || "running"}`} chatId={id} workflow={detail.voiceWorkflow} refresh={() => refresh(id)} />}
    {detail.pendingRequests.map(request => <NativeQuestion key={request.requestId} chatId={id} request={request} refresh={() => refresh(id)} />)}
    {detail.queued?.map(request => <div className="codex-inline-notice info codex-queued-message" key={request.id}>
      <span>{request.state === "queued" ? "Queued" : request.state} · {request.text.slice(0,160)}{request.attachments?.length ? ` · ${request.attachments.length} file(s)` : ""}{request.reason ? ` · ${request.reason}` : ""}</span>
      {["queued", "blocked"].includes(request.state) && <>
        <button className="codex-text-action" type="button" disabled={locked || !canEditDraft || request.attachmentsUnavailable || Boolean(editing.current[request.id])} onClick={() => void cancel(request, true)}>Edit</button>
        <button className="codex-text-action" type="button" disabled={locked} onClick={() => void cancel(request)}>Cancel</button>
      </>}
    </div>)}
    {Object.entries(pending.current).filter(([key]) => key.startsWith(`${id}:`)).map(([key]) => <button key={key} className="codex-text-action" type="button" disabled={locked} onClick={() => void send(key.split(":").at(-1) as Action, true)}>Check and retry same {key.split(":").at(-1)} request</button>)}
    {Object.values(editing.current).filter(row => row.chatId === id).map(row => <div className="codex-inline-notice info" key={row.request.id}>
      <span>{row.cancelled ? "Cancelled message saved for editing" : "Edit cancellation needs confirmation"} · {row.request.text.slice(0,160)}</span>
      <button type="button" className="codex-text-action" disabled={locked || (row.cancelled && !canEditDraft)} onClick={() => row.cancelled ? restore(row) : void cancel(row.request, true, row)}>{row.cancelled ? "Restore to draft" : "Retry edit cancellation"}</button>
    </div>)}
    {notices[id] && <p className="codex-attachment-notice" role="status">{notices[id]}</p>}
  </section>;
}

function NativeQuestion({chatId,request,refresh}:{chatId:string;request:PendingRequestView;refresh:()=>Promise<unknown>}) {
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const key=useRef<string>("");
  const questions=Array.isArray(request.presentation.questions)?request.presentation.questions as Array<{id:string;question:string;isSecret?:boolean;options?:Array<{label:string}>}>:[];
  const submit=async(decision?:string)=>{
    key.current ||= crypto.randomUUID();setBusy(true);
    try {
      await api(`/api/codex-chat/v1/threads/${chatId}/requests`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key.current},body:JSON.stringify({requestId:request.requestId,revision:request.presentation.revision,clientMessageId:key.current,decision,...(request.kind==="user_input"?{answers:Object.fromEntries(questions.map(q=>[q.id,[answers[q.id] || ""]]))}:{})})});
      setNotice("Answer submitted.");await refresh();
    }catch(error){if(rejectedBeforeDelivery(error))key.current="";setNotice(error instanceof Error?error.message:"The answer is unconfirmed. Refresh this request.");}
    finally{setBusy(false);}
  };
  if(request.presentation.state==="channel_unavailable")return <div role="status" className="codex-inline-notice warning">Канал ответа недоступен. Обновите состояние задачи: сохранённое решение не будет выполнено повторно.</div>;
  const doc=request.presentation.approvalScope==="contract only"?"Contract":request.presentation.approvalScope==="outcome only"?"Outcome":null;
  const grant=request.presentation.budgetReview as {tokensUsed:number;iterationsUsed:number;additions:{tokens:number;iterations:number;elapsed_ms:number};proposedLimits:{tokens:number;iterations:number}}|undefined;
  const nextModel=request.presentation.proposedBuildModel;
  const spec=request.presentation.overview as {name?:string;mission?:string;criteria?:string;interfaces?:string[];scope?:string;budgetMode?:string;permissions?:string;secrets?:string;tokens?:number;iterations?:number;elapsedMs?:number;examples?:Array<{interface:string;input:unknown;expected:unknown}>}|undefined;
  return <fieldset className="codex-inline-notice warning" disabled={busy || request.presentation.state!=="pending"}>
    <legend>{doc==="Contract"?"1. Что создать и в каких пределах":doc==="Outcome"?"2. Как проверить результат":grant?"Увеличить лимит и продолжить сборку?":nextModel?"Сменить модель сборщика?":request.title}</legend>{!doc&&!grant&&!nextModel&&request.reason&&<p>{request.reason}</p>}
    {request.presentation.localApplication==='fast-forward-after-verification'?<p>После проверки поведения и безопасной остановки Прита перенесёт проверенную сборку в рабочую папку агента, чтобы он запускался из карточки. Если в папке есть ваши изменения, они сохранятся. Сервер останется остановлен; окончательная приёмка — отдельно.</p>:null}
    {grant?<p>Уже использовано: {grant.tokensUsed} токенов и {grant.iterationsUsed} попыток. Добавить: {grant.additions.tokens} токенов, {grant.additions.iterations} попыток{grant.additions.elapsed_ms?', время: '+Math.ceil(grant.additions.elapsed_ms/60000)+' мин':''}. Новые пределы: {grant.proposedLimits.tokens} токенов и {grant.proposedLimits.iterations} попыток. После одобрения продолжится эта же сборка.</p>:null}
    {typeof nextModel==='string'?<p>Сборщик: {String(request.presentation.previousBuildModel)} → {nextModel}. Режим: {String(request.presentation.proposedBuildEffort)}. Модель чата и лимиты сохраняются.</p>:null}
    {doc&&spec?<div><strong>{spec.name}</strong><p>{spec.mission || spec.criteria}</p>
      {doc==="Contract"?<><p>Интерфейсы: {spec.interfaces?.join(" + ")} · Каталог: {spec.scope}</p>
        <p>Сборщик: {String(request.presentation.buildProvider)} / {String(request.presentation.buildModel)}. Модель готового агента: {String(request.presentation.childModelId || "не требуется")}.</p>
        {request.presentation.automaticContinuation===true?<p>После отдельного одобрения Outcome фабрика проверит заготовку. Если продуктовый тест выявит исправимую ошибку, фабрика сама запустит сборщика в указанных пределах.</p>:null}
        <p>Права: {spec.permissions || "см. документ"}. Секреты: {spec.secrets || "см. документ"}.</p>
        <p>Лимиты сборки: {spec.tokens} токенов, {spec.iterations} попыток, {Math.ceil((spec.elapsedMs || 0)/60000)} мин.</p>{spec.budgetMode==="native-goal"?<p>Codex учитывает токены по завершении запроса: последний запрос может превысить лимит. Новая попытка сверх него не начнётся.</p>:null}</>:
        spec.examples?.map((e,i)=><p key={i}><strong>{e.interface.toUpperCase()}:</strong> <code>{JSON.stringify(e.input)} → {JSON.stringify(e.expected)}</code></p>)}
    </div>:null}
    {request.kind==="user_input"?questions.map(q=><label key={q.id}>{q.question}<input type={q.isSecret?"password":"text"} autoComplete="off" value={answers[q.id]||""} onChange={e=>setAnswers(rows=>({...rows,[q.id]:e.target.value}))} />{q.options?.map(option=><button className="codex-text-action" type="button" key={option.label} onClick={()=>setAnswers(rows=>({...rows,[q.id]:option.label}))}>{option.label}</button>)}</label>):doc?<details><summary>Полный документ и условия проверки</summary><pre>{JSON.stringify(request.presentation,null,2)}</pre></details>:<pre>{JSON.stringify(request.presentation,null,2)}</pre>}
    {request.kind==="user_input"?<button type="button" className="codex-text-action" disabled={questions.some(q=>!answers[q.id]?.trim())} onClick={()=>void submit()}>Submit answer</button>:<><button type="button" className="codex-text-action" onClick={()=>void submit("accept")}>Approve this request</button><button type="button" className="codex-text-action" onClick={()=>void submit("decline")}>Decline</button></>}
    {notice&&<p role="status">{notice}</p>}
  </fieldset>;
}

function VoiceQuestion({chatId,workflow,refresh}:{chatId:string;workflow:NonNullable<ThreadDetail["voiceWorkflow"]>;refresh:()=>Promise<unknown>}) {
  const [answer,setAnswer]=useState(""),[notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const requestIds=useRef<Record<string,string>>({});
  const act=async(action:"answer"|"stop")=>{
    const id=requestIds.current[action] ||= crypto.randomUUID();setBusy(true);
    try {
      await api(`/api/codex-chat/v1/threads/${chatId}/voice-control`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify({action,taskId:workflow.taskId,questionId:workflow.questionId,revision:workflow.revision,answer,clientMessageId:id})});
      setNotice(action==="stop"?"Stop requested for this Voice task. Waiting for execution to finish.":"Answer submitted for this question.");await refresh();
    }catch(error){if(rejectedBeforeDelivery(error))delete requestIds.current[action];setNotice(error instanceof Error?error.message:"The request is unconfirmed. Refresh the task.");}
    finally{setBusy(false);}
  };
  return <div className="codex-inline-notice info">
    <strong>Voice task · {workflow.state.replaceAll("_"," ")}</strong>
    {workflow.state==="waiting_for_operator"&&workflow.question&&<label>{workflow.question}<textarea aria-label="Answer Voice task question" value={answer} onChange={event=>setAnswer(event.target.value)} maxLength={4000}/><button type="button" className="codex-text-action" disabled={busy||!answer.trim()} onClick={()=>void act("answer")}>Answer this Voice task</button></label>}
    <button type="button" className="codex-text-action" disabled={busy} onClick={()=>void act("stop")}>Stop Voice task</button>
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
