import { readAgentTestResult } from "./command-probe.mjs";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { withFileLock } from "../lib/atomic-file.mjs";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaRoot } from "../lib/paths.mjs";
import { redactSensitiveText } from "../lib/redaction.mjs";
import { readAgentCatalog, findCatalogAgent, readCatalogArtifact, readIdentityEvidence, readAgentOperationsManifest, agentOperationsApplicability, authoredAgentId } from "./identity.mjs";
import { contractData } from "./contract.mjs";
import { approvedTrialPlan, latestOutcomeSpecForContract, parseOutcomeSpecText } from "./outcome-spec.mjs";
import { readAgentResultReadiness } from "./result-readiness.mjs";
import { workspaceRevision } from "./workspace-revision.mjs";
import { writeLifecycleReport } from "./lifecycle-report.mjs";

const scalar = value => JSON.stringify(redactSensitiveText(String(value || "unknown")).replace(/[\r\n]+/g, " "));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function prepareDirectory(root, directory) {
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("handoff_output_outside_instance");
  let current = root;
  for (const part of ["", ...relative.split(path.sep)].filter((item, i) => item || i === 0)) {
    current = path.join(current, part);
    if (existsSync(current)) { const info = lstatSync(current); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("handoff_output_unsafe"); }
    else mkdirSync(current);
  }
}

export function firstScenarioForHandoff(kind, { data, parsed, plan, manifest }) {
  const general = plan?.demo?.length ? plan.demo.map((step, index) => `${index + 1}. ${step}`).join("\n") : "First, prepare and approve a concrete demo script in the Outcome Spec.";
  const headless = parsed?.headless;
  const headlessContract = headless ? `\n- Trigger: ${headless.trigger}\n- Input: ${headless.inputContract}\n- Output: ${headless.outputArtifacts}\n- Errors and exit codes: ${headless.failureVisibility}\n- Observability: ${headless.observability}\n` : "";
  const intro = {
    "one-shot-cli": "The CLI runs on demand from the agent directory. Run the exact command from the approved scenario; no persistent process or URL is required.",
    "service": `The service uses the selected manager: ${manifest?.control_center_runtime?.manager || data.serviceMode || "not prepared"}. Start/stop actions require its reviewed operations contract and separate authorization.`,
    "job-runner": `The first job run is started manually using the approved trigger. Selected proactivity: ${data.proactiveMode || "none"}. Preparing the handoff does not enable a schedule.`,
    "tool-server": "Open the selected consumer, connect the approved transport, and make the specified tool call. Handoff preparation does not change MCP permissions.",
    "library": "Use the library from the consumer specified in the Outcome. Run the import/call example and check the returned result.",
    "interactive-agent": `Open the selected interface ${data.primaryInterface || "from the Contract"} and run the approved conversation example.`,
  }[kind] || "The result type must be clarified in the authored Contract; discovered files do not replace that decision.";
  const examples = parsed?.userFacing?.sessions?.map(item => `### ${item.name}\n\n\`\`\`text\n${item.transcript}\n\`\`\``).join("\n\n") || "";
  const healthArgv = manifest?.healthcheck_argv;
  return `${intro}\n${headlessContract}\n${general}\n\n${examples}${Array.isArray(healthArgv) ? `\n\nHealth argv (startup check, separate from outcome verification): ${JSON.stringify(healthArgv)}` : ""}`;
}

export function prepareAuthoredHandoff(target, options = {}) {
  const root = path.resolve(options.root || resolvePrithaRoot()), input = { ...options, root, fresh: true };
  const memoryRoot = resolvePrithaAgentMemoryRoot(input);
  const agent = findCatalogAgent(readAgentCatalog(input), target);
  if (!agent?.agentId || !agent.contractSource) return null;
  if (agent.identityStatus === "conflict" || !agent.projectPath) throw new Error("handoff_identity_conflict");
  const contract = readCatalogArtifact(agent, agent.contractSource, input);
  if (!/^status: accepted$/m.test(contract)) throw new Error("handoff_accepted_contract_required");
  const data = contractData(agent.contractSource, { root }), revision = workspaceRevision(agent.projectPath, { requireComplete: true });
  const selected = latestOutcomeSpecForContract(agent.contractSource, input);
  let plan = null, parsed = null;
  if (selected?.path) {
    try { plan = approvedTrialPlan(selected.path, input); parsed = parseOutcomeSpecText(readIdentityEvidence(path.resolve(root, selected.path), memoryRoot)); }
    catch { /* A guide may explain pending approval, never manufacture it. */ }
  }
  const operation = readAgentOperationsManifest(agent), applicability = agentOperationsApplicability(agent, operation.manifest, input);
  const readiness = readAgentResultReadiness(agent.agentId, input);
  const childTests = readAgentTestResult(agent.agentId, input);
  const date = new Date().toISOString().slice(0, 10), profiles = path.join(memoryRoot, "profiles"), reports = path.join(memoryRoot, "reports");
  const profilePath = agent.artifacts.find(item => item.type === "child-agent-profile")?.path || path.join(profiles, `${agent.agentId}.md`);
  prepareDirectory(path.dirname(memoryRoot), profiles); prepareDirectory(path.dirname(memoryRoot), reports);
  const context = { ...input, projectRoot: agent.projectPath, instanceKey: agent.instanceKey };
  return withFileLock(path.join(profiles, `${agent.agentId}.handoff`), () => {
    let profileText = readIdentityEvidence(profilePath, memoryRoot);
    let profileCreated = false;
    const profileIdentity = authoredAgentId(parseFrontmatterData(profileText) || {});
    if (existsSync(profilePath) && (!profileText || profileIdentity.issue || profileIdentity.id !== agent.agentId)) throw new Error("handoff_profile_identity_conflict");
    if (!profileText) {
      const written = writeLifecycleReport(profilePath, ({ artifactId }) => `---\nid: ${artifactId}\ntype: child-agent-profile\nstatus: active\ncreated: ${date}\nupdated: ${date}\nagent_id: ${agent.agentId}\ninstance_key: ${agent.instanceKey}\ncontract_path: ${scalar(path.relative(root, agent.contractSource))}\ncontract_fingerprint: ${data.fingerprint}\nproject_path: ${scalar(path.relative(root, agent.projectPath))}\nmission: ${scalar(data.primaryMission)}\ntopics: [child-agent, handoff]\ntools: [Pritha]\nsources:\n  - ${scalar(path.relative(root, agent.contractSource))}\nrelated:\n  workflows: [07_workflows/agents-mother.md]\nsupersedes: []\nsuperseded_by: []\nmemory_domain: child-agents\nsubject:\n  kind: child-agent\n  id: ${agent.agentId}\nprivacy: local-private\nretention: durable\nreview_status: derived-from-accepted-contract\nconfidence: high\n---\n\n# ${data.agentName}\n\n## Purpose\n\n${data.primaryMission}\n\nThis authored profile is derived from the accepted contract. It is not verification or acceptance evidence.\n`, context);
      profileText = readIdentityEvidence(written.path, memoryRoot); profileCreated = true;
    }
    const key = hash({ agentId: agent.agentId, instance: agent.instanceKey, contract: data.fingerprint, revision, plan,
      profile: hash(profileText), manifest: operation.manifest, manifestIssue: operation.issue, readiness, childTests });
    const previous = agent.artifacts.find(item => item.type === "agent-handoff-report" && item.fm?.handoff_digest === key);
    if (previous && readCatalogArtifact(agent, previous.path, input)) return { reportPath: previous.path, profilePath, profileCreated, unchanged: true, readiness, status: "guide-prepared" };
    const scenario = firstScenarioForHandoff(agent.agentKind.kind, { data, plan, parsed, manifest: operation.manifest });
    const written = writeLifecycleReport(path.join(reports, `${date}-${agent.agentId}-agent-handoff-${key.slice(0, 12)}.md`), ({ artifactId }) => `---\nid: ${artifactId}\ntype: agent-handoff-report\nstatus: guide-prepared\ncreated: ${date}\nupdated: ${date}\nagent_id: ${agent.agentId}\ninstance_key: ${agent.instanceKey}\ncontract_path: ${scalar(path.relative(root, agent.contractSource))}\ncontract_fingerprint: ${data.fingerprint}\nproject_path: ${scalar(path.relative(root, agent.projectPath))}\nhandoff_digest: ${key}\ntopics: [agent-engineering, handoff]\ntools: [Pritha]\nsources:\n  - ${scalar(path.relative(root, agent.contractSource))}\nrelated:\n  workflows: [07_workflows/agents-mother.md]\nsupersedes: []\nsuperseded_by: []\nmemory_domain: child-agents\nsubject:\n  kind: child-agent\n  id: ${agent.agentId}\nprivacy: local-private\nretention: durable\nreview_status: prepared\nconfidence: medium\n---\n\n# Handoff: ${data.agentName}\n\nType: ${agent.agentKind.kind}. This document prepares the first scenario; acceptance is a separate decision.\n\n## Result status\n\n- Canonical project verification: ${readiness.verification.status}\n- Candidate: ${readiness.candidate.status}\n- Acceptance: ${readiness.acceptance.status}\n- Git HEAD: ${revision.head || "unknown"}\n- Approved Outcome: ${plan?.spec_id || "not prepared"}\n- Operations manifest: ${operation.issue || (applicability.manifestRequired === false ? "not required by the selected Contract" : operation.present ? "present" : "the selected operations adapter must be prepared")}\n\n## First scenario\n\n${scenario}\n\n## Result checks\n\n- npm test: ${childTests.status}${childTests.status === "pass" ? "" : " — warning; handoff continues"}. This is not Outcome verification or acceptance.\n\n${plan?.trials.map(trial => `- ${trial.id}: ${trial.kind}; ${trial.argv ? JSON.stringify(trial.argv) : trial.passCriteria}`).join("\n") || "An approved Outcome with specific Trials is required."}\n\nChanges to executables or locked inputs require fresh verification. Handoff does not overwrite the authored profile or project. Missing operations metadata is prepared by the selected scaffold adapter and verified separately; handoff does not infer a service mode or invent a healthcheck.\n`, context);
    return { reportPath: written.path, profilePath, profileCreated, unchanged: false, readiness, status: "guide-prepared" };
  });
}
