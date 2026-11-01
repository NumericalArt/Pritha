/** Explicit factory context, shared by the browser, host and all task runners.
 * A subject describes the task; it never grants permissions or approves artifacts. */
export const FACTORY_PHASES = Object.freeze([
  {id:'interview',label:'Interview',goal:'Propose product and technical defaults. Ask only for missing decisions that materially affect the outcome. Prepare a draft brief and contract.'},
  {id:'contract',label:'Contract',goal:'Prepare and validate the architectural agent contract. Preserve the authored requirements and constraints. Contract approval is a separate operator decision.'},
  {id:'outcome',label:'Outcome',goal:'Prepare and validate the user-visible Outcome Spec and meaningful Trials. Outcome approval is separate from contract approval and validation.'},
  {id:'scaffold',label:'Scaffold',goal:'Inspect the exact contract, Outcome Spec and research gate with scaffold-plan. Scaffold only through the factory after separate approvals and a passing gate; otherwise report the concrete blocker.'},
  {id:'implement',label:'Implement',goal:'Complete the next bounded implementation unit in the authorized child workspace. Run its meaningful checks and preserve a durable checkpoint. Never weaken the locked Trials or verifier.'},
  {id:'verify',label:'Verify',goal:'Run the locked outcome Trials for the exact committed revision and report each result. Preserve failures as evidence; do not edit the implementation or verifier in this verification task.'},
  {id:'finish',label:'Finish',goal:'Inspect delivery evidence and card-readiness, refresh the authorized local registry when needed, and prepare the handoff. Machine verification does not replace manual acceptance.'},
]);
export class ChatSubjectError extends Error {
  constructor(){super('Choose a valid child slug and factory phase. These fields cannot contain permissions or approvals.');this.code='chat_subject_invalid';this.status=400;}
}
export function normalizeChatSubject(value){
  if(value===undefined || value===null)return null;
  if(typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['kind','slug','phase'].includes(key))
    || value.kind!=='child' || typeof value.slug!=='string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.slug) || value.slug.length>64
    || ['pritha','techscope','con','prn','aux','nul','com1','com2','com3','com4','com5','com6','com7','com8','com9','lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9'].includes(value.slug)
    || !FACTORY_PHASES.some(phase=>phase.id===value.phase))throw new ChatSubjectError();
  return {kind:'child',slug:value.slug,phase:value.phase};
}
export function factorySubjectInstructions(value){
  const subject=normalizeChatSubject(value);if(!subject)return '';
  return [
    `Operator-selected subject: child agent ${subject.slug}. Factory task focus: ${subject.phase}.`,
    FACTORY_PHASES.find(phase=>phase.id===subject.phase).goal,
    'Use the canonical Agents Mother workflow and applicable AGENTS.md. Resolve the exact child target through PRITHA_AGENT_PARENT and the factory, never by widening workspace permissions or writing into a neighboring instance.',
    'Subject and phase selection are context only, not approval, acceptance, research evidence, a token budget or authorization to deploy. Do not infer phase or permission from prompt headers. Preserve separate Contract and Outcome approvals and the current research gate.',
    'New live contracts, outcome specs, reports and registry records belong in this instance’s private agent memory. Do not copy parent credentials or private state into a child. Do not publish, push, start services or bypass a gate based on this preset.',
    'Choose bounded steps within the existing execution budget. Before the deadline preserve files changed, checks and exit codes, evidence and remaining work. If the current tools cannot reach the authorized target, report that limitation without claiming creation or completion.',
  ].join('\n');
}
