import {hasCreationAuthority,hasDelegatedContract} from './factory-creation-authority.mjs';
import {buildInterrupted,RESUMABLE_BUILD_STEPS} from './factory-interruption.mjs';
import {improving} from './factory-improvement.mjs';
// A finished controller turn is not a finished child. Both entry points use
// this presentation from the same bound evidence; neither infers it from text.
export function factoryMilestone(state,delivery,firstUse,{turnActive}={}) {
  const at=(kind,label,summary)=>({kind,label,summary});
  // A revision of a built agent runs beside the applied version, which stays in
  // the project and on its card until the revision is verified and applied.
  const revising=improving(state),revision='revision '+(state?.improvement?.number || 1);
  if(delivery?.status==='accepted' && delivery.acceptance==='accepted')return at('accepted','Complete',state?.phase==='card-blocked'?'The agent has been accepted. Its management card is not ready yet.':'The user accepted the verified version.');
  if(delivery?.blockers.length){const b=delivery.blockers[0];return at('decision','Decision needed',[b.explanation || b.title,b.nextStep || b.question].join(' '));}
  if(revising && ['cancelled','abandoned','failed'].includes(delivery?.status))return at('stopped','Revision stopped','This '+revision+' ended without a verified result. The applied version is unchanged and stays available from its card. Describe the change again to start another revision.');
  if(['cancelled','abandoned'].includes(delivery?.status))return at('stopped','Stopped','This build ended without acceptance. The work has been saved. New work requires a separate request.');
  if(delivery?.status==='paused')return at('stopped','Paused','The build is paused. The work has been saved. Pritha is waiting for a request to continue.');
  if(delivery?.status==='failed')return at('stopped','Build interrupted','The build could not be completed. Pritha saved the work and stopped new attempts. Check the build log to establish the cause before continuing.');
  // The session still names a step as running, yet its chat has no turn that
  // could be running it: Stop, a timeout or a host restart ended it. A read
  // changes nothing; the next message lets the host confirm and continue.
  if(state?.running && turnActive===false){
    if(RESUMABLE_BUILD_STEPS.includes(state.running.action))return at('stopped','Build paused','The build stopped before it confirmed its result. The work so far and its usage record are saved. Send a message in this chat to continue: Pritha first confirms that the earlier process has ended, then resumes the same build.');
    return at('reconcile','Step not confirmed','The last step ended without confirming its result. Nothing more will run by itself. Send a message in this chat so that Pritha can check the saved result.');
  }
  if(state?.continuationPause && !state.running){
    const step=state.continuationPause;
    // Stop, a timeout or a host restart ended the builder mid-step. That is a
    // pause of the same run, not a failure with an unknown cause.
    if(buildInterrupted(state))return at('stopped','Build paused','The build stopped before it finished. The work so far and its usage record are saved. Ask Pritha to continue in this chat: it resumes the same build within the remaining limits.');
    if(hasDelegatedContract(state) && ['research_collect','research_apply','research_recover'].includes(step))return at('building','Choosing implementation','An optional source could not be read. Pritha is reviewing the available information and choosing how to implement and test the agent.');
    if(['research','research_collect','research_apply','research_recover'].includes(step))return at('stopped','Research paused','Source verification could not be completed. Pritha saved the research and paused automatic continuation. Resolve the cause and confirm the sources before building.');
    if(step==='scaffold')return at('stopped','Scaffolding paused','The scaffold could not be completed. Pritha saved the approved documents and paused automatic continuation. Check this step in the log before retrying.');
    if(step==='finish')return at('partial','Handoff paused','Handoff preparation could not be completed. Pritha saved the build and verification results. Resolve the cause before completing the handoff.');
    return at('stopped','Step paused','The current step could not be completed. Pritha saved the previous results and paused automatic continuation. The cause is not yet known; check the step log before retrying.');
  }
  if(revising && state.localApplication && state.localApplication.status!=='applied' && state.localApplication.reason!=='source_has_changes'){
    if(state.localApplication.reason==='service_record_present')return at('partial','Stop the agent to apply','The '+revision+' is verified. The agent is running its applied version: stop it from its card, then ask Pritha here to apply the revision.');
    return at('partial','Revision not applied','The '+revision+' is verified but could not be applied to the project yet. The applied version is unchanged and stays available from its card.');
  }
  if(state?.phase==='card-blocked' && state.localApplication?.status==='manual')return at('review','Ready to apply','The build is verified. Applying it to the agent project requires approval before it can be launched from the card.');
  if(state?.phase==='card-blocked' && state.localApplication?.reason==='source_has_changes')return at('partial','Your changes are preserved','The build is verified. The project has local changes; Pritha preserved them and is waiting for a decision about applying the build.');
  if(state?.phase==='card-blocked')return at('partial','Management card not ready',firstUse?'The agent interfaces are verified. You can try the indicated build. Pritha is waiting for the management card settings to be fixed.':'The build passed verification. Pritha is waiting for the management card settings to be fixed.');
  if(firstUse?.disposition==='applied-local-project')return at('review','Ready to launch',(state?.improvement?.appliedAt?'The checked '+revision+' is in the project folder and replaced the earlier version.':'The checked version is in the project folder.')+' Launch it from its card and try it.'
    +(state?.preparation?' To change how it behaves, describe the change in this chat: Pritha revises the examples, rebuilds and checks the agent before it replaces this version.':''));
  if(['verified','awaiting_acceptance','accepted'].includes(delivery?.status))return at('review','Verified',firstUse?'The verified version is ready for a first run. Acceptance is a separate decision.':'Verification results are recorded. The command for the current version is not yet confirmed.');
  if(revising && delivery?.status==='verifying')return at('verifying','Verifying revision',delivery.iteration===0?'Checking the applied version against the revised examples to see what has to change. It stays in use meanwhile.':'Checking the '+revision+' against the revised examples. The applied version stays in use until it passes.');
  if(delivery?.status==='verifying')return at('verifying','Verifying',delivery.iteration===0?'The scaffold is ready. Checking which features still need implementation.':'The implementation is ready for verification. Checking the agent behavior against the agreed examples.');
  // These are real delivery stages, not a reinterpretation of a failed turn.
  // Blockers and interrupted steps above always take precedence.
  if(delivery?.status==='building'){
    if(!state?.running)return at('reconcile','Checking state','The build is not yet complete. Pritha is waiting for confirmation of the current step before continuing.');
    if(delivery.lastFailureKind==='executor')return at('building','Recovering build','The builder call could not be completed. Pritha is checking the saved files before the next attempt within the agreed limits.');
    if(revising)return at('building','Improving','Building the '+revision+' on top of the applied version. It replaces that version only after it passes the revised examples.');
    if(delivery.phase==='implementation' && delivery.iteration===1 && state.scaffoldRevision)return at('building','Implementing','The scaffold is ready. Implementing the agent behavior.');
    if(delivery.phase==='repair' && delivery.iteration===0 && state.scaffoldRevision)return at('building','Preparing implementation','The scaffold is ready. Preparing to implement the agent behavior.');
    if(delivery.phase==='repair' || delivery.iteration>1)return at('building','Fixing','Verification found a mismatch with the agreed outcome. Fixing the implementation within the remaining limits, then verifying again.');
    return at('building','Implementing','Implementing the agent. Next, it will be checked against the agreed examples.');
  }
  if(revising && !delivery)return at('building','Preparing revision','Pritha is preparing the '+revision+': the revised examples and their protected verifier. The applied version stays available from its card.');
  if(state?.phase==='scaffolded')return at('building','Scaffold ready','The scaffold is ready. Next comes implementation of the agent behavior and verification of the result.');
  if(state?.phase==='research' && hasDelegatedContract(state))return at('building','Planning implementation','Pritha is using memory and relevant documentation to choose the implementation, then it will build and test the agent.');
  if(state?.phase==='research')return at('building','Researching sources','Checking sources for the selected approach. Next, the agent scaffold will be prepared.');
  if(state?.outcomeApproval)return at('building','Building','The factory is building and verifying the agent within the agreed limits.');
  if(hasCreationAuthority(state) && (!state.contractApproval || hasDelegatedContract(state)))return at('building','Preparing the agent','Pritha is turning your request into an implementation plan and examples, then building the local agent.');
  // Nothing is saved before the first factory step, so the workflow is not yet
  // known: a model-led request needs no document reviews. Promise them only
  // once a reviewed draft workflow has actually started.
  if(!state)return at('proposal','Clarifying the task','Pritha is working out what the agent should do and how its result will be checked.');
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
