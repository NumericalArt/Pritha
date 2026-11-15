import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readAgentCatalog } from "../scripts/agents-mother/identity.mjs";
import { applyAgentRemoval, planAgentRemoval, restoreAgentRemoval } from "../scripts/agents-mother/agent-removal.mjs";

const root = realpathSync(new URL("../", import.meta.url).pathname);

function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-removal-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), memoryRoot = path.join(stateRoot, "agents");
  for (const dir of [agentParent, ...["contracts", "profiles", "reports", "research"].map((name) => path.join(memoryRoot, name))]) mkdirSync(dir, { recursive: true });
  const options = { root, stateRoot, memoryRoot, agentParent, env: { PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: agentParent } };
  const doc = (name, type, id, body) => { const file = path.join(memoryRoot, name); writeFileSync(file, `---\nid: ${path.basename(name, ".md")}\ntype: ${type}\nupdated: 2026-11-15\nagent_id: ${id}\nsubject:\n  kind: child-agent\n  id: ${id}\n---\n\n${body}\n`); return file; };
  const agent = (slug, id, { lineage = true } = {}) => {
    const project = path.join(agentParent, slug);
    mkdirSync(path.join(project, "delivery"), { recursive: true });
    writeFileSync(path.join(project, "AGENTS.md"), "# Agent\n");
    if (lineage) writeFileSync(path.join(project, "delivery", "outcome-lineage.json"), JSON.stringify({ schema: "pritha-child-outcome-lineage-v1" }));
    const contract = doc(`contracts/2026-11-15-${slug}-agent-contract.md`, "agent-contract", id, `- Agent name: ${slug}\n- Primary mission: Mission of ${slug}\n- Target folder: ${project}`);
    const research = doc(`research/2026-11-15-${slug}-agent-research.md`, "research-note", id, "Research.");
    const factory = path.join(stateRoot, "agents", "voice-factory", slug);
    mkdirSync(factory, { recursive: true });
    const runId = `voice-${slug}-0001`, run = path.join(stateRoot, "builds", slug, runId);
    writeFileSync(path.join(factory, "session.json"), JSON.stringify({ slug, target: project, agentId: id, contract, research, runId, running: null }));
    mkdirSync(run, { recursive: true });
    writeFileSync(path.join(run, "build-state.json"), JSON.stringify({ run_id: runId, source_project: project, status: "verified" }));
    mkdirSync(path.join(stateRoot, "builds", ".targets"), { recursive: true });
    const claim = path.join(stateRoot, "builds", ".targets", `${slug}.json`);
    writeFileSync(claim, JSON.stringify({ run_id: runId, run_root: run }));
    return { project, contract, research, factory, run, claim };
  };
  return { stateRoot, agentParent, memoryRoot, options, agent, catalog: () => readAgentCatalog({ ...options, fresh: true }) };
}

test("a factory child moves whole into the archive, leaves the catalog and comes back on restore", t => {
  const f = fixture(t), id = "agent-" + "a".repeat(24), files = f.agent("mood-test", id);
  const plan = planAgentRemoval(id, f.options);
  assert.equal(plan.removable, true, JSON.stringify(plan.blockers));
  assert.deepEqual(new Set(plan.moves.map((move) => move.from)), new Set([files.project, files.contract, files.research, files.factory, files.run, files.claim]));
  assert.equal(plan.confirmationPhrase, "REMOVE mood-test");
  assert.throws(() => applyAgentRemoval(id, { planHash: plan.planHash, confirmation: "remove" }, f.options), { code: "confirmation_required" });
  assert.ok(existsSync(files.project), "a refused confirmation moves nothing");
  const result = applyAgentRemoval(id, { planHash: plan.planHash, confirmation: plan.confirmationPhrase }, f.options);
  assert.equal(result.moved, 6);
  for (const file of Object.values(files)) assert.equal(existsSync(file), false, file);
  assert.equal(existsSync(path.dirname(files.run)), false, "an emptied build folder goes too");
  assert.equal(f.catalog().agents.some((agent) => agent.agentId === id), false);
  const manifest = JSON.parse(readFileSync(path.join(result.archive, "manifest.json"), "utf8"));
  assert.equal(manifest.status, "removed");
  assert.ok(manifest.moves.every((move) => existsSync(move.to)));
  assert.ok(existsSync(path.join(f.memoryRoot, "registry.md")), "the registry is rebuilt");
  assert.doesNotMatch(readFileSync(path.join(f.memoryRoot, "registry.md"), "utf8"), /mood-test/);
  restoreAgentRemoval(result.archive, f.options);
  for (const file of Object.values(files)) assert.equal(existsSync(file), true, file);
  assert.equal(f.catalog().agents.some((agent) => agent.agentId === id), true);
});

test("the user's own project, a running service and a changed plan are refused without moving anything", t => {
  const f = fixture(t), own = "agent-" + "b".repeat(24), child = "agent-" + "c".repeat(24);
  const user = f.agent("own-project", own, { lineage: false });
  const plan = planAgentRemoval(own, f.options);
  assert.equal(plan.removable, false);
  assert.deepEqual(plan.blockers.map((blocker) => blocker.code), ["not_factory_child"]);
  assert.throws(() => applyAgentRemoval(own, { planHash: plan.planHash, confirmation: plan.confirmationPhrase }, f.options), { code: "removal_blocked" });
  assert.ok(existsSync(user.project) && existsSync(user.contract));

  const files = f.agent("running-child", child);
  mkdirSync(path.join(files.project, ".state"));
  writeFileSync(path.join(files.project, ".state", "service.pid.json"), JSON.stringify({ pid: process.pid }));
  assert.deepEqual(planAgentRemoval(child, f.options).blockers.map((blocker) => blocker.code), ["service_running"]);
  rmSync(path.join(files.project, ".state"), { recursive: true });

  const before = planAgentRemoval(child, f.options);
  assert.equal(before.removable, true);
  writeFileSync(path.join(files.factory, "session.json"), JSON.stringify({ ...JSON.parse(readFileSync(path.join(files.factory, "session.json"), "utf8")), running: { step: "deliver" } }));
  assert.deepEqual(planAgentRemoval(child, f.options).blockers.map((blocker) => blocker.code), ["factory_step_running"]);
  writeFileSync(path.join(files.factory, "session.json"), JSON.stringify({ ...JSON.parse(readFileSync(path.join(files.factory, "session.json"), "utf8")), running: null }));
  const extra = path.join(f.memoryRoot, "research", "2026-11-15-running-child-agent-pattern-pack.md");
  writeFileSync(extra, `---\nid: pack\ntype: research-note\nagent_id: ${child}\nsubject:\n  kind: child-agent\n  id: ${child}\n---\n\nPack.\n`);
  writeFileSync(path.join(files.factory, "session.json"), JSON.stringify({ ...JSON.parse(readFileSync(path.join(files.factory, "session.json"), "utf8")), pattern: extra }));
  assert.throws(() => applyAgentRemoval(child, { planHash: before.planHash, confirmation: before.confirmationPhrase }, f.options), { code: "plan_changed" });
  assert.ok(existsSync(files.project));
});
