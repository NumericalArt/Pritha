#!/usr/bin/env node
// Remove an agent that Pritha's factory created: its project folder, memory
// documents, factory session, build runs and proposal move together into an
// archive under the state root, and the registry is rebuilt without it.
// Nothing is deleted, and restoreAgentRemoval moves everything back.
//
// Only factory children qualify: their project carries Pritha's outcome
// lineage. A folder without it is the user's own project and is refused.
// A running service, a running factory step or an executing build blocks the
// plan; the user stops the agent first.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAgentCatalog, findCatalogAgent } from "./identity.mjs";
import { prithaRootEnvironment, resolvePrithaAgentMemoryRoot, resolvePrithaAgentParent, resolvePrithaRoot, resolvePrithaStateRoot } from "../lib/paths.mjs";

export const AGENT_REMOVAL_PLAN_SCHEMA = "pritha-agent-removal-plan-v1";
export const AGENT_REMOVAL_MANIFEST_SCHEMA = "pritha-agent-removal-v1";
const LINEAGE_SCHEMA = "pritha-child-outcome-lineage-v1";
// A paused or blocked run is idle; these statuses mean a turn or Trials are executing.
const EXECUTING_BUILD = new Set(["preparing", "building", "verifying", "correcting"]);

export class AgentRemovalError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel); };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const directories = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => path.join(dir, entry.name)); } catch { return []; } };

function context(options = {}) {
  const root = path.resolve(options.root || resolvePrithaRoot());
  return {
    root,
    stateRoot: resolvePrithaStateRoot({ ...options, root }),
    memoryRoot: resolvePrithaAgentMemoryRoot({ ...options, root }),
    agentParent: resolvePrithaAgentParent({ ...options, root }),
  };
}

function liveServicePid(projectPath) {
  const record = readJson(path.join(projectPath, ".state", "service.pid.json"));
  if (!Number.isSafeInteger(record?.pid) || record.pid <= 0) return null;
  try { process.kill(record.pid, 0); return record.pid; } catch (error) { return error?.code === "EPERM" ? record.pid : null; }
}

function factorySessions(ctx, agent) {
  return directories(path.join(ctx.stateRoot, "agents", "voice-factory")).flatMap((dir) => {
    const session = readJson(path.join(dir, "session.json"));
    if (!session) return [];
    const matches = (agent.projectPath && session.target === agent.projectPath) || (agent.agentId && session.agentId === agent.agentId);
    return matches ? [{ dir, session }] : [];
  });
}

function buildRuns(ctx, agent, runIds) {
  return directories(path.join(ctx.stateRoot, "builds")).flatMap(directories).flatMap((dir) => {
    const ledger = readJson(path.join(dir, "build-state.json"));
    if (!ledger) return [];
    const matches = (agent.projectPath && ledger.source_project === agent.projectPath) || runIds.has(ledger.run_id);
    return matches ? [{ dir, ledger }] : [];
  });
}

/** What removing this agent would move, and what blocks it now. Read-only. */
export function planAgentRemoval(target, options = {}) {
  const ctx = context(options);
  const catalog = readAgentCatalog({ root: ctx.root, stateRoot: ctx.stateRoot, memoryRoot: ctx.memoryRoot, agentParent: ctx.agentParent, fresh: true });
  const agent = findCatalogAgent(catalog, target);
  if (!agent) throw new AgentRemovalError("agent_not_found", "No agent with this identifier.");
  const blockers = [];
  const moves = [];
  const add = (kind, from) => { if (from && fs.existsSync(from) && !moves.some((move) => move.from === from || inside(move.from, from))) moves.push({ kind, from }); };
  if (agent.identityStatus === "conflict") blockers.push({ code: "identity_conflict", message: "This agent's identity is ambiguous; resolve it before removal." });
  const contract = agent.artifacts.find((item) => item.type === "agent-contract");
  if (agent.projectPath) {
    const lineage = readJson(path.join(agent.projectPath, "delivery", "outcome-lineage.json"));
    if (path.dirname(agent.projectPath) !== ctx.agentParent || lineage?.schema !== LINEAGE_SCHEMA) {
      blockers.push({ code: "not_factory_child", message: "This folder was not created by Pritha's factory. Pritha does not remove the user's own projects." });
    } else {
      const pid = liveServicePid(agent.projectPath);
      if (pid) blockers.push({ code: "service_running", message: "The agent's service is running. Stop it from its card first." });
      add("project", agent.projectPath);
    }
  } else if (!contract || !agent.agentId) {
    blockers.push({ code: "not_factory_child", message: "Only agents created by Pritha's factory can be removed here." });
  }
  const sessions = factorySessions(ctx, agent);
  for (const { dir, session } of sessions) {
    if (session.running) blockers.push({ code: "factory_step_running", message: "A factory step for this agent is running. Wait for it or stop it first." });
    add("factory", dir);
    for (const key of ["contract", "outcome", "research", "pattern"]) {
      if (typeof session[key] === "string" && inside(ctx.memoryRoot, session[key])) add("memory", session[key]);
    }
  }
  const runIds = new Set(sessions.map(({ session }) => session.runId).filter(Boolean));
  const runs = buildRuns(ctx, agent, runIds);
  for (const { dir, ledger } of runs) {
    if (EXECUTING_BUILD.has(ledger.status)) blockers.push({ code: "build_executing", message: `Build ${ledger.run_id} is ${ledger.status}. Wait for it or stop it first.` });
    add("build", dir);
  }
  // A target claim names its run; it leaves with the run so the folder name is free again.
  const claims = path.join(ctx.stateRoot, "builds", ".targets");
  for (const file of (() => { try { return fs.readdirSync(claims).filter((name) => name.endsWith(".json")).map((name) => path.join(claims, name)); } catch { return []; } })()) {
    if (runs.some(({ dir }) => readJson(file)?.run_root === dir)) add("build", file);
  }
  for (const item of agent.artifacts) if (inside(ctx.memoryRoot, item.path)) add("memory", item.path);
  if (agent.projectPath) add("proposal", path.join(ctx.stateRoot, "agents", "proposals", path.basename(agent.projectPath)));
  if (!moves.length && !blockers.length) blockers.push({ code: "nothing_to_remove", message: "No files belong to this agent." });
  // A rename keeps the archive instant and reversible; it needs one volume.
  const archiveRoot = path.join(ctx.stateRoot, "archive", "agents");
  const archiveDevice = fs.statSync(ctx.stateRoot).dev;
  if (moves.some((move) => fs.statSync(path.dirname(move.from)).dev !== archiveDevice)) {
    blockers.push({ code: "different_volume", message: "Some files are on another volume; move them manually." });
  }
  const sorted = moves.sort((a, b) => `${a.kind}:${a.from}`.localeCompare(`${b.kind}:${b.from}`));
  const body = { schema: AGENT_REMOVAL_PLAN_SCHEMA, agentId: agent.id, name: agent.name, projectPath: agent.projectPath || null, moves: sorted, blockers, archiveRoot };
  return { ...body, removable: blockers.length === 0, confirmationPhrase: `REMOVE ${agent.name}`, planHash: `sha256:${sha256(JSON.stringify(body))}` };
}

function archiveTarget(ctx, archiveDir, move) {
  const base = move.kind === "project" ? ctx.agentParent : move.kind === "memory" ? ctx.memoryRoot : ctx.stateRoot;
  return path.join(archiveDir, move.kind, path.relative(base, move.from));
}

// The script path comes from the Pritha checkout, not from this module: inside
// the Control Center bundle this module's own URL points at a copied asset, and
// the first live removal on 2026-11-15 failed to rebuild the registry that way.
// A failed rebuild is reported, never mistaken for a failed removal.
function rebuildRegistry(ctx) {
  const script = path.join(ctx.root, "scripts", "agents-mother", "index.mjs");
  try {
    execFileSync(process.execPath, [script, "registry"], { cwd: ctx.root, stdio: "ignore", timeout: 120_000,
      env: { ...process.env, ...prithaRootEnvironment(ctx.root), PRITHA_STATE_ROOT: ctx.stateRoot, PRITHA_AGENT_PARENT: ctx.agentParent } });
    return true;
  } catch { return false; }
}

/** Move the planned files into the archive. Needs the unchanged plan hash and the exact phrase. */
export function applyAgentRemoval(target, { planHash, confirmation, actor = "user" } = {}, options = {}) {
  const ctx = context(options);
  const plan = planAgentRemoval(target, options);
  if (!plan.removable) throw new AgentRemovalError("removal_blocked", plan.blockers.map((blocker) => blocker.message).join(" "));
  if (planHash !== plan.planHash) throw new AgentRemovalError("plan_changed", "The agent changed since this plan was shown. Review the new plan.");
  if ((confirmation || "").trim() !== plan.confirmationPhrase) throw new AgentRemovalError("confirmation_required", `Type ${plan.confirmationPhrase} to confirm.`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = path.basename(plan.projectPath || "") || plan.agentId;
  const archiveDir = path.join(plan.archiveRoot, `${label}-${stamp}`);
  fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  const manifestFile = path.join(archiveDir, "manifest.json");
  const manifest = { schema: AGENT_REMOVAL_MANIFEST_SCHEMA, agentId: plan.agentId, name: plan.name, projectPath: plan.projectPath, actor, planHash: plan.planHash,
    removedAt: new Date().toISOString(), moves: plan.moves.map((move) => ({ ...move, to: archiveTarget(ctx, archiveDir, move) })), completed: [] };
  const save = () => fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  save();
  try {
    for (const move of manifest.moves) {
      fs.mkdirSync(path.dirname(move.to), { recursive: true, mode: 0o700 });
      fs.renameSync(move.from, move.to);
      manifest.completed.push(move.from);
      save();
    }
  } catch (error) {
    // Put back what already moved, newest first, so a failure leaves no half-removed agent.
    for (const from of [...manifest.completed].reverse()) {
      const move = manifest.moves.find((entry) => entry.from === from);
      try { fs.renameSync(move.to, move.from); } catch { /* reported below */ }
    }
    manifest.failed = { code: error?.code || "move_failed", at: new Date().toISOString() };
    manifest.completed = [];
    save();
    throw new AgentRemovalError("removal_failed", "The files could not be moved; nothing was removed.");
  }
  for (const move of manifest.moves.filter((entry) => entry.kind === "build")) {
    const parent = path.dirname(move.from);
    if (path.basename(parent) === ".targets") continue;
    try { if (!fs.readdirSync(parent).length) fs.rmdirSync(parent); } catch { /* another run still uses it */ }
  }
  manifest.status = "removed";
  save();
  const registryRebuilt = rebuildRegistry(ctx);
  return { ok: true, archive: archiveDir, moved: manifest.moves.length, name: plan.name, registryRebuilt };
}

/** Move an archived agent back, if none of its original places is taken again. */
export function restoreAgentRemoval(archiveDir, options = {}) {
  const ctx = context(options);
  if (!inside(path.join(ctx.stateRoot, "archive", "agents"), path.resolve(archiveDir))) throw new AgentRemovalError("archive_outside_state", "Restore only from this instance's agent archive.");
  const manifest = readJson(path.join(archiveDir, "manifest.json"));
  if (manifest?.schema !== AGENT_REMOVAL_MANIFEST_SCHEMA || manifest.status !== "removed") throw new AgentRemovalError("archive_invalid", "This archive holds no completed removal.");
  const taken = manifest.moves.filter((move) => fs.existsSync(move.from));
  if (taken.length) throw new AgentRemovalError("restore_conflict", `Already present again: ${taken.map((move) => move.from).join(", ")}`);
  for (const move of manifest.moves) { fs.mkdirSync(path.dirname(move.from), { recursive: true }); fs.renameSync(move.to, move.from); }
  manifest.status = "restored";
  manifest.restoredAt = new Date().toISOString();
  fs.writeFileSync(path.join(archiveDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  const registryRebuilt = rebuildRegistry(ctx);
  return { ok: true, restored: manifest.moves.length, name: manifest.name, registryRebuilt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, target, ...rest] = process.argv.slice(2);
  const flag = (name) => { const index = rest.indexOf(name); return index >= 0 ? rest[index + 1] : undefined; };
  try {
    const result = command === "plan" ? planAgentRemoval(target)
      : command === "apply" && rest.includes("--yes") ? applyAgentRemoval(target, { planHash: flag("--plan-hash"), confirmation: flag("--confirm") })
      : command === "restore" && rest.includes("--yes") ? restoreAgentRemoval(target)
      : null;
    if (!result) throw new AgentRemovalError("usage", "Usage: agent-removal.mjs plan <agent> | apply <agent> --plan-hash <hash> --confirm \"REMOVE <name>\" --yes | restore <archive-dir> --yes");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.code || "removal_error", message: error.message }));
    process.exitCode = 1;
  }
}
