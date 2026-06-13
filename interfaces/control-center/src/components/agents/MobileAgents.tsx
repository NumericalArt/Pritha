import type { AgentCardModel } from "@/data/mockAgents";
import type { ControlCenterFleetManualAuditResult } from "@/lib/control-center/types";
import { AgentCard } from "./AgentCard";

export function MobileAgents({
  agents,
  onAgentAction,
  onAgentCredentials,
  onCreatePlan,
  onManualAudit,
  manualAuditRunning = false,
  manualAuditResult,
}: {
  agents: AgentCardModel[];
  onAgentAction?: (agent: AgentCardModel) => void;
  onAgentCredentials?: (agent: AgentCardModel) => void;
  onCreatePlan?: () => void;
  onManualAudit?: () => void;
  manualAuditRunning?: boolean;
  manualAuditResult?: ControlCenterFleetManualAuditResult;
}) {
  const alive = agents.filter((agent) => agent.state === "alive").length;
  const missing = agents.filter((agent) => agent.state === "missing").length;
  const updates = agents.filter((agent) => agent.updateStatus === "available").length;

  return (
    <div className="mobile-agents-screen">
      <div className="mobile-page-title-row">
        <h1 className="mobile-page-title">Child Agents</h1>
        <span className="count-pill">{agents.length}</span>
      </div>
      <div className="mobile-summary-grid">
        <div className="mobile-summary-chip">
          <span>Total</span>
          <strong>{agents.length}</strong>
        </div>
        <div className="mobile-summary-chip wide">
          <span><span className="dot green" />Alive</span>
          <strong>{alive}</strong>
          <span><span className="dot red" />Missing</span>
          <strong>{missing}</strong>
        </div>
        <div className="mobile-summary-chip">
          <span>↑ Updates</span>
          <strong>{updates}</strong>
        </div>
      </div>
      <div className="mobile-operator-actions">
        <button type="button" onClick={onManualAudit} disabled={!onManualAudit || manualAuditRunning}>
          {manualAuditRunning ? "Running Audit" : "Run Manual Audit"}
        </button>
        {manualAuditResult ? (
          <span>
            {manualAuditResult.status}: {manualAuditResult.summary.passed}/{manualAuditResult.summary.warnings}/{manualAuditResult.summary.failed}
          </span>
        ) : null}
      </div>
      <div className="mobile-agent-list">
        {agents.map((agent) => (
          <AgentCard agent={agent} mobile key={agent.id} onAction={onAgentAction} onCredentials={onAgentCredentials} />
        ))}
        <button className="mobile-add-agent-card" type="button" onClick={onCreatePlan} title="Open a safe Codex planning handoff">
          + Create Plan
        </button>
      </div>
    </div>
  );
}
