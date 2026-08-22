import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { today } from "../lib/date.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaStatePathFrom, resolveTechscopeRoot } from "../lib/paths.mjs";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { slug } from "../lib/slug.mjs";
import { writeLifecycleReport } from "./lifecycle-report.mjs";
import { createBuildExecutor } from "./build-executors.mjs";
import {
  budgetBlocker,
  claimDeliveryTarget,
  createDeliveryLedger,
  deliveryTargetClaimPath,
  readDeliveryLedger,
  recordDeliveryFailure,
  releaseDeliveryTarget,
  targetKey,
  transitionDelivery,
  typedBlocker,
  updateDeliveryLedger,
} from "./delivery-ledger.mjs";
import {
  captureProtectedTrialInputs,
  commitVerifiedCheckpoint,
  discardDeliveryIteration,
  DeliveryWorkspaceError,
  prepareDeliveryWorktree,
  readDeliveryWorktree,
  verifyProtectedTrialInputs,
} from "./delivery-worktree.mjs";
import { compileOutcomeSpec, TRIAL_PLAN_SCHEMA, verifyOutcomeApproval } from "./outcome-spec.mjs";
import { runTrialPlan, verifyTrialResultFreshness } from "./trial-runner.mjs";

export class DeliveryLoopError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DeliveryLoopError";
    this.code = code;
    this.details = details;
  }
}

function bounded(value, maximum = 2_000) {
  const text = String(value || "").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 3)}...`;
}

function sanitize(value, context) {
  if (typeof value === "string") return redactFilesystemPaths(value, context);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry, context)]));
  return value;
}

function assertPlan(plan) {
  if (!plan || plan.schema !== TRIAL_PLAN_SCHEMA || !plan.spec_id || !plan.agent_slug || !Array.isArray(plan.trials)) {
    throw new DeliveryLoopError("trial_plan_invalid", "Delivery requires a compiled Trial plan");
  }
  return plan;
}

function approvedPlanBinding(plan, options = {}) {
  if (!plan.approval_id) {
    if (options.allowDraft) return { ok: true, draft: true, event: null };
    throw new DeliveryLoopError("outcome_approval_stale", "Delivery plan has no user approval evidence");
  }
  const approval = verifyOutcomeApproval(plan.spec_path, options);
  const event = approval.event;
  const matches = approval.ok
    && event?.approval_id === plan.approval_id
    && event?.semantic_lock === plan.semantic_lock
    && event?.document_lock === plan.document_lock
    && event?.contract_fingerprint === plan.contract_fingerprint;
  if (!matches) {
    throw new DeliveryLoopError(
      "outcome_approval_stale",
      `The approved Outcome Spec binding is no longer current${approval.reasons?.length ? `: ${approval.reasons.join(", ")}` : ""}`,
    );
  }
  return approval;
}

function policyBoundOptions(plan, options = {}) {
  const policy = plan.delivery_policy || {};
  const trialBackend = options.trialBackend
    || (policy.trial_backend_policy === "app-server-required" ? "app-server" : "local");
  if (policy.trial_backend_policy === "app-server-required" && trialBackend !== "app-server") {
    throw new DeliveryLoopError("trial_backend_policy_conflict", "The approved contract requires the App Server Trial backend");
  }
  if (policy.trial_backend_policy === "local-trusted-only" && trialBackend !== "local") {
    throw new DeliveryLoopError("trial_backend_policy_conflict", "The approved contract restricts Trials to the trusted local backend");
  }
  return {
    ...options,
    buildExecutor: options.buildExecutor || policy.build_executor || "codex-app-server",
    trialBackend,
    buildGitMode: policy.build_git_mode || "disposable-worktree",
    allowNoGitInPlace: policy.build_git_mode === "no-git-in-place",
    budget: {
      maxIterations: options.budget?.maxIterations || policy.max_iterations || 6,
      maxElapsedMs: options.budget?.maxElapsedMs || policy.max_elapsed_ms || 5_400_000,
      repeatedFailureThreshold: options.budget?.repeatedFailureThreshold || policy.repeated_failure_threshold || 3,
    },
  };
}

function blockerForError(error) {
  const code = error?.code || "delivery_error";
  const summary = bounded(error instanceof Error ? error.message : String(error), 1_000);
  const definitions = {
    dirty_workspace: {
      question: "How should Pritha proceed while the active project contains user changes?",
      options: [
        { id: "retry-after-clean", label: "Retry after clean", effect: "You commit or otherwise resolve the active changes, then Pritha creates a disposable worktree." },
        { id: "use-clean-clone", label: "Use clean clone", effect: "Abandon this target-bound run, then start a new delivery run against a clean clone." },
        { id: "stop-run", label: "Stop run", effect: "Abandon delivery without touching the active changes." },
      ],
    },
    git_required: {
      question: "Which safe delivery surface should Pritha use for this non-Git project?",
      options: [
        { id: "initialize-git", label: "Initialize Git", effect: "You authorize a separate Git initialization step before delivery resumes." },
        { id: "use-clean-clone", label: "Use Git clone", effect: "Abandon this target-bound run, initialize a new delivery run against a clean Git clone." },
        { id: "stop-run", label: "Stop run", effect: "Keep the project unchanged and abandon this run." },
      ],
    },
    target_busy: {
      question: "How should Pritha handle the other active delivery run for this target?",
      options: [
        { id: "resume-existing", label: "Resume existing", effect: "Abandon this duplicate and resume the owning run identified in the blocker evidence." },
        { id: "stop-new-run", label: "Stop new run", effect: "Abandon this duplicate run without changing the existing one." },
      ],
    },
    trial_input_missing: {
      question: "How should Pritha obtain the missing host-trusted Trial input?",
      options: [
        { id: "repair-scaffold", label: "Repair scaffold", effect: "Create or restore the verifier outside the autonomous build executor, then resume." },
        { id: "revise-outcome", label: "Revise outcome", effect: "Create and approve a new Outcome Spec with a different Trial." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without weakening verification." },
      ],
    },
    verifier_modified: {
      question: "How should Pritha respond to an executor change in protected Trial inputs?",
      options: [
        { id: "discard-iteration", label: "Discard iteration", effect: "Rollback only the disposable delivery worktree to the last recorded checkpoint and retry." },
        { id: "replace-executor", label: "Replace executor", effect: "Keep the run blocked until another implementation executor is selected." },
        { id: "stop-run", label: "Stop run", effect: "Abandon the run without merging or deployment." },
      ],
    },
    checkpoint_commit_failed: {
      question: "How should Pritha handle the failed verified-checkpoint commit?",
      options: [
        { id: "fix-hook", label: "Fix hook", effect: "Resolve the Git hook or repository configuration, then rerun verification." },
        { id: "inspect-worktree", label: "Inspect worktree", effect: "Keep the disposable worktree for manual inspection without bypassing hooks." },
        { id: "stop-run", label: "Stop run", effect: "Abandon the run and leave the active project untouched." },
      ],
    },
    manual_build_required: {
      question: "Who should implement the changes required by the failing Trials?",
      options: [
        { id: "switch-to-codex", label: "Use Codex", effect: "Resume with the Codex App Server build executor without changing the approved outcome." },
        { id: "implement-manually", label: "Implement manually", effect: "Keep the run blocked while a human edits the disposable delivery worktree, then resume verification." },
        { id: "stop-run", label: "Stop run", effect: "Abandon the run without merge, push or deployment." },
      ],
    },
    no_git_in_place_not_implemented: {
      question: "Which safe Git-backed boundary should Pritha use for autonomous implementation?",
      options: [
        { id: "revise-contract", label: "Use disposable worktree", effect: "Revise and approve the contract with Build Git mode disposable-worktree." },
        { id: "implement-manually", label: "Implement manually", effect: "Keep Pritha read-only and make the required changes outside this autonomous run." },
        { id: "stop-run", label: "Stop run", effect: "Abandon delivery without changing the project." },
      ],
    },
    outcome_approval_stale: {
      question: "Which approved outcome should Pritha use before delivery continues?",
      options: [
        { id: "restore-approved-spec", label: "Restore approved spec", effect: "Restore the exact approved Outcome Spec and contract binding, then resume this run." },
        { id: "revise-outcome", label: "Revise outcome", effect: "Create a new Outcome Spec revision, approve it, and start a new delivery run." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without merging, pushing or deploying its worktree." },
      ],
    },
    outcome_spec_changed: {
      question: "Which approved Outcome Spec should replace the stale delivery evidence?",
      options: [
        { id: "restore-approved-spec", label: "Restore approved spec", effect: "Restore the exact approved Outcome Spec and contract binding, then re-run verification." },
        { id: "revise-outcome", label: "Revise outcome", effect: "Create and approve a new Outcome Spec revision, then start a new delivery run." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without accepting, merging, pushing or deploying stale evidence." },
      ],
    },
  };
  const definition = definitions[code] || {
    question: "How should Pritha proceed with this delivery blocker?",
    options: [
      { id: "retry", label: "Retry", effect: "Retry the bounded step with the same approved outcome." },
      { id: "add-guidance", label: "Add guidance", effect: "Provide one missing constraint, then resume without changing the approved goal." },
      { id: "stop-run", label: "Stop run", effect: "Abandon the run without merge, push or deployment." },
    ],
  };
  return typedBlocker({
    code,
    summary,
    question: definition.question,
    options: definition.options,
    evidence_refs: [],
  });
}

function reportsDirectory(options) {
  if (options.reportDir === false) return null;
  if (options.reportDir) return path.resolve(options.reportDir);
  if (!options.root) return null;
  return path.join(resolvePrithaAgentMemoryRoot({ root: options.root, stateRoot: options.stateRoot }), "reports");
}

function deliveryReportMarkdown(state, plan, worktree, options = {}) {
  const date = options.date || today();
  const context = { projectRoot: worktree?.worktree, stateRoot: options.stateRoot, root: options.root };
  const safeState = sanitize(state, context);
  const blockers = (safeState.blockers || []).map((blocker) => [
    `### ${blocker.code}`,
    "",
    blocker.summary,
    "",
    `Question: ${blocker.question}`,
    "",
    ...blocker.options.map((entry) => `- **${entry.label}:** ${entry.effect}`),
  ].join("\n")).join("\n\n") || "None.";
  const trial = safeState.last_trial_result || {};
  return `---
id: ${options.artifactId || `${date}-${slug(plan.agent_slug)}-agent-delivery-report`}
type: agent-delivery-report
status: ${state.status}
created: ${date}
updated: ${date}
topics:
  - agent-delivery
  - outcome-spec
  - ${slug(plan.agent_slug)}
tools:
  - Pritha
  - Codex
sources:
  - ${JSON.stringify(plan.spec_path)}
related:
  agent_contracts:
    - ${JSON.stringify(plan.contract_path)}
  outcome_specs:
    - ${JSON.stringify(plan.spec_path)}
supersedes: []
superseded_by: []
freshness_status: current
source_published: ${date}
source_updated: ${date}
source_version: delivery ledger v1
retrieved: ${date}
verified: ${["verified", "awaiting_acceptance", "accepted"].includes(state.status) ? date : "pending"}
valid_for: ${JSON.stringify(`delivery run ${state.run_id}`)}
temporal_status: current
memory_domain: child-agents
memory_domains:
  - child-agents
  - agent-building-knowledge
subject:
  kind: child-agent
  id: ${slug(plan.agent_slug)}
privacy: public
retention: durable
review_status: ${state.status === "accepted" ? "accepted" : "draft"}
confidence: ${["verified", "awaiting_acceptance", "accepted"].includes(state.status) ? "high" : "medium"}
---

# Agent delivery report: ${plan.agent_slug}

## Run

- Run id: ${state.run_id}
- Status: ${state.status}
- Phase: ${state.phase}
- Iterations: ${state.iteration}/${state.budget.max_iterations}
- Branch: ${worktree?.branch || "not-created"}
- Base revision: ${worktree?.base_revision || "not-created"}
- Verified checkpoint: ${worktree?.verified_checkpoint || "pending"}
- Push, merge and deployment: not performed

## Approved outcome binding

- Outcome Spec: ${plan.spec_id}
- Semantic lock: ${plan.semantic_lock}
- Document lock: ${plan.document_lock}
- Contract fingerprint: ${plan.contract_fingerprint}
- Approval evidence: ${plan.approval_id || "draft-only"}

## Verification

- Latest status: ${trial.status || "not-run"}
- Evidence lock: ${trial.evidence_lock || "pending"}
- Evidence reference: ${trial.path || "pending"}

## Typed blockers

${blockers}

## Next meaning

${state.status === "verified" ? "Machine-verifiable Trials passed. This does not imply user acceptance, merge, deployment or release readiness." : state.status === "awaiting_acceptance" ? "Automated checks passed; operator judgment or demonstration remains before acceptance." : state.status === "accepted" ? "The user explicitly accepted this delivery result. Merge and deployment remain separate actions." : "The run stopped at a typed blocker and may resume only from its recorded evidence and answer."}
`;
}

function emitDeliveryReport(state, plan, worktree, options = {}) {
  const directory = reportsDirectory(options);
  if (!directory) return null;
  mkdirSync(directory, { recursive: true });
  const written = writeLifecycleReport(
    path.join(directory, `${options.date || today()}-${slug(plan.agent_slug)}-agent-delivery-report.md`),
    ({ artifactId }) => deliveryReportMarkdown(state, plan, worktree, { ...options, artifactId }),
    { projectRoot: worktree?.worktree, stateRoot: options.stateRoot, root: options.root },
  );
  return written.path;
}

function storeTrialResult(runRoot, result, sequence) {
  const relative = path.join("trial-results", `verification-${String(sequence).padStart(3, "0")}.json`);
  const fullPath = path.join(runRoot, relative);
  atomicWriteFile(fullPath, `${JSON.stringify(result, null, 2)}\n`);
  return { path: relative.replaceAll(path.sep, "/"), status: result.verification_status, evidence_lock: result.evidence_lock };
}

function storeExecutorResult(runRoot, result, iteration) {
  const relative = path.join("executor", `iteration-${String(iteration).padStart(3, "0")}.json`);
  const fullPath = path.join(runRoot, relative);
  atomicWriteFile(fullPath, `${JSON.stringify(result, null, 2)}\n`);
  return relative.replaceAll(path.sep, "/");
}

function ensureRunPlan(runRoot, plan) {
  const planPath = path.join(runRoot, "trial-plan.json");
  if (existsSync(planPath)) {
    const current = JSON.parse(readFileSync(planPath, "utf8"));
    if (JSON.stringify(current) !== JSON.stringify(plan)) {
      throw new DeliveryLoopError("trial_plan_changed", "Run Trial plan differs from its immutable snapshot");
    }
    return planPath;
  }
  atomicWriteFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return planPath;
}

function ensureLedger(runRoot, plan, projectPath, runId, options = {}) {
  if (existsSync(path.join(runRoot, "build-state.json"))) return readDeliveryLedger(runRoot);
  return createDeliveryLedger(runRoot, {
    runId,
    agentSlug: plan.agent_slug,
    targetKey: targetKey(projectPath),
    targetLabel: path.basename(path.resolve(projectPath)),
    sourceProject: projectPath,
    spec: {
      id: plan.spec_id,
      semanticLock: plan.semantic_lock,
      documentLock: plan.document_lock,
      contractFingerprint: plan.contract_fingerprint,
      approvalId: plan.approval_id || "draft-only",
    },
    budget: options.budget,
  }).state;
}

function claimTarget(runRoot, state, options = {}) {
  const buildsRoot = options.buildsRoot || path.resolve(runRoot, "..", "..");
  try {
    return claimDeliveryTarget(buildsRoot, { targetKey: state.target_key, runId: state.run_id, runRoot });
  } catch (error) {
    throw new DeliveryLoopError("target_busy", error.message);
  }
}

function releaseTarget(runRoot, state, options = {}) {
  const buildsRoot = options.buildsRoot || path.resolve(runRoot, "..", "..");
  const claimPath = deliveryTargetClaimPath(buildsRoot, state.target_key);
  return releaseDeliveryTarget(claimPath, state.run_id);
}

function blockDelivery(runRoot, plan, worktree, blocker, options = {}) {
  const current = readDeliveryLedger(runRoot);
  const transitioned = current.status === "blocked"
    ? { state: current }
    : transitionDelivery(runRoot, "blocked", { blockers: [blocker], phase: blocker.code, eventType: "delivery_blocked" });
  const reportPath = emitDeliveryReport(transitioned.state, plan, worktree, options);
  return { state: transitioned.state, worktree, reportPath, blocked: true };
}

async function verifyIteration(plan, runRoot, worktree, protectedInputs, trialBackend, sequence, options) {
  const protectedStatus = verifyProtectedTrialInputs(protectedInputs, worktree.worktree);
  if (!protectedStatus.ok) throw new DeliveryLoopError("verifier_modified", "The build executor changed protected Trial inputs", { changes: protectedStatus.changes });
  const run = await runTrialPlan(plan, {
    projectPath: worktree.worktree,
    backend: trialBackend,
    runRoot,
    stateRoot: options.stateRoot,
    root: options.root,
    closeBackend: options.closeTrialBackend,
  });
  const freshness = verifyTrialResultFreshness(run.result, worktree.worktree, {
    outcomeSpecPath: options.outcomeSpecPath,
    root: options.root,
    stateRoot: options.stateRoot,
  });
  if (!freshness.ok) {
    throw new DeliveryLoopError(
      freshness.reason === "outcome_spec_changed" ? "outcome_spec_changed" : "verification_stale",
      `Delivery evidence is stale: ${freshness.reason}`,
    );
  }
  const reference = storeTrialResult(runRoot, run.result, sequence);
  updateDeliveryLedger(runRoot, (state) => ({
    ...state,
    status: "verifying",
    phase: "verification",
    next_action: "evaluate_trial_result",
    blockers: [],
    workspace: run.result.workspace_after,
    last_trial_result: reference,
  }), { eventType: "trials_completed", payload: { status: run.result.verification_status, evidence_lock: run.result.evidence_lock } });
  return run.result;
}

async function finalizePassingResult(plan, runRoot, worktree, protectedInputs, trialBackend, initialResult, sequence, options) {
  let result = initialResult;
  let verificationSequence = sequence;
  for (let checkpointAttempt = 0; checkpointAttempt < 3; checkpointAttempt += 1) {
    const preCheckpointFreshness = verifyTrialResultFreshness(result, worktree.worktree, {
      outcomeSpecPath: options.outcomeSpecPath,
      root: options.root,
      stateRoot: options.stateRoot,
    });
    if (!preCheckpointFreshness.ok) {
      throw new DeliveryLoopError(
        preCheckpointFreshness.reason === "outcome_spec_changed" ? "outcome_spec_changed" : "verification_stale",
        `Delivery evidence became stale before checkpoint: ${preCheckpointFreshness.reason}`,
      );
    }
    try {
      worktree = commitVerifiedCheckpoint(runRoot);
    } catch (error) {
      throw new DeliveryLoopError("checkpoint_commit_failed", error.message, { cause: error.code });
    }
    verificationSequence += 1;
    result = await verifyIteration(plan, runRoot, worktree, protectedInputs, trialBackend, verificationSequence, options);
    if (result.verification_status === "failed") return { result, worktree, sequence: verificationSequence };
    if (!result.workspace_changed_during_trials) return { result, worktree, sequence: verificationSequence };
  }
  throw new DeliveryLoopError("non_idempotent_trials", "Passing Trials kept changing the workspace after three verified checkpoints");
}

export async function runDeliveryLoop(input = {}) {
  const plan = assertPlan(input.plan);
  const runRoot = path.resolve(input.runRoot);
  const projectPath = path.resolve(input.projectPath);
  const runId = input.runId || path.basename(runRoot);
  mkdirSync(runRoot, { recursive: true });
  ensureRunPlan(runRoot, plan);
  let state = ensureLedger(runRoot, plan, projectPath, runId, input);
  let worktree = readDeliveryWorktree(runRoot);
  if (["verified", "awaiting_acceptance", "accepted", "failed", "abandoned", "cancelled"].includes(state.status)) {
    return { state, worktree, reportPath: null, blocked: false };
  }
  if (state.status === "blocked") return { state, worktree, reportPath: null, blocked: true };
  if (input.buildGitMode && input.buildGitMode !== "disposable-worktree") {
    const error = new DeliveryLoopError("no_git_in_place_not_implemented", "Autonomous no-Git in-place mutation is disabled in v1");
    return blockDelivery(runRoot, plan, worktree, blockerForError(error), input);
  }

  try {
    claimTarget(runRoot, state, input);
  } catch (error) {
    return blockDelivery(runRoot, plan, worktree, blockerForError(error), input);
  }

  try {
    worktree = prepareDeliveryWorktree(projectPath, runRoot, runId, input);
    state = readDeliveryLedger(runRoot);
    if (state.status === "created" || state.status === "correcting" || state.status === "paused") {
      state = transitionDelivery(runRoot, "preparing", {
        nextAction: "lock_trial_inputs",
        workspace: { branch: worktree.branch, base_revision: worktree.base_revision },
      }).state;
    }
  } catch (error) {
    const normalized = error instanceof DeliveryWorkspaceError ? error : new DeliveryLoopError("worktree_preparation_failed", error.message);
    return blockDelivery(runRoot, plan, worktree, blockerForError(normalized), input);
  }

  let protectedInputs;
  try {
    protectedInputs = captureProtectedTrialInputs(plan, worktree.worktree, runRoot).snapshot;
  } catch (error) {
    return blockDelivery(runRoot, plan, worktree, blockerForError(error), input);
  }

  const buildExecutor = typeof input.buildExecutor === "object" && input.buildExecutor
    ? input.buildExecutor
    : createBuildExecutor(input.buildExecutor || "codex-app-server", input.buildExecutorOptions || {});
  const trialBackend = input.trialBackend || "local";
  let failures = [];
  let verificationSequence = 0;
  try {
    if (state.status !== "verifying") {
      state = transitionDelivery(runRoot, "verifying", { nextAction: "run_initial_trials", phase: "initial_verification" }).state;
    }

    while (true) {
      let result;
      try {
        verificationSequence += 1;
        result = await verifyIteration(plan, runRoot, worktree, protectedInputs, trialBackend, verificationSequence, input);
      } catch (error) {
        return blockDelivery(runRoot, plan, worktree, blockerForError(error), input);
      }

      if (result.verification_status !== "failed") {
        let final;
        try {
          final = await finalizePassingResult(plan, runRoot, worktree, protectedInputs, trialBackend, result, verificationSequence, input);
        } catch (error) {
          return blockDelivery(runRoot, plan, worktree, blockerForError(error), input);
        }
        result = final.result;
        worktree = final.worktree;
        verificationSequence = final.sequence;
        if (result.verification_status === "failed") {
          failures = result.trials.filter((trial) => trial.kind === "automated" && trial.status !== "passed");
        } else {
          const terminalStatus = result.verification_status === "awaiting_acceptance" ? "awaiting_acceptance" : "verified";
          const terminal = transitionDelivery(runRoot, terminalStatus, {
            lastTrialResult: { path: `trial-results/verification-${String(verificationSequence).padStart(3, "0")}.json`, status: result.verification_status, evidence_lock: result.evidence_lock },
            workspace: result.workspace_after,
            eventType: `delivery_${terminalStatus}`,
          });
          releaseTarget(runRoot, terminal.state, input);
          const reportPath = emitDeliveryReport(terminal.state, plan, worktree, input);
          return { state: terminal.state, worktree, trialResult: result, reportPath, blocked: false };
        }
      } else {
        failures = result.trials.filter((trial) => trial.kind === "automated" && trial.status !== "passed");
      }

      const failureUpdate = recordDeliveryFailure(runRoot, failures, { eventType: "verification_failed" });
      state = failureUpdate.state;
      if (state.status === "blocked") {
        const reportPath = emitDeliveryReport(state, plan, worktree, input);
        return { state, worktree, trialResult: result, reportPath, blocked: true };
      }
      const budget = budgetBlocker(state);
      if (budget) return blockDelivery(runRoot, plan, worktree, budget, input);

      state = updateDeliveryLedger(runRoot, (current) => ({
        ...current,
        status: "building",
        phase: "implementation",
        iteration: current.iteration + 1,
        next_action: "execute_build_iteration",
        blockers: [],
      }), { eventType: "build_iteration_started" }).state;

      let executorResult;
      try {
        executorResult = await buildExecutor.execute({
          runId: state.run_id,
          iteration: state.iteration,
          remainingIterations: Math.max(0, state.budget.max_iterations - state.iteration),
          worktree: worktree.worktree,
          plan,
          failures: sanitize(failures, { projectRoot: worktree.worktree, stateRoot: input.stateRoot, root: input.root }),
          protectedPaths: protectedInputs.entries,
          timeoutMs: input.executorTimeoutMs,
          stateRoot: input.stateRoot,
          root: input.root,
        });
        const executorPath = storeExecutorResult(runRoot, executorResult, state.iteration);
        updateDeliveryLedger(runRoot, (current) => ({ ...current, executor_last_result: executorPath, next_action: "verify_executor_changes" }), {
          eventType: "build_iteration_completed",
          payload: { iteration: state.iteration, executor_result: executorPath },
        });
      } catch (error) {
        if (["manual_build_required", "no_git_in_place_not_implemented"].includes(error?.code)) {
          return blockDelivery(runRoot, plan, worktree, blockerForError(error), input);
        }
        const synthetic = [{ id: "build-executor", assertions: [], error: { code: error.code || "executor_failed" } }];
        const failure = recordDeliveryFailure(runRoot, synthetic, { eventType: "build_executor_failed" });
        if (failure.state.status === "blocked") {
          const reportPath = emitDeliveryReport(failure.state, plan, worktree, input);
          return { state: failure.state, worktree, reportPath, blocked: true };
        }
        continue;
      }

      const protectedStatus = verifyProtectedTrialInputs(protectedInputs, worktree.worktree);
      if (!protectedStatus.ok) {
        return blockDelivery(
          runRoot,
          plan,
          worktree,
          blockerForError(new DeliveryLoopError("verifier_modified", "The executor modified protected Trial inputs", { changes: protectedStatus.changes })),
          input,
        );
      }
      state = transitionDelivery(runRoot, "verifying", { nextAction: "run_trials", phase: "verification" }).state;
    }
  } finally {
    buildExecutor.close?.();
  }
}

export async function deliverOutcome(specPath, projectPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const compiled = compileOutcomeSpec(specPath, {
    root,
    stateRoot: options.stateRoot,
    runId: options.runId,
    allowDraft: Boolean(options.allowDraft),
  });
  const bound = policyBoundOptions(compiled.plan, options);
  return runDeliveryLoop({
    ...bound,
    root,
    runId: compiled.runId,
    runRoot: compiled.runRoot,
    plan: compiled.plan,
    projectPath,
    outcomeSpecPath: compiled.path || path.resolve(root, specPath),
  });
}

export function findDeliveryRun(runId, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const buildsRoot = resolvePrithaStatePathFrom({ root, stateRoot: options.stateRoot }, "builds");
  const requested = String(runId || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(requested) || !existsSync(buildsRoot)) return null;
  const matches = [];
  for (const agent of readdirSync(buildsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== ".targets").slice(0, 1_000)) {
    const candidate = path.join(buildsRoot, agent.name, requested);
    if (existsSync(path.join(candidate, "build-state.json"))) matches.push(candidate);
  }
  if (matches.length > 1) throw new DeliveryLoopError("run_id_ambiguous", `Delivery run id is ambiguous across ${matches.length} agents: ${runId}`);
  return matches[0] || null;
}

export function deliveryStatus(runId, options = {}) {
  const runRoot = findDeliveryRun(runId, options);
  if (!runRoot) throw new DeliveryLoopError("run_not_found", `Delivery run not found: ${runId}`);
  return { runRoot, state: readDeliveryLedger(runRoot), worktree: readDeliveryWorktree(runRoot) };
}

export function resolveDeliveryBlocker(runRoot, answer, options = {}) {
  const state = readDeliveryLedger(runRoot);
  if (state.status !== "blocked" || state.blockers.length === 0) throw new DeliveryLoopError("run_not_blocked", "Delivery run has no active blocker");
  const selected = String(answer || "").trim();
  const option = state.blockers[0].options.find((entry) => entry.id === selected);
  if (!option) throw new DeliveryLoopError("blocker_answer_invalid", "Answer must match one of the blocker option ids");
  if (["stop-run", "stop-new-run", "resume-existing", "use-clean-clone", "revise-contract"].includes(selected)) {
    return transitionDelivery(runRoot, "abandoned", { eventType: "delivery_abandoned_by_user" }).state;
  }
  if (selected === "revise-outcome") return transitionDelivery(runRoot, "abandoned", { eventType: "outcome_revision_requested" }).state;
  const guidance = bounded(options.guidance || "Operator selected the recorded retry path.", 2_000);
  if (["review-failures", "inspect-worktree", "implement-manually"].includes(selected)) {
    return updateDeliveryLedger(runRoot, (current) => ({
      ...current,
      operator_guidance: guidance,
    }), { eventType: "blocker_review_requested", payload: { blocker_code: state.blockers[0].code, answer: selected } }).state;
  }
  if (selected === "discard-iteration") discardDeliveryIteration(runRoot);
  return updateDeliveryLedger(runRoot, (current) => {
    const budget = { ...current.budget };
    if (selected === "extend-once") {
      budget.max_iterations += Number.isSafeInteger(options.extendIterations) ? Math.min(Math.max(options.extendIterations, 1), 10) : 2;
      budget.max_elapsed_ms += Number.isSafeInteger(options.extendElapsedMs) ? Math.min(Math.max(options.extendElapsedMs, 60_000), 3_600_000) : 30 * 60 * 1_000;
    }
    return {
      ...current,
      status: "correcting",
      phase: "operator_resolution",
      next_action: "resume_delivery",
      blockers: [],
      budget,
      operator_guidance: guidance,
    };
  }, { eventType: "blocker_resolved", payload: { blocker_code: state.blockers[0].code, answer: selected } }).state;
}

export async function resumeDelivery(runId, options = {}) {
  const status = deliveryStatus(runId, options);
  const planPath = path.join(status.runRoot, "trial-plan.json");
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const bound = policyBoundOptions(plan, options);
  let state = status.state;
  if (state.status === "blocked") {
    if (!options.answer) return { state, worktree: status.worktree, blocked: true, reportPath: null };
    state = resolveDeliveryBlocker(status.runRoot, options.answer, options);
    if (state.status === "blocked") return { state, worktree: status.worktree, blocked: true, reportPath: null };
    if (state.status === "abandoned") {
      releaseTarget(status.runRoot, state, options);
      return { state, worktree: status.worktree, blocked: false, reportPath: null };
    }
  }
  const worktree = readDeliveryWorktree(status.runRoot);
  const projectPath = options.projectPath || worktree?.source_project || state.source_project;
  if (!projectPath) throw new DeliveryLoopError("worktree_missing", "Delivery run has no resumable source project");
  if (targetKey(projectPath) !== state.target_key) {
    throw new DeliveryLoopError("delivery_target_mismatch", "Resume project does not match the delivery run target");
  }
  try {
    approvedPlanBinding(plan, options);
  } catch (error) {
    return blockDelivery(status.runRoot, plan, worktree, blockerForError(error), options);
  }
  if (state.last_trial_result?.path && worktree?.worktree) {
    const freshness = verifyTrialResultFreshness(
      path.join(status.runRoot, state.last_trial_result.path),
      worktree.worktree,
      {
        outcomeSpecPath: options.outcomeSpecPath || (plan.approval_id ? plan.spec_path : null),
        root: options.root,
        stateRoot: options.stateRoot,
      },
    );
    if (!freshness.ok) {
      return blockDelivery(
        status.runRoot,
        plan,
        worktree,
        blockerForError(new DeliveryLoopError(
          freshness.reason === "outcome_spec_changed" ? "outcome_spec_changed" : "verification_stale",
          `Delivery evidence is stale after resume: ${freshness.reason}`,
        )),
        options,
      );
    }
  }
  return runDeliveryLoop({
    ...bound,
    runId,
    runRoot: status.runRoot,
    plan,
    projectPath,
    outcomeSpecPath: options.outcomeSpecPath || (plan.approval_id ? plan.spec_path : null),
  });
}

export function acceptDelivery(runId, options = {}) {
  if (options.acceptedBy !== "user") throw new DeliveryLoopError("acceptance_actor_invalid", "Delivery acceptance requires explicit --accepted-by user");
  const status = deliveryStatus(runId, options);
  if (!new Set(["verified", "awaiting_acceptance"]).has(status.state.status)) {
    throw new DeliveryLoopError("delivery_not_acceptance_ready", `Delivery status ${status.state.status} cannot be accepted`);
  }
  if (!status.worktree) throw new DeliveryLoopError("worktree_missing", "Delivery worktree metadata is missing");
  const plan = JSON.parse(readFileSync(path.join(status.runRoot, "trial-plan.json"), "utf8"));
  approvedPlanBinding(plan, { ...options, allowDraft: false });
  const resultPath = path.join(status.runRoot, status.state.last_trial_result.path);
  const freshness = verifyTrialResultFreshness(resultPath, status.worktree.worktree, {
    outcomeSpecPath: options.outcomeSpecPath || plan.spec_path,
    root: options.root,
    stateRoot: options.stateRoot,
  });
  if (!freshness.ok) throw new DeliveryLoopError("verification_stale", `Delivery evidence is stale: ${freshness.reason}`);
  const accepted = transitionDelivery(status.runRoot, "accepted", {
    acceptedAt: options.acceptedAt,
    eventType: "delivery_accepted_by_user",
  });
  releaseTarget(status.runRoot, accepted.state, options);
  const reportPath = emitDeliveryReport(accepted.state, plan, status.worktree, options);
  return { state: accepted.state, worktree: status.worktree, reportPath };
}
