import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "../lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const DEFAULT_CATALOG_ROOT = path.join(ROOT, "11_agents", "skills");

export const SKILL_NEEDS = new Set(["auto", "none", "selected"]);
export const SKILL_SOURCES = new Set(["local-only", "trusted-only", "external-with-approval"]);
export const SKILL_INSTALL_MODES = new Set(["recommend", "vendor", "link", "runtime-install"]);
export const SKILL_MUTATION_POLICIES = new Set(["read-only", "patch-with-approval", "agent-managed"]);

const REQUIRED_FIELDS = [
  "name",
  "description",
  "version",
  "source",
  "review_status",
  "trust_level",
  "requires_toolsets",
  "risk_level",
];

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bchmod\s+777\b/i,
  /\bcurl\b[\s\S]{0,80}\|\s*(?:sh|bash|zsh)\b/i,
  /\bwget\b[\s\S]{0,80}\|\s*(?:sh|bash|zsh)\b/i,
  /\blaunchctl\b/i,
  /\bcron(?:tab)?\b/i,
  /\bdelete\s+all\b/i,
  /\bexfiltrat/i,
];

function list(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

export function sha256(text) {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export function skillPolicyFor(data = {}) {
  const policy = {
    skillNeeds: lower(data.skillNeeds) || "auto",
    allowedSkillSources: lower(data.allowedSkillSources) || "local-only",
    skillInstallMode: lower(data.skillInstallMode) || "recommend",
    skillMutationPolicy: lower(data.skillMutationPolicy) || "read-only",
  };
  if (!SKILL_NEEDS.has(policy.skillNeeds)) policy.skillNeeds = "auto";
  if (!SKILL_SOURCES.has(policy.allowedSkillSources)) policy.allowedSkillSources = "local-only";
  if (!SKILL_INSTALL_MODES.has(policy.skillInstallMode)) policy.skillInstallMode = "recommend";
  if (!SKILL_MUTATION_POLICIES.has(policy.skillMutationPolicy)) policy.skillMutationPolicy = "read-only";
  return policy;
}

export function parseSkillFile(filePath, options = {}) {
  const root = options.root ? path.resolve(options.root) : ROOT;
  const fullPath = path.resolve(filePath);
  const text = readFileSync(fullPath, "utf8");
  const fm = parseFrontmatterData(text) || {};
  const relPath = path.relative(root, fullPath).split(path.sep).join("/");
  return {
    path: fullPath,
    relPath,
    directory: path.dirname(fullPath),
    text,
    hash: sha256(text),
    name: String(fm.name || path.basename(path.dirname(fullPath))).trim(),
    description: String(fm.description || "").trim(),
    version: String(fm.version || "").trim(),
    source: String(fm.source || "").trim(),
    reviewStatus: String(fm.review_status || "").trim(),
    trustLevel: String(fm.trust_level || "").trim(),
    requiresToolsets: list(fm.requires_toolsets),
    riskLevel: String(fm.risk_level || "").trim(),
    sourcePaths: list(fm.source_paths),
    tags: list(fm.tags),
    frontmatter: fm,
  };
}

export function validateSkill(skill) {
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    const key = field.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    const value = skill.frontmatter?.[field] ?? skill[key];
    if (Array.isArray(value) ? value.length === 0 : !String(value || "").trim()) {
      issues.push(`missing required field: ${field}`);
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skill.name)) {
    issues.push("name must use lowercase kebab-case");
  }
  if (!["reviewed", "accepted"].includes(lower(skill.reviewStatus))) {
    issues.push(`review_status must be reviewed or accepted for local installation, got: ${skill.reviewStatus || "missing"}`);
  }
  if (!["local", "local-reviewed", "trusted"].includes(lower(skill.trustLevel))) {
    issues.push(`trust_level must be local, local-reviewed or trusted for MVP, got: ${skill.trustLevel || "missing"}`);
  }
  if (!["low", "medium", "high"].includes(lower(skill.riskLevel))) {
    issues.push(`risk_level must be low, medium or high, got: ${skill.riskLevel || "missing"}`);
  }
  return issues;
}

export function auditSkill(skill, data = {}) {
  const issues = validateSkill(skill);
  const blockers = [];
  const text = `${skill.text}\n${JSON.stringify(skill.frontmatter)}`;
  const policy = skillPolicyFor(data);

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) blockers.push(`dangerous operation pattern: ${pattern.source}`);
  }
  if (policy.allowedSkillSources === "local-only" && !/^pritha-memory|^local|^techscope/i.test(skill.source)) {
    blockers.push(`source is not allowed by local-only policy: ${skill.source || "missing"}`);
  }
  const allowedNetwork = lower(data.allowedNetworkAccess);
  const networkForbidden = /none|deny|deny-by-default|not-applicable/.test(allowedNetwork);
  if (networkForbidden && skill.requiresToolsets.some((item) => /network|web|browser|api|mcp|http/i.test(item))) {
    blockers.push("skill requires network-like toolsets but contract network policy is restrictive");
  }
  const secrets = lower(data.secretsRequired);
  if (!secrets || /none|unknown|tbd/.test(secrets)) {
    const declaresSecretNeed = skill.requiresToolsets.some((item) => /secret|token|credential|api key|oauth/i.test(item))
      || /requires?[\s\S]{0,40}(secret|token|credential|api key|oauth)/i.test(text);
    if (declaresSecretNeed) blockers.push("skill mentions required secrets but contract does not define required secrets");
  }
  if (/10_wiki\//.test(skill.sourcePaths.join(" "))) {
    blockers.push("generated wiki pages cannot be direct skill provenance");
  }
  return { issues, blockers, ok: issues.length === 0 && blockers.length === 0 };
}

function walkSkillFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const skillPath = path.join(fullPath, "SKILL.md");
      if (existsSync(skillPath)) out.push(skillPath);
    }
  }
  return out.sort();
}

export function discoverLocalSkills(options = {}) {
  const catalogRoot = options.catalogRoot ? path.resolve(options.catalogRoot) : DEFAULT_CATALOG_ROOT;
  return walkSkillFiles(catalogRoot).map((filePath) => parseSkillFile(filePath));
}

function fitScore(text, terms) {
  const haystack = lower(text);
  return Math.min(5, terms.filter((term) => haystack.includes(term)).length);
}

export function scoreSkillForContract(skill, data = {}) {
  const contractText = [
    data.agentName,
    data.primaryMission,
    data.primaryInterface,
    data.telegramMode,
    data.memoryModel,
    data.toolSystem,
    data.inputDataTypes,
    ...(data.coreFunctions || []),
    ...(data.criticalWorkflows || []),
  ].filter(Boolean).join(" ");
  const skillText = [skill.name, skill.description, skill.tags.join(" "), skill.requiresToolsets.join(" ")].join(" ");
  const skillTerms = [
    ...lower(skill.name).split("-"),
    ...skill.tags.map(lower),
  ].filter((term) => term.length > 2);
  const taskFit = fitScore(contractText, skillTerms);
  const interfaceFit = Math.min(
    fitScore(contractText, ["telegram", "cli", "codex", "web", "api"]),
    fitScore(skillText, ["telegram", "cli", "codex", "web", "api"]),
  );
  const memoryFit = Math.min(
    fitScore(contractText, ["markdown", "memory", "source", "evidence", "brief", "intake"]),
    fitScore(skillText, ["markdown", "memory", "source", "evidence", "brief", "intake"]),
  );
  const toolFit = skill.requiresToolsets.some((tool) => /filesystem|markdown|cli/i.test(tool)) ? 4 : 2;
  const securityFit = lower(skill.riskLevel) === "low" ? 5 : lower(skill.riskLevel) === "medium" ? 3 : 1;
  const evidenceQuality = ["reviewed", "accepted"].includes(lower(skill.reviewStatus)) ? 5 : 1;
  const maintenanceRisk = lower(skill.source).includes("pritha") || lower(skill.source).includes("local") ? 1 : 4;
  const total = taskFit + interfaceFit + memoryFit + toolFit + securityFit + evidenceQuality - maintenanceRisk;
  return { taskFit, interfaceFit, memoryFit, toolFit, securityFit, evidenceQuality, maintenanceRisk, total };
}

export function selectSkillsForContract(data = {}, options = {}) {
  const policy = skillPolicyFor(data);
  const skills = discoverLocalSkills(options);
  if (policy.skillNeeds === "none") {
    return { policy, installed: [], candidates: [], blocked: [], all: skills };
  }
  const rows = skills.map((skill) => {
    const audit = auditSkill(skill, data);
    const score = scoreSkillForContract(skill, data);
    let recommendation = "candidate";
    if (!audit.ok) recommendation = "blocked";
    else if (score.total >= 17) recommendation = "recommended";
    else if (score.total >= 11) recommendation = "optional";
    return { skill, audit, score, recommendation };
  });
  const installed = policy.skillInstallMode === "vendor"
    ? rows.filter((row) => row.recommendation === "recommended")
    : [];
  const candidates = rows.filter((row) => !installed.includes(row) && row.recommendation !== "blocked");
  const blocked = rows.filter((row) => row.recommendation === "blocked");
  return { policy, installed, candidates, blocked, all: skills };
}

export function skillRowForManifest(row, decision = "not-installed") {
  const { skill, score, recommendation, audit } = row;
  return {
    name: skill.name,
    source: skill.source,
    source_paths: skill.sourcePaths,
    version: skill.version,
    trust_level: skill.trustLevel,
    review_status: skill.reviewStatus,
    risk_level: skill.riskLevel,
    requires_toolsets: skill.requiresToolsets,
    hash: skill.hash,
    fit_score: score?.total ?? 0,
    recommendation,
    decision,
    issues: audit?.issues || [],
    blockers: audit?.blockers || [],
  };
}

export function printSkillsStatus(options = {}) {
  const skills = discoverLocalSkills(options);
  const rows = skills.map((skill) => {
    const audit = auditSkill(skill);
    return {
      name: skill.name,
      version: skill.version,
      source: skill.source,
      trust: skill.trustLevel,
      risk: skill.riskLevel,
      status: audit.ok ? "ok" : "needs-review",
      path: skill.relPath,
    };
  });
  if (options.json) {
    console.log(JSON.stringify({ count: rows.length, skills: rows }, null, 2));
    return;
  }
  console.log(`Local skill catalog: ${rows.length} skill(s)`);
  for (const row of rows) {
    console.log(`- ${row.name} ${row.version} [${row.status}] ${row.path}`);
  }
}

export function printSkillSelection(contractData, options = {}) {
  const selection = selectSkillsForContract(contractData, options);
  const payload = {
    policy: selection.policy,
    installed: selection.installed.map((row) => skillRowForManifest(row, "installable-if-vendor")),
    candidates: selection.candidates.map((row) => skillRowForManifest(row)),
    blocked: selection.blocked.map((row) => skillRowForManifest(row, "blocked")),
  };
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Skill policy: needs=${selection.policy.skillNeeds}; sources=${selection.policy.allowedSkillSources}; install=${selection.policy.skillInstallMode}; mutation=${selection.policy.skillMutationPolicy}`);
  for (const [label, rows] of [["Recommended/installable", payload.installed], ["Candidates", payload.candidates], ["Blocked", payload.blocked]]) {
    console.log(`\n${label}: ${rows.length}`);
    for (const row of rows) {
      console.log(`- ${row.name}: ${row.recommendation}; score=${row.fit_score}; risk=${row.risk_level}; decision=${row.decision}`);
    }
  }
}

export function auditProjectSkills(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, "skills", "manifest.json");
  const issues = [];
  if (!existsSync(manifestPath)) {
    issues.push("missing skills/manifest.json");
    return { ok: false, issues };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const entry of manifest.installed || []) {
    const skillPath = path.join(root, "skills", entry.name, "SKILL.md");
    if (!existsSync(skillPath)) {
      issues.push(`missing installed skill file: skills/${entry.name}/SKILL.md`);
      continue;
    }
    const actual = sha256(readFileSync(skillPath, "utf8"));
    if (entry.hash && actual !== entry.hash) issues.push(`hash drift for ${entry.name}: expected ${entry.hash}, got ${actual}`);
  }
  const candidatesPath = path.join(root, "skills", "candidates.json");
  if (!existsSync(candidatesPath)) issues.push("missing skills/candidates.json");
  const result = { ok: issues.length === 0, issues, installed: manifest.installed?.length || 0, candidates: manifest.candidates?.length || 0 };
  if (options.silent) return result;
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`Skill audit passed: installed=${result.installed}; candidates=${result.candidates}`);
  else {
    console.error("Skill audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
  }
  return result;
}
