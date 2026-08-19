import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FunctionBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { readDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { resumeDelivery, runDeliveryLoop } from "../scripts/agents-mother/delivery-loop.mjs";
import { TRIAL_PLAN_SCHEMA } from "../scripts/agents-mother/outcome-spec.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "tests@pritha.local"]);
  git(root, ["config", "user.name", "Pritha Tests"]);
  writeFileSync(path.join(root, "implementation.txt"), "not-ready\n", "utf8");
  writeFileSync(path.join(root, "eval.mjs"), `
import { readFileSync } from "node:fs";
const value = readFileSync("implementation.txt", "utf8").trim();
if (value !== "ready") { process.stderr.write("not ready"); process.exit(1); }
process.stdout.write("READY");
`, "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "initial"]);
  return root;
}

function plan() {
  const trials = [{
    id: "main",
    statement: "Implementation is ready",
    kind: "automated",
    covers: ["core:main"],
    given: [],
    isolation: "none",
    argv: [process.execPath, "eval.mjs"],
    cwd: ".",
    thenExitCode: 0,
    thenStdoutContains: ["READY"],
    thenStdoutExcludes: [],
    thenStderrContains: [],
    thenStderrExcludes: [],
    thenArtifacts: [],
    thenArtifactContains: [],
    thenAbsentPaths: [],
    thenMinStdoutChars: null,
    thenMaxDurationMs: 5_000,
    passCriteria: "",
    fixture: "",
    timeoutMs: 5_000,
  }];
  return {
    schema: TRIAL_PLAN_SCHEMA,
    spec_id: "fixture-outcome",
    spec_path: "11_agents/contracts/fixture-agent-outcome-spec.md",
    agent_slug: "fixture-agent",
    contract_path: "11_agents/contracts/fixture-agent-contract.md",
    contract_fingerprint: "sha256:contract",
    semantic_lock: "sha256:semantic",
    document_lock: "sha256:document",
    approval_id: null,
    interaction_mode: "headless",
    automated_trial_waiver: "none",
    autonomous_verification_allowed: true,
    counts: { trials: 1, automated: 1, operator_judged: 0 },
    coverage: [],
    trials,
    demo: ["run evaluator"],
  };
}

test("delivery loop repairs a failing fixture, independently verifies, commits and preserves active worktree", async () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-loop-run-")), "builds", "fixture-agent", "run-success");
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "implementation.txt"), "ready\n", "utf8");
    return { summary: "implemented", changed_files: ["implementation.txt"] };
  });
  const result = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-success",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });

  assert.equal(result.state.status, "verified");
  assert.equal(result.state.iteration, 1);
  assert.equal(readFileSync(path.join(project, "implementation.txt"), "utf8"), "not-ready\n");
  assert.equal(readFileSync(path.join(result.worktree.worktree, "implementation.txt"), "utf8"), "ready\n");
  assert.equal(git(project, ["status", "--porcelain"]), "");
  assert.equal(git(result.worktree.worktree, ["status", "--porcelain"]), "");
  assert.equal(git(result.worktree.worktree, ["branch", "--show-current"]), "pritha/build-run-success");
  assert.equal(Boolean(result.worktree.verified_checkpoint), true);
});

test("repeated non-progress becomes a typed blocker instead of hanging", async () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-loop-run-")), "builds", "fixture-agent", "run-stuck");
  const executor = new FunctionBuildExecutor(async () => ({ summary: "no progress", changed_files: [] }));
  const result = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-stuck",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
    budget: { maxIterations: 6, maxElapsedMs: 60_000, repeatedFailureThreshold: 2 },
  });

  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "repeated_trial_failure");
  assert.equal(result.state.blockers[0].question.endsWith("?"), true);
  assert.equal(result.state.blockers[0].options.length >= 2, true);
});

test("executor modification of the protected evaluator is blocked and a user-approved discard restores the verifier", async () => {
  const project = repository();
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-run-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-cheat");
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "eval.mjs"), "process.stdout.write('READY');\n", "utf8");
    return { summary: "changed test", changed_files: ["eval.mjs"] };
  });
  const result = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-cheat",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });

  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "verifier_modified");
  assert.equal(readDeliveryLedger(runRoot).status, "blocked");

  const repaired = await resumeDelivery("run-cheat", {
    root: project,
    stateRoot,
    allowDraft: true,
    answer: "discard-iteration",
    buildExecutor: new FunctionBuildExecutor(async ({ worktree }) => {
      writeFileSync(path.join(worktree, "implementation.txt"), "ready\n", "utf8");
      return { summary: "implemented without changing verifier", changed_files: ["implementation.txt"] };
    }),
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(repaired.state.status, "verified");
  assert.match(readFileSync(path.join(repaired.worktree.worktree, "eval.mjs"), "utf8"), /implementation\.txt/);
});

test("a dirty-workspace blocker resumes from the private source-project binding after the user cleans it", async () => {
  const project = repository();
  writeFileSync(path.join(project, "user-note.txt"), "preserve me\n", "utf8");
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-resume-state-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-dirty-resume");
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "implementation.txt"), "ready\n", "utf8");
    return { summary: "implemented", changed_files: ["implementation.txt"] };
  });

  const blocked = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-dirty-resume",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(blocked.state.status, "blocked");
  assert.equal(blocked.state.blockers[0].code, "dirty_workspace");
  assert.equal(blocked.state.source_project, project);

  git(project, ["add", "user-note.txt"]);
  git(project, ["commit", "-m", "preserve user note"]);
  const resumed = await resumeDelivery("run-dirty-resume", {
    root: project,
    stateRoot,
    allowDraft: true,
    answer: "retry-after-clean",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });

  assert.equal(resumed.state.status, "verified");
  assert.equal(readFileSync(path.join(project, "implementation.txt"), "utf8"), "not-ready\n");
  assert.equal(readFileSync(path.join(project, "user-note.txt"), "utf8"), "preserve me\n");
});

test("review-failures keeps a budget blocker paused instead of silently retrying", async () => {
  const project = repository();
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-review-state-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-review");
  const executor = new FunctionBuildExecutor(async () => ({ summary: "no progress", changed_files: [] }));
  const blocked = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-review",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
    budget: { maxIterations: 1, maxElapsedMs: 60_000, repeatedFailureThreshold: 3 },
  });
  assert.equal(blocked.state.status, "blocked");
  assert.equal(blocked.state.blockers[0].code, "iteration_budget_exhausted");

  const reviewed = await resumeDelivery("run-review", {
    root: project,
    stateRoot,
    allowDraft: true,
    answer: "review-failures",
    guidance: "Show the current failures before any retry.",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(reviewed.state.status, "blocked");
  assert.equal(reviewed.state.blockers[0].code, "iteration_budget_exhausted");
});

test("resume preserves the approved Trial backend policy before changing blocker state", async () => {
  const project = repository();
  writeFileSync(path.join(project, "dirty.txt"), "user work\n", "utf8");
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-policy-state-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-policy");
  const policyPlan = {
    ...plan(),
    delivery_policy: {
      build_git_mode: "disposable-worktree",
      build_executor: "manual",
      trial_backend_policy: "app-server-required",
    },
  };
  const blocked = await runDeliveryLoop({
    plan: policyPlan,
    projectPath: project,
    runRoot,
    runId: "run-policy",
    buildExecutor: new FunctionBuildExecutor(async () => ({ summary: "unused" })),
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(blocked.state.status, "blocked");
  const version = blocked.state.version;

  git(project, ["add", "dirty.txt"]);
  git(project, ["commit", "-m", "preserve dirty work"]);
  await assert.rejects(
    () => resumeDelivery("run-policy", {
      root: project,
      stateRoot,
      allowDraft: true,
      answer: "retry-after-clean",
      trialBackend: "local",
      reportDir: false,
    }),
    (error) => error?.code === "trial_backend_policy_conflict",
  );
  assert.equal(readDeliveryLedger(runRoot).version, version);
  assert.equal(readDeliveryLedger(runRoot).status, "blocked");
});
