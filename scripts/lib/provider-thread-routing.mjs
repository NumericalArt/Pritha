import { createHash } from 'node:crypto';
import { ExecutionCoordinator } from './execution-coordinator.mjs';
import { isProviderConnectorId } from './provider-profile.mjs';

export class ProviderRouteError extends Error {
  constructor(code, message, status = 409) { super(message); Object.assign(this, { code, status, retryable: false }); }
}

/** A creation receipt pins routing before dispatch, including an uncertain first response. */
export class ProviderThreadRouting {
  constructor(options) { this.options = options; this.coordinator = null; }
  get execution() { return this.coordinator ||= new ExecutionCoordinator(this.options); }
  resolve(input, choose) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(input?.clientThreadId || '')) throw new ProviderRouteError('invalid_client_thread_id', 'A stable client thread ID is required.', 400);
    if (input.connectorId !== undefined && !isProviderConnectorId(input.connectorId)) throw new ProviderRouteError('provider_profile_invalid', 'Choose a configured task provider.', 400);
    if (input.modelId !== undefined && (typeof input.modelId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(input.modelId))) throw new ProviderRouteError('provider_model_invalid', 'Choose a supported model.', 400);
    const key = `provider-create:${input.clientThreadId}`;
    let receipt = this.execution.getIntent(key);
    if (!receipt) {
      const selected = choose();
      if (!isProviderConnectorId(selected?.connectorId)) throw new ProviderRouteError('provider_profile_invalid', 'Choose a configured task provider.', 400);
      const modelId = input.modelId ?? selected.modelId ?? null;
      if (modelId !== null && (typeof modelId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(modelId))) throw new ProviderRouteError('provider_model_invalid', 'Choose a supported model.', 400);
      receipt = this.execution.reserveIntent(key, createHash('sha256').update(input.clientThreadId).digest('hex'), {
        kind: 'provider-create-route', connectorId: selected.connectorId, modelId,
      }).intent;
    }
    if (!isProviderConnectorId(receipt.connectorId) || receipt.kind !== 'provider-create-route'
      || receipt.modelId !== null && (typeof receipt.modelId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(receipt.modelId))) throw new ProviderRouteError('provider_route_corrupt', 'The saved creation route needs recovery.', 503);
    if ((input.connectorId !== undefined && input.connectorId !== receipt.connectorId)
      || (input.modelId !== undefined && receipt.modelId !== null && input.modelId !== receipt.modelId)) {
      throw new ProviderRouteError('runtime_identity_mismatch', 'This request is already bound to its original provider and model. Retry it there or start a new chat.');
    }
    return { connectorId: receipt.connectorId, modelId: receipt.modelId };
  }
  close() { this.coordinator?.close(); this.coordinator = null; }
}
