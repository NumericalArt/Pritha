"use client";

import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, Gauge, RefreshCw, TimerOff } from "lucide-react";

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type LimitsState = {
  codexSubscription: {
    status: string;
    source: string;
    detail: string;
    checkedAt: string;
    rateLimits: CodexRateLimitSnapshot | null;
    rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot> | null;
    commands: {
      dashboardUrl: string;
      appStatus: string;
      cliStatus: string;
      cliUsageDaily: string;
      cliUsageWeekly: string;
      cliUsageCumulative: string;
    };
  };
  realtimeUsage: {
    status: string;
    detail: string;
    today: TokenUsage;
    week: TokenUsage;
  };
  openaiApiUsage: {
    status: string;
    detail: string;
  };
  localPausePolicy: {
    enabled: boolean;
    thresholdPercent: number;
    action: string;
    source: string;
    detail: string;
  };
};

type CodexRateLimitWindow = {
  usedPercent: number;
  remainingPercent: number;
  resetsAt: number | null;
  resetAtIso: string | null;
  windowDurationMins: number | null;
  label: string;
};

type CodexRateLimitSnapshot = {
  credits: {
    balance: string | null;
    hasCredits: boolean;
    unlimited: boolean;
  } | null;
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: CodexRateLimitWindow | null;
  rateLimitReachedType: string | null;
  secondary: CodexRateLimitWindow | null;
};

function formatTokens(tokens?: number) {
  return (tokens || 0).toLocaleString("en-US");
}

function statusClass(status?: string) {
  if (!status) return "unknown";
  if (status === "ready" || status === "collecting") return "alive";
  if (status === "manual" || status === "planned" || status === "unavailable") return "unknown";
  return "missing";
}

function formatReset(iso?: string | null) {
  if (!iso) return "reset unknown";
  return `resets ${new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatCheckedAt(iso?: string) {
  if (!iso) return "";
  return `Checked ${new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

function bucketTitle(snapshot: CodexRateLimitSnapshot, fallback: string) {
  if (snapshot.limitName) return snapshot.limitName;
  if (snapshot.limitId === "codex") return "Codex";
  return snapshot.limitId || fallback;
}

function formatCreditBalance(balance?: string | null) {
  if (!balance) return "";
  const numeric = Number(balance);
  if (!Number.isFinite(numeric)) return balance;
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function RateWindowMetric({ label, window }: { label: string; window: CodexRateLimitWindow | null }) {
  if (!window) return null;
  return (
    <span>
      {label} {window.remainingPercent}% left
      <small>{window.usedPercent}% used · {formatReset(window.resetAtIso)}</small>
    </span>
  );
}

function RateLimitSnapshotCard({ snapshot, title }: { snapshot: CodexRateLimitSnapshot; title: string }) {
  return (
    <div className="settings-limit-card">
      <div className="settings-limit-card-head">
        <strong>{title}</strong>
        <span>
          {snapshot.planType || "plan unknown"}
          {snapshot.rateLimitReachedType ? ` · ${snapshot.rateLimitReachedType}` : ""}
        </span>
      </div>
      <div className="settings-limit-metrics">
        <RateWindowMetric label={snapshot.primary?.label || "Primary"} window={snapshot.primary} />
        <RateWindowMetric label={snapshot.secondary?.label || "Secondary"} window={snapshot.secondary} />
        {snapshot.credits ? (
          <span>
            Credits {snapshot.credits.unlimited ? "unlimited" : snapshot.credits.hasCredits ? "available" : "not available"}
            {snapshot.credits.balance ? <small>Balance {formatCreditBalance(snapshot.credits.balance)}</small> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CodexCommandFallback({ commands }: { commands?: LimitsState["codexSubscription"]["commands"] }) {
  if (!commands) return null;
  return (
    <div className="settings-limit-fallback">
      <span className="settings-limit-fallback-note">
        Usage Dashboard opens the external ChatGPT/Codex usage page. Slash commands are manual fallbacks when the Codex App Server probe cannot read limits.
      </span>
      <a className="outline-button compact" href={commands.dashboardUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={15} />
        Usage Dashboard
      </a>
      <code>{commands.cliUsageDaily}</code>
      <code>{commands.cliUsageWeekly}</code>
      <code>{commands.cliStatus}</code>
    </div>
  );
}

export function LimitsSettingsSection() {
  const [limits, setLimits] = useState<LimitsState | null>(null);
  const [statusText, setStatusText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadLimits();
  }, []);

  async function loadLimits() {
    setLoading(true);
    setStatusText("");
    try {
      const response = await fetch("/api/settings/limits", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) {
        setStatusText("Limits status unavailable");
        return;
      }
      const payload = (await response.json().catch(() => null)) as { limits?: LimitsState } | null;
      if (!payload?.limits) {
        setStatusText("Limits status unavailable");
        return;
      }
      setLimits(payload.limits);
      setStatusText(formatCheckedAt(payload.limits.codexSubscription.checkedAt));
    } finally {
      setLoading(false);
    }
  }

  const codexSnapshots = limits?.codexSubscription.rateLimitsByLimitId ? Object.entries(limits.codexSubscription.rateLimitsByLimitId) : [];
  const primarySnapshot = limits?.codexSubscription.rateLimits;
  const extraSnapshots = codexSnapshots.filter(([key]) => key !== primarySnapshot?.limitId).slice(0, 3);

  function renderCodexLimits() {
    if (!limits) return null;
    if (!primarySnapshot && extraSnapshots.length === 0) {
      return (
        <>
          <div className="info-note settings-limit-hint">
            <Gauge size={17} />
            If this reports a protocol or app-server error, set PRITHA_REALTIME_CODEX_BIN to the Codex.app bundled binary rather than a Homebrew codex-cli shim.
          </div>
          <CodexCommandFallback commands={limits.codexSubscription.commands} />
        </>
      );
    }
    return (
      <div className="settings-limit-stack">
        {primarySnapshot ? <RateLimitSnapshotCard title={bucketTitle(primarySnapshot, "Codex")} snapshot={primarySnapshot} /> : null}
        {extraSnapshots.map(([key, snapshot]) => (
          <RateLimitSnapshotCard key={key} title={bucketTitle(snapshot, key)} snapshot={snapshot} />
        ))}
        <CodexCommandFallback commands={limits.codexSubscription.commands} />
      </div>
    );
  }

  if (!limits && statusText) {
    return (
      <section className="settings-section">
        <div className="settings-section-row">
          <div className="section-header">
            <span className="section-icon">
              <Gauge size={22} />
            </span>
            <div>
              <h2>Limits</h2>
              <p>Codex and Realtime usage status</p>
            </div>
          </div>
          <button className="outline-button" type="button" onClick={loadLimits} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "Checking..." : "Check Status"}
          </button>
        </div>
        <div className="info-note">
          <BarChart3 size={17} />
          {statusText}
        </div>
      </section>
    );
  }

  if (!limits) {
    // Keep the first paint compact while the app-server probe runs.
    return (
      <section className="settings-section">
        <div className="settings-section-row">
          <div className="section-header">
            <span className="section-icon">
              <Gauge size={22} />
            </span>
            <div>
              <h2>Limits</h2>
              <p>Codex and Realtime usage status</p>
            </div>
          </div>
          <button className="outline-button" type="button" onClick={loadLimits} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "Checking..." : "Check Status"}
          </button>
        </div>
        <div className="info-note">
          <BarChart3 size={17} />
          Loading read-only limits status...
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <Gauge size={22} />
          </span>
          <div>
            <h2>Limits</h2>
            <p>Codex and Realtime usage status</p>
          </div>
        </div>
        <button className="outline-button" type="button" onClick={loadLimits} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? "Checking..." : "Check Status"}
        </button>
      </div>
      <div className="info-note">
        <BarChart3 size={17} />
        Read-only preview. Codex limits use the existing Codex session; Realtime usage enforcement is not enabled yet.
      </div>
      <div className="settings-rowline settings-limits-row">
        <div className="settings-limits-copy">
          <strong>Codex subscription limits</strong>
          <span>{limits.codexSubscription.detail}</span>
          {renderCodexLimits()}
        </div>
        <span className={`settings-status-chip ${statusClass(limits.codexSubscription.status)}`}>{limits.codexSubscription.status}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Realtime token usage</strong>
          <span>{limits.realtimeUsage.detail}</span>
        </div>
        <div className="settings-mini-metrics" aria-label="Realtime token usage">
          <span>Today {formatTokens(limits.realtimeUsage.today.totalTokens)}</span>
          <span>Week {formatTokens(limits.realtimeUsage.week.totalTokens)}</span>
        </div>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>OpenAI Admin API telemetry</strong>
          <span>{limits.openaiApiUsage.detail}</span>
        </div>
        <span className={`settings-status-chip ${statusClass(limits.openaiApiUsage.status)}`}>{limits.openaiApiUsage.status}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Local pause policy</strong>
          <span>{limits.localPausePolicy.detail}</span>
        </div>
        <div className="settings-pause-policy">
          <TimerOff size={16} />
          <span className="settings-status-chip unknown">
            {limits.localPausePolicy.enabled ? `Enabled at ${limits.localPausePolicy.thresholdPercent}%` : `Planned at ${limits.localPausePolicy.thresholdPercent}%`}
          </span>
        </div>
      </div>
      <div className="info-note">
        <BarChart3 size={17} />
        Enforcement should be added only after local pause thresholds are tested against live telemetry.
      </div>
      {statusText ? <div className="settings-action-row">{statusText}</div> : null}
    </section>
  );
}
