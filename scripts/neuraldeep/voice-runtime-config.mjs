import { createHash } from 'node:crypto';
import path from 'node:path';
import { readProviderCredential } from '../lib/provider-credential.mjs';
import { resolvePrithaRoot, resolvePrithaStateRoot, resolvePrithaStatePath } from '../lib/paths.mjs';
import { recordNeuralDeepRun } from './usage-ledger.mjs';
export function voiceRuntimeCredentials() {
  const stateRoot = resolvePrithaStateRoot({ root: resolvePrithaRoot() });
  return {
    origin: 'https://api.neuraldeep.ru',
    key: readProviderCredential('neuraldeep', { stateRoot }),
    instanceId: createHash('sha256').update(path.resolve(stateRoot)).digest('hex'),
  };
}
export function recordVoiceUsage(stateRoot, receipt) {
  return recordNeuralDeepRun({
    stateRoot,
    privateRoot: resolvePrithaStatePath('private', 'task-chat', 'neuraldeep'),
    runId: receipt.id,
    source: 'voice-dialogue',
    workloadId: receipt.turn_id,
    sessionId: receipt.session_id,
    model: receipt.metadata.model || 'unknown',
    status: receipt.status,
    startedAt: receipt.started_at,
    finishedAt: receipt.finished_at,
    providerRequests: 1,
    usage: receipt.metadata.usage,
    usageKnown: receipt.metadata.usageKnown === true,
    billing: receipt.metadata.billing,
  });
}
