import { AgentsOperatorExperience } from "@/components/agents/AgentsOperatorExperience";
import type { AgentCardModel, AgentIconType } from "@/data/mockAgents";
import { getControlCenterStatus } from "@/lib/control-center/server";
import type { ControlCenterAgent } from "@/lib/control-center/types";

export const dynamic = "force-dynamic";

function iconForAgent(agent: ControlCenterAgent): AgentIconType {
  if (agent.name.toLowerCase().includes("fespa")) return "sail";
  if (agent.ui.state === "needs-check") return "warning";
  if (agent.ui.state === "missing") return "box";
  return "bot";
}

function toCardAgent(agent: ControlCenterAgent): AgentCardModel {
  return {
    id: agent.id,
    name: agent.name,
    version: agent.version,
    versionStatus: agent.versionStatus,
    versionSource: agent.versionSource,
    description: agent.mission,
    state: agent.ui.state,
    activity: agent.ui.activity,
    url: agent.url.local,
    updateStatus: agent.ui.updateStatus,
    issueText: agent.ui.issueText || (agent.versionStatus === "unavailable" ? "Assigned version unavailable" : undefined),
    lifecycleNote:
      agent.lifecycle.rollback.status === "ready"
        ? "Rollback snapshots available"
        : agent.lifecycle.snapshotPlan.status === "manual_only"
          ? "Snapshot draft available"
          : agent.lifecycle.snapshots.status === "unavailable"
          ? "No rollback snapshots"
          : agent.lifecycle.snapshots.count === 0
            ? "No rollback snapshots"
            : undefined,
    lifecycleTone: agent.lifecycle.rollback.status === "ready" ? "ok" : "muted",
    restorePlanStatus:
      agent.lifecycle.restorePlan.status === "ready"
        ? "ready"
        : agent.lifecycle.restorePlan.status === "planned"
          ? "planned"
          : "unavailable",
    rollbackStatus:
      agent.lifecycle.rollback.status === "ready"
        ? "ready"
        : agent.lifecycle.rollback.status === "planned"
          ? "planned"
          : "unavailable",
    iconType: iconForAgent(agent),
    actionEnabled: agent.ui.actionEnabled,
    actionDisabledReason: agent.ui.actionDisabledReason,
    control: agent.control,
  };
}

export default async function AgentsPage() {
  const status = await getControlCenterStatus();
  const agents = status.childAgents.map(toCardAgent);

  return <AgentsOperatorExperience status={status} agents={agents} />;
}
