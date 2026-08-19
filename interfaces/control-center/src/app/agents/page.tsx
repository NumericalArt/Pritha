import { AgentsOperatorExperience } from "@/components/agents/AgentsOperatorExperience";
import type { AgentCardModel, AgentIconType } from "@/data/mockAgents";
import { controlCenterStatusForClient, getControlCenterStatus } from "@/lib/control-center/server";
import type { ControlCenterAgent } from "@/lib/control-center/types";

export const dynamic = "force-dynamic";

function iconForAgent(agent: ControlCenterAgent): AgentIconType {
  if (agent.name.toLowerCase().includes("fespa")) return "sail";
  if (agent.ui.state === "needs-check") return "warning";
  if (agent.ui.state === "missing") return "box";
  return "bot";
}

function deliveryLifecycleCard(agent: ControlCenterAgent): Pick<AgentCardModel, "lifecycleNote" | "lifecycleTone"> | null {
  const status = agent.lifecycle.delivery.status;
  if (status === "accepted") return { lifecycleNote: "Delivery accepted", lifecycleTone: "ok" };
  if (status === "awaiting_acceptance") return { lifecycleNote: "Awaiting user acceptance", lifecycleTone: "update" };
  if (status === "verified") return { lifecycleNote: "Outcome machine-verified", lifecycleTone: "ok" };
  if (["created", "preparing", "building", "verifying", "correcting", "running"].includes(status)) {
    return { lifecycleNote: `Outcome delivery · ${status.replace(/_/g, " ")}`, lifecycleTone: "update" };
  }
  if (status === "paused") return { lifecycleNote: "Outcome delivery paused", lifecycleTone: "update" };
  if (status === "blocked") return { lifecycleNote: "Outcome delivery blocked", lifecycleTone: "update" };
  if (["failed", "abandoned", "cancelled"].includes(status)) {
    return { lifecycleNote: `Delivery ${status.replace(/_/g, " ")}`, lifecycleTone: "update" };
  }
  if (agent.lifecycle.outcome.status === "approved" && agent.lifecycle.outcome.approved) {
    return { lifecycleNote: "Outcome approved · delivery not started", lifecycleTone: "update" };
  }
  if (agent.lifecycle.outcome.status === "draft") return { lifecycleNote: "Outcome Spec needs approval", lifecycleTone: "update" };
  if (agent.lifecycle.outcome.status === "missing") return { lifecycleNote: "Legacy agent · Outcome Spec missing", lifecycleTone: "muted" };
  return null;
}

function toCardAgent(agent: ControlCenterAgent): AgentCardModel {
  const deliveryCard = deliveryLifecycleCard(agent);
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
    tailscaleUrl: agent.url.tailscale,
    statusUrl: `/agents/${agent.id}`,
    updateStatus: agent.ui.updateStatus,
    issueText: agent.ui.issueText || (agent.versionStatus === "unavailable" ? "Assigned version unavailable" : undefined),
    lifecycleNote:
      deliveryCard?.lifecycleNote ||
      (agent.lifecycle.rollback.status === "ready"
        ? "Rollback snapshots available"
        : agent.lifecycle.snapshotPlan.status === "manual_only"
          ? "Snapshot draft available"
          : agent.lifecycle.snapshots.status === "unavailable"
          ? "No rollback snapshots"
          : agent.lifecycle.snapshots.count === 0
            ? "No rollback snapshots"
            : undefined),
    lifecycleTone: deliveryCard?.lifecycleTone || (agent.lifecycle.rollback.status === "ready" ? "ok" : "muted"),
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
    credentials: {
      status:
        agent.credentials.status === "ready" || agent.credentials.status === "pending_auth"
          ? agent.credentials.status
          : "unavailable",
      required: agent.credentials.required,
      missingRequired: agent.credentials.missingRequired,
      total: agent.credentials.definitions.length,
    },
    iconType: iconForAgent(agent),
    actionEnabled: agent.ui.actionEnabled,
    actionDisabledReason: agent.ui.actionDisabledReason,
    control: agent.control,
  };
}

export default async function AgentsPage() {
  const status = await getControlCenterStatus();
  const agents = status.childAgents.map(toCardAgent);

  return <AgentsOperatorExperience status={controlCenterStatusForClient(status)} agents={agents} />;
}
