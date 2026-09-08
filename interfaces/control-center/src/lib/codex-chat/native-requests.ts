import { registerExecutionChannel, callExecutionChannel, executionChannelView } from "../../../../../scripts/lib/execution-channel.mjs";
import { createHash } from "node:crypto";
import { ExecutionConflict } from "../../../../../scripts/lib/execution-coordinator.mjs";
import { nativeExecutionCoordinator, nativeThreadLeaseKey } from "./native-turn-coordinator";
import { nativeControlView } from "./native-control";

const methods = new Map([
  ["item/commandExecution/requestApproval","command_approval"],
  ["item/fileChange/requestApproval","file_change_approval"],
  ["item/permissions/requestApproval","permission_approval"],
  ["item/tool/requestUserInput","user_input"],
]);
const channels = new Map<string,{generation:string;close:()=>void;respond:(result:unknown)=>void|Promise<void>}>();
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function captureNativeRequest(message:{id?:string|number;method?:string;params?:Record<string,unknown>}, storage:string, generation:string, respond:(result:unknown)=>void|Promise<void>) {
  const kind=methods.get(message.method || ""), params=message.params || {};
  if (!kind || message.id === undefined || !params.threadId || !params.turnId || Buffer.byteLength(JSON.stringify(params))>128_000) return false;
  const coordinator=nativeExecutionCoordinator();
  const key=`native-request:${storage}:${generation}:${message.id}:${digest(params)}`;
  if(!coordinator.getIntent(key) && coordinator.listIntents({kind:"native-request",states:["pending","answering","unknown"],limit:129}).length>=128)throw new ExecutionConflict("native_requests_full");
  const {intent,created}=coordinator.reserveIntent(key,digest(message),{kind:"native-request",key,requestKind:kind,rpcId:message.id,storage,generation,nativeThreadId:params.threadId,nativeTurnId:params.turnId,params},{limit:{max:128,states:["pending","answering","unknown"]}});
  if (created) coordinator.updateIntent(key,{state:"pending"});
  else if(intent.state!=="pending")return true;
  channels.get(intent.id)?.close();
  const close=registerExecutionChannel(coordinator,`native-answer:${intent.id}`,{
    view:()=>channels.has(intent.id)?{generation}:null,
    call:input=>answerNativeRequest(storage,String(params.threadId),input),
  });
  channels.set(intent.id,{generation,respond,close});
  return true;
}

export function pendingNativeRequests(storage:string,nativeThreadId:string) {
  return nativeExecutionCoordinator().listIntents({kind:"native-request",states:["pending","answering","unknown"],limit:200})
    .filter(row=>row.storage===storage && row.nativeThreadId===nativeThreadId)
    .map(row=>({id:row.id,revision:row.revision,kind:row.requestKind,params:row.params,state:row.state}));
}

export function expireNativeRequests(generation:string) {
  if (![...channels.values()].some(channel=>channel.generation===generation))return;
  try {
    const coordinator=nativeExecutionCoordinator();
    for (const row of coordinator.listIntents({kind:"native-request",states:["pending"],limit:200})) {
      if (row.generation!==generation)continue;
      coordinator.updateIntent(row.key,{state:"expired"});
    }
  } finally {for (const [id,channel] of channels) if(channel.generation===generation){channel.close();channels.delete(id);}}
}

function answerFor(row:Record<string,any>, input:{decision?:string;answers?:Record<string,string[]>}) {
  if (row.requestKind === "user_input") {
    const questions=Array.isArray(row.params.questions)?row.params.questions:[];
    if (!questions.length || !input.answers || Object.keys(input.answers).some(id=>!questions.some((q:{id:string})=>q.id===id))) throw new ExecutionConflict("native_answer_invalid");
    const answers:Record<string,{answers:string[]}>={};
    for(const question of questions) {
      const values=input.answers[question.id];
      if(!Array.isArray(values)||!values.length||values.length>10||values.some(value=>typeof value!=="string"||Buffer.byteLength(value)>4_000))throw new ExecutionConflict("native_answer_invalid");
      answers[question.id]={answers:values};
    }
    return {answers};
  }
  if (!["accept","decline","cancel"].includes(input.decision || ""))throw new ExecutionConflict("native_answer_invalid");
  if (row.requestKind === "permission_approval") {
    const requested=row.params.permissions;
    if (!requested || Object.keys(requested).some(key=>!["fileSystem","network"].includes(key)))throw new ExecutionConflict("native_permission_schema_unsupported");
    return {permissions:input.decision === "accept" ? requested : {},scope:"turn",strictAutoReview:true};
  }
  // Never issue acceptForSession, policy amendments, or rights outside this request.
  return {decision:input.decision};
}

export async function answerNativeRequest(storage:string,nativeThreadId:string,input:{requestId:string;revision:number;clientMessageId:string;decision?:string;answers?:Record<string,string[]>}) {
  const coordinator=nativeExecutionCoordinator();
  if(!channels.has(input.requestId)) {
    const row=coordinator.getIntentById(input.requestId);
    if(!row || row.storage!==storage || row.nativeThreadId!==nativeThreadId)throw new ExecutionConflict("native_request_not_found");
    if(row.state === "answered" && row.responseHash===digest(answerFor(row,input)))return {submitted:true,replayed:true};
    if(row.revision!==input.revision || row.state!=="pending")throw new ExecutionConflict("native_request_changed");
    const remote=executionChannelView(coordinator,`native-answer:${input.requestId}`);
    if(!remote || remote.generation!==row.generation)throw new ExecutionConflict("control_connection_expired");
    return callExecutionChannel(coordinator,`native-answer:${input.requestId}`,input);
  }
  return coordinator.withMutation(`native-answer:${input.requestId}`,async()=>{
    const row=coordinator.getIntentById(input.requestId);
    if(!row || row.kind!=="native-request" || row.storage!==storage || row.nativeThreadId!==nativeThreadId)throw new ExecutionConflict("native_request_not_found");
    const response=answerFor(row,input), responseHash=digest(response);
    if(row.state === "answered" && row.responseHash===responseHash)return {submitted:true,replayed:true};
    if(row.revision!==input.revision || row.state!=="pending")throw new ExecutionConflict("native_request_changed");
    const channel=channels.get(row.id), control=nativeControlView(coordinator,nativeThreadLeaseKey(storage,nativeThreadId));
    if(!channel || channel.generation!==row.generation || !control || control.nativeTurnId!==row.nativeTurnId)throw new ExecutionConflict("control_connection_expired");
    // Shell/file/permission approvals may widen effects beyond the sandboxed cwd.
    // Retain exclusive shared ownership through this turn before accepting them.
    if(row.requestKind!=="user_input" && input.decision==="accept" && !coordinator.extend(control.owner,control.generation,["execution-ambient-effects"],{mode:"write"}))throw new ExecutionConflict("approval_resources_busy","Another task owns shared resources. Wait for it to finish before granting this request.");
    const key=row.key;
    coordinator.updateIntent(key,{state:"answering",responseHash,clientMessageId:input.clientMessageId},row.revision);
    try {await channel.respond(response);coordinator.updateIntent(key,{state:"answered"});channel.close();channels.delete(row.id);return {submitted:true,replayed:false};}
    catch(error){coordinator.updateIntent(key,{state:"unknown"});throw error;}
  });
}

export function expireCompletedNativeRequests(storage:string,nativeThreadId:string,terminalTurns:Set<string>) {
  const coordinator=nativeExecutionCoordinator();
  for(const row of coordinator.listIntents({kind:"native-request",states:["pending","unknown"],limit:200})) {
    if(row.storage!==storage || row.nativeThreadId!==nativeThreadId || !terminalTurns.has(row.nativeTurnId))continue;
    coordinator.updateIntent(row.key,{state:"expired",reason:"native_turn_terminal"},row.revision);
    channels.get(row.id)?.close();channels.delete(row.id);
  }
}
