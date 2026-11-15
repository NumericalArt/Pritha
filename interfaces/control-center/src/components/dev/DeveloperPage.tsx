import {
  ChevronRight,
  Copy,
  Database,
  FileText,
  Info,
  Link,
  Mic,
  Orbit,
  ScrollText,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import type { CapabilityStatus, ControlCenterDiagnostics } from "@/lib/control-center/types";
import { SnapshotOperationsPanel } from "./SnapshotOperationsPanel";
import { AttentionPanel, BuildsPanel, ReleasePanel } from "./DeveloperConsolePanels";

type DeveloperPageProps = {
  data: ControlCenterDiagnostics;
};


function moduleStatusLabel(status: CapabilityStatus) {
  if (status === "not_installed") return "Not installed";
  if (status === "manual_only") return "Manual only";
  if (status === "pending_auth") return "Needs setup";
  return status[0].toUpperCase() + status.slice(1);
}

function ModuleIcon({ id }: { id: string }) {
  const props = { size: 19 };
  if (id === "harness") return <ShieldCheck {...props} />;
  if (id === "memory") return <Database {...props} />;
  if (id === "tools") return <Wrench {...props} />;
  if (id === "interfaces") return <TerminalSquare {...props} />;
  if (id === "operations") return <Settings {...props} />;
  if (id === "voice") return <Mic {...props} />;
  if (id === "proactivity") return <Orbit {...props} />;
  return <Link {...props} />;
}

function SystemReadinessPanel({ data }: DeveloperPageProps) {
  const selfTest = data.status.selfTest;
  return (
    <section className="dev-panel readiness-panel">
      <div className="panel-heading-row">
        <h2>System Readiness (modules)</h2>
        <div className="panel-actions">
          <span title={selfTest.createdAt}>Last self-test: {selfTest.ageLabel}</span>
          <code title="Run in a terminal">node scripts/self-test.mjs</code>
        </div>
      </div>
      <div className="module-row">
        {data.modules.map((module) => (
          <div className="module-item" key={module.id}>
            <span className="module-icon">
              <ModuleIcon id={module.id} />
            </span>
            <span>
              <strong>{module.label}</strong>
              <small className={`module-status ${module.status}`}>{moduleStatusLabel(module.status)}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WarningsPanel({ data }: DeveloperPageProps) {
  return (
    <section className="dev-panel warning-panel">
      <div className="panel-heading-row">
        <h2>Warnings & Notices</h2>
        <span>{data.warnings.length} items ⌄</span>
      </div>
      <div className="warning-list">
        {data.warnings.map((warning, index) => (
          <div className={`warning-row ${index === 0 ? "critical" : ""}`} key={warning}>
            {index === 0 ? <span>⚠</span> : <Info size={17} />}
            <span>{warning}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvironmentCard({ data }: DeveloperPageProps) {
  const env = data.environment;
  return (
    <section className="side-card dev-side-card">
      <h2>
        <TerminalSquare size={17} />
        Environment
      </h2>
      <dl className="compact-dl">
        <div>
          <dt>Platform</dt>
          <dd>{env.platform}</dd>
        </div>
        <div>
          <dt>Node.js</dt>
          <dd>{env.node}</dd>
        </div>
        <div>
          <dt>App Port</dt>
          <dd>{env.appPort}</dd>
        </div>
        <div>
          <dt>Data Path</dt>
          <dd>{env.dataPath}</dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>{env.timezone}</dd>
        </div>
        <div>
          <dt>Git (Pritha)</dt>
          <dd>{env.git}</dd>
        </div>
      </dl>
      <button className="outline-button full" type="button">
        <Copy size={16} />
        Copy Info
      </button>
    </section>
  );
}

function VoiceDiagnosticsCard({ data }: DeveloperPageProps) {
  const voice = data.voiceDiagnostics;
  const connectionLabel = voice.connection === "good" ? "Good" : voice.connection === "degraded" ? "Degraded" : voice.connection === "bad" ? "Bad" : "Unknown";
  return (
    <section className="side-card dev-side-card">
      <div className="card-title-row">
        <h2>
          <Mic size={17} />
          Voice Diagnostics
        </h2>
        <button className="chip-button" type="button">
          Details
        </button>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Realtime Connection</dt>
          <dd className={voice.connection === "good" ? "good" : ""}>{connectionLabel}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{voice.model}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{voice.latencyMs} ms</dd>
        </div>
        <div>
          <dt>Turn Detection</dt>
          <dd>{voice.turnDetection}</dd>
        </div>
        <div>
          <dt>Last Session</dt>
          <dd>{voice.lastSession}</dd>
        </div>
      </dl>
    </section>
  );
}

function MemoryIndexCard({ data }: DeveloperPageProps) {
  const memory = data.memoryIndex;
  const statusLabel = memory.status === "up_to_date" ? "Up to date" : memory.status[0].toUpperCase() + memory.status.slice(1).replace(/_/g, " ");
  return (
    <section className="side-card dev-side-card">
      <div className="card-title-row">
        <h2>
          <Database size={17} />
          Memory Index
        </h2>
        <button className="chip-button" type="button">
          Details
        </button>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Status</dt>
          <dd className={memory.status === "up_to_date" ? "good" : ""}>{statusLabel}</dd>
        </div>
        <div>
          <dt>Documents</dt>
          <dd>{memory.documents.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Chunks</dt>
          <dd>{memory.chunks.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Last Updated</dt>
          <dd>{memory.lastUpdated}</dd>
        </div>
      </dl>
    </section>
  );
}

function LatestReportsCard({ data }: DeveloperPageProps) {
  return (
    <section className="side-card dev-side-card latest-reports-card" id="latest-reports">
      <div className="card-title-row">
        <h2>
          <ScrollText size={17} />
          Latest Reports
        </h2>
      </div>
      <div className="reports-list">
        {data.reports.map((report) => (
          <div className="report-row" key={report.path}>
            <FileText size={15} />
            <span>{report.title}</span>
            <time>{report.updated}</time>
            <ChevronRight size={15} />
          </div>
        ))}
      </div>
    </section>
  );
}

// Less used tools stay available, folded away from the answers above them.
function MoreDiagnostics({ data }: DeveloperPageProps) {
  return (
    <details className="dev-more" data-testid="dev-more">
      <summary>Modules, snapshots, voice and memory</summary>
      <SystemReadinessPanel data={data} />
      <SnapshotOperationsPanel agents={data.status.childAgents} />
      <VoiceDiagnosticsCard data={data} />
      <MemoryIndexCard data={data} />
    </details>
  );
}

export function DeveloperPage({ data }: DeveloperPageProps) {
  return (
    <>
      <div className="dev-desktop-content">
        <PageHeader title="Developer" subtitle="What is installed, what the factory is doing and what needs you. Read-only." variant="dev" showCodexButton status={data.status} />
        <div className="dev-layout">
          <main className="dev-main">
            <BuildsPanel data={data.console} />
            <WarningsPanel data={data} />
            <MoreDiagnostics data={data} />
          </main>
          <aside className="dev-rail">
            <ReleasePanel data={data.console} />
            <AttentionPanel data={data.console} />
            <EnvironmentCard data={data} />
            <LatestReportsCard data={data} />
          </aside>
        </div>
      </div>
      <div className="mobile-dev-screen">
        <h1 className="mobile-page-title">Developer</h1>
        <ReleasePanel data={data.console} />
        <AttentionPanel data={data.console} />
        <BuildsPanel data={data.console} />
        <WarningsPanel data={data} />
        <EnvironmentCard data={data} />
        <LatestReportsCard data={data} />
        <MoreDiagnostics data={data} />
      </div>
    </>
  );
}
