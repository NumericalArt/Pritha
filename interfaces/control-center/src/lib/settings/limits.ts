import { getOpenAICredentialsStatus } from "./openai-credentials";
import { readCodexRateLimits } from "./codex-rate-limits";

export async function getSettingsLimitsState() {
  const credentials = getOpenAICredentialsStatus();
  const codexRateLimits = await readCodexRateLimits();
  return {
    codexSubscription: {
      status: codexRateLimits.status,
      source: codexRateLimits.source,
      detail: codexRateLimits.detail,
      checkedAt: codexRateLimits.checkedAt,
      rateLimits: codexRateLimits.rateLimits,
      rateLimitsByLimitId: codexRateLimits.rateLimitsByLimitId,
      commands: codexRateLimits.commands,
    },
    realtimeUsage: {
      status: "collecting",
      detail: "Realtime response.done usage collection is planned for local daily and weekly estimates.",
      today: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      week: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    },
    openaiApiUsage: {
      status: credentials.adminApiKey.configured ? "ready" : "missing_admin_key",
      detail: credentials.adminApiKey.configured
        ? "Admin API telemetry can be enabled as a read-only follow-up."
        : "OPENAI_ADMIN_API_KEY is optional and only needed for Admin API usage/cost telemetry.",
    },
    localPausePolicy: {
      enabled: false,
      thresholdPercent: 30,
      action: "block_codex_deep_tasks",
      source: "planned",
      detail: "Future enforcement should block new expensive Codex tasks, not the whole Control Center.",
    },
  };
}
