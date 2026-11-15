/** Revision of an agent that is already built and applied to its project.
 *
 * The accepted Contract stays as it is: identity, interfaces, port, model
 * connection and limits do not change. The user's request is expressed as
 * revised product examples, from which the host prepares a successor Outcome
 * and its protected verifier. A new delivery run then builds on the applied
 * version in its own worktree. The applied version, its Outcome and its
 * verifier stay in use until the revision is verified and fast-forwarded into
 * the project; a revision that ends without a verified result changes nothing.
 *
 * No imports on purpose: the worker, the tool host, the planner and the UI
 * milestone all read these rules. */

/** True while a revision is prepared or built and the applied version it will
 * replace is still the one in the project. */
export const improving=state=>Boolean(state?.improvement?.applied);

const SETTLED=new Set(['verified','awaiting_acceptance']);
const ENDED=new Set(['abandoned','cancelled','failed']);

/** Whether a revision can start now. `ledger` is the delivery ledger of the
 * session's current run. The reason is a stable code for guidance, not prose. */
export function improvementAvailability(state,ledger){
  const no=reason=>({available:false,reason});
  // Only the structured proposal route keeps the examples the host compiles.
  if(!state?.preparation || !state.contractApproval)return no('custom_workflow');
  if(state.running)return no('step_unconfirmed');
  // A revision whose documents are still being prepared has no run yet; it is in progress all the same.
  if(improving(state) && (!state.runId || !ledger))return no('improvement_in_progress');
  if(!state.runId || !ledger || ledger.run_id!==state.runId)return no('not_built');
  // Final acceptance closes the creation request the revision would act under.
  if(ledger.status==='accepted' || ledger.accepted_by==='user')return no('accepted');
  // A revision that ended without a result can be replaced by another one.
  if(improving(state))return ENDED.has(ledger.status)?{available:true,retry:true}:no('improvement_in_progress');
  if(!SETTLED.has(ledger.status))return no(ENDED.has(ledger.status)?'build_ended':'build_in_progress');
  if(state.localApplication?.status!=='applied' || state.localApplication.runId!==state.runId)return no('not_applied');
  return {available:true};
}

/** Host-authored guidance for the builder of a revision. The note is the
 * factory model's own summary of the request and is bounded by the caller. */
export function improvementGuidance(state){
  return 'This run revises an agent that already works: the worktree starts from its applied version. Keep every behavior the approved examples still require and change only what the revised examples need. Do not rebuild the project from scratch.'
    +(state?.improvement?.note?' Requested change: '+state.improvement.note:'');
}
