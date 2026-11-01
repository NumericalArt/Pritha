import type { ProviderConnectorId } from './provider-profile.mjs';
export type ProviderRoute = { connectorId: ProviderConnectorId; modelId: string | null };
export class ProviderRouteError extends Error { code: string; status: number; retryable: boolean; }
export class ProviderThreadRouting {
  constructor(options: { stateRoot: string; directory: string });
  resolve(input: { clientThreadId: string; connectorId?: ProviderConnectorId; modelId?: string }, choose: () => { connectorId: ProviderConnectorId; modelId?: string | null }): ProviderRoute;
  close(): void;
}
