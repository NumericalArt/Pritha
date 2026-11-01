import path from "node:path";
import { openVoiceJournal } from "../../../../../scripts/neuraldeep/voice-journal-store.mjs";
import { NeuralDeepProviderService } from "../../../../../scripts/neuraldeep/provider-service.mjs";
import { VoiceProviderError } from "../../../../../scripts/neuraldeep/voice-provider.mjs";
import { resolvePrithaRoot, resolvePrithaStateRoot, resolvePrithaStatePath } from "../pritha-paths";
import { requireVoiceEngine } from "../realtime/voice-engine-server";
import { DEFAULT_CHAINED_VOICE_SETTINGS } from "./settings";
import { normalizeChainedVoiceSettings } from "./settings";
import { providerSettingsStore } from "../settings/provider-settings-server";

export function getChainedVoiceSettings() { return normalizeChainedVoiceSettings(providerSettingsStore().read().neuraldeepVoice); }

function createHost() {
  const root = resolvePrithaRoot(), stateRoot = resolvePrithaStateRoot();
  const directory = path.join(stateRoot === root ? path.join(root, ".private") : stateRoot, "codex-chat", "execution");
  const store = openVoiceJournal({ stateRoot, directory });
  const service = new NeuralDeepProviderService({ root, stateRoot, privateRoot: resolvePrithaStatePath("private", "task-chat", "neuraldeep"), requireCli: false });
  process.once("exit", () => store.close());
  return {
    voiceJournal: () => store.journal,
    assertAllowed() {
      requireVoiceEngine("neuraldeep");
      if (!store.coordinator.admission().enabled) throw new VoiceProviderError("provider_capacity");
    },
    async acquire(input: { attemptId: string; signal: AbortSignal; sessionId: string; workloadId: string }) {
      this.assertAllowed(); input.signal.throwIfAborted();
      const snapshot = await service.snapshot(DEFAULT_CHAINED_VOICE_SETTINGS.model);
      input.signal.throwIfAborted(); this.assertAllowed();
      if (snapshot.status !== "ready") throw new VoiceProviderError(snapshot.status === "pending-auth" ? "provider_auth" : snapshot.status === "rate-limited" ? "provider_capacity" : "provider_unavailable");
      const limit = Number((snapshot.capabilities as unknown as Record<string, unknown>).parallelLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64) throw new VoiceProviderError("provider_capacity");
      const lease = store.coordinator.claim([`voice-http:${input.attemptId}`], input.attemptId, {
        kind: "turn", capacity: store.coordinator.admission().capacity,
        detail: { executionKind: "voice-http", requestId: input.attemptId, sessionId: input.sessionId, turnId: input.workloadId },
      });
      if (!lease) throw new VoiceProviderError("provider_capacity");
      try {
        let slot = false;
        for (let i = 0; i < limit && !slot; i++) slot = store.coordinator.extend(lease.owner, lease.generation, [`provider-slot:neuraldeep:${i}`]);
        if (!slot) throw new VoiceProviderError("provider_capacity");
        lease.assertOwned();
        return { release: async (_outcome?: string) => lease.release() };
      } catch (error) { lease.release(); throw error; }
    },
  };
}
type Host = ReturnType<typeof createHost>;
declare global { var __prithaVoiceHosts: Map<string, Host> | undefined; }
export function getVoiceHost() {
  const key = resolvePrithaStateRoot();
  const hosts = globalThis.__prithaVoiceHosts ||= new Map<string, Host>();
  if (!hosts.has(key)) hosts.set(key, createHost());
  return hosts.get(key)!;
}
export function assertVoiceDispatchAllowed() { getVoiceHost().assertAllowed(); }
