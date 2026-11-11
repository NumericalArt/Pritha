import {deliveryUsageStatus} from './delivery-ledger.mjs';

// Project known causes and actual paused actions, never provider prose or logs.
const reasons = {
  token_budget_exhausted: ['Build budget exhausted', 'Review the work so far or allocate more budget?', 'The remaining budget is insufficient for another builder call.', 'Pritha saved the work and paused new calls. Continuing the build requires your budget decision.'],
  iteration_budget_exhausted: ['Build attempts exhausted', 'Review the result or allow another attempt?', 'All agreed build attempts have been used.', 'Pritha saved the result. Another attempt requires your approval.'],
  elapsed_budget_exhausted: ['Build time expired', 'Review the result or allow more build time?', 'The agreed build time has expired.', 'Pritha saved the work and paused the build. Continuing requires your decision about more time.'],
  isolation_unavailable: ['Execution environment not ready', 'Restore the environment or revise the requirements?', 'The environment does not provide the isolation selected for this build.', 'Pritha stopped command execution. Continuing requires a restored environment or approval of revised requirements.'],
  goal_usage_unavailable: ['Usage not yet confirmed', 'How should the saved attempt be reconciled?', 'Usage from the previous builder call could not be confirmed.', 'Pritha saved the attempt and paused new calls. Usage must be reconciled before continuing.'],
  build_runtime_unavailable: ['Builder unavailable', 'How should the selected builder be restored?', 'The selected builder could not be connected.', 'Pritha paused the build. After restoring the connection, check availability again.'],
  verification_needs_implementation: ['Further work needed', 'Continue fixing the implementation or review the results?', 'Verification of the current files found a mismatch with the agreed outcome.', 'Pritha saved the verification results. Fixing the implementation requires your decision to continue the build.'],
  verifier_modified: ['Verification file changed', 'How should the approved verification be restored?', 'The builder changed the file used to verify the result.', 'Pritha stopped the build. Continuing requires restoring the approved verification.'],
  repeated_trial_failure: ['Fix did not resolve the issue', 'Clarify the task or revise the criteria?', 'The same issue occurred several times.', 'Pritha saved the results and stopped retrying. Continuing requires clarification of the task.'],
  dirty_workspace: ['Project has uncommitted changes', 'Save the changes or select a clean copy?', 'A separate build workspace could not be prepared because the project has changes.', 'Pritha preserved the user files. The build is waiting for these changes to be resolved.'],
  target_busy: ['Project already has an active build', 'Continue the existing build or stop the new one?', 'Another build is already running for this project.', 'Pritha paused the new run and is waiting for a choice of which build to continue.'],
  goal_api_unavailable: ['Budget tracking unavailable', 'Update the environment or approve a separate exception?', 'The builder environment does not support the agreed budget tracking.', 'Pritha stopped the builder from starting. Continuing requires restored tracking or a separate decision.'],
  trial_input_missing: ['Verification file missing', 'Restore the verification or revise the criteria?', 'A file required for the approved verification could not be found.', 'Pritha paused the build. Restore the verification before continuing.'],
  trial_input_provenance_mismatch: ['Verification differs from the approved version', 'Restore the verification or approve a new version?', 'The verification file does not match the version you approved.', 'Pritha paused the build. Restore the approved version before continuing.'],
  checkpoint_commit_failed: ['Could not save the verified version', 'Fix the save settings or stop the build?', 'The verified result could not be committed to the project history.', 'Pritha saved the working files. Resolve the cause and repeat verification before handoff.'],
};
const choices = {
  'verify-only':['Verify current files','The approved checks will run without a new build.'],
  'extend-budget':['Increase the limit','The increase requires separate approval; previous usage will be retained.'],
  'review-failures':['Review results','The build will remain paused.'],
  'inspect-worktree':['Inspect build files','No new attempt will start.'],
  'retry-accounting':['Reconcile usage','The host will check the executor record without resubmitting the request.'],
  'retry-after-upgrade':['Restore and retry','After recovery, Pritha will check the availability of the selected environment.'],
  'revise-contract':['Revise the Contract','Changed requirements will require a new decision.'],
  'resume-build':['Continue the build','The executor will work within the remaining limits.'],
  'revise-outcome':['Revise the outcome','New criteria will require separate approval.'],
  'stop-run':['Stop','Work will stop; the files will be retained.'],
  'abandon':['End this attempt','The files and recorded usage will be retained.'],
  'add-guidance':['Clarify the task','Clarification will guide the next attempt within the agreed outcome.'],
  'retry':['Retry the step','After resolving the cause, the same step will be retried within the agreed limits.'],
  'replace-executor':['Change the builder','The selected executor will require approval and verification.'],
  'restore-verifier':['Restore verification','The exact approved verification file will be required.'],
  'discard-iteration':['Discard attempt changes','The last saved version can be restored in the separate build workspace.'],
  'fix-hook':['Fix version saving','After fixing the project settings, verification must run again.'],
  'retry-after-clean':['Save changes and retry','First, save or resolve the project changes.'],
  'use-clean-clone':['Select a clean copy','A different project copy will require a separate build.'],
  'resume-existing':['Continue the existing build','The new attempt will end; continuation applies to the existing build.'],
  'stop-new-run':['Stop the new build','The existing build will continue unchanged.'],
  'repair-scaffold':['Restore the verification file','Restore the verification outside the builder before continuing.'],
  'continue-without-goal':['Allow one attempt without token tracking','A separate exception is required; time and attempt limits will remain in place.'],
};
export function deliveryExplanation(s) {
  const blockers=s.blockers.slice(0,8).map(row=>{
    const known=Object.hasOwn(reasons,row.code);
    const [title,question,explanation,nextStep]=known?reasons[row.code]:['Build paused','How should this build continue?','The build step could not be completed. The cause is not yet known.','Pritha saved the work and stopped new attempts. Check the log for this step before retrying.'];
    return {code:row.code,title,question,explanation,nextStep,options:row.options.slice(0,5).map(({id})=>{
      const [label,effect]=Object.hasOwn(choices,id)?choices[id]:['Clarify this option','Details are available in the saved decision for this build.'];
      return {id,label,effect};
    })};
  });
  return {status:s.status,phase:s.phase,version:s.version,iteration:s.iteration,
    lastFailureKind:s.failure_history?.at(-1)?.trial_ids?.includes('build-executor')?'executor':s.failure_history?.length?'trial':null,
    budget:{tokensUsed:s.budget.tokens_used,maxTokens:s.budget.max_tokens,maxIterations:s.budget.max_iterations,
      usageStatus:deliveryUsageStatus(s.budget),overrun:Math.max(0,s.budget.tokens_used-s.budget.max_tokens)},
    acceptance:s.accepted_by==='user'?'accepted':'pending',blockers};
}
