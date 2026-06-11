"use client";

import { Activity, AlertTriangle, CheckCircle2, ClipboardCheck, Play, RefreshCcw, ShieldCheck, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AgentCardModel } from "@/data/mockAgents";
import { getCardActionLabel, getPrimaryAction } from "@/data/mockAgents";
import type {
  ControlCenterCommandReadiness,
  ControlCenterFleetManualAuditResult,
  ControlCenterOperatorAction,
  ControlCenterOperatorActionPlan,
  ControlCenterOperatorActionResult,
  ControlCenterStatus,
} from "@/lib/control-center/types";
import { LineageLite } from "./LineageLite";
import { MobileAgents } from "./MobileAgents";
import { AgentsGrid } from "./AgentsGrid";
import { AgentsRightRail } from "./RightRail";
import { PageHeader } from "../shell/PageHeader";

type PanelState = {
  plan?: ControlCenterOperatorActionPlan;
  result?: ControlCenterOperatorActionResult;
  loading: boolean;
  running: boolean;
  error?: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await response.json()) as T;
  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json ? String((json as { error?: unknown }).error) : response.statusText;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return json;
}

function actionLabel(action: ControlCenterOperatorAction) {
  if (action === "start") return "Start";
  if (action === "stop") return "Stop";
  if (action === "restore") return "Restore";
  return "Check";
}

function ActionIcon({ action }: { action: ControlCenterOperatorAction }) {
  if (action === "start") return <Play size={18} fill="currentColor" />;
  if (action === "stop") return <Square size={15} fill="currentColor" />;
  if (action === "restore") return <RefreshCcw size={18} />;
  return <ClipboardCheck size={18} />;
}

function CheckIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 size={16} />;
  return <AlertTriangle size={16} />;
}

function resultText(result: ControlCenterOperatorActionResult) {
  return `${result.status}: ${result.summary.passed} pass / ${result.summary.warnings} warn / ${result.summary.failed} fail`;
}

function executionLabel(plan?: ControlCenterOperatorActionPlan) {
  if (!plan) return "Plan only";
  if (plan.control.executionMode === "executable") return "Executable";
  if (plan.control.executionMode === "manual_only") return "Manual only";
  if (plan.control.executionMode === "codex_plan") return "Codex plan";
  if (plan.control.executionMode === "unavailable") return "Unavailable";
  return "Plan only";
}

function commandReadinessLabel(readiness?: ControlCenterCommandReadiness) {
  if (readiness === "structured_executable") return "structured executable";
  if (readiness === "human_instruction") return "human instruction";
  if (readiness === "legacy_declared") return "legacy declared";
  return "missing";
}

export function AgentsOperatorExperience({ status, agents }: { status: ControlCenterStatus; agents: AgentCardModel[] }) {
  const router = useRouter();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ControlCenterOperatorAction>("check");
  const [panel, setPanel] = useState<PanelState>({ loading: false, running: false });
  const [manualAuditRunning, setManualAuditRunning] = useState(false);
  const [manualAuditResult, setManualAuditResult] = useState<ControlCenterFleetManualAuditResult | undefined>();
  const [manualAuditError, setManualAuditError] = useState<string | undefined>();
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId) || null, [agents, selectedAgentId]);

  function openAction(agent: AgentCardModel) {
    setSelectedAgentId(agent.id);
    setSelectedAction(getPrimaryAction(agent));
    setPanel({ loading: true, running: false });
  }

  function closeAction() {
    setSelectedAgentId(null);
    setPanel({ loading: false, running: false });
  }

  async function loadPlan(agentId: string, action: ControlCenterOperatorAction) {
    setPanel((current) => ({ ...current, loading: true, error: undefined, result: undefined }));
    try {
      const plan = await fetchJson<ControlCenterOperatorActionPlan>(`/api/agents/${agentId}/actions/${action}/plan`);
      setPanel({ plan, loading: false, running: false });
    } catch (error) {
      setPanel({ loading: false, running: false, error: error instanceof Error ? error.message : "Action plan unavailable" });
    }
  }

  async function runManualCheck() {
    if (!selectedAgent) return;
    setPanel((current) => ({ ...current, running: true, error: undefined }));
    try {
      const result = await fetchJson<ControlCenterOperatorActionResult>(`/api/agents/${selectedAgent.id}/actions/check`, {
        method: "POST",
      });
      setPanel((current) => ({ ...current, result, running: false }));
      router.refresh();
    } catch (error) {
      setPanel((current) => ({ ...current, running: false, error: error instanceof Error ? error.message : "Manual check failed" }));
    }
  }

  async function runFleetManualAudit() {
    setManualAuditRunning(true);
    setManualAuditError(undefined);
    try {
      const result = await fetchJson<ControlCenterFleetManualAuditResult>("/api/agents/actions/manual-audit", {
        method: "POST",
      });
      setManualAuditResult(result);
      router.refresh();
    } catch (error) {
      setManualAuditError(error instanceof Error ? error.message : "Manual audit failed");
    } finally {
      setManualAuditRunning(false);
    }
  }

  useEffect(() => {
    if (!selectedAgentId) return;
    void loadPlan(selectedAgentId, selectedAction);
  }, [selectedAgentId, selectedAction]);

  const selectedActionLabel = panel.plan?.control.label || (selectedAgent ? getCardActionLabel(selectedAgent) : actionLabel(selectedAction));

  return (
    <>
      <div className="agents-desktop-content">
        <PageHeader title="Child Agents" subtitle="Pritha remembers. You control." count={status.counts.childAgents} variant="agents" />
        <div className="agents-page">
          <div className="agents-layout">
            <section className="agents-main">
              <AgentsGrid agents={agents} onAgentAction={openAction} />
              <LineageLite counts={status.counts} />
            </section>
            <AgentsRightRail
              status={status}
              onManualAudit={() => void runFleetManualAudit()}
              manualAuditRunning={manualAuditRunning}
              manualAuditResult={manualAuditResult}
              manualAuditError={manualAuditError}
            />
          </div>
        </div>
      </div>
      <MobileAgents
        agents={agents}
        onAgentAction={openAction}
        onManualAudit={() => void runFleetManualAudit()}
        manualAuditRunning={manualAuditRunning}
        manualAuditResult={manualAuditResult}
      />

      {selectedAgent ? (
        <div className="operator-action-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? closeAction() : undefined)}>
          <aside className="operator-action-panel" aria-label={`${selectedActionLabel} for ${selectedAgent.name}`}>
            <div className="operator-action-header">
              <div className={`operator-action-icon ${selectedAction}`}>
                <ActionIcon action={selectedAction} />
              </div>
              <div>
                <span>Operator Action</span>
                <h2>{selectedActionLabel} {selectedAgent.name}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close action panel" onClick={closeAction}>
                <X size={18} />
              </button>
            </div>

            <div className="operator-action-status-grid">
              <div>
                <span>Status</span>
                <strong>{panel.plan?.status || (panel.loading ? "Loading" : "Unavailable")}</strong>
              </div>
              <div>
                <span>Execution</span>
                <strong>{executionLabel(panel.plan)}</strong>
              </div>
              <div>
                <span>Target</span>
                <strong>{panel.plan?.target.kind || "none"}</strong>
              </div>
              <div>
                <span>Runtime</span>
                <strong>{panel.plan?.control.runtimeKind || selectedAgent.control?.runtimeKind || "unknown"}</strong>
              </div>
              <div>
                <span>Start command</span>
                <strong>{commandReadinessLabel(panel.plan?.control.commandReadiness.start || selectedAgent.control?.commandReadiness.start)}</strong>
              </div>
              <div>
                <span>Stop command</span>
                <strong>{commandReadinessLabel(panel.plan?.control.commandReadiness.stop || selectedAgent.control?.commandReadiness.stop)}</strong>
              </div>
            </div>

            {panel.error ? <div className="operator-action-message error">{panel.error}</div> : null}
            {panel.result ? <div className="operator-action-message ok">{resultText(panel.result)}</div> : null}

            <section className="operator-action-section">
              <h3>Preflight</h3>
              <div className="operator-check-list">
                {panel.plan?.checks.map((check) => (
                  <div className={`operator-check-row ${check.status}`} key={check.id}>
                    <CheckIcon status={check.status} />
                    <span>{check.label}</span>
                    <small>{check.detail}</small>
                  </div>
                ))}
                {panel.loading ? <div className="operator-empty">Loading action plan...</div> : null}
              </div>
            </section>

            <section className="operator-action-section">
              <h3>Plan</h3>
              <div className="operator-plan-list">
                {panel.plan?.steps.map((step) => (
                  <div key={step}>{step}</div>
                ))}
              </div>
            </section>

            {panel.plan?.blockers.length ? (
              <section className="operator-action-section">
                <h3>Blockers</h3>
                <div className="operator-plan-list warn">
                  {panel.plan.blockers.map((blocker) => (
                    <div key={blocker}>{blocker}</div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="operator-action-section">
              <h3>Safety</h3>
              <div className="operator-safety-note">
                <ShieldCheck size={17} />
                <span>{panel.plan?.warnings[0] || "No runtime mutation is available without an explicit backend."}</span>
              </div>
              {panel.plan?.risks[0] ? (
                <div className="operator-safety-note muted">
                  <Activity size={17} />
                  <span>{panel.plan.risks[0]}</span>
                </div>
              ) : null}
            </section>

            <div className="operator-action-footer">
              <button className="outline-button compact" type="button" onClick={closeAction}>
                Close
              </button>
              <button className="primary-action-button compact" type="button" disabled={panel.running} onClick={() => void runManualCheck()}>
                <ClipboardCheck size={16} />
                {panel.running ? "Checking..." : "Run Manual Check"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
