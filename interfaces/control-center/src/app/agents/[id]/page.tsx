import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { controlCenterStatusForClient, getControlCenterAgent } from "@/lib/control-center/server";
import { deliveryBudgetText } from "@/lib/control-center/delivery-state";

export const dynamic = "force-dynamic";

function statusText(value: string | undefined) {
  if (!value) return "unknown";
  return value.replace(/_/g, " ");
}

export default async function AgentStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, agent } = await getControlCenterAgent(id);
  if (!agent) notFound();

  const clientStatus = controlCenterStatusForClient(status);
  const directUrl = agent.url.tailscale || agent.url.local;
  const canOpenDirect = agent.ui.activity === "active" && Boolean(directUrl);
  const noRuntimeRequired = agent.readiness.runtime.status === "not_applicable";
  const result = agent.resultReadiness;
  const deliveryDetail = agent.lifecycle.delivery.runId
    ? `run ${agent.lifecycle.delivery.runId}${agent.lifecycle.delivery.phase ? ` · ${agent.lifecycle.delivery.phase}` : ""}`
    : agent.lifecycle.delivery.path || agent.lifecycle.delivery.reason || "not started";
  const readinessRows = [
    ...(agent.identity ? [["Identity", agent.identity.status, agent.identity.status === "conflict" ? "Contract and project identity need review" : agent.identity.status === "legacy" ? "Legacy attribution; approval is checked separately" : "Stable ID within this Pritha instance"]] : []),
    ["Folder", agent.folder.status, agent.folder.relativePath || agent.folder.name || "not available"],
    ["Outcome Spec", agent.lifecycle.outcome.status, agent.lifecycle.outcome.path || agent.lifecycle.outcome.reason || "not available"],
    ["Build history", agent.lifecycle.delivery.status, deliveryDetail],
    ...(result ? [
      ["Result verification", result.verification.status, `${result.verification.head?.slice(0, 12) || "Revision unavailable"} · ${result.verification.reason}`],
      ["User acceptance", result.acceptance.status, result.acceptance.at || "No confirmed acceptance receipt"],
      ["Trials", result.verification.counts ? `${result.verification.counts.passed}/${result.verification.counts.automated}` : "unknown", result.verification.counts ? `${result.verification.counts.operator} operator checks · canonical project` : "No current measurements"],
      ["Build candidate", result.candidate.status, `${result.candidate.head?.slice(0, 12) || "Revision unavailable"} · ${result.candidate.reason}`],
    ] : []),
    ...(agent.lifecycle.delivery.budget ? [["Build budget", agent.lifecycle.delivery.budget.usageStatus, deliveryBudgetText(agent.lifecycle.delivery.budget)]] : []),
    ["Health", agent.health.status, agent.health.checkedUrl || agent.health.detail || "not checked"],
    ["Readiness", agent.readiness.status, agent.readiness.summary],
    ["Runtime service", agent.readiness.runtime.status, agent.readiness.runtime.detail],
    ["Access", agent.readiness.access.tailscale, agent.readiness.access.detail],
    ["Runtime", agent.control.executionMode, agent.control.reason],
    ["Operations", agent.operations.status, agent.operations.localUrl || agent.operations.issue || (noRuntimeRequired ? "The contract requires no managed service" : "manifest not available")],
  ];

  return (
    <div className="agent-status-page">
      <PageHeader
        title={agent.name}
        subtitle="Child agent status"
        variant="agents"
        status={clientStatus}
        showCountPill={false}
      />
      <section className="agent-status-hero">
        <div>
          <span className={`status-pill ${agent.ui.activity === "active" ? "alive" : "unknown"}`}>
            {noRuntimeRequired ? "On demand" : statusText(agent.ui.activity)}
          </span>
          <h1>{agent.name}</h1>
          <p>{agent.mission}</p>
        </div>
        {canOpenDirect ? (
          <a className="agent-status-primary-link" href={directUrl} target="_blank" rel="noreferrer">
            Open Runtime
          </a>
        ) : null}
      </section>
      <section className="agent-status-grid" aria-label="Agent readiness">
        {readinessRows.map(([label, value, detail]) => (
          <div className="agent-status-tile" key={label}>
            <span>{label}</span>
            <strong>{statusText(value)}</strong>
            <p>{detail}</p>
          </div>
        ))}
      </section>
      <section className="agent-status-note">
        <h2>{noRuntimeRequired ? "No persistent service required" : canOpenDirect ? "Runtime available" : "Runtime not open"}</h2>
        <p>
          {noRuntimeRequired
            ? "This result is used on demand. Its approved Trials and user acceptance are shown separately above; a running process or URL is not required by this contract."
            : canOpenDirect
            ? "The agent has an active local runtime. Use the runtime link for the agent surface, or return to Child Agents for Start/Stop controls."
            : "The agent has a Control Center record, but its runtime is not currently answering as an active service. Use Child Agents to run Start, Check, or remediation before opening the runtime URL."}
        </p>
      </section>
    </div>
  );
}
