import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { agentInstanceKey, authoredAgentId, currentAgentMission, findCatalogAgent, readAgentCatalog } from "../scripts/agents-mother/identity.mjs";
import { parseFrontmatterData } from "../scripts/lib/frontmatter.mjs";
import { approveOutcomeSpec, createOutcomeSpec, validateOutcomeSpecText } from "../scripts/agents-mother/outcome-spec.mjs";
import { resolveProviderAgentWorkspace } from "../scripts/lib/provider-agent-workspace.mjs";

function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-identity-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother");
  const stateRoot = path.join(parent, "state");
  const agentParent = path.join(parent, "children");
  const memoryRoot = path.join(stateRoot, "agents");
  for (const directory of [root, agentParent, ...["contracts", "profiles", "reports"].map((name) => path.join(memoryRoot, name))]) mkdirSync(directory, { recursive: true });
  const options = { root, stateRoot, memoryRoot, agentParent };
  const write = (name, type, id, body = "", extra = "") => {
    const file = path.join(memoryRoot, name);
    writeFileSync(file, `---\nid: ${path.basename(name, ".md")}\ntype: ${type}\nupdated: 2026-09-05\n${id ? `agent_id: ${id}\nsubject:\n  kind: child-agent\n  id: ${id}\n` : ""}${extra}---\n\n${body}\n`);
    return file;
  };
  const folder = (name) => { const file = path.join(agentParent, name); mkdirSync(file); writeFileSync(path.join(file, "AGENTS.md"), "# Agent\n"); return file; };
  const contract = (name, id, project, display = name) => write(`contracts/${name}.md`, "agent-contract", id, `- Agent name: ${display}\n- Primary mission: Mission ${id}\n${project ? `- Target folder: ${project}` : ""}`);
  return { ...options, options, write, folder, contract, catalog: () => readAgentCatalog({ ...options, fresh: true }) };
}

test("placeholder-only lifecycle reports are diagnostics and do not synthesize agents", t => {
  const f = fixture(t);
  f.write("reports/placeholder.md", "agent-post-creation-review", null, "# Agent Post-Creation Review: pilot\n\n- Project path: <PROJECT_ROOT>");
  assert.equal(f.catalog().agents.length, 0);
  assert.ok(f.catalog().diagnostics.some(row => row.code === "unbound-legacy-report"));
});

test("non-Git distribution excludes tracked agent history from its live catalog",t=>{
  const f=fixture(t),history=path.join(f.root,'11_agents','contracts'),local=path.join(f.root,'.private','agents','contracts');
  mkdirSync(history,{recursive:true});mkdirSync(local,{recursive:true});
  const contract=id=>`---\nid: ${id}\ntype: agent-contract\nagent_id: ${id}\n---\n- Agent name: ${id}\n`;
  writeFileSync(path.join(history,'historical.md'),contract('historical'));
  writeFileSync(path.join(local,'local.md'),contract('local'));
  const catalog=readAgentCatalog({root:f.root,stateRoot:f.root,agentParent:f.agentParent,env:{},fresh:true});
  assert.equal(catalog.artifacts.length,1);assert.equal(catalog.agents.length,1);
  assert.equal(catalog.agents[0].agentId,'local');assert.equal(findCatalogAgent(catalog,'historical'),null);
});

test("frontmatter-only reports use exact stable ID; display and artifact renames preserve identity", (t) => {
  const f = fixture(t);
  const folder = f.folder("alpha");
  const contract = f.contract("first", "agent-alpha", folder, "Old name");
  f.write("reports/unrelated-filename.md", "agent-test-report", "agent-alpha", "", "status: pass\n");
  const before = findCatalogAgent(f.catalog(), "agent-alpha");
  assert.equal(before.artifacts.length, 2);
  assert.equal(before.projectPath, folder);
  writeFileSync(contract, readFileSync(contract, "utf8").replace("Old name", "Renamed product"));
  renameSync(contract, path.join(f.memoryRoot, "contracts/renamed-document.md"));
  const after = findCatalogAgent(f.catalog(), "agent-alpha");
  assert.equal(after.id, before.id);
  assert.equal(after.name, "Renamed product");
  assert.equal(after.artifacts.length, 2);
});

test("two agents with identical display names and different folders keep separate evidence", (t) => {
  const f = fixture(t);
  f.contract("first", "first-id", f.folder("first"), "Same name");
  f.contract("second", "second-id", f.folder("second"), "Same name");
  f.write("reports/first.md", "agent-test-report", "first-id");
  f.write("reports/second.md", "agent-test-report", "second-id");
  f.write("reports/ambiguous.md", "agent-test-report", null, "- Agent name: Same name");
  const catalog = f.catalog();
  assert.equal(catalog.agents.length, 2);
  assert.equal(findCatalogAgent(catalog, "Same name"), null);
  for (const id of ["first-id", "second-id"]) assert.equal(findCatalogAgent(catalog, id).artifacts.length, 2);
  assert.ok(catalog.diagnostics.some((item) => item.code === "ambiguous-legacy-attribution"));
});

test("ID precedence rejects contradictions and never reinterprets a non-child subject", () => {
  assert.deepEqual(authoredAgentId({ agent_id: "a", subject: { kind: "child-agent", id: "a" } }), { id: "a", issue: null });
  assert.equal(authoredAgentId({ agent_id: "a", subject: { kind: "child-agent", id: "b" } }).issue, "conflicting-agent-ids");
  assert.equal(authoredAgentId({ agent_id: "a", subject: { kind: "pritha", id: "a" } }).issue, "non-child-subject");
  assert.equal(authoredAgentId({ agent_id: "../outside" }).issue, "invalid-agent-id");
  for (const agent_id of [[], {}, ""]) assert.equal(authoredAgentId({ agent_id }).issue, "invalid-agent-id");
});

test("exact contract path binds an outcome; duplicate basenames and conflicting IDs cannot bind it", (t) => {
  const f = fixture(t);
  const contract = f.contract("alpha", "alpha", f.folder("alpha"));
  f.write("contracts/outcome.md", "agent-outcome-spec", "alpha", "", `contract_path: ${contract}\n`);
  f.write("contracts/foreign.md", "agent-outcome-spec", "alpha", "", `contract_path: ${path.join(f.root, "other/alpha.md")}\n`);
  f.write("contracts/conflict.md", "agent-outcome-spec", "other", "", `contract_path: ${contract}\n`);
  const catalog = f.catalog();
  assert.equal(findCatalogAgent(catalog, "alpha").artifacts.length, 2);
  assert.deepEqual(catalog.diagnostics.map((item) => item.code).sort(), ["contract-binding-not-found", "contract-id-conflict"]);
});

test("instance keys qualify otherwise identical IDs and foreign metadata is quarantined", (t) => {
  const f = fixture(t), g = fixture(t);
  f.contract("alpha", "alpha", f.folder("alpha"));
  g.contract("alpha", "alpha", g.folder("alpha"));
  f.write("reports/foreign.md", "agent-test-report", "alpha", "", `instance_key: ${agentInstanceKey(g.stateRoot)}\n`);
  const left = findCatalogAgent(f.catalog(), "alpha"), right = findCatalogAgent(g.catalog(), "alpha");
  assert.notEqual(left.id, right.id);
  assert.notEqual(left.instanceKey, right.instanceKey);
  assert.equal(left.artifacts.length, 1);
  assert.equal(findCatalogAgent(f.catalog(), right.id), null);
  assert.ok(f.catalog().diagnostics.some((item) => item.code === "foreign-instance"));
});

test("substring and arbitrary body mentions never attribute legacy evidence", (t) => {
  const f = fixture(t);
  f.contract("alpha", "alpha", f.folder("alpha"));
  f.contract("alpha-pro", "alpha-pro", f.folder("alpha-pro"));
  f.write("reports/alpha-mentioned.md", "agent-test-report", null, "This mentions alpha but has no authored agent metadata.");
  f.write("reports/alpha-pro.md", "agent-test-report", "alpha-pro");
  const catalog = f.catalog();
  assert.equal(findCatalogAgent(catalog, "alpha").artifacts.length, 1);
  assert.equal(findCatalogAgent(catalog, "alpha-pro").artifacts.length, 2);
});

test("conflicting ID/project declarations disable folder attribution instead of choosing the first", (t) => {
  const f = fixture(t);
  f.contract("alpha", "alpha", f.folder("first"));
  f.contract("alpha-new", "alpha", f.folder("second"));
  const agent = findCatalogAgent(f.catalog(), "alpha");
  assert.equal(agent.identityStatus, "conflict");
  assert.equal(agent.projectPath, null);
  assert.ok(agent.diagnostics.includes("conflicting-project-paths"));
});

test("one project cannot silently become two explicit agents", (t) => {
  const f = fixture(t), project = f.folder("alpha");
  f.contract("first", "first", project);
  f.contract("second", "second", project);
  for (const id of ["first", "second"]) {
    const agent = findCatalogAgent(f.catalog(), id);
    assert.equal(agent.projectPath, null);
    assert.ok(agent.diagnostics.includes("multiple-identities-for-project"));
  }
});

test("a repaired report subject must use the accepted contract ID to preserve its project binding", t => {
  const f = fixture(t), project = f.folder("brief-fixture");
  f.contract("brief-fixture", "stable-fixture-id", project);
  const report = f.write("reports/adapter.md", "agent-operations-report", null, "",
    "subject:\n  kind: child-agent\n  id: brief-fixture\n");
  const conflicted = f.catalog().agents;
  assert.equal(conflicted.length, 2);
  assert.ok(conflicted.every(agent => agent.identityStatus === "conflict" && agent.projectPath === null));
  writeFileSync(report, readFileSync(report, "utf8").replace("  id: brief-fixture\n", "  id: stable-fixture-id\n"));
  const repaired = f.catalog().agents;
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].projectPath, project);
  assert.equal(repaired[0].identityStatus, "identified");
  assert.equal(repaired[0].artifacts.length, 2);
});

test("external state excludes tracked historical child files and symlinked memory/folders", (t) => {
  const f = fixture(t), g = fixture(t);
  const tracked = path.join(f.root, "11_agents/contracts");
  mkdirSync(tracked, { recursive: true });
  writeFileSync(path.join(tracked, "foreign.md"), "---\ntype: agent-contract\nagent_id: tracked-foreign\n---\n- Agent name: tracked\n");
  const foreign = g.contract("outside", "outside", g.folder("outside"));
  symlinkSync(foreign, path.join(f.memoryRoot, "contracts/linked.md"));
  symlinkSync(path.dirname(foreign), path.join(f.memoryRoot, "reports/linked-directory"));
  symlinkSync(path.join(g.agentParent, "outside"), path.join(f.agentParent, "outside"));
  assert.equal(f.catalog().agents.length, 0);
});

test("declared project outside this instance parent cannot fall back to a matching name", (t) => {
  const f = fixture(t), g = fixture(t);
  f.folder("alpha");
  f.contract("alpha", "alpha", g.folder("alpha"));
  const agent = findCatalogAgent(f.catalog(), "alpha");
  assert.equal(agent.projectPath, null);
  assert.ok(agent.diagnostics.includes("project-path-outside-or-missing"));
});

function draftProposal(f, target, { extra = "", body = "", status = "draft" } = {}) {
  const contract = f.write("contracts/proposal.md", "agent-contract", "planned-agent",
    `- Agent name: Planned Agent\n- Primary mission: Count lines\n- Target folder: ${target}\n${body}`,
    `${status ? `status: ${status}\n` : ""}${extra}`);
  f.write("contracts/proposal-outcome.md", "agent-outcome-spec", "planned-agent", "",
    `status: draft\ncontract_path: ${contract}\n`);
  return contract;
}

for (const name of ["pritha-line-counter-acceptance", "Techscope-tools"]) test(`an existing ${name} child requires its accepted instance-local contract`, t => {
  const f = fixture(t), project = f.folder(name), id = "prefixed-child";
  assert.throws(() => resolveProviderAgentWorkspace(f.options, name), { code: "provider_agent_workspace_unavailable" });
  const contract = status => f.write("contracts/prefixed.md", "agent-contract", id,
    `- Agent name: ${name}\n- Target folder: ${project}`, `status: ${status}\nproject_path: ${project}\n`);
  contract("draft");
  let agent = findCatalogAgent(f.catalog(), id);
  assert.throws(() => resolveProviderAgentWorkspace(f.options, agent.id), { code: "provider_agent_workspace_unavailable" });
  contract("accepted");
  agent = findCatalogAgent(f.catalog(), id);
  assert.deepEqual(resolveProviderAgentWorkspace(f.options, agent.id), { agentId: agent.id, source: project });
  f.write("contracts/prefixed.md", "agent-contract", id, `- Agent name: ${name}\n- Target folder: ${project}`,
    `status: accepted\nproject_path: ${project}\ninstance_key: another-instance\n`);
  assert.throws(() => resolveProviderAgentWorkspace(f.options, agent.id), { code: "provider_agent_workspace_unavailable" });
  contract("accepted");
  writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "pritha" }));
  assert.throws(() => resolveProviderAgentWorkspace(f.options, agent.id), { code: "provider_agent_workspace_unavailable" });
  writeFileSync(path.join(project, "package.json"), JSON.stringify({ name }));
  mkdirSync(path.join(project, "11_agents")); mkdirSync(path.join(project, "scripts"));
  writeFileSync(path.join(project, "scripts", "pritha.mjs"), ""); mkdirSync(path.join(project, "interfaces", "control-center"), { recursive: true });
  assert.throws(() => resolveProviderAgentWorkspace(f.options, agent.id), { code: "provider_agent_workspace_unavailable" });
});

test("a draft destination stays visible without binding or creating an executable workspace", t => {
  const f = fixture(t), target = path.join(f.agentParent, "future project", "child");
  draftProposal(f, target);
  const catalog = f.catalog(), agent = findCatalogAgent(catalog, "planned-agent");
  assert.equal(catalog.agents.length, 1);
  assert.equal(agent.identityStatus, "identified");
  assert.deepEqual(agent.diagnostics, ["project-planned-not-created"]);
  assert.equal(agent.projectPath, null);
  assert.equal(agent.artifacts.length, 2);
  assert.equal(currentAgentMission(agent, f.options).text, "Count lines");
  assert.equal(findCatalogAgent(catalog, target), null);
  assert.throws(() => resolveProviderAgentWorkspace(f.options, agent.id), { code: "provider_agent_workspace_unavailable" });
  assert.equal(existsSync(path.dirname(target)), false, "catalog reads never create the proposed project");
});

test("a draft target cannot use a matching sibling as its execution binding", t => {
  const f = fixture(t), sibling = f.folder("Planned Agent"), target = path.join(f.agentParent, "other");
  draftProposal(f, target);
  const agent = findCatalogAgent(f.catalog(), "planned-agent");
  assert.equal(agent.projectPath, null);
  assert.notEqual(agent.projectPath, sibling);
  assert.deepEqual(agent.diagnostics, ["project-planned-not-created"]);
});

for (const kind of ["outside", "linked-leaf", "broken-linked-leaf", "linked-parent", "foreign-instance", "canonical-checkout", "regular-file"]) {
  test(`draft destinations retain path isolation: ${kind}`, t => {
    const f = fixture(t), foreign = fixture(t);
    let target = path.join(f.agentParent, "planned");
    if (kind === "outside") target = path.join(foreign.agentParent, "missing");
    if (kind === "linked-leaf") symlinkSync(foreign.folder("child"), target);
    if (kind === "broken-linked-leaf") symlinkSync(path.join(foreign.agentParent, "missing"), target);
    if (kind === "linked-parent") { symlinkSync(foreign.agentParent, target); target = path.join(target, "missing"); }
    if (kind === "regular-file") writeFileSync(target, "not a directory");
    if (kind === "canonical-checkout") { f.options.agentParent = path.dirname(f.root); target = path.join(f.root, "missing"); }
    if (kind === "foreign-instance") {
      const owner = path.join(f.agentParent, "another-instance");
      for (const part of ["Pritha/11_agents", "Pritha/scripts", "Pritha/interfaces/control-center"]) mkdirSync(path.join(owner, part), { recursive: true });
      writeFileSync(path.join(owner, "Pritha/scripts/pritha.mjs"), "// canonical checkout\n");
      target = path.join(owner, "missing-child");
    }
    draftProposal(f, target);
    const agent = findCatalogAgent(f.catalog(), "planned-agent");
    assert.equal(agent.identityStatus, "conflict");
    assert.equal(agent.projectPath, null);
    assert.ok(agent.diagnostics.includes("project-path-outside-or-missing"));
  });
}

for (const kind of ["accepted", "unknown-status", "frontmatter-project", "body-project", "existing-project", "profile", "scaffold-report", "approved-outcome"]) {
  test(`a missing project is not reclassified as an uncreated draft: ${kind}`, t => {
    const f = fixture(t), target = path.join(f.agentParent, "missing");
    const options = kind === "accepted" ? { status: "accepted" } : kind === "unknown-status" ? { status: "" }
      : kind === "frontmatter-project" ? { extra: `project_path: ${target}\n` }
      : kind === "body-project" ? { body: `- Project path: ${target}` } : {};
    draftProposal(f, kind === "existing-project" ? `existing project \`${target}\`` : target, options);
    if (kind === "profile") f.write("profiles/planned.md", "child-agent-profile", "planned-agent", "", "status: draft\n");
    if (kind === "scaffold-report") f.write("reports/planned.md", "scaffold-report", "planned-agent", "", "status: draft\n");
    if (kind === "approved-outcome") {
      const outcome = path.join(f.memoryRoot, "contracts/proposal-outcome.md");
      writeFileSync(outcome, readFileSync(outcome, "utf8").replace("status: draft", "status: approved"));
    }
    const agent = findCatalogAgent(f.catalog(), "planned-agent");
    assert.equal(agent.identityStatus, "conflict");
    assert.equal(agent.projectPath, null);
    assert.ok(agent.diagnostics.includes("project-path-outside-or-missing"));
  });
}

test("different missing targets for one draft identity remain a conflict", t => {
  const f = fixture(t);
  draftProposal(f, path.join(f.agentParent, "first"));
  f.write("contracts/revision.md", "agent-contract", "planned-agent", `- Target folder: ${path.join(f.agentParent, "second")}`, "status: draft\n");
  assert.equal(findCatalogAgent(f.catalog(), "planned-agent").identityStatus, "conflict");
});

test("a previously created project with lifecycle evidence stays conflicted after its folder disappears", t => {
  const f = fixture(t), target = f.folder("planned");
  draftProposal(f, target);
  f.write("reports/scaffold.md", "scaffold-report", "planned-agent", `- Project path: ${target}`, "status: created\n");
  const present = findCatalogAgent(f.catalog(), "planned-agent");
  assert.equal(present.identityStatus, "identified");
  assert.equal(present.projectPath, target);
  rmSync(target, { recursive: true });
  const missing = findCatalogAgent(f.catalog(), "planned-agent");
  assert.equal(missing.id, present.id);
  assert.equal(missing.identityStatus, "conflict");
  assert.equal(missing.projectPath, null);
});

test("mission reflects an in-place authored edit and new profiles without a registry rebuild", (t) => {
  const f = fixture(t);
  const contract = f.contract("alpha", "alpha", f.folder("alpha"));
  const first = readAgentCatalog(f.options);
  const agent = findCatalogAgent(first, "alpha");
  assert.equal(currentAgentMission(agent, f.options).text, "Mission alpha");
  writeFileSync(contract, readFileSync(contract, "utf8").replace("Mission alpha", "A clarified mission"));
  assert.equal(currentAgentMission(agent, f.options).text, "A clarified mission");
  const profile = f.write("profiles/alpha.md", "child-agent-profile", "alpha", "- Primary mission: Profile purpose");
  const updated = findCatalogAgent(readAgentCatalog(f.options), "alpha");
  assert.equal(updated.missionSource, profile);
  assert.equal(currentAgentMission(updated, f.options).text, "Profile purpose");
  writeFileSync(profile, readFileSync(profile, "utf8").replaceAll("agent_id: alpha", "agent_id: foreign"));
  assert.equal(currentAgentMission(updated, f.options).source, null);
});

test("legacy attribution remains diagnosed and cannot authorize unrelated modern IDs", (t) => {
  const f = fixture(t);
  const contract = f.contract("old", null, f.folder("old"), "Old name");
  f.write("contracts/outcome.md", "agent-outcome-spec", "old", "", `contract_path: ${contract}\n`);
  const agent = findCatalogAgent(f.catalog(), "Old name");
  assert.equal(agent.identityStatus, "legacy");
  assert.ok(agent.diagnostics.includes("legacy-attribution-not-approval"));
  assert.equal(agent.artifacts.length, 2);
});

test("registry CLI includes frontmatter-only evidence and reports conflicts without leaking into tracked memory", (t) => {
  const f = fixture(t);
  f.contract("alpha", "alpha", f.folder("alpha"));
  f.write("reports/evidence.md", "agent-test-report", "alpha");
  const result = spawnSync(process.execPath, [path.resolve("scripts/pritha.mjs"), "registry"], {
    encoding: "utf8", env: { ...process.env, TECHSCOPE_ROOT: f.root, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_PARENT: f.agentParent },
  });
  assert.equal(result.status, 0, result.stderr);
  const registry = readFileSync(path.join(f.memoryRoot, "registry.md"), "utf8");
  assert.match(registry, /Agents tracked: 1/);
  assert.match(registry, /test:1/);
  assert.equal(f.catalog().agents.length, 1, "generated rows must not become additional authored identity sources");
});

test("new interview proposals receive distinct IDs while each contract and Outcome share one identity", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, [path.resolve("scripts/pritha.mjs"), "interview", "--no-input", "--name", "Same label", "--mission", "Produce a fixture report"], {
      encoding: "utf8", env: { ...process.env, TECHSCOPE_ROOT: f.root, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_PARENT: f.agentParent },
    });
    assert.equal(result.status, 0, result.stderr);
  }
  const documents = readdirSync(path.join(f.memoryRoot, "contracts")).map((file) => parseFrontmatterData(readFileSync(path.join(f.memoryRoot, "contracts", file), "utf8")));
  const contracts = documents.filter((fm) => fm.type === "agent-contract");
  assert.equal(contracts.length, 2);
  assert.notEqual(contracts[0].agent_id, contracts[1].agent_id);
  for (const contract of contracts) {
    assert.match(contract.agent_id, /^agent-[a-f0-9]{24}$/);
    assert.equal(documents.filter((fm) => fm.type === "agent-outcome-spec" && fm.subject?.id === contract.agent_id).length, 1);
  }
});

test("Outcome approval refuses a conflicting stable identity before writing host evidence", (t) => {
  const f = fixture(t);
  const contract = f.contract("alpha", "alpha", f.folder("alpha"));
  const spec = createOutcomeSpec(contract, f.options);
  const changed = readFileSync(spec.path, "utf8").replace("  id: alpha", "  id: other");
  writeFileSync(spec.path, changed);
  const validation = validateOutcomeSpecText(changed, { root: f.root });
  assert.ok(validation.issues.some((entry) => entry.code === "OS020"));
  assert.throws(() => approveOutcomeSpec(spec.path, { ...f.options, approvedBy: "user" }), /OS020/);
});

test("legacy contract revisions and nameless reports join only their exact unique project", (t) => {
  const f = fixture(t), project = f.folder("LegacyAgent");
  f.write("contracts/first.md", "agent-contract", null, "- Agent name: Legacy Agent\n- Target folder: <SIBLING_AGENT_ROOT>/LegacyAgent");
  f.write("contracts/second.md", "agent-contract", null, "- Agent name: Legacy Agent\n- Target folder: `<SIBLING_AGENT_ROOT>/LegacyAgent` unless user chooses another path.");
  f.write("reports/nameless.md", "agent-post-creation-review", null, `- Project path: ${project}`);
  f.write("reports/mixed-project-description.md", "agent-operations-report", null, `- Agent name: Legacy Agent\n- Project path: \`${f.root}\`, sibling runtime \`${project}\`.`);
  const catalog = f.catalog(), agent = findCatalogAgent(catalog, "Legacy Agent");
  assert.equal(catalog.agents.length, 1);
  assert.equal(agent.projectPath, project);
  assert.equal(agent.identityStatus, "legacy");
  assert.equal(agent.artifacts.length, 4);
  assert.ok(agent.diagnostics.includes("legacy-project-description-not-binding"));
});

test("migrated legacy memory references map one recognized prefix without authorizing approval", (t) => {
  const f = fixture(t);
  f.contract("alpha", "alpha", f.folder("alpha"));
  f.write("reports/migrated.md", "agent-handoff-report", "alpha", "", "contract_path: 11_agents/contracts/alpha.md\n");
  f.write("reports/unknown-prefix.md", "agent-handoff-report", "alpha", "", "contract_path: another-instance/contracts/alpha.md\n");
  const catalog = f.catalog(), agent = findCatalogAgent(catalog, "alpha");
  assert.equal(agent.artifacts.length, 2);
  assert.equal(agent.artifacts.find((item) => item.type === "agent-handoff-report").attribution, "legacy");
  assert.ok(agent.diagnostics.includes("legacy-memory-path-not-approval"));
  assert.ok(catalog.diagnostics.some((item) => item.code === "contract-binding-not-found"));
});

test("a nested sibling owned by another canonical Pritha cannot attach to this instance", (t) => {
  const f = fixture(t);
  const otherParent = path.join(f.agentParent, "other-instance");
  for (const part of ["Pritha/11_agents", "Pritha/scripts", "Pritha/interfaces/control-center", "Child"]) mkdirSync(path.join(otherParent, part), { recursive: true });
  writeFileSync(path.join(otherParent, "Pritha/scripts/pritha.mjs"), "// Other canonical Pritha\n");
  f.contract("child", "child", path.join(otherParent, "Child"));
  const agent = findCatalogAgent(f.catalog(), "child");
  assert.equal(agent.projectPath, null);
  assert.equal(agent.identityStatus, "conflict");
});
