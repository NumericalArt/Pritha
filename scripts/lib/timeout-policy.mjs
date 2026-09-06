// Shared host policies. Callers may select a class, never an unbounded timeout.
export const TIMEOUT_POLICIES = Object.freeze({
  releaseReady: Object.freeze({ defaultMs: 45_000, minMs: 100, maxMs: 300_000, env: "PRITHA_UPDATE_HEALTH_TIMEOUT_MS" }),
  releaseRollback: Object.freeze({ defaultMs: 30_000, minMs: 100, maxMs: 300_000, env: "PRITHA_UPDATE_ROLLBACK_HEALTH_TIMEOUT_MS" }),
  releaseRequest: Object.freeze({ defaultMs: 8_000, minMs: 50, maxMs: 60_000, env: "PRITHA_UPDATE_HEALTH_REQUEST_TIMEOUT_MS" }),
  releaseStrict: Object.freeze({ defaultMs: 180_000, minMs: 100, maxMs: 600_000, env: "PRITHA_UPDATE_STRICT_HEALTH_TIMEOUT_MS" }),
});

export function timeoutPolicy(name, { env = process.env, value } = {}) {
  const policy = TIMEOUT_POLICIES[name];
  if (!policy) throw new Error("Unknown timeout policy");
  const raw = value === undefined ? env[policy.env] : value;
  if (raw === undefined) return policy.defaultMs;
  const milliseconds = typeof raw === "number" ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < policy.minMs || milliseconds > policy.maxMs) {
    throw new Error(`${policy.env} must be an integer between ${policy.minMs} and ${policy.maxMs} milliseconds`);
  }
  return milliseconds;
}

export function releaseTimeouts(env = process.env) {
  return Object.fromEntries(Object.keys(TIMEOUT_POLICIES).map((name) => [name, timeoutPolicy(name, { env })]));
}
