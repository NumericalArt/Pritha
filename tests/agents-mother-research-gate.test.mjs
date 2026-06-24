import test from "node:test";
import assert from "node:assert/strict";

import {
  contractAllowsExternalResearchNotApplicable,
  normalizeResearchGateStatus,
  researchGateDecisionForReport,
  researchGateStatusForReport,
  reportReferencesContract,
} from "../scripts/agents-mother/research-gate.mjs";

const contract = {
  relPath: "11_agents/contracts/2026-06-22-sample-agent-contract.md",
  text: [
    "- External verification needs: Pritha memory plus current official docs before scaffold",
    "- Source freshness requirements: verify volatile platform/API choices before scaffold",
    "- Current-docs verification required: yes",
  ].join("\n"),
};

const fixtureContract = {
  relPath: "tests/fixtures/contracts/valid-agent-contract.md",
  text: [
    "- External verification needs: none for fixture.",
    "- Source freshness requirements: not-applicable.",
    "- Current-docs verification required: no-with-reason: deterministic fixture.",
  ].join("\n"),
};

function reportFor(contractPath, gate = {}) {
  const values = {
    research_gate_status: "complete",
    memory_research_status: "complete",
    external_research_status: "complete",
    synthesis_status: "complete",
    ...gate,
  };
  return [
    "---",
    "id: sample-agent-research",
    "type: review",
    "status: draft",
    `research_gate_status: ${values.research_gate_status}`,
    `memory_research_status: ${values.memory_research_status}`,
    `external_research_status: ${values.external_research_status}`,
    `synthesis_status: ${values.synthesis_status}`,
    "sources:",
    `  - ${contractPath}`,
    "related:",
    "  agent_contracts:",
    `    - ${contractPath}`,
    "---",
    "",
    "# Sample Agent Research",
    "",
    `Contract: ${contractPath}`,
  ].join("\n");
}

test("research gate status requires explicit machine-readable fields", () => {
  const legacy = [
    "---",
    "id: legacy-research",
    "type: review",
    "status: complete",
    "---",
    "",
    "Fixture result: local scaffold standards are sufficient; no external volatile choices.",
  ].join("\n");

  const gate = researchGateStatusForReport(legacy);
  assert.equal(gate.ok, false);
  assert.equal(gate.status, "pending");
  assert.ok(gate.reasons.includes("researchGate_missing"));
  assert.ok(gate.reasons.includes("externalResearch_missing"));
});

test("complete research gate passes for a matching contract", () => {
  const decision = researchGateDecisionForReport(contract, reportFor(contract.relPath));
  assert.equal(decision.ok, true);
  assert.equal(decision.status, "complete");
  assert.deepEqual(decision.reasons, []);
});

test("pending external research blocks scaffold readiness", () => {
  const decision = researchGateDecisionForReport(
    contract,
    reportFor(contract.relPath, { external_research_status: "pending" }),
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.status, "pending");
  assert.ok(decision.reasons.includes("externalResearch_pending"));
});

test("not-applicable external research requires a contract reason", () => {
  const normalDecision = researchGateDecisionForReport(
    contract,
    reportFor(contract.relPath, { external_research_status: "not-applicable" }),
  );
  assert.equal(normalDecision.ok, false);
  assert.equal(normalDecision.status, "failed");
  assert.ok(normalDecision.reasons.includes("external_research_not_applicable_without_contract_reason"));

  const fixtureDecision = researchGateDecisionForReport(
    fixtureContract,
    reportFor(fixtureContract.relPath, { external_research_status: "not-applicable" }),
  );
  assert.equal(contractAllowsExternalResearchNotApplicable(fixtureContract), true);
  assert.equal(fixtureDecision.ok, true);
  assert.equal(fixtureDecision.status, "complete");
});

test("research gate rejects reports that do not reference the contract", () => {
  const report = reportFor("11_agents/contracts/other-agent-contract.md");
  const reference = reportReferencesContract(report, contract);
  assert.equal(reference.ok, false);
  assert.deepEqual(reference.reasons, ["research_report_contract_mismatch"]);

  const decision = researchGateDecisionForReport(contract, report);
  assert.equal(decision.ok, false);
  assert.equal(decision.status, "failed");
  assert.ok(decision.reasons.includes("research_report_contract_mismatch"));
});

test("research gate status values are strict", () => {
  assert.equal(normalizeResearchGateStatus("complete"), "complete");
  assert.equal(normalizeResearchGateStatus("not_applicable"), "not-applicable");
  assert.equal(normalizeResearchGateStatus("verified"), "malformed");
  assert.equal(normalizeResearchGateStatus(""), "missing");
});
