// A finished controller turn is not a finished child. Both entry points use
// this presentation from the same bound evidence; neither infers it from text.
export function factoryMilestone(state,delivery,firstUse) {
  const at=(kind,label,summary)=>({kind,label,summary});
  if(delivery?.status==='accepted' && delivery.acceptance==='accepted')return at('accepted','Complete',state?.phase==='card-blocked'?'The agent has been accepted. Its management card is not ready yet.':'The user accepted the verified version.');
  if(delivery?.blockers.length){const b=delivery.blockers[0];return at('decision','Decision needed',[b.explanation || b.title,b.nextStep || b.question].join(' '));}
  if(['cancelled','abandoned'].includes(delivery?.status))return at('stopped','Stopped','This build ended without acceptance. The work has been saved. New work requires a separate request.');
  if(delivery?.status==='paused')return at('stopped','Paused','The build is paused. The work has been saved. Pritha is waiting for a request to continue.');
  if(delivery?.status==='failed')return at('stopped','Build interrupted','The build could not be completed. Pritha saved the work and stopped new attempts. Check the build log to establish the cause before continuing.');
  if(state?.continuationPause && !state.running){
    const step=state.continuationPause;
    if(['research','research_collect','research_apply','research_recover'].includes(step))return at('stopped','Research paused','Source verification could not be completed. Pritha saved the research and paused automatic continuation. Resolve the cause and confirm the sources before building.');
    if(step==='scaffold')return at('stopped','Scaffolding paused','The scaffold could not be completed. Pritha saved the approved documents and paused automatic continuation. Check this step in the log before retrying.');
    if(step==='finish')return at('partial','Handoff paused','Handoff preparation could not be completed. Pritha saved the build and verification results. Resolve the cause before completing the handoff.');
    return at('stopped','Step paused','The current step could not be completed. Pritha saved the previous results and paused automatic continuation. The cause is not yet known; check the step log before retrying.');
  }
  if(state?.phase==='card-blocked' && state.localApplication?.status==='manual')return at('review','Ready to apply','The build is verified. Applying it to the agent project requires approval before it can be launched from the card.');
  if(state?.phase==='card-blocked' && state.localApplication?.reason==='source_has_changes')return at('partial','Your changes are preserved','The build is verified. The project has local changes; Pritha preserved them and is waiting for a decision about applying the build.');
  if(state?.phase==='card-blocked')return at('partial','Management card not ready',firstUse?'The agent interfaces are verified. You can try the indicated build. Pritha is waiting for the management card settings to be fixed.':'The build passed verification. Pritha is waiting for the management card settings to be fixed.');
  if(firstUse?.disposition==='applied-local-project')return at('review','Ready to launch','The verified version is in the project folder. The agent can be launched from its card. Acceptance is a separate decision.');
  if(['verified','awaiting_acceptance','accepted'].includes(delivery?.status))return at('review','Verified',firstUse?'The verified version is ready for a first run. Acceptance is a separate decision.':'Verification results are recorded. The command for the current version is not yet confirmed.');
  if(delivery?.status==='verifying')return at('verifying','Verifying',delivery.iteration===0?'The scaffold is ready. Checking which features still need implementation.':'The implementation is ready for verification. Checking the agent behavior against the agreed examples.');
  // These are real delivery stages, not a reinterpretation of a failed turn.
  // Blockers and interrupted steps above always take precedence.
  if(delivery?.status==='building'){
    if(!state?.running)return at('reconcile','Checking state','The build is not yet complete. Pritha is waiting for confirmation of the current step before continuing.');
    if(delivery.lastFailureKind==='executor')return at('building','Recovering build','The builder call could not be completed. Pritha is checking the saved files before the next attempt within the agreed limits.');
    if(delivery.phase==='implementation' && delivery.iteration===1 && state.scaffoldRevision)return at('building','Implementing','The scaffold is ready. Implementing the agent behavior.');
    if(delivery.phase==='repair' && delivery.iteration===0 && state.scaffoldRevision)return at('building','Preparing implementation','The scaffold is ready. Preparing to implement the agent behavior.');
    if(delivery.phase==='repair' || delivery.iteration>1)return at('building','Fixing','Verification found a mismatch with the agreed outcome. Fixing the implementation within the remaining limits, then verifying again.');
    return at('building','Implementing','Implementing the agent. Next, it will be checked against the agreed examples.');
  }
  if(state?.phase==='scaffolded')return at('building','Scaffold ready','The scaffold is ready. Next comes implementation of the agent behavior and verification of the result.');
  if(state?.phase==='research')return at('building','Researching sources','Checking sources for the selected approach. Next, the agent scaffold will be prepared.');
  if(state?.outcomeApproval)return at('building','Building','The factory is building and verifying the agent within the agreed limits.');
  return at('proposal','Clarifying the task','First, agree on the agent capabilities and the verification criteria in separate reviews.');
}

export function factoryVoiceDisplay(raw,turnComplete,product) {
  const accepted=product?.kind==='accepted';
  const complete=turnComplete && (raw!=='complete' || !product || accepted);
  const status=raw==='complete' && !complete && product
    ? ['decision','stopped','partial','review','proposal'].includes(product.kind)?'waiting_for_operator':'running' : raw;
  const ceiling=!product || accepted?100:({proposal:10,reconcile:10,building:55,verifying:80,partial:85,review:95})[product.kind] ?? 55;
  return {complete,status,ceiling};
}
