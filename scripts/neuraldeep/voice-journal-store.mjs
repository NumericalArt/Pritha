import { ExecutionCoordinator } from '../lib/execution-coordinator.mjs';
import { NeuralDeepVoiceJournal, VOICE_SCHEMA } from './voice-journal.mjs';

/** Voice receipts share the canonical host database and its transaction boundary.
 * Do not introduce the fork's separate admission authority alongside this one. */
export function openVoiceJournal(options) {
  const coordinator = new ExecutionCoordinator(options);
  try {
    coordinator.db.exec(VOICE_SCHEMA);
    const journal = new NeuralDeepVoiceJournal(coordinator);
    coordinator.reconcileVoiceHttpRequests(detail => {
      const request = journal.request(detail.requestId);
      if (request?.status === 'dispatching') journal.finishRequest(request.id, 'interrupted', {usageKnown:false}, request.kind === 'llm');
      if (detail.sessionId && detail.turnId) journal.finishTurn(detail.sessionId, detail.turnId, 'interrupted');
    });
    return { coordinator, journal, close: () => coordinator.close() };
  } catch (error) { coordinator.close(); throw error; }
}
