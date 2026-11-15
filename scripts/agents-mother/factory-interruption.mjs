/** Build steps whose durable record is the delivery ledger, not the factory
 * session: the ledger has its own lease, attempt receipts and usage
 * reconciliation, so the SAME run can resume from that evidence. Document,
 * research and scaffold steps are not in this list: their effect is recorded
 * nowhere else and stays unconfirmed for review. No imports on purpose: the
 * continuation plan, the receipt recovery and the UI milestone all read this. */
export const RESUMABLE_BUILD_STEPS=Object.freeze(['deliver','delivery_resume','delivery_extend','verify']);

/** True after the host released a build step whose worker provably exited
 * without a receipt (operator Stop, timeout or host restart). */
export const buildInterrupted=state=>Boolean(state?.continuationPause && state.interruptedStep?.action===state.continuationPause
  && RESUMABLE_BUILD_STEPS.includes(state.continuationPause));
