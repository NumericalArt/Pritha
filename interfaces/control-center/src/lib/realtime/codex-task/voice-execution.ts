import { createHash } from "node:crypto";
import { canonicalPath } from "../../codex-chat/storage-identity";
import { nativeExecutionCoordinator } from "../../codex-chat/native-turn-coordinator";

const workflowKey = (taskId: string) => `voice-workflow:${taskId}`;

export function voiceWorkflow(taskId: string) {
  return nativeExecutionCoordinator().getIntent(workflowKey(taskId));
}

/** Logical ownership spans planning, all steps, and operator waits. */
export function beginVoiceWorkflow(task: Record<string, unknown>, cwd: string, routingMode: string, sandbox: string) {
  const coordinator = nativeExecutionCoordinator();
  const taskId = String(task.id);
  const key = workflowKey(taskId);
  const scope = task.thread_scope as {kind?: string; id?: string} | undefined;
  const scopeId = routingMode === "control" ? "control" : routingMode === "per_task" ? taskId : `${scope?.kind}:${scope?.id}`;
  const resource = `voice-workflow-scope:${canonicalPath(cwd)}:${scopeId}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({taskId, resource})).digest("hex");
  const {intent} = coordinator.reserveIntent(key, fingerprint, {kind:"voice-workflow", taskId, round:0});
  if(intent.state === "waiting_admission") {
    if (!coordinator.claims().some(row=>row.owner===intent.owner && row.generation===intent.generation)) throw new Error("voice_owner_missing");
    return coordinator.updateIntent(key,{state:"running"},intent.revision);
  }
  if (intent.state === "waiting_for_operator" && task.operator_question_answered_at && task.operator_question_answered_at !== intent.lastAnswer) {
    if (!coordinator.claims().some(row=>row.owner===intent.owner && row.generation===intent.generation)) throw new Error("voice_owner_missing");
    return coordinator.updateIntent(key, {state:"running", round:intent.round+1, lastAnswer:task.operator_question_answered_at}, intent.revision);
  }
  if (!["reserved", "not_dispatched"].includes(intent.state)) throw new Error("voice_workflow_owned_or_unconfirmed");
  const lease = coordinator.claim([resource], key, {kind:"voice-workflow",detail:{taskId}});
  if (!lease) throw new Error("voice_scope_busy");
  try {
    if (!coordinator.extend(lease.owner, lease.generation, [`workspace:${canonicalPath(cwd)}`], {mode:sandbox === "read-only" ? "read" : "write"})) throw new Error("workspace_busy");
    if (!coordinator.extend(lease.owner, lease.generation, ["execution-ambient-effects"], {mode:sandbox === "danger-full-access" || task.task_type === "agent_creation" ? "write" : "read"})) throw new Error("workspace_busy");
    const roots = Array.isArray(task.execution_writable_roots) ? task.execution_writable_roots : [];
    for(const root of roots) if(typeof root === "string" && !coordinator.extend(lease.owner,lease.generation,[`workspace:${canonicalPath(root)}`],{mode:"write"}))throw new Error("workspace_busy");
    return coordinator.updateIntent(key, {state:"running",owner:lease.owner,generation:lease.generation,round:intent.round+1}, intent.revision);
  } catch(error) {lease.release();throw error;}
}

export function finishVoiceWorkflow(taskId: string, state: "completed" | "not_dispatched" | "unknown" | "waiting_for_operator" | "waiting_admission", detail: {question?:string} = {}) {
  const coordinator=nativeExecutionCoordinator(), current=voiceWorkflow(taskId);
  if (!current) return;
  coordinator.updateIntent(workflowKey(taskId), {state,...detail,...(detail.question ? {questionId:createHash("sha256").update(JSON.stringify([taskId,current.round,detail.question])).digest("hex")} : {})}, current.revision);
  if (["completed","not_dispatched"].includes(state) && current.owner && current.generation) coordinator.reconcileRelease(current.owner,current.generation);
}

export function assertVoiceOwner(taskId: string, resource: string) {
  const owner = voiceWorkflow(taskId);
  if (!owner || owner.state !== "running") throw new Error("voice_owner_not_running");
  const coordinator=nativeExecutionCoordinator();
  if (!coordinator.extend(owner.owner,owner.generation,[resource])) throw new Error("turn_active");
  return owner;
}

export function settleAbortedVoiceWorkflow(taskId:string) {
  const coordinator=nativeExecutionCoordinator(), current=voiceWorkflow(taskId);
  if(!current)return;
  const phases=[...coordinator.listIntents({kind:"voice-turn",limit:1000}),...coordinator.listIntents({kind:"voice-cli",limit:1000})].filter(row=>row.taskId===taskId && row.round===current.round);
  finishVoiceWorkflow(taskId,phases.some(row=>["dispatching","running","unknown"].includes(row.state))?"unknown":"completed");
}
