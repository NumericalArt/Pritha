"use client";
import { useRef, useState } from "react";
import { controlCenterRequest as api, ControlCenterRequestError } from "@/lib/control-center-request";
import type { PendingRequestView, RuntimeStatus, ThreadDetail } from "@/lib/codex-chat/types";

type Props={canSend:boolean;chatId:string|null;detail:ThreadDetail|null;draft:string;attachments:string[];settings?:RuntimeStatus["selected"];onSent:(chatId:string,text:string,attachments:string[])=>void;refresh:(chatId:string)=>Promise<unknown>};
type Snapshot={id:string;body:Record<string,unknown>;text:string;attachments:string[]};
function rejectedBeforeDelivery(error:unknown) {
  return error instanceof ControlCenterRequestError && ["control_turn_changed","control_rejected","control_unsupported","invalid_request","queue_target_ended","chat_archived","model_image_unsupported","attachment_inaccessible","runtime_identity_mismatch","native_answer_invalid","native_request_changed","voice_question_changed"].includes(error.code);
}
export function TaskChatControls({canSend,chatId,detail,draft,attachments,settings,onSent,refresh}:Props) {
  const [busy,setBusy]=useState<Record<string,boolean>>({});
  const [notices,setNotices]=useState<Record<string,string>>({});
  const pending=useRef<Record<string,Snapshot>>({});
  if(!chatId || !detail || detail.thread.chatId!==chatId)return null;
  const id=chatId;
  const locked=busy[id]===true;
  const running=detail.thread.status === "active" || Boolean(detail.activeTurnId) || Boolean(detail.controls);
  const send=async(action:"steer"|"interrupt"|"queue")=>{
    const key=`${id}:${action}`, previous=pending.current[key];
    const text=draft.trim();
    if(previous && action!=="interrupt" && previous.text!==text){setNotices(rows=>({...rows,[id]:"Check the earlier request before changing its contents. Your new draft has been kept."}));return;}
    const snapshot=previous || {id:crypto.randomUUID(),text,attachments:[...attachments],body:action==="queue" ? {input:[{type:"text",text}],attachments:[...attachments],settings:{modelId:settings?.modelId,effortId:settings?.effortId,serviceTierId:settings?.serviceTierId}} : {action,text,expectedTurnId:detail.controls?.turnId}};
    pending.current[key]=snapshot;
    setBusy(rows=>({...rows,[id]:true}));
    try {
      await api(`/api/codex-chat/v1/threads/${encodeURIComponent(id)}/${action==="queue"?"queue":"control"}`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":snapshot.id},body:JSON.stringify({...snapshot.body,clientMessageId:snapshot.id})});
      delete pending.current[key];
      if(action!=="interrupt")onSent(id,snapshot.text,action==="queue"?snapshot.attachments:[]);
      setNotices(rows=>({...rows,[id]:action==="queue"?"Message queued. It will run after the preceding task finishes.":action==="interrupt"?"Stop requested. Waiting for the exact turn to finish.":"Clarification submitted to this turn."}));
      await refresh(id);
    } catch(error){if(rejectedBeforeDelivery(error))delete pending.current[key];setNotices(rows=>({...rows,[id]:error instanceof Error?error.message:"Check this request before repeating it."}));}
    finally{setBusy(rows=>({...rows,[id]:false}));}
  };
  const cancel=async(request:{id:string;revision:number})=>{
    setBusy(rows=>({...rows,[id]:true}));
    try{await api(`/api/codex-chat/v1/threads/${id}/queue`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({action:"cancel",...request})});await refresh(id);}
    catch(error){setNotices(rows=>({...rows,[id]:error instanceof Error?error.message:"Queued message could not be cancelled."}));}
    finally{setBusy(rows=>({...rows,[id]:false}));}
  };
  return <section className="codex-task-controls" aria-label="Running task controls">
    {detail.voiceWorkflow && <VoiceQuestion key={`${id}:${detail.voiceWorkflow.questionId || "running"}`} chatId={id} workflow={detail.voiceWorkflow} refresh={()=>refresh(id)} />}
    {detail.pendingRequests.map(request=><NativeQuestion key={request.requestId} chatId={id} request={request} refresh={()=>refresh(id)} />)}
    {(running || Boolean(detail.queued?.length)) && <div className="codex-composer-actions">
      {detail.controls?.steer && <button className="codex-text-action" type="button" disabled={locked||!canSend||!draft.trim()||attachments.length>0} onClick={()=>void send("steer")}>Clarify this turn</button>}
      <button className="codex-text-action" type="button" disabled={locked||!canSend||(!draft.trim()&&!attachments.length)} onClick={()=>void send("queue")}>Send after completion</button>
      {detail.controls?.interrupt && !detail.voiceWorkflow && <button className="codex-text-action" type="button" disabled={locked} onClick={()=>void send("interrupt")}>Stop this turn</button>}
    </div>}
    {detail.queued?.map(request=><div className="codex-inline-notice info" key={request.id}><span>{request.state === "queued" ? "Queued" : request.state} · {request.text.slice(0,160)}{request.reason?` · ${request.reason}`:""}</span>{["queued","blocked"].includes(request.state)&&<button className="codex-text-action" type="button" disabled={locked} onClick={()=>void cancel(request)}>Cancel queued message</button>}</div>)}
    {notices[id]&&<p className="codex-attachment-notice" role="status">{notices[id]}</p>}
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
  return <fieldset className="codex-inline-notice warning" disabled={busy || request.presentation.state!=="pending"}>
    <legend>{request.title}</legend>{request.reason&&<p>{request.reason}</p>}
    {request.kind==="user_input"?questions.map(q=><label key={q.id}>{q.question}<input type={q.isSecret?"password":"text"} autoComplete="off" value={answers[q.id]||""} onChange={e=>setAnswers(rows=>({...rows,[q.id]:e.target.value}))} />{q.options?.map(option=><button className="codex-text-action" type="button" key={option.label} onClick={()=>setAnswers(rows=>({...rows,[q.id]:option.label}))}>{option.label}</button>)}</label>):<pre>{JSON.stringify(request.presentation,null,2)}</pre>}
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
