import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec } from "../scripts/agents-mother/outcome-spec.mjs";

const server = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");
const tree = ts.createSourceFile("server.ts", server, ts.ScriptTarget.Latest, true);
const functions = ["slug", "escapeRegExp", "relativePath", "frontmatter", "scalarValue", "sha256", "currentContractFingerprint", "outcomeApprovalIntegrity", "parseRegistry", "findSiblingFolder", "findProfile", "findContract", "findOutcomeSpec", "findDeliveryReport", "findReports", "findLiveDeliveryState", "selectAgent", "operationManifestForAgent", "readJson"];
const declarations = functions.map((name) => {
  const node = tree.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, `Missing production selector ${name}`);
  return node.getText(tree);
});
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64")}`;
const deliveryUrl = moduleUrl(readFileSync("interfaces/control-center/src/lib/control-center/delivery-state.ts", "utf8"));
const identityUrl = pathToFileURL(path.resolve("scripts/agents-mother/identity.mjs")).href;

async function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-card-identity-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), memoryRoot = path.join(stateRoot, "agents");
  const project = path.join(agentParent, "actual-folder");
  for (const dir of [root, project, path.join(memoryRoot, "contracts"), path.join(memoryRoot, "reports")]) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(project, "AGENTS.md"), "# Fixture agent\n");
  const contractPath = path.join(memoryRoot, "contracts/contract.md");
  const contractText = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("type: agent-contract", "type: agent-contract\nagent_id: stable-agent")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${project}`);
  writeFileSync(contractPath, contractText);
  const specPath = createOutcomeSpec(contractPath, { root, stateRoot }).path;
  approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user" });
  const { plan } = compileOutcomeSpec(specPath, { root, stateRoot });
  // Execute the actual production selectors with isolated roots. HTTP, models
  // and the rest of the Control Center are unnecessary for identity decisions.
  const selectors = await import(moduleUrl(`
    import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
    import path from 'node:path';
    import { createHash } from 'node:crypto';
    import { readAgentCatalog as catalog, readCatalogArtifact as artifact, findCatalogAgent, readIdentityEvidence } from ${JSON.stringify(identityUrl)};
    import { deliveryStateView } from ${JSON.stringify(deliveryUrl)};
    const context = ${JSON.stringify({ root, stateRoot, agentParent, memoryRoot })};
    const readAgentCatalog = (options) => catalog({ ...options, ...context });
    const readCatalogArtifact = (agent, file) => artifact(agent, file, context);
    const resolvePrithaStateRoot = () => context.stateRoot;
    const resolvePrithaAgentMemoryRoot = () => context.memoryRoot;
    const resolvePrithaStatePath = (kind, ...segments) => path.join(context.stateRoot, kind, ...segments);
    import { outcomeDocumentLock as currentOutcomeDocumentLock } from ${JSON.stringify(pathToFileURL(path.resolve("scripts/agents-mother/outcome-lock.mjs")).href)};
    ${declarations.join("\n")}
    export { ${functions.join(",")} };
  `));
  const record = selectors.parseRegistry(root, true).records.find((item) => item.agentId === "stable-agent");
  assert.ok(record);
  const approvalCheck = selectors.outcomeApprovalIntegrity(root, specPath, contractPath, readFileSync(specPath, "utf8"));
  assert.equal(approvalCheck.valid, true, approvalCheck.reason);
  const ledger = {
    schema: "pritha-delivery-ledger-v2", run_id: "bound-run", status: "awaiting_acceptance", source_project: project,
    updated_at: "2026-09-05T10:00:00.000Z", spec: { id: plan.spec_id, contract_fingerprint: plan.contract_fingerprint, semantic_lock: plan.semantic_lock, document_lock: plan.document_lock, approval_id: plan.approval_id },
    budget: {},
  };
  const ledgerPath = path.join(stateRoot, "builds/snapshot-agent/bound-run/build-state.json");
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const writeLedger = (value = ledger) => writeFileSync(ledgerPath, JSON.stringify(value));
  writeLedger();
  return { root, stateRoot, memoryRoot, project, record, selectors, ledger, ledgerPath, writeLedger, contractPath, specPath, plan };
}

test("production cards select the canonical folder by ID and preserve a unique old route alias", async (t) => {
  const f = await fixture(t);
  assert.equal(f.selectors.findSiblingFolder(f.root, f.record.id).absolutePath, f.project);
  const agent = { id: f.record.id, identity: { routeAliases: f.record.routeAliases }, name: f.record.name };
  assert.equal(f.selectors.selectAgent([agent], f.record.routeAliases[0]), agent);
  assert.equal(f.selectors.selectAgent([agent, { ...agent, id: "different" }], f.record.routeAliases[0]), null);
  assert.equal(f.selectors.operationManifestForAgent(f.root, agent).folder.absolutePath, f.project);
  assert.equal(f.selectors.findSiblingFolder(f.root, "unrelated"), null);
  assert.equal(f.selectors.findContract(f.root, f.record), f.contractPath);
  assert.equal(f.selectors.findOutcomeSpec(f.root, f.record), f.specPath);
});

test("live delivery projection requires exact project, contract, spec locks and host approval receipt", async (t) => {
  const f = await fixture(t);
  assert.equal(f.plan.agent_id, undefined, "v1 compiled plans retain their existing wire shape");
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record)?.runId, "bound-run");
  const invalid = [
    { ...f.ledger, source_project: path.join(f.project, "other") },
    ...["id", "contract_fingerprint", "semantic_lock", "document_lock", "approval_id"].map((field) => ({ ...f.ledger, spec: { ...f.ledger.spec, [field]: "foreign-or-stale" } })),
    { ...f.ledger, source_project: undefined, agent_slug: f.record.name, target_label: f.record.name },
  ];
  for (const state of invalid) {
    f.writeLedger(state);
    assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record), null);
  }
  f.writeLedger();
  writeFileSync(f.contractPath, `${readFileSync(f.contractPath, "utf8")}\nChanged accepted meaning.\n`);
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record), null);
});

test("a replaced approval file or ledger symlink cannot import another instance's evidence", async (t) => {
  const f = await fixture(t), other = await fixture(t);
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record)?.runId, "bound-run");
  const approvalPath = path.join(f.stateRoot, "audit/outcome-approvals.jsonl");
  const approved = readFileSync(approvalPath);
  rmSync(approvalPath);
  symlinkSync(path.join(other.stateRoot, "audit/outcome-approvals.jsonl"), approvalPath);
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record), null);
  rmSync(approvalPath);
  writeFileSync(approvalPath, approved);
  rmSync(f.ledgerPath);
  symlinkSync(other.ledgerPath, f.ledgerPath);
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record), null);
});

test("a changed Outcome binding cannot be followed through a cached card", async (t) => {
  const f = await fixture(t), other = await fixture(t);
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record)?.runId, "bound-run");
  const source = readFileSync(f.specPath, "utf8");
  writeFileSync(f.specPath, source.replace(/^contract_path:.*$/m, `contract_path: ${other.contractPath}`));
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record), null);
  rmSync(f.specPath);
  symlinkSync(other.specPath, f.specPath);
  assert.equal(f.selectors.findLiveDeliveryState(f.root, f.record), null);
});
