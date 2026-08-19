import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { atomicWriteFile, withFileLock } from "../lib/atomic-file.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";
import { redactFilesystemPaths } from "../lib/redaction.mjs";

export const DELIVERY_LEDGER_SCHEMA = "pritha-delivery-ledger-v1";
export const DELIVERY_EVENT_SCHEMA = "pritha-delivery-event-v1";
export const DELIVERY_TARGET_CLAIM_SCHEMA = "pritha-delivery-target-claim-v1";

export const DELIVERY_TERMINAL_STATUSES = new Set([
  "verified",
  "awaiting_acceptance",
  "accepted",
  "failed",
  "abandoned",
  "cancelled",
]);
export const DELIVERY_ACTIVE_STATUSES = new Set([
  "created",
  "preparing",
  "building",
  "verifying",
  "correcting",
  "paused",
  "blocked",
]);
export const DELIVERY_STATUSES = new Set([...DELIVERY_ACTIVE_STATUSES, ...DELIVERY_TERMINAL_STATUSES]);

const ALLOWED_TRANSITIONS = new Map([
  ["created", new Set(["preparing", "blocked", "failed", "cancelled"])],
  ["preparing", new Set(["building", "verifying", "blocked", "failed", "cancelled"])],
  ["building", new Set(["verifying", "blocked", "failed", "cancelled"])],
  ["verifying", new Set(["verified", "awaiting_acceptance", "building", "correcting", "blocked", "failed", "cancelled"])],
  ["correcting", new Set(["preparing", "building", "verifying", "blocked", "failed", "cancelled"])],
  ["paused", new Set(["preparing", "building", "verifying", "correcting", "blocked", "cancelled", "abandoned"])],
  ["blocked", new Set(["preparing", "building", "verifying", "correcting", "cancelled", "abandoned"])],
  ["verified", new Set(["accepted", "awaiting_acceptance", "correcting"])],
  ["awaiting_acceptance", new Set(["accepted", "correcting", "cancelled", "abandoned"])],
  ["failed", new Set(["correcting", "cancelled", "abandoned"])],
  ["accepted", new Set()],
  ["abandoned", new Set()],
  ["cancelled", new Set()],
]);

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function boundedText(value, name, maximum = 2_000) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  if (text.length > maximum) throw new Error(`${name} exceeds ${maximum} characters`);
  return text;
}

function safeIdentifier(value, name) {
  const text = boundedText(value, name, 128);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(text)) throw new Error(`${name} contains unsupported characters`);
  return text;
}

function normalizeEvidenceRefs(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("blocker evidence_refs must be a bounded array");
  return value.map((entry) => boundedText(entry, "blocker evidence reference", 500));
}

export function typedBlocker(value = {}) {
  const code = safeIdentifier(value.code, "blocker code").toLowerCase();
  const summary = boundedText(value.summary, "blocker summary", 1_000);
  const question = boundedText(value.question, "blocker question", 1_000);
  if (!question.endsWith("?")) throw new Error("blocker question must be an explicit question ending in ?");
  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 5) {
    throw new Error("blocker requires 2 to 5 bounded answer options");
  }
  const optionIds = new Set();
  const options = value.options.map((entry) => {
    const id = safeIdentifier(entry?.id, "blocker option id").toLowerCase();
    if (optionIds.has(id)) throw new Error("blocker option ids must be unique");
    optionIds.add(id);
    return {
      id,
      label: boundedText(entry?.label, "blocker option label", 160),
      effect: boundedText(entry?.effect, "blocker option effect", 600),
    };
  });
  return { code, summary, question, options, evidence_refs: normalizeEvidenceRefs(value.evidence_refs || []) };
}

export function validateDeliveryLedger(value) {
  const issues = [];
  if (!value || typeof value !== "object" || value.schema !== DELIVERY_LEDGER_SCHEMA) issues.push("unsupported ledger schema");
  if (!DELIVERY_STATUSES.has(value?.status)) issues.push("unsupported delivery status");
  if (!Number.isSafeInteger(value?.version) || value.version < 1) issues.push("ledger version must be a positive integer");
  if (!value?.run_id || !value?.agent_slug || !value?.target_key) issues.push("run_id, agent_slug and target_key are required");
  if (value?.source_project !== undefined && (typeof value.source_project !== "string" || !path.isAbsolute(value.source_project))) {
    issues.push("source_project must be an absolute path when present");
  }
  const hasNextAction = typeof value?.next_action === "string" && value.next_action.trim().length > 0;
  const blockers = Array.isArray(value?.blockers) ? value.blockers : [];
  const hasBlockers = blockers.length > 0;
  if (DELIVERY_ACTIVE_STATUSES.has(value?.status)) {
    if (hasNextAction === hasBlockers) issues.push("active ledger must contain exactly one of next_action or blockers");
    if (value.status === "blocked" && !hasBlockers) issues.push("blocked status requires blockers");
    if (value.status !== "blocked" && hasBlockers) issues.push("only blocked status may carry blockers");
  } else if (hasNextAction || hasBlockers) {
    issues.push("terminal ledger may not carry next_action or blockers");
  }
  for (const blocker of blockers) {
    try {
      typedBlocker(blocker);
    } catch (error) {
      issues.push(error.message);
    }
  }
  if (!value?.budget || !Number.isSafeInteger(value.budget.max_iterations) || value.budget.max_iterations < 1) issues.push("budget.max_iterations must be positive");
  if (!Number.isSafeInteger(value?.budget?.max_elapsed_ms) || value.budget.max_elapsed_ms < 1) issues.push("budget.max_elapsed_ms must be positive");
  if (!Number.isSafeInteger(value?.budget?.repeated_failure_threshold) || value.budget.repeated_failure_threshold < 2) issues.push("budget.repeated_failure_threshold must be at least 2");
  return { ok: issues.length === 0, issues };
}

function assertValidLedger(value) {
  const result = validateDeliveryLedger(value);
  if (!result.ok) throw new Error(`Invalid delivery ledger: ${result.issues.join("; ")}`);
  return value;
}

export function deliveryLedgerPaths(runRoot) {
  const root = path.resolve(runRoot);
  return { runRoot: root, statePath: path.join(root, "build-state.json"), eventsPath: path.join(root, "events.jsonl") };
}

function appendEvent(paths, event) {
  appendFileSync(paths.eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
}

function eventFor(state, type, payload = {}) {
  return {
    schema: DELIVERY_EVENT_SCHEMA,
    event_id: randomUUID(),
    sequence: state.version,
    run_id: state.run_id,
    type: safeIdentifier(type, "event type").toLowerCase(),
    occurred_at: state.updated_at,
    payload,
    state,
  };
}

export function targetKey(projectPath) {
  const resolved = path.resolve(projectPath);
  let canonical = resolved;
  try {
    canonical = realpathSync(resolved);
  } catch {
    // A missing target is still identified by its normalized absolute path.
  }
  return sha256(canonical);
}

export function createDeliveryLedger(runRoot, input = {}) {
  const paths = deliveryLedgerPaths(runRoot);
  mkdirSync(paths.runRoot, { recursive: true });
  if (existsSync(paths.statePath)) throw new Error(`Delivery ledger already exists for run ${input.runId || "unknown"}`);
  const now = input.createdAt || new Date().toISOString();
  const state = assertValidLedger({
    schema: DELIVERY_LEDGER_SCHEMA,
    version: 1,
    run_id: safeIdentifier(input.runId, "run id"),
    agent_slug: safeIdentifier(input.agentSlug, "agent slug").toLowerCase(),
    target_key: boundedText(input.targetKey, "target key", 128),
    target_label: boundedText(input.targetLabel || input.agentSlug, "target label", 256),
    source_project: input.sourceProject ? path.resolve(input.sourceProject) : undefined,
    status: "created",
    phase: "created",
    spec: {
      id: boundedText(input.spec?.id, "spec id", 256),
      semantic_lock: boundedText(input.spec?.semanticLock, "semantic lock", 128),
      document_lock: boundedText(input.spec?.documentLock, "document lock", 128),
      contract_fingerprint: boundedText(input.spec?.contractFingerprint, "contract fingerprint", 128),
      approval_id: boundedText(input.spec?.approvalId, "approval id", 256),
    },
    budget: {
      max_iterations: Number.isSafeInteger(input.budget?.maxIterations) ? input.budget.maxIterations : 6,
      max_elapsed_ms: Number.isSafeInteger(input.budget?.maxElapsedMs) ? input.budget.maxElapsedMs : 90 * 60 * 1_000,
      repeated_failure_threshold: Number.isSafeInteger(input.budget?.repeatedFailureThreshold) ? input.budget.repeatedFailureThreshold : 3,
    },
    iteration: 0,
    consecutive_failure_signature: null,
    consecutive_failure_count: 0,
    failure_history: [],
    workspace: input.workspace || null,
    last_trial_result: null,
    next_action: "prepare_delivery_workspace",
    blockers: [],
    created_at: now,
    updated_at: now,
    accepted_by: null,
    accepted_at: null,
  });
  return withFileLock(paths.statePath, () => {
    if (existsSync(paths.statePath)) throw new Error(`Delivery ledger already exists for run ${state.run_id}`);
    const event = eventFor(state, "run_created", { next_action: state.next_action });
    appendEvent(paths, event);
    atomicWriteFile(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
    return { state, event, ...paths };
  });
}

function parseLedgerText(text) {
  return parseBoundedJson(text, { maxBytes: 5 * 1024 * 1024, maxDepth: 32, maxNodes: 50_000 });
}

export function readDeliveryLedger(runRoot) {
  const paths = deliveryLedgerPaths(runRoot);
  if (!existsSync(paths.statePath)) throw new Error("Delivery ledger does not exist");
  return assertValidLedger(parseLedgerText(readFileSync(paths.statePath, "utf8")));
}

function latestEventState(eventsPath) {
  if (!existsSync(eventsPath)) return null;
  const text = readFileSync(eventsPath, "utf8");
  if (Buffer.byteLength(text) > 50 * 1024 * 1024) throw new Error("Delivery event log exceeds recovery limit");
  let latest = null;
  const lines = text.split("\n");
  const finalLineMayBePartial = !text.endsWith("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = parseBoundedJson(line, { maxBytes: 5 * 1024 * 1024, maxDepth: 40, maxNodes: 60_000 });
    } catch (error) {
      if (finalLineMayBePartial && index === lines.length - 1) break;
      throw error;
    }
    if (event.schema !== DELIVERY_EVENT_SCHEMA || !event.state) throw new Error("Delivery event log contains an unsupported event");
    if (!latest || event.sequence > latest.sequence) latest = event;
  }
  return latest?.state || null;
}

export function recoverDeliveryLedger(runRoot) {
  const paths = deliveryLedgerPaths(runRoot);
  return withFileLock(paths.statePath, () => {
    const recovered = assertValidLedger(latestEventState(paths.eventsPath));
    let current = null;
    try {
      if (existsSync(paths.statePath)) current = assertValidLedger(parseLedgerText(readFileSync(paths.statePath, "utf8")));
    } catch {
      current = null;
    }
    if (!current || current.version < recovered.version) atomicWriteFile(paths.statePath, `${JSON.stringify(recovered, null, 2)}\n`);
    return current && current.version >= recovered.version ? current : recovered;
  });
}

export function updateDeliveryLedger(runRoot, update, options = {}) {
  const paths = deliveryLedgerPaths(runRoot);
  return withFileLock(paths.statePath, () => {
    const current = readDeliveryLedger(paths.runRoot);
    if (options.expectedVersion !== undefined && current.version !== options.expectedVersion) {
      throw new Error(`Delivery ledger changed: expected version ${options.expectedVersion}, found ${current.version}`);
    }
    const proposed = typeof update === "function" ? update(structuredClone(current)) : { ...current, ...update };
    const now = options.updatedAt || new Date().toISOString();
    const next = assertValidLedger({
      ...proposed,
      schema: DELIVERY_LEDGER_SCHEMA,
      version: current.version + 1,
      run_id: current.run_id,
      agent_slug: current.agent_slug,
      target_key: current.target_key,
      created_at: current.created_at,
      updated_at: now,
    });
    const event = eventFor(next, options.eventType || "state_updated", options.payload || {});
    appendEvent(paths, event);
    atomicWriteFile(paths.statePath, `${JSON.stringify(next, null, 2)}\n`);
    return { state: next, event, ...paths };
  });
}

export function transitionDelivery(runRoot, status, options = {}) {
  if (!DELIVERY_STATUSES.has(status)) throw new Error(`Unsupported delivery status: ${status}`);
  return updateDeliveryLedger(runRoot, (current) => {
    if (current.status !== status && !ALLOWED_TRANSITIONS.get(current.status)?.has(status)) {
      throw new Error(`Delivery transition is not allowed: ${current.status} -> ${status}`);
    }
    const terminal = DELIVERY_TERMINAL_STATUSES.has(status);
    const blockers = status === "blocked" ? (options.blockers || []).map(typedBlocker) : [];
    const nextAction = terminal || status === "blocked" ? "" : boundedText(options.nextAction, "next action", 256);
    return {
      ...current,
      status,
      phase: options.phase || status,
      next_action: nextAction,
      blockers,
      workspace: options.workspace === undefined ? current.workspace : options.workspace,
      last_trial_result: options.lastTrialResult === undefined ? current.last_trial_result : options.lastTrialResult,
      accepted_by: status === "accepted" ? "user" : current.accepted_by,
      accepted_at: status === "accepted" ? (options.acceptedAt || new Date().toISOString()) : current.accepted_at,
    };
  }, { ...options, eventType: options.eventType || `status_${status}` });
}

function failureSignature(failures) {
  const projection = (failures || []).map((failure) => ({
    id: failure.id,
    failed_assertions: (failure.assertions || []).filter((entry) => !entry.passed).map((entry) => entry.type).sort(),
    error_code: failure.error?.code || null,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return sha256(JSON.stringify(projection));
}

export function recordDeliveryFailure(runRoot, failures, options = {}) {
  const signature = failureSignature(failures);
  return updateDeliveryLedger(runRoot, (current) => {
    const count = current.consecutive_failure_signature === signature ? current.consecutive_failure_count + 1 : 1;
    const threshold = current.budget.repeated_failure_threshold;
    const entry = { iteration: current.iteration, signature, trial_ids: (failures || []).map((failure) => failure.id).filter(Boolean).slice(0, 100) };
    const base = {
      ...current,
      consecutive_failure_signature: signature,
      consecutive_failure_count: count,
      failure_history: [...(current.failure_history || []), entry].slice(-20),
    };
    if (count < threshold) {
      return { ...base, status: "building", phase: "repair", next_action: "repair_latest_trial_failures", blockers: [] };
    }
    return {
      ...base,
      status: "blocked",
      phase: "repeated_failure",
      next_action: "",
      blockers: [typedBlocker({
        code: "repeated_trial_failure",
        summary: `The same Trial failure signature repeated ${count} times.`,
        question: "How should Pritha proceed with this repeated failure?",
        options: [
          { id: "add-guidance", label: "Add guidance", effect: "Provide one missing constraint or implementation clue, then resume the same approved outcome." },
          { id: "revise-outcome", label: "Revise outcome", effect: "Create a new Outcome Spec revision and require fresh approval before continuing." },
          { id: "stop-run", label: "Stop run", effect: "Abandon this delivery run without changing the active user workspace." },
        ],
        evidence_refs: entry.trial_ids.map((id) => `trial:${id}`),
      })],
    };
  }, { ...options, eventType: "trial_failure_recorded", payload: { signature } });
}

export function budgetBlocker(state, now = Date.now()) {
  const elapsed = now - Date.parse(state.created_at);
  if (state.iteration >= state.budget.max_iterations) {
    return typedBlocker({
      code: "iteration_budget_exhausted",
      summary: `The build used its ${state.budget.max_iterations}-iteration budget.`,
      question: "Should Pritha extend the build budget for this approved outcome?",
      options: [
        { id: "extend-once", label: "Extend once", effect: "Add a bounded number of iterations and continue from the latest evidence." },
        { id: "review-failures", label: "Review failures", effect: "Keep the run blocked and inspect the latest Trial evidence." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without merging or deploying changes." },
      ],
      evidence_refs: ["ledger:iteration"],
    });
  }
  if (Number.isFinite(elapsed) && elapsed >= state.budget.max_elapsed_ms) {
    return typedBlocker({
      code: "elapsed_budget_exhausted",
      summary: "The delivery run reached its elapsed-time budget.",
      question: "Should Pritha extend the elapsed-time budget for this run?",
      options: [
        { id: "extend-once", label: "Extend once", effect: "Grant one bounded time extension and resume." },
        { id: "review-failures", label: "Review failures", effect: "Keep the run blocked and inspect current evidence." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without merging or deployment." },
      ],
      evidence_refs: ["ledger:elapsed"],
    });
  }
  return null;
}

export function deliveryTargetClaimPath(buildsRoot, key) {
  const digest = String(key).replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("target key must be a sha256 identity");
  return path.join(path.resolve(buildsRoot), ".targets", `${digest}.json`);
}

export function claimDeliveryTarget(buildsRoot, input = {}) {
  const claimPath = deliveryTargetClaimPath(buildsRoot, input.targetKey);
  mkdirSync(path.dirname(claimPath), { recursive: true });
  return withFileLock(claimPath, () => {
    let existing = null;
    if (existsSync(claimPath)) {
      try {
        existing = parseBoundedJson(readFileSync(claimPath, "utf8"), { maxBytes: 64 * 1024, maxDepth: 8, maxNodes: 128 });
      } catch {
        existing = null;
      }
    }
    if (existing?.schema === DELIVERY_TARGET_CLAIM_SCHEMA && existing.run_id !== input.runId && !existing.released_at) {
      let active = true;
      try {
        active = DELIVERY_ACTIVE_STATUSES.has(readDeliveryLedger(existing.run_root).status);
      } catch {
        active = true;
      }
      if (active) throw new Error(`Another delivery run already owns this target: ${existing.run_id}`);
    }
    const claim = {
      schema: DELIVERY_TARGET_CLAIM_SCHEMA,
      target_key: input.targetKey,
      run_id: safeIdentifier(input.runId, "run id"),
      run_root: path.resolve(input.runRoot),
      claimed_at: input.claimedAt || new Date().toISOString(),
      released_at: null,
    };
    atomicWriteFile(claimPath, `${JSON.stringify(claim, null, 2)}\n`);
    return { claimPath, claim };
  });
}

export function releaseDeliveryTarget(claimPathValue, runId, options = {}) {
  const claimPath = path.resolve(claimPathValue);
  return withFileLock(claimPath, () => {
    if (!existsSync(claimPath)) return { released: false, reason: "claim_missing" };
    const claim = parseBoundedJson(readFileSync(claimPath, "utf8"), { maxBytes: 64 * 1024, maxDepth: 8, maxNodes: 128 });
    if (claim.run_id !== runId) return { released: false, reason: "claim_owned_by_another_run" };
    if (claim.released_at) return { released: true, claim };
    const next = { ...claim, released_at: options.releasedAt || new Date().toISOString() };
    atomicWriteFile(claimPath, `${JSON.stringify(next, null, 2)}\n`);
    return { released: true, claim: next };
  });
}

export function redactDeliveryStateForReport(state, options = {}) {
  const text = redactFilesystemPaths(JSON.stringify(state), options);
  return JSON.parse(text);
}
