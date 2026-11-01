/** Provider policy shared by the CLI, server and UI. No I/O or credentials here. */
export const PROVIDER_CONNECTOR_IDS = Object.freeze(["codex", "neuraldeep", "claude", "openrouter", "local"]);
export const PROVIDER_LABELS = Object.freeze({ codex: "Codex", neuraldeep: "NeuralDeep", claude: "Claude Code", openrouter: "OpenRouter", local: "Local" });
export const VOICE_ENGINES = Object.freeze(["auto", "openai", "neuraldeep"]);
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const DEFAULT_MODELS = Object.freeze({ codex: "gpt-5.6-sol", neuraldeep: "qwen3.8-27b", claude: "sonnet", openrouter: "", local: "" });

export class ProviderConfigurationError extends Error {
  constructor(code, message) { super(message); this.name = "ProviderConfigurationError"; this.code = code; }
}
function invalid(code = "provider_configuration_invalid") {
  throw new ProviderConfigurationError(code, "Provider configuration is invalid. Review this provider in Settings.");
}
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function isProviderConnectorId(value) { return PROVIDER_CONNECTOR_IDS.includes(value); }
export function normalizeProviderConnectorId(value) {
  if (value === "codex-native") return "codex";
  if (!isProviderConnectorId(value)) invalid("provider_profile_invalid");
  return value;
}

export function connectorForBootstrapProfile(profile) {
  if (["minimal", "local", "control-center", "control-center-tailscale"].includes(profile)) return "codex";
  if (["neuraldeep", "claude", "openrouter"].includes(profile)) return profile;
  if (profile === "local-model") return "local";
  invalid("bootstrap_profile_invalid");
}

/** Existing threads bypass default selection: they must use their saved binding. */
export function resolveProviderSelection({ connector, env = {}, instance = {}, setup = {} } = {}) {
  const candidates = [
    ["explicit", connector], ["environment", env.PRITHA_PROVIDER_PROFILE],
    ["instance", instance.providerProfile], ["setup", setup.providerProfile],
  ];
  const [source, value] = candidates.find(([, item]) => item !== undefined) || ["default", "codex"];
  const connectorId = normalizeProviderConnectorId(value);
  return { connectorId, providerProfile: connectorId === "codex" ? "codex-native" : connectorId, source };
}

export function defaultProviderPreset(connectorId) {
  if (!isProviderConnectorId(connectorId)) invalid("provider_profile_invalid");
  return { modelId: DEFAULT_MODELS[connectorId], reasoningEffort: connectorId === "neuraldeep" ? "xhigh" : "medium", timeoutMs: 1_800_000 };
}

export function normalizeLocalProviderUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\/(?:127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?(?:\/v1\/?|\/?)$/.test(value)) invalid("local_endpoint_invalid");
  let url;
  try { url = new URL(value); } catch { invalid("local_endpoint_invalid"); }
  if (url.username || url.password || url.search || url.hash) invalid("local_endpoint_invalid");
  url.pathname = "/v1";
  return url.href;
}

export function normalizeProviderPreset(connectorId, value, fallback = defaultProviderPreset(connectorId)) {
  if (!isProviderConnectorId(connectorId) || !record(value)) invalid();
  const allowed = new Set(["modelId", "reasoningEffort", "thinkingBudget", "timeoutMs", "baseUrl", "authMode"]);
  if (Object.keys(value).some(key => !allowed.has(key))) invalid("provider_preset_field_invalid");
  const preset = { ...fallback, ...value };
  if (typeof preset.modelId !== "string" || (preset.modelId !== "" && !/^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(preset.modelId))) invalid("provider_model_invalid");
  if (!EFFORTS.has(preset.reasoningEffort)) invalid("provider_effort_invalid");
  if (!Number.isSafeInteger(preset.timeoutMs) || preset.timeoutMs < 10_000 || preset.timeoutMs > 3_600_000) invalid("provider_timeout_invalid");
  if (preset.thinkingBudget !== undefined && (!Number.isSafeInteger(preset.thinkingBudget) || preset.thinkingBudget < 0 || preset.thinkingBudget > 200_000)) invalid("provider_thinking_budget_invalid");
  if (preset.baseUrl !== undefined) {
    if (connectorId !== "local") invalid("provider_endpoint_fixed");
    preset.baseUrl = normalizeLocalProviderUrl(preset.baseUrl);
  }
  if (preset.authMode !== undefined && (connectorId !== "claude" || !["api-key", "local-cli-session"].includes(preset.authMode))) invalid("provider_auth_mode_invalid");
  return preset;
}

export function normalizeProviderSettings(value = {}, { legacy = {}, defaultConnector = "codex" } = {}) {
  if (!record(value) || (value.version !== undefined && value.version !== 1)) invalid("provider_settings_version_invalid");
  if (Object.keys(value).some(key => !["version", "activeConnectorId", "providerPresets"].includes(key))) invalid("provider_settings_field_invalid");
  const raw = value.providerPresets ?? {};
  if (!record(raw) || Object.keys(raw).some(key => !isProviderConnectorId(key))) invalid("provider_presets_invalid");
  const providerPresets = Object.fromEntries(PROVIDER_CONNECTOR_IDS.map(id => {
    const fallback = defaultProviderPreset(id);
    if (id === "codex") {
      if (typeof legacy.codexModel === "string") fallback.modelId = legacy.codexModel;
      if (EFFORTS.has(legacy.codexReasoningEffort)) fallback.reasoningEffort = legacy.codexReasoningEffort;
      if (Number.isSafeInteger(legacy.codexTimeoutMs) && legacy.codexTimeoutMs >= 10_000 && legacy.codexTimeoutMs <= 3_600_000) fallback.timeoutMs = legacy.codexTimeoutMs;
    }
    return [id, normalizeProviderPreset(id, raw[id] ?? {}, fallback)];
  }));
  return { version: 1, activeConnectorId: normalizeProviderConnectorId(value.activeConnectorId ?? defaultConnector), providerPresets };
}

export function updateProviderPreset(settings, connectorId, patch) {
  const current = normalizeProviderSettings(settings);
  if (!isProviderConnectorId(connectorId)) invalid("provider_profile_invalid");
  return { ...current, providerPresets: { ...current.providerPresets,
    [connectorId]: normalizeProviderPreset(connectorId, patch, current.providerPresets[connectorId]) } };
}

export function readyProviderConnectors(statuses) {
  return PROVIDER_CONNECTOR_IDS.filter(id => statuses?.[id]?.status === "ready");
}

export function assertProviderBinding(binding, requested) {
  if (!record(binding) || !isProviderConnectorId(binding.connectorId) || typeof binding.modelId !== "string" || !binding.modelId || typeof binding.sessionId !== "string" || !binding.sessionId) invalid("runtime_identity_mismatch");
  if (binding.connectorId !== requested.connectorId || (requested.modelId !== undefined && requested.modelId !== binding.modelId)
      || (requested.sessionId !== undefined && requested.sessionId !== binding.sessionId)) invalid("runtime_identity_mismatch");
  return binding;
}

export function resolveVoiceEngine({ connectorId, engine = "auto", configured = {}, offline = false, preferredEngine = "openai" }) {
  if (!isProviderConnectorId(connectorId) || !VOICE_ENGINES.includes(engine) || !["openai", "neuraldeep"].includes(preferredEngine)) invalid("voice_engine_invalid");
  if (offline || (connectorId === "local" && engine === "auto")) {
    if (engine !== "auto") invalid("voice_network_disallowed");
    return { engine: null, reason: "offline" };
  }
  const selected = engine !== "auto" ? engine : connectorId === "codex" ? "openai"
    : connectorId === "neuraldeep" ? "neuraldeep"
      : configured[preferredEngine] ? preferredEngine : preferredEngine === "openai" ? "neuraldeep" : "openai";
  return configured[selected] === true ? { engine: selected, reason: "configured" } : { engine: null, reason: "pending-auth" };
}
