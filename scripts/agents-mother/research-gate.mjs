import { parseFrontmatterData } from "../lib/frontmatter.mjs";

const VALID_GATE_STATUSES = new Set(["complete", "pending", "not-applicable", "failed"]);
const PASSING_GATE_STATUSES = new Set(["complete", "not-applicable"]);
const REQUIRED_GATE_FIELDS = [
  ["research_gate_status", "researchGate"],
  ["memory_research_status", "memoryResearch"],
  ["external_research_status", "externalResearch"],
  ["synthesis_status", "synthesis"],
];

function asArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function bodyValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`^- ${escaped}:\\s*(.*)$`, "mi"));
  return match ? match[1].trim() : "";
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return "missing";
  if (Array.isArray(value) || typeof value === "object") return "malformed";
  const text = String(value).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (text === "n/a" || text === "na" || text === "notapplicable") return "not-applicable";
  if (VALID_GATE_STATUSES.has(text)) return text;
  return "malformed";
}

function fieldReason(name, status) {
  if (status === "missing") return `${name}_missing`;
  if (status === "malformed") return `${name}_malformed`;
  if (status === "pending") return `${name}_pending`;
  if (status === "failed") return `${name}_failed`;
  return "";
}

export function normalizeResearchGateStatus(value) {
  return normalizeValue(value);
}

export function parseResearchGateFrontmatter(text) {
  return parseFrontmatterData(String(text || "")) || {};
}

export function researchGateStatusForReport(text) {
  const frontmatter = parseResearchGateFrontmatter(text);
  const fields = {};
  const reasons = [];

  for (const [frontmatterKey, fieldKey] of REQUIRED_GATE_FIELDS) {
    fields[fieldKey] = normalizeValue(frontmatter[frontmatterKey]);
    const reason = fieldReason(fieldKey, fields[fieldKey]);
    if (reason) reasons.push(reason);
  }

  const values = Object.values(fields);
  let status = "pending";
  if (values.some((value) => value === "failed" || value === "malformed")) {
    status = "failed";
  } else if (values.some((value) => value === "missing" || value === "pending")) {
    status = "pending";
  } else if (values.every((value) => value === "not-applicable")) {
    status = "not-applicable";
  } else if (PASSING_GATE_STATUSES.has(fields.researchGate)) {
    status = "complete";
  }

  const ok = PASSING_GATE_STATUSES.has(status);
  return {
    ok,
    status,
    fields,
    frontmatter,
    reasons,
  };
}

export function reportReferencesContract(reportText, contractData = {}) {
  const relPath = String(contractData.relPath || "").trim();
  if (!relPath) return { ok: true, reasons: [] };

  const text = String(reportText || "");
  const frontmatter = parseResearchGateFrontmatter(text);
  const sources = asArray(frontmatter.sources);
  const related = frontmatter.related && typeof frontmatter.related === "object" ? frontmatter.related : {};
  const relatedContracts = asArray(related.agent_contracts);
  const references = [...sources, ...relatedContracts];

  if (references.includes(relPath) || text.includes(relPath)) {
    return { ok: true, reasons: [] };
  }

  return {
    ok: false,
    reasons: ["research_report_contract_mismatch"],
  };
}

export function contractAllowsExternalResearchNotApplicable(contractData = {}) {
  const text = String(contractData.text || "");
  const values = [
    bodyValue(text, "External verification needs"),
    bodyValue(text, "Source freshness requirements"),
    bodyValue(text, "Current-docs verification required"),
    bodyValue(text, "Current-docs verification status"),
    bodyValue(text, "External research policy"),
    bodyValue(text, "External research status"),
  ].join("\n").toLowerCase();

  if (/\bnone for fixture\b/.test(values)) return true;
  if (/\btests only\b/.test(values)) return true;
  if (/\bno-with-reason\b/.test(values)) return true;
  if (/\bnot-applicable\b/.test(values) && /\b(no|none|fixture|test|tests)\b/.test(values)) return true;
  return false;
}

export function isExternalResearchNotApplicable(contractData, gate) {
  const status = gate?.fields?.externalResearch || "missing";
  return status === "not-applicable" && contractAllowsExternalResearchNotApplicable(contractData);
}

export function researchGateDecisionForReport(contractData, reportText) {
  const gate = researchGateStatusForReport(reportText);
  const reference = reportReferencesContract(reportText, contractData);
  const reasons = [...gate.reasons, ...reference.reasons];

  const externalNotApplicable = gate.fields.externalResearch === "not-applicable";
  if (externalNotApplicable && !contractAllowsExternalResearchNotApplicable(contractData)) {
    reasons.push("external_research_not_applicable_without_contract_reason");
  }

  const researchGateNotApplicable = gate.fields.researchGate === "not-applicable";
  if (researchGateNotApplicable && !contractAllowsExternalResearchNotApplicable(contractData)) {
    reasons.push("research_gate_not_applicable_without_contract_reason");
  }

  const ok = gate.ok && reference.ok && reasons.length === 0;
  const status = ok ? gate.status : gate.status === "pending" ? "pending" : "failed";
  return {
    ...gate,
    ok,
    status,
    referencesContract: reference.ok,
    reasons,
  };
}
