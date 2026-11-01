import path from "node:path";
import { RuntimeSettingsStore, providerSettingsSnapshot, updateStoredProviderSettings, type ProviderSettingsPatch } from "../../../../../scripts/lib/runtime-settings-store.mjs";
import { ProviderConfigurationError, resolveProviderSelection } from "./provider-profile";
import { PrithaStateFileError, resolvePrithaSetupFile, resolvePrithaStatePath, resolvePrithaStateRoot, resolvePrithaRoot } from "../pritha-paths";
import { getPrithaRuntimeSettings } from "../realtime/pritha-runtime";
import { getCodexModelCatalog } from "./codex-model-catalog-server";
import { validateCodexSelection, normalizeCodexReasoningEffortToken } from "./codex-model-catalog";

export function providerSettingsStore() {
  return new RuntimeSettingsStore(resolvePrithaStatePath("private", "interface-lab", "pritha-control-center", "realtime", "runtime-settings.json"), { allowedRoot: resolvePrithaStateRoot() });
}
function options() {
  const root = resolvePrithaRoot(), stateRoot = resolvePrithaStateRoot();
  const instance = new RuntimeSettingsStore(path.join(root, ".pritha-instance.json"), { allowedRoot: root }).read();
  const setup = new RuntimeSettingsStore(resolvePrithaSetupFile({root, stateRoot}), { allowedRoot: stateRoot }).read();
  return { defaultConnector: resolveProviderSelection({ env: process.env, instance, setup }).connectorId, legacy: getPrithaRuntimeSettings() };
}
export function getProviderSettings() { return providerSettingsSnapshot(providerSettingsStore().read(), options()); }
export async function updateProviderSettings(patch: ProviderSettingsPatch) {
  // Native settings keep their existing catalog/effort constraints through the new API too.
  if (patch?.connectorId === "codex" && patch.preset) {
    const current = getPrithaRuntimeSettings();
    const validation = validateCodexSelection({
      model: patch.preset.modelId ?? current.codexModel,
      effort: normalizeCodexReasoningEffortToken(patch.preset.reasoningEffort ?? current.codexReasoningEffort, ""),
      serviceTier: current.codexServiceTier,
    }, (await getCodexModelCatalog()).models, { model: current.codexModel, effort: current.codexReasoningEffort, serviceTier: current.codexServiceTier });
    if (!validation.ok || (patch.preset.reasoningEffort === "ultra" && current.codexExecutionMode !== "inline_only")) throw new ProviderConfigurationError("provider_model_invalid", "Choose a supported native model and reasoning effort in Settings.");
  }
  return updateStoredProviderSettings(providerSettingsStore(), patch, options());
}
export function providerSettingsErrorResponse(error: unknown) {
  const known = error instanceof ProviderConfigurationError || error instanceof PrithaStateFileError;
  const status = known ? /conflict|busy/.test(error.code) ? 409 : /corrupt|unreadable|write_failed|path_invalid|migration_pending/.test(error.code) ? 503 : 400 : 500;
  return Response.json({ ok: false, error: known ? error.code : "settings_unavailable", message: known ? error.message : "Settings are unavailable. Reload and try again." }, { status, headers: { "Cache-Control": "no-store" } });
}
