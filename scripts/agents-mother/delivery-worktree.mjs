import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";

export const DELIVERY_WORKTREE_SCHEMA = "pritha-delivery-worktree-v1";
export const PROTECTED_TRIAL_INPUTS_SCHEMA = "pritha-protected-trial-inputs-v1";
const SCRIPT_RUNNERS = new Set(["node", "node.exe", "python", "python3", "python.exe", "ruby", "ruby.exe", "deno", "bun"]);

export class DeliveryWorkspaceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DeliveryWorkspaceError";
    this.code = code;
    this.details = details;
  }
}

function git(cwd, args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || "Git command failed").trim();
    throw new DeliveryWorkspaceError("git_command_failed", detail.slice(0, 4_000), { args });
  }
}

function regularDirectory(value, name) {
  const requested = path.resolve(String(value || ""));
  if (!existsSync(requested)) throw new DeliveryWorkspaceError(`${name}_missing`, `${name} does not exist`);
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new DeliveryWorkspaceError(`${name}_invalid`, `${name} must be a regular directory, not a symlink`);
  return realpathSync(requested);
}

function safeRunId(value) {
  const runId = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(runId)) throw new DeliveryWorkspaceError("run_id_invalid", "run id is not safe for a delivery branch");
  return runId;
}

function metadataPath(runRoot) {
  return path.join(path.resolve(runRoot), "delivery-worktree.json");
}

export function readDeliveryWorktree(runRoot) {
  const filePath = metadataPath(runRoot);
  if (!existsSync(filePath)) return null;
  const value = parseBoundedJson(readFileSync(filePath, "utf8"), { maxBytes: 128 * 1024, maxDepth: 12, maxNodes: 512 });
  if (value.schema !== DELIVERY_WORKTREE_SCHEMA) throw new DeliveryWorkspaceError("worktree_metadata_invalid", "Delivery worktree metadata has an unsupported schema");
  return value;
}

export function prepareDeliveryWorktree(projectPath, runRoot, runId, options = {}) {
  const projectRoot = regularDirectory(projectPath, "project");
  const root = path.resolve(runRoot);
  mkdirSync(root, { recursive: true });
  const existing = readDeliveryWorktree(root);
  if (existing) {
    if (realpathSync(existing.source_project) !== projectRoot) throw new DeliveryWorkspaceError("worktree_target_mismatch", "Run belongs to a different source project");
    const worktree = regularDirectory(existing.worktree, "worktree");
    const branch = git(worktree, ["branch", "--show-current"]).trim();
    if (branch !== existing.branch) throw new DeliveryWorkspaceError("worktree_branch_mismatch", "Delivery worktree is on an unexpected branch");
    return { ...existing, worktree, resumed: true, metadataPath: metadataPath(root) };
  }

  let topLevel;
  try {
    topLevel = realpathSync(git(projectRoot, ["rev-parse", "--show-toplevel"]).trim());
  } catch (error) {
    if (options.allowNoGitInPlace) {
      throw new DeliveryWorkspaceError("no_git_in_place_not_implemented", "No-Git in-place delivery is not enabled in v1");
    }
    throw new DeliveryWorkspaceError("git_required", "Autonomous delivery requires a Git repository and disposable worktree", { cause: error.message });
  }
  if (topLevel !== projectRoot) throw new DeliveryWorkspaceError("project_not_git_root", "Delivery project must be the Git repository root");
  const status = git(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.trim()) {
    throw new DeliveryWorkspaceError("dirty_workspace", "The active project worktree has uncommitted or untracked changes; Pritha will not stash, reset or overwrite them");
  }

  const safeId = safeRunId(runId);
  const branch = `pritha/build-${safeId}`;
  const baseRevision = git(projectRoot, ["rev-parse", "HEAD"]).trim();
  const worktree = path.join(root, "worktree");
  if (existsSync(worktree)) throw new DeliveryWorkspaceError("worktree_path_exists", "Run worktree path exists without matching metadata");
  git(projectRoot, ["worktree", "add", "-b", branch, worktree, baseRevision]);
  const resolvedWorktree = regularDirectory(worktree, "worktree");
  const metadata = {
    schema: DELIVERY_WORKTREE_SCHEMA,
    run_id: safeId,
    source_project: projectRoot,
    worktree: resolvedWorktree,
    branch,
    base_revision: baseRevision,
    verified_checkpoint: null,
    created_at: options.createdAt || new Date().toISOString(),
  };
  const filePath = metadataPath(root);
  atomicWriteFile(filePath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { ...metadata, resumed: false, metadataPath: filePath };
}

function safeRelativePath(value) {
  const source = String(value || "").trim().replaceAll("\\", "/");
  if (!source || source.startsWith("-") || path.posix.isAbsolute(source) || source.includes("\0")) return false;
  return source.split("/").every((part) => part && part !== "." && part !== "..");
}

function referencedTrialInputPaths(plan, worktree) {
  const candidates = new Map();
  for (const trial of plan.trials || []) {
    if (trial.kind !== "automated") continue;
    if (trial.fixture) candidates.set(trial.fixture, { path: trial.fixture, required: true, sources: [`trial:${trial.id}:fixture`] });
    const argv = Array.isArray(trial.argv) ? trial.argv : [];
    const runner = path.basename(argv[0] || "").toLowerCase();
    if (SCRIPT_RUNNERS.has(runner) && safeRelativePath(argv[1])) {
      candidates.set(argv[1], { path: argv[1], required: true, sources: [`trial:${trial.id}:entrypoint`] });
    }
    for (const token of argv.slice(1)) {
      if (!safeRelativePath(token)) continue;
      const fullPath = path.join(worktree, token);
      if (!existsSync(fullPath)) continue;
      const current = candidates.get(token) || { path: token, required: true, sources: [] };
      current.sources.push(`trial:${trial.id}:argv`);
      candidates.set(token, current);
    }
  }
  return [...candidates.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function hashFile(worktree, relativePath) {
  if (!safeRelativePath(relativePath)) throw new DeliveryWorkspaceError("trial_input_path_invalid", "Protected Trial input path is unsafe");
  const fullPath = path.resolve(worktree, relativePath);
  const rel = path.relative(worktree, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new DeliveryWorkspaceError("trial_input_path_invalid", "Protected Trial input escapes the worktree");
  if (!existsSync(fullPath)) throw new DeliveryWorkspaceError("trial_input_missing", `Protected Trial input is missing: ${relativePath}`);
  const stat = lstatSync(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new DeliveryWorkspaceError("trial_input_invalid", `Protected Trial input must be a regular file: ${relativePath}`);
  if (stat.size > 16 * 1024 * 1024) throw new DeliveryWorkspaceError("trial_input_too_large", `Protected Trial input exceeds 16 MiB: ${relativePath}`);
  return { size: stat.size, hash: `sha256:${createHash("sha256").update(readFileSync(fullPath)).digest("hex")}` };
}

export function captureProtectedTrialInputs(plan, worktreeValue, runRoot) {
  const worktree = regularDirectory(worktreeValue, "worktree");
  const entries = referencedTrialInputPaths(plan, worktree).map((entry) => ({ ...entry, ...hashFile(worktree, entry.path) }));
  const snapshot = {
    schema: PROTECTED_TRIAL_INPUTS_SCHEMA,
    plan_lock: `sha256:${createHash("sha256").update(JSON.stringify(plan)).digest("hex")}`,
    entries,
  };
  const filePath = path.join(path.resolve(runRoot), "protected-trial-inputs.json");
  if (existsSync(filePath)) {
    const existing = parseBoundedJson(readFileSync(filePath, "utf8"), { maxBytes: 2 * 1024 * 1024, maxDepth: 16, maxNodes: 10_000 });
    if (JSON.stringify(existing) !== JSON.stringify(snapshot)) {
      throw new DeliveryWorkspaceError("trial_input_baseline_changed", "Protected Trial inputs differ from the run baseline");
    }
    return { snapshot: existing, path: filePath, unchanged: true };
  }
  atomicWriteFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return { snapshot, path: filePath, unchanged: false };
}

export function verifyProtectedTrialInputs(snapshotOrPath, worktreeValue) {
  const worktree = regularDirectory(worktreeValue, "worktree");
  const snapshot = typeof snapshotOrPath === "string"
    ? parseBoundedJson(readFileSync(path.resolve(snapshotOrPath), "utf8"), { maxBytes: 2 * 1024 * 1024, maxDepth: 16, maxNodes: 10_000 })
    : snapshotOrPath;
  if (snapshot?.schema !== PROTECTED_TRIAL_INPUTS_SCHEMA || !Array.isArray(snapshot.entries)) {
    throw new DeliveryWorkspaceError("trial_input_snapshot_invalid", "Protected Trial input snapshot is invalid");
  }
  const changes = [];
  for (const expected of snapshot.entries) {
    try {
      const current = hashFile(worktree, expected.path);
      if (current.hash !== expected.hash || current.size !== expected.size) changes.push({ path: expected.path, reason: "content_changed" });
    } catch (error) {
      changes.push({ path: expected.path, reason: error.code || "unavailable" });
    }
  }
  return { ok: changes.length === 0, changes };
}

export function commitVerifiedCheckpoint(runRoot, options = {}) {
  const metadata = readDeliveryWorktree(runRoot);
  if (!metadata) throw new DeliveryWorkspaceError("worktree_metadata_missing", "Delivery worktree metadata is missing");
  const worktree = regularDirectory(metadata.worktree, "worktree");
  const branch = git(worktree, ["branch", "--show-current"]).trim();
  if (branch !== metadata.branch || !branch.startsWith("pritha/build-")) {
    throw new DeliveryWorkspaceError("worktree_branch_mismatch", "Refusing to commit outside the delivery branch");
  }
  const status = git(worktree, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.trim()) {
    git(worktree, ["add", "-A"]);
    git(worktree, ["commit", "-m", `Pritha verified outcome: ${metadata.run_id}`]);
  }
  const checkpoint = git(worktree, ["rev-parse", "HEAD"]).trim();
  const next = { ...metadata, verified_checkpoint: checkpoint, verified_at: options.verifiedAt || new Date().toISOString() };
  atomicWriteFile(metadataPath(runRoot), `${JSON.stringify(next, null, 2)}\n`);
  return { ...next, changed: Boolean(status.trim()) };
}

export function discardDeliveryIteration(runRoot) {
  const metadata = readDeliveryWorktree(runRoot);
  if (!metadata) throw new DeliveryWorkspaceError("worktree_metadata_missing", "Delivery worktree metadata is missing");
  const worktree = regularDirectory(metadata.worktree, "worktree");
  const branch = git(worktree, ["branch", "--show-current"]).trim();
  if (branch !== metadata.branch || !branch.startsWith("pritha/build-")) {
    throw new DeliveryWorkspaceError("worktree_branch_mismatch", "Refusing to discard changes outside the delivery branch");
  }
  const checkpoint = metadata.verified_checkpoint || metadata.base_revision;
  if (!/^[a-f0-9]{40,64}$/.test(String(checkpoint || ""))) {
    throw new DeliveryWorkspaceError("checkpoint_invalid", "Delivery rollback checkpoint is invalid");
  }
  git(worktree, ["reset", "--hard", checkpoint]);
  git(worktree, ["clean", "-fd"]);
  return { ...metadata, restored_checkpoint: checkpoint };
}
