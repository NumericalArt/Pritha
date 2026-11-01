import type { ProviderSettings, ProviderPreset, ProviderConnectorId, VoiceEngine } from "./provider-profile.mjs";
export type RuntimeSettingsDocument = Record<string, unknown>;
export type ProviderSettingsSnapshot = ProviderSettings & { revision: number; voiceEngine: VoiceEngine };
export type ProviderSettingsPatch = { expectedRevision: number; activeConnectorId?: ProviderConnectorId; connectorId?: ProviderConnectorId; preset?: Partial<ProviderPreset>; voiceEngine?: VoiceEngine };
export class RuntimeSettingsStore {
  constructor(file: string, options?: { allowedRoot?: string });
  read(): RuntimeSettingsDocument;
  mutate(change: (current: RuntimeSettingsDocument) => RuntimeSettingsDocument, options?: {expectedRevision?: number}): RuntimeSettingsDocument;
  recoveryStatus(): { fingerprint: string; previousAvailable: boolean };
  restorePrevious(fingerprint: string, validate?: (value: RuntimeSettingsDocument) => unknown): RuntimeSettingsDocument;
}
export function providerSettingsSnapshot(document: RuntimeSettingsDocument, options?: {legacy?: Record<string, unknown>; defaultConnector?: ProviderConnectorId}): ProviderSettingsSnapshot;
export function updateStoredProviderSettings(store: RuntimeSettingsStore, patch: ProviderSettingsPatch, options?: {legacy?: Record<string, unknown>; defaultConnector?: ProviderConnectorId}): ProviderSettingsSnapshot;
export function mergeLegacyRuntimeSettings(current: RuntimeSettingsDocument, legacy: RuntimeSettingsDocument): RuntimeSettingsDocument;
