import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  captureProtectedTrialInputs,
  commitVerifiedCheckpoint,
  DeliveryWorkspaceError,
  prepareDeliveryWorktree,
  verifyProtectedTrialInputs,
} from "../scripts/agents-mother/delivery-worktree.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "tests@pritha.local"]);
  git(root, ["config", "user.name", "Pritha Tests"]);
  writeFileSync(path.join(root, "agent.mjs"), "export const ready = false;\n", "utf8");
  writeFileSync(path.join(root, "eval.mjs"), "import { ready } from './agent.mjs'; if (!ready) process.exit(1);\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "initial"]);
  return root;
}

function plan() {
  return { trials: [{ id: "smoke", kind: "automated", argv: [process.execPath, "eval.mjs"], fixture: "", cwd: "." }] };
}

test("delivery coding uses a dedicated branch and leaves the active worktree unchanged", () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-run-")), "run");
  const prepared = prepareDeliveryWorktree(project, runRoot, "run-1");
  assert.equal(prepared.branch, "pritha/build-run-1");
  assert.equal(readFileSync(path.join(project, "agent.mjs"), "utf8").includes("false"), true);

  writeFileSync(path.join(prepared.worktree, "agent.mjs"), "export const ready = true;\n", "utf8");
  const checkpoint = commitVerifiedCheckpoint(runRoot, { verifiedAt: "2026-08-16T12:00:00.000Z" });
  assert.equal(checkpoint.changed, true);
  assert.equal(git(prepared.worktree, ["status", "--porcelain"]), "");
  assert.equal(git(project, ["status", "--porcelain"]), "");
  assert.equal(readFileSync(path.join(project, "agent.mjs"), "utf8").includes("false"), true);
});

test("dirty active worktree is refused without stashing or resetting", () => {
  const project = repository();
  writeFileSync(path.join(project, "agent.mjs"), "user change\n", "utf8");
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-run-")), "run");
  assert.throws(
    () => prepareDeliveryWorktree(project, runRoot, "run-dirty"),
    (error) => error instanceof DeliveryWorkspaceError && error.code === "dirty_workspace",
  );
  assert.equal(readFileSync(path.join(project, "agent.mjs"), "utf8"), "user change\n");
});

test("Trial entrypoints are locked before executor changes", () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-run-")), "run");
  const prepared = prepareDeliveryWorktree(project, runRoot, "run-lock");
  const captured = captureProtectedTrialInputs(plan(), prepared.worktree, runRoot);
  assert.deepEqual(captured.snapshot.entries.map((entry) => entry.path), ["eval.mjs"]);
  assert.equal(verifyProtectedTrialInputs(captured.snapshot, prepared.worktree).ok, true);

  writeFileSync(path.join(prepared.worktree, "eval.mjs"), "process.exit(0);\n", "utf8");
  const verification = verifyProtectedTrialInputs(captured.snapshot, prepared.worktree);
  assert.equal(verification.ok, false);
  assert.deepEqual(verification.changes, [{ path: "eval.mjs", reason: "content_changed" }]);
});
