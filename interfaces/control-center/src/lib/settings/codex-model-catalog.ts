export type CodexServiceTier = "standard" | "fast";
export type CodexReasoningEffort = string;

export type CodexReasoningEffortOption = {
  id: CodexReasoningEffort;
  label: string;
  description: string;
};

export type CodexModelServiceTier = {
  id: string;
  name: string;
  description: string;
};

export type CodexModelCatalogItem = {
  id: string;
  label: string;
  description: string;
  isDefault: boolean;
  defaultReasoningEffort: CodexReasoningEffort;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
  serviceTiers: CodexModelServiceTier[];
};

export type CodexModelCatalog = {
  source: "app-server" | "fallback";
  refreshedAt: string;
  models: CodexModelCatalogItem[];
  warning?: string;
};

export type CodexSelection = {
  model: string;
  effort: CodexReasoningEffort;
  serviceTier: CodexServiceTier;
};

export const DEFAULT_CODEX_SELECTION: CodexSelection = {
  model: "gpt-5.6-sol",
  effort: "medium",
  serviceTier: "standard",
};

export const CODEX_REASONING_EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;

const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

const EFFORT_DESCRIPTIONS: Record<string, string> = {
  low: "Faster answers with light reasoning.",
  medium: "Balanced reasoning for everyday work.",
  high: "More reasoning for complex tasks.",
  xhigh: "Extra-high reasoning for difficult tasks.",
  max: "Maximum single-agent reasoning.",
  ultra: "Maximum reasoning with automatic task delegation.",
};

const SAFE_EFFORT_TOKEN = /^[a-z][a-z0-9_-]{0,31}$/;
const SAFE_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_SERVICE_TIER_ID = /^[a-z][a-z0-9_-]{0,31}$/;

function text(value: unknown, maxLength = 400) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function isSafeCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === "string" && SAFE_EFFORT_TOKEN.test(value);
}

export function normalizeCodexReasoningEffortToken(value: unknown, fallback: CodexReasoningEffort = "medium") {
  if (value === "very_high") return "xhigh";
  return isSafeCodexReasoningEffort(value) ? value : fallback;
}

export function codexReasoningEffortLabel(effort: string) {
  if (EFFORT_LABELS[effort]) return EFFORT_LABELS[effort];
  return effort
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Custom";
}

function fallbackEffort(id: string): CodexReasoningEffortOption {
  return {
    id,
    label: codexReasoningEffortLabel(id),
    description: EFFORT_DESCRIPTIONS[id] || "Model-advertised reasoning effort.",
  };
}

const LOW_TO_XHIGH = CODEX_REASONING_EFFORT_ORDER.slice(0, 4).map(fallbackEffort);
const LOW_TO_MAX = CODEX_REASONING_EFFORT_ORDER.slice(0, 5).map(fallbackEffort);
const LOW_TO_ULTRA = CODEX_REASONING_EFFORT_ORDER.map(fallbackEffort);
const FAST_TIER: CodexModelServiceTier[] = [
  {
    id: "priority",
    name: "Fast",
    description: "About 1.5x faster with increased Codex usage.",
  },
];

function fallbackModel(
  id: string,
  label: string,
  description: string,
  efforts: CodexReasoningEffortOption[],
  fast: boolean,
  isDefault = false,
): CodexModelCatalogItem {
  return {
    id,
    label,
    description,
    isDefault,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: efforts.map((effort) => ({ ...effort })),
    serviceTiers: fast ? FAST_TIER.map((tier) => ({ ...tier })) : [],
  };
}

export const FALLBACK_CODEX_MODELS: CodexModelCatalogItem[] = [
  fallbackModel("gpt-5.6-sol", "GPT-5.6 Sol", "Complex, open-ended work with detail and polish.", LOW_TO_ULTRA, true, true),
  fallbackModel("gpt-5.6-terra", "GPT-5.6 Terra", "Everyday Codex workhorse.", LOW_TO_ULTRA, true),
  fallbackModel("gpt-5.6-luna", "GPT-5.6 Luna", "Clear, repeatable work.", LOW_TO_MAX, true),
  fallbackModel("gpt-5.5", "GPT-5.5", "Previous frontier Codex model.", LOW_TO_XHIGH, true),
  fallbackModel("gpt-5.4", "GPT-5.4", "General-purpose Codex model.", LOW_TO_XHIGH, true),
  fallbackModel("gpt-5.4-mini", "GPT-5.4 Mini", "Smaller Codex model.", LOW_TO_XHIGH, false),
  fallbackModel("gpt-5.3-codex-spark", "GPT-5.3 Codex Spark", "Fast model for near-instant coding iteration.", LOW_TO_XHIGH, false),
];

export function fallbackCodexModelCatalog(now = new Date()): CodexModelCatalog {
  return {
    source: "fallback",
    refreshedAt: now.toISOString(),
    models: FALLBACK_CODEX_MODELS.map((model) => ({
      ...model,
      supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({ ...effort })),
      serviceTiers: model.serviceTiers.map((tier) => ({ ...tier })),
    })),
    warning: "Live Codex catalog unavailable; built-in fallback is active.",
  };
}

export function normalizeCodexModelList(payload: unknown): CodexModelCatalogItem[] {
  const root = record(payload);
  const rawModels = Array.isArray(root?.data) ? root.data : [];
  const models: CodexModelCatalogItem[] = [];

  for (const rawModel of rawModels.slice(0, 100)) {
    const value = record(rawModel);
    if (!value || value.hidden !== false) continue;
    const id = text(value.id || value.model, 128);
    if (!SAFE_MODEL_ID.test(id)) continue;

    const effortRows = Array.isArray(value.supportedReasoningEfforts) ? value.supportedReasoningEfforts : [];
    const supportedReasoningEfforts = uniqueById(
      effortRows
        .map((row) => record(row))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => {
          const effort = normalizeCodexReasoningEffortToken(row.reasoningEffort, "");
          if (!isSafeCodexReasoningEffort(effort)) return null;
          return {
            id: effort,
            label: codexReasoningEffortLabel(effort),
            description: text(row.description) || EFFORT_DESCRIPTIONS[effort] || "Model-advertised reasoning effort.",
          };
        })
        .filter((row): row is CodexReasoningEffortOption => Boolean(row)),
    );
    if (!supportedReasoningEfforts.length) continue;

    const tierRows = Array.isArray(value.serviceTiers) ? value.serviceTiers : [];
    const serviceTiers = uniqueById(
      tierRows
        .map((row) => record(row))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => {
          const tierId = text(row.id, 32).toLowerCase();
          if (!SAFE_SERVICE_TIER_ID.test(tierId)) return null;
          return {
            id: tierId,
            name: text(row.name, 80) || tierId,
            description: text(row.description) || "Model-advertised service tier.",
          };
        })
        .filter((row): row is CodexModelServiceTier => Boolean(row)),
    );

    const advertisedDefault = normalizeCodexReasoningEffortToken(value.defaultReasoningEffort, "");
    const defaultReasoningEffort = supportedReasoningEfforts.some((effort) => effort.id === advertisedDefault)
      ? advertisedDefault
      : supportedReasoningEfforts.find((effort) => effort.id === "medium")?.id || supportedReasoningEfforts[0].id;

    models.push({
      id,
      label: text(value.displayName, 120) || id,
      description: text(value.description) || "Available from the local Codex catalog.",
      isDefault: value.isDefault === true,
      defaultReasoningEffort,
      supportedReasoningEfforts,
      serviceTiers,
    });
  }

  return uniqueById(models);
}

export function codexModelSupportsEffort(model: CodexModelCatalogItem, effort: string) {
  return model.supportedReasoningEfforts.some((option) => option.id === effort);
}

export function codexModelSupportsFast(model: CodexModelCatalogItem) {
  return model.serviceTiers.some((tier) => tier.id === "priority" || tier.id === "fast");
}

export function closestSupportedCodexReasoningEffort(model: CodexModelCatalogItem, effort: string) {
  if (codexModelSupportsEffort(model, effort)) return effort;
  const requestedIndex = CODEX_REASONING_EFFORT_ORDER.indexOf(effort as (typeof CODEX_REASONING_EFFORT_ORDER)[number]);
  if (requestedIndex >= 0) {
    for (let index = requestedIndex - 1; index >= 0; index -= 1) {
      const candidate = CODEX_REASONING_EFFORT_ORDER[index];
      if (codexModelSupportsEffort(model, candidate)) return candidate;
    }
  }
  return model.defaultReasoningEffort;
}

export function reconcileCodexSelectionForModel(model: CodexModelCatalogItem, selection: CodexSelection) {
  const effort = closestSupportedCodexReasoningEffort(model, selection.effort);
  const serviceTier: CodexServiceTier = selection.serviceTier === "fast" && !codexModelSupportsFast(model) ? "standard" : selection.serviceTier;
  return {
    model: model.id,
    effort,
    serviceTier,
    effortChanged: effort !== selection.effort,
    serviceTierChanged: serviceTier !== selection.serviceTier,
  };
}

export function validateCodexSelection(selection: CodexSelection, models: CodexModelCatalogItem[], current?: CodexSelection) {
  if (selection.serviceTier !== "standard" && selection.serviceTier !== "fast") {
    return { ok: false as const, error: "invalid_codex_service_tier" as const };
  }
  const model = models.find((item) => item.id === selection.model);
  if (!model) {
    const unchangedCustom = Boolean(
      current
      && selection.model === current.model
      && selection.effort === current.effort
      && selection.serviceTier === current.serviceTier,
    );
    return unchangedCustom
      ? { ok: true as const, custom: true as const }
      : { ok: false as const, error: "unavailable_codex_model" as const };
  }
  if (!isSafeCodexReasoningEffort(selection.effort) || !codexModelSupportsEffort(model, selection.effort)) {
    return { ok: false as const, error: "unsupported_codex_reasoning_effort" as const };
  }
  if (selection.serviceTier === "fast" && !codexModelSupportsFast(model)) {
    return { ok: false as const, error: "unsupported_codex_service_tier" as const };
  }
  return { ok: true as const, custom: false as const };
}

export function codexAppServiceTier(serviceTier: CodexServiceTier) {
  return serviceTier === "fast" ? "priority" : "default";
}

export function codexCliServiceTier(serviceTier: CodexServiceTier) {
  return serviceTier === "fast" ? "fast" : "default";
}

export function codexAppTurnSettings(selection: CodexSelection) {
  return {
    model: selection.model,
    effort: selection.effort,
    serviceTier: codexAppServiceTier(selection.serviceTier),
  };
}

export function codexCliConfigEntries(selection: CodexSelection) {
  const entries = [
    `model_reasoning_effort="${selection.effort}"`,
    `service_tier="${codexCliServiceTier(selection.serviceTier)}"`,
  ];
  if (selection.serviceTier === "fast") entries.push("features.fast_mode=true");
  return entries;
}

export function createCodexModelCatalogLoader(
  fetchLiveCatalog: () => Promise<unknown>,
  options: { ttlMs?: number; now?: () => number; fallbackModels?: CodexModelCatalogItem[] } = {},
) {
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  const fallbackModels = options.fallbackModels ?? FALLBACK_CODEX_MODELS;
  let cached: { expiresAt: number; value: CodexModelCatalog } | null = null;
  let inFlight: Promise<CodexModelCatalog> | null = null;

  return async function loadCodexModelCatalog() {
    const currentTime = now();
    if (cached && currentTime < cached.expiresAt) return cached.value;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      let value: CodexModelCatalog;
      try {
        const models = normalizeCodexModelList(await fetchLiveCatalog());
        if (!models.length) throw new Error("empty_codex_model_catalog");
        value = {
          source: "app-server",
          refreshedAt: new Date(now()).toISOString(),
          models,
        };
      } catch {
        value = {
          source: "fallback",
          refreshedAt: new Date(now()).toISOString(),
          models: fallbackModels.map((model) => ({
            ...model,
            supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({ ...effort })),
            serviceTiers: model.serviceTiers.map((tier) => ({ ...tier })),
          })),
          warning: "Live Codex catalog unavailable; built-in fallback is active.",
        };
      }
      cached = { expiresAt: now() + ttlMs, value };
      return value;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
}
