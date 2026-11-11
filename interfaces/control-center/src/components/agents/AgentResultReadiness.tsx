import type { AgentCardModel } from "@/data/mockAgents";
import { getCardActionLabel } from "@/data/mockAgents";

const resultLabels = {
  unverified: "Unverified", verified: "Verified", awaiting_operator: "Operator check needed",
  failed: "Checks failed", stale: "Verification outdated", unknown: "Unknown",
};
const kinds: Record<string, string> = {
  service: "Service", "one-shot-cli": "CLI", "job-runner": "Jobs", "tool-server": "Tool server",
  library: "Library", "interactive-agent": "Interactive agent", "legacy-unclassified": "Unclassified",
};
const acceptanceLabels = {
  not_accepted: "Not yet accepted", accepted: "Accepted by the user",
  recorded_for_other_revision: "Earlier version accepted", unknown: "No confirmed record",
};

export function AgentResultReadiness({ agent }: { agent: AgentCardModel }) {
  const result = agent.resultReadiness;
  if (!result) return null;
  const checked = result.verification;
  const runtime = agent.runtimeReadiness?.status === "not_applicable" ? "Not required"
    : agent.healthStatus === "ok" ? "Health responds" : agent.healthStatus === "failed" ? "Health does not respond" : "Not confirmed";
  return <details className="agent-result-readiness" data-testid="agent-result-readiness">
    <summary>Result: {resultLabels[checked.status]}</summary>
    <dl>
      <dt>Type</dt><dd>{kinds[agent.agentKind?.kind || "legacy-unclassified"]}</dd>
      <dt>Trials</dt><dd>{checked.counts ? `${checked.counts.passed}/${checked.counts.automated} automated · ${checked.counts.operator} manual` : "No current measurements"}</dd>
      <dt>Revision</dt><dd>{checked.head?.slice(0, 12) || "Not verified"}</dd>
      <dt>Acceptance</dt><dd>{acceptanceLabels[result.acceptance.status]}</dd>
      <dt>Process</dt><dd>{runtime}</dd>
      <dt>Action</dt><dd>{getCardActionLabel(agent)}{agent.control?.executionMode === "plan_only" ? " · plan" : ""}</dd>
      {result.candidate.head && (result.candidate.head !== checked.head || result.candidate.status !== checked.status) ? <><dt>Build branch</dt><dd>{resultLabels[result.candidate.status]} · {result.candidate.head.slice(0, 12)}</dd></> : null}
    </dl>
    {checked.reason === "outcome-approval-not-current" ? <p>Current Outcome Spec approval is required.</p> : null}
    {result.observedAt ? <p>Status as of <time dateTime={result.observedAt}>{new Date(result.observedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</time></p> : null}
  </details>;
}
