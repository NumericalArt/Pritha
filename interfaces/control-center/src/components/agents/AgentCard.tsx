import { CheckCircle2, ClipboardCheck, Copy, ExternalLink, HelpCircle, Play, RefreshCcw, RotateCcw, Square } from "lucide-react";
import type { AgentCardModel } from "@/data/mockAgents";
import { getCardAction, getCardActionLabel, getCardActionTone } from "@/data/mockAgents";
import { AgentIcon } from "./AgentIcon";

function stateLabel(agent: AgentCardModel) {
  if (agent.state === "alive") return "Alive";
  if (agent.state === "missing") return "Missing";
  if (agent.state === "needs-check") return "Needs check";
  return "Unknown";
}

function activityLabel(agent: AgentCardModel) {
  if (agent.activity === "active") return "Active";
  if (agent.activity === "inactive") return "Inactive";
  return "Unknown";
}

function footer(agent: AgentCardModel) {
  if (agent.restorePlanStatus === "ready") {
    return (
      <div className="agent-footer update">
        <RefreshCcw size={15} />
        Restore plan available
      </div>
    );
  }
  if (agent.updateStatus === "available") {
    return (
      <div className="agent-footer update">
        <span aria-hidden="true">↑</span>
        Update available
      </div>
    );
  }
  if (agent.updateStatus === "up-to-date") {
    return (
      <div className="agent-footer ok">
        <CheckCircle2 size={15} />
        Up to date
      </div>
    );
  }
  if (agent.issueText) {
    return (
      <div className="agent-footer muted">
        {agent.issueText}
        <HelpCircle size={16} />
      </div>
    );
  }
  if (agent.lifecycleNote) {
    return (
      <div className={`agent-footer ${agent.lifecycleTone || "muted"}`}>
        {agent.lifecycleTone === "ok" ? <CheckCircle2 size={15} /> : <RotateCcw size={15} />}
        {agent.lifecycleNote}
      </div>
    );
  }
  return null;
}

export function AgentCard({
  agent,
  mobile = false,
  onAction,
}: {
  agent: AgentCardModel;
  mobile?: boolean;
  onAction?: (agent: AgentCardModel) => void;
}) {
  const cardAction = getCardAction(agent);
  const actionTone = getCardActionTone(agent);
  const actionLabel = getCardActionLabel(agent);
  const canShowUrl = agent.state === "alive" && Boolean(agent.url);
  const canOpenPlan = Boolean(onAction);

  return (
    <article className={`${mobile ? "mobile-agent-card" : "agent-card"}`} data-state={agent.state}>
      {mobile ? (
        <div className="mobile-agent-topline">
          <span className={`state-label ${agent.state}`}>
            <span className={`dot ${agent.state === "alive" ? "green" : agent.state === "missing" ? "red" : "orange"}`} />
            {stateLabel(agent)}
          </span>
          <button className="agent-menu-button" type="button" aria-label={`Open menu for ${agent.name}`}>
            ...
          </button>
        </div>
      ) : (
        <span className={`agent-corner-dot ${agent.state}`} />
      )}

      <div className={mobile ? "mobile-agent-body" : "agent-top"}>
        <AgentIcon type={agent.iconType} />
        <div className="agent-copy">
          <div className="agent-title-row">
            <h2>{agent.name}</h2>
            <span className="version-pill" title={agent.versionSource ? `Version source: ${agent.versionSource}` : "Assigned version unavailable"}>
              {agent.version}
            </span>
          </div>
          <p>{agent.description}</p>
          {mobile ? (
            <span className={`activity-label ${agent.activity}`}>
              <span className={`dot ${agent.activity === "active" ? "green" : ""}`} />
              {activityLabel(agent)}
            </span>
          ) : null}
        </div>
      </div>

      {!mobile ? (
        <div className="agent-state-row">
          <span className={`state-label ${agent.state}`}>
            <span className={`dot ${agent.state === "alive" ? "green" : agent.state === "missing" ? "red" : "orange"}`} />
            {stateLabel(agent)}
          </span>
          <span className={`activity-label ${agent.activity}`}>
            <span className={`dot ${agent.activity === "active" ? "green" : ""}`} />
            {activityLabel(agent)}
          </span>
        </div>
      ) : null}

      <button
        className={`${mobile ? "mobile-agent-action" : "agent-action"} ${actionTone}`}
        type="button"
        disabled={!canOpenPlan && agent.actionEnabled === false}
        title={canOpenPlan ? `Open ${actionLabel} for ${agent.name}` : agent.actionEnabled === false ? agent.actionDisabledReason : undefined}
        onClick={canOpenPlan ? () => onAction?.(agent) : undefined}
      >
        {cardAction === "start_plan" || cardAction === "run_now" || cardAction === "resume_schedule" ? <Play size={18} fill="currentColor" /> : null}
        {cardAction === "stop_plan" || cardAction === "pause_schedule" ? <Square size={15} fill="currentColor" /> : null}
        {cardAction === "restore_plan" ? <RefreshCcw size={17} /> : null}
        {cardAction === "run_check" ? <ClipboardCheck size={17} /> : null}
        {cardAction === "open_codex" ? <ExternalLink size={17} /> : null}
        {actionLabel}
      </button>

      {canShowUrl ? (
        <div className={`${mobile ? "mobile-agent-url-row" : "agent-url-row"}`}>
          <span>{agent.url?.replace("http://", mobile ? "" : "http://")}</span>
          <a className="icon-button" href={agent.url} target="_blank" rel="noreferrer" aria-label={`Open URL for ${agent.name}`}>
            <ExternalLink size={17} />
          </a>
          <button className="icon-button" type="button" aria-label={`Copy URL for ${agent.name}`}>
            <Copy size={17} />
          </button>
        </div>
      ) : null}

      {footer(agent)}
    </article>
  );
}
