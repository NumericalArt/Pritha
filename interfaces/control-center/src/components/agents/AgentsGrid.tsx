import type { AgentCardModel } from "@/data/mockAgents";
import { AgentCard } from "./AgentCard";

export function AgentsGrid({ agents, onAgentAction }: { agents: AgentCardModel[]; onAgentAction?: (agent: AgentCardModel) => void }) {
  return (
    <div className="agent-grid">
      {agents.map((agent) => (
        <AgentCard agent={agent} key={agent.id} onAction={onAgentAction} />
      ))}
      <button className="add-agent-card" type="button" disabled title="Create new agents in Codex or Voice">
        <span className="add-symbol">+</span>
        <span>Add New Agent</span>
        <small>Create new agents in Codex or Voice</small>
      </button>
    </div>
  );
}
