import type { AgentCardModel } from "@/data/mockAgents";
import { AgentCard } from "./AgentCard";

export function AgentsGrid({
  agents,
  onAgentAction,
  onAgentCredentials,
  onCreatePlan,
}: {
  agents: AgentCardModel[];
  onAgentAction?: (agent: AgentCardModel) => void;
  onAgentCredentials?: (agent: AgentCardModel) => void;
  onCreatePlan?: () => void;
}) {
  return (
    <div className="agent-grid">
      {agents.map((agent) => (
        <AgentCard agent={agent} key={agent.id} onAction={onAgentAction} onCredentials={onAgentCredentials} />
      ))}
      <button className="add-agent-card" type="button" data-testid="create-agent-plan-button" onClick={onCreatePlan} title="Open a safe Codex planning handoff">
        <span className="add-symbol">+</span>
        <span>Open in Codex / Create Plan</span>
        <small>Contract first</small>
      </button>
    </div>
  );
}
