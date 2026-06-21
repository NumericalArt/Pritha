"use client";

import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Terminal } from "lucide-react";

type AvailabilityStatus = {
  available?: boolean;
  detail?: string;
};

type CodexAuthStatus = {
  codexBin: string;
  root: string;
  cli: AvailabilityStatus;
  appServer: AvailabilityStatus;
  auth: {
    status: string;
    method: string;
    detail: string;
  };
  commands: {
    chatgptLogin: string;
    deviceLogin: string;
    openApp: string;
    check: string;
  };
};

function availabilityLabel(status?: AvailabilityStatus) {
  if (!status) return "Loading";
  return status.available ? "Ready" : "Unavailable";
}

function availabilityClass(status?: AvailabilityStatus) {
  if (!status) return "unknown";
  return status.available ? "alive" : "missing";
}

export function CodexAuthSection() {
  const [codex, setCodex] = useState<CodexAuthStatus | null>(null);
  const [command, setCommand] = useState("");
  const [loginHelpOpen, setLoginHelpOpen] = useState(false);
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    void loadCodexAuth();
  }, []);

  async function loadCodexAuth() {
    setStatusText("");
    const response = await fetch("/api/settings/codex-auth", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setStatusText("Codex auth status unavailable");
      return;
    }
    const payload = (await response.json().catch(() => null)) as { codex?: CodexAuthStatus } | null;
    if (!payload?.codex) {
      setStatusText("Codex auth status unavailable");
      return;
    }
    setCodex(payload.codex);
  }

  async function requestLoginPlan(path: "login-plan" | "device-login-plan") {
    setStatusText("");
    const response = await fetch(`/api/settings/codex-auth/${path}`, { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      setStatusText("Codex login plan unavailable");
      return;
    }
    const payload = (await response.json().catch(() => null)) as { command?: string; reason?: string } | null;
    setCommand(payload?.command || "");
    setStatusText(payload?.reason || "Run the command in a trusted terminal.");
  }

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <div className="section-header">
          <span className="section-icon">
            <KeyRound size={22} />
          </span>
          <div>
            <h2>Codex Connection</h2>
            <p>Codex App and CLI availability</p>
          </div>
        </div>
        <button className="outline-button" type="button" onClick={loadCodexAuth}>
          <RefreshCw size={16} />
          Check Status
        </button>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Codex CLI</strong>
          <span>{codex?.codexBin || "codex"} in {codex?.root || "current workspace"}</span>
        </div>
        <span className={`settings-status-chip ${availabilityClass(codex?.cli)}`}>{availabilityLabel(codex?.cli)}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Codex App Server</strong>
          <span>Required for the preferred deep-task transport.</span>
        </div>
        <span className={`settings-status-chip ${availabilityClass(codex?.appServer)}`}>{availabilityLabel(codex?.appServer)}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Authentication</strong>
          <span>{codex?.auth.detail || "Codex authentication is managed by Codex App / CLI. Pritha uses the available Codex session and does not store Codex credentials."}</span>
        </div>
        <span className="settings-status-chip unknown">{codex?.auth.method || "external"}</span>
      </div>
      <div className="settings-action-row">
        <button className="outline-button" type="button" onClick={() => setLoginHelpOpen((open) => !open)}>
          <Terminal size={16} />
          {loginHelpOpen ? "Hide Login Help" : "Login Help"}
        </button>
        <span>Use only if Codex reports a session or login problem.</span>
      </div>
      {loginHelpOpen ? (
        <div className="settings-command-grid">
          <button className="outline-button" type="button" onClick={() => requestLoginPlan("login-plan")}>
            <Terminal size={16} />
            ChatGPT Login
          </button>
          <button className="outline-button" type="button" onClick={() => requestLoginPlan("device-login-plan")}>
            <Terminal size={16} />
            Device Login
          </button>
          {codex?.commands.openApp ? <code>{codex.commands.openApp}</code> : null}
          {codex?.commands.check ? <code>{codex.commands.check}</code> : null}
        </div>
      ) : null}
      {loginHelpOpen && command ? (
        <div className="settings-command-row" aria-live="polite">
          <span>Run manually</span>
          <code>{command}</code>
        </div>
      ) : null}
      {statusText ? <div className="settings-action-row">{statusText}</div> : null}
    </section>
  );
}
