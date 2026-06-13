import {
  Clock3,
  Database,
  Globe2,
  Home,
  Info,
  Laptop,
  Moon,
  Play,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { LanguageDropdown } from "@/components/primitives/LanguageDropdown";
import { VoiceSettingsSection } from "@/components/settings/VoiceSettingsSection";
import type { CapabilityStatus, ControlCenterStatus } from "@/lib/control-center/types";

function statusText(status: CapabilityStatus) {
  return status.replace(/_/g, " ");
}

function formatUptime(seconds: number | undefined) {
  if (seconds == null || seconds < 0) return "starting";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function capabilityTone(status: CapabilityStatus | "pass" | "fail" | "unknown") {
  if (status === "ready" || status === "pass") return "good";
  return "";
}

function memoryIndexLabel(status?: ControlCenterStatus) {
  const stats = status?.selfTest.memoryStats;
  if (!stats?.documents && !stats?.chunks) return "Unknown";
  return `${stats.documents.toLocaleString("en-US")} docs / ${stats.chunks.toLocaleString("en-US")} chunks`;
}

function SettingsTabs() {
  const tabs = ["General", "Access", "Codex", "Voice", "Limits", "Proactivity"];
  return (
    <div className="settings-tabs" role="tablist" aria-label="Settings sections">
      {tabs.map((tab) => (
        <button className={`settings-tab ${tab === "General" ? "active" : ""}`} type="button" role="tab" aria-selected={tab === "General"} key={tab}>
          {tab}
        </button>
      ))}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <span className="section-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function LanguageSection({ id = "settings-language" }: { id?: string }) {
  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <SectionHeader icon={<Globe2 size={22} />} title="Language" subtitle="Interface language" />
        <label className="settings-select-label">
          <span>Default</span>
          <LanguageDropdown id={id} ariaLabel="Default interface language" />
        </label>
      </div>
      <div className="info-note">
        <Info size={17} />
        Pritha's core knowledge and project files remain in English.
      </div>
    </section>
  );
}

type AccessProps = {
  access?: ControlCenterStatus["access"];
  status?: ControlCenterStatus;
};

function AccessSection({ access }: AccessProps) {
  const selectedMode = access?.tailscale === "ready" ? "tailscale" : access?.lan === "ready" ? "lan" : "localhost";
  const tailscaleVoiceUrl = access?.tailscaleVoiceUrl || access?.tailscaleUrl;
  const options = [
    { id: "localhost", label: "Localhost (This device)", value: access?.localhost || "http://127.0.0.1:3420", href: access?.localhost, icon: Laptop },
    { id: "lan", label: "LAN", value: access?.lanUrl || "Unavailable", href: access?.lanUrl, icon: Home },
    { id: "tailscale", label: "Tailscale", value: tailscaleVoiceUrl || "Not configured", href: tailscaleVoiceUrl, icon: ShieldCheck },
    { id: "qr", label: "Voice Link", value: tailscaleVoiceUrl ? "Open /voice on phone" : "Needs Tailscale", href: tailscaleVoiceUrl, icon: QrCode },
  ];

  return (
    <section className="settings-section">
      <SectionHeader icon={<SlidersHorizontal size={22} />} title="Access & Connections" subtitle="How devices connect to Pritha Control Center" />
      <div className="access-grid">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = option.id === selectedMode;
          return (
            <a className={`access-option ${selected ? "selected" : ""}`} href={option.href} target={option.href ? "_blank" : undefined} rel={option.href ? "noreferrer" : undefined} key={option.id}>
              <Icon size={25} />
              <strong>{option.label}</strong>
              <span>{option.value}</span>
              {selected ? <span className="selected-check">✓</span> : <span className="option-dot" />}
            </a>
          );
        })}
      </div>
      <div className="info-note">
        <Info size={17} />
        For remote voice tests, use the Tailscale HTTPS /voice link on MacBook or iPhone.
      </div>
    </section>
  );
}

function AppearanceSection() {
  return (
    <section className="settings-section compact-section">
      <SectionHeader icon={<Moon size={23} />} title="Appearance" subtitle="Theme" />
      <div className="theme-toggle">
        <button className="active" type="button">
          Dark
        </button>
        <button type="button" aria-disabled="true">
          System
        </button>
        <button type="button" aria-disabled="true">
          Light
        </button>
      </div>
    </section>
  );
}

function DataStorageSection() {
  return (
    <section className="settings-section">
      <SectionHeader icon={<Database size={23} />} title="Data & Storage" subtitle="Snapshots and local data" />
      <div className="settings-rowline">
        <div>
          <strong>Snapshots retention per agent</strong>
          <span>How many snapshots to keep for rollback</span>
        </div>
        <select defaultValue="2" aria-label="Snapshots retention per agent">
          <option value="1">1 snapshot</option>
          <option value="2">2 snapshots (recommended)</option>
          <option value="3">3 snapshots</option>
        </select>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Clear local cache</strong>
          <span>Safe to clear. Does not remove snapshots or reports.</span>
        </div>
        <button className="outline-button" type="button" disabled>
          Clear Cache
        </button>
      </div>
    </section>
  );
}

function SummaryCard({ status }: { status?: ControlCenterStatus }) {
  const selfTest = status?.selfTest;
  return (
    <section className="side-card summary-card">
      <h2>Pritha Summary</h2>
      <dl className="summary-list">
        <div>
          <dt>
            <ShieldCheck size={16} />
            Version
          </dt>
          <dd>{status?.app.version || "v?"}</dd>
        </div>
        <div>
          <dt>
            <Info size={16} />
            Status
          </dt>
          <dd className={capabilityTone(status?.pritha.status || "unknown")}>{status?.pritha.status === "ready" ? "Ready" : "Needs setup"}</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={16} />
            Uptime
          </dt>
          <dd>{formatUptime(status?.app.uptimeSeconds)}</dd>
        </div>
        <div>
          <dt>
            <Database size={16} />
            Memory Index
          </dt>
          <dd>{memoryIndexLabel(status)}</dd>
        </div>
        <div>
          <dt>
            <TimerReset size={16} />
            Last Self-test
          </dt>
          <dd className={capabilityTone(selfTest?.status || "unknown")} title={selfTest?.createdAt}>
            {selfTest?.ageLabel || "Never"}
          </dd>
        </div>
      </dl>
      <button className="outline-button full" type="button" aria-disabled="true" title="Run from CLI: node scripts/self-test.mjs">
        <Play size={16} />
        Self-test is CLI-only
      </button>
    </section>
  );
}

function LimitsCard({ status }: { status?: ControlCenterStatus }) {
  return (
    <section className="side-card limits-card">
      <h2>Capability Overview</h2>
      <div className="limit-row">
        <span>Codex Bridge <Info size={14} /></span>
        <strong>{status ? statusText(status.voice.codexBridge) : "unknown"}</strong>
      </div>
      <div className="limit-row">
        <span>OpenAI Realtime <Info size={14} /></span>
        <strong>{status ? statusText(status.voice.realtime) : "unknown"}</strong>
      </div>
      <div className="limit-row budget">
        <span>Budget <Info size={14} /></span>
        <strong>Manual / unavailable</strong>
      </div>
      <button className="outline-button full" type="button">
        Open Limits Settings
      </button>
    </section>
  );
}

function ProactivityCard({ status }: { status?: ControlCenterStatus }) {
  const proactivity = status?.proactivity;
  const statusLabel = proactivity ? statusText(proactivity.status) : "unknown";
  const cronLabel = proactivity?.cronAdapter === "not_installed" ? "Cron adapter not installed" : `Cron adapter ${proactivity ? statusText(proactivity.cronAdapter) : "unknown"}`;
  const modeLabel = proactivity?.mode === "manual" ? "Manual-only" : proactivity?.mode === "planned" ? "Planned" : "Disabled";

  return (
    <section className="side-card proactivity-card">
      <div className="card-title-row">
        <h2>Proactivity</h2>
        <span className="inline-status orange">{modeLabel}</span>
      </div>
      <div className="proactivity-box">
        <Clock3 size={34} />
        <div>
          <strong>{cronLabel}</strong>
          <span>Proactivity status: {statusLabel}.</span>
        </div>
      </div>
      <button className="outline-button full" type="button" aria-disabled="true" title="Proactivity configuration is planned">
        Configure Draft
      </button>
      <div className="manual-action-row">
        <span>Manual Actions</span>
        <button className="outline-button" type="button" aria-disabled="true" title="Manual checks live on the Agents page">
          <Play size={16} />
          Agents page
        </button>
      </div>
    </section>
  );
}

export function SettingsControlPage({ access, status }: AccessProps) {
  return (
    <>
      <div className="settings-desktop-content">
        <PageHeader title="Settings" subtitle="Configure Pritha to work the way you want." variant="voice" showCodexButton status={status} />
        <div className="settings-layout">
          <main className="settings-main">
            <SettingsTabs />
            <LanguageSection id="settings-language" />
            <AccessSection access={access} />
            <AppearanceSection />
            <VoiceSettingsSection />
            <DataStorageSection />
          </main>
          <aside className="settings-rail">
            <SummaryCard status={status} />
            <LimitsCard status={status} />
            <ProactivityCard status={status} />
          </aside>
        </div>
      </div>
      <div className="mobile-settings-screen">
        <h1 className="mobile-page-title">Settings</h1>
        <SettingsTabs />
        <LanguageSection id="mobile-settings-language" />
        <AccessSection access={access} />
        <AppearanceSection />
        <VoiceSettingsSection />
        <DataStorageSection />
        <SummaryCard status={status} />
        <LimitsCard status={status} />
        <ProactivityCard status={status} />
      </div>
    </>
  );
}
