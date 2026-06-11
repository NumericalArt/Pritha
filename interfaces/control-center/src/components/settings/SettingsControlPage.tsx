import {
  Clock3,
  Database,
  Globe2,
  HardDrive,
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
import { settingsMock, type CapabilityStatus } from "@/data/mockControlCenter";
import type { ControlCenterStatus } from "@/lib/control-center/types";

function statusText(status: CapabilityStatus) {
  return status.replace(/_/g, " ");
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

function LanguageSection() {
  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <SectionHeader icon={<Globe2 size={22} />} title="Language" subtitle="Interface language" />
        <div className="language-toggle-large">
          <button className="active" type="button">
            English
          </button>
          <button type="button">Русский</button>
        </div>
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

function SummaryCard() {
  const summary = settingsMock.summary;
  return (
    <section className="side-card summary-card">
      <h2>Pritha Summary</h2>
      <dl className="summary-list">
        <div>
          <dt>
            <ShieldCheck size={16} />
            Version
          </dt>
          <dd>{summary.version}</dd>
        </div>
        <div>
          <dt>
            <Info size={16} />
            Status
          </dt>
          <dd className="good">Ready</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={16} />
            Uptime
          </dt>
          <dd>{summary.uptime}</dd>
        </div>
        <div>
          <dt>
            <Database size={16} />
            Memory Index
          </dt>
          <dd>Up to date</dd>
        </div>
        <div>
          <dt>
            <TimerReset size={16} />
            Last Self-test
          </dt>
          <dd>{summary.lastSelfTest}</dd>
        </div>
      </dl>
      <button className="outline-button full" type="button" aria-disabled="true">
        <Play size={16} />
        Run Self-test
      </button>
    </section>
  );
}

function LimitsCard() {
  const limits = settingsMock.limits;
  const hasBudget = typeof limits.budgetUsedPercent === "number";

  return (
    <section className="side-card limits-card">
      <h2>Limits Overview</h2>
      <div className="limit-row">
        <span>Codex Limits <Info size={14} /></span>
        <strong>{statusText(limits.codexLimits)}</strong>
      </div>
      <div className="limit-row">
        <span>API Usage <Info size={14} /></span>
        <strong>{statusText(limits.apiUsage)}</strong>
      </div>
      <div className="limit-row budget">
        <span>Budget <Info size={14} /></span>
        <strong>{hasBudget ? `${limits.budgetUsedPercent}% used` : "Manual / unavailable"}</strong>
      </div>
      {hasBudget ? (
        <div className="limit-progress">
          <span className="limit-progress-fill" style={{ width: `${limits.budgetUsedPercent}%` }} />
        </div>
      ) : null}
      <button className="outline-button full" type="button">
        Open Limits Settings
      </button>
    </section>
  );
}

function ProactivityCard() {
  return (
    <section className="side-card proactivity-card">
      <div className="card-title-row">
        <h2>Proactivity</h2>
        <span className="inline-status orange">Off</span>
      </div>
      <div className="proactivity-box">
        <Clock3 size={34} />
        <div>
          <strong>Cron adapter not installed</strong>
          <span>Proactivity is disabled.</span>
        </div>
      </div>
      <button className="outline-button full" type="button" aria-disabled="true">
        Configure Draft
      </button>
      <div className="manual-action-row">
        <span>Manual Actions</span>
        <button className="outline-button" type="button" aria-disabled="true">
          <Play size={16} />
          Run Manual Check
        </button>
      </div>
    </section>
  );
}

export function SettingsControlPage({ access }: AccessProps) {
  return (
    <>
      <div className="settings-desktop-content">
        <PageHeader title="Settings" subtitle="Configure Pritha to work the way you want." variant="voice" showCodexButton />
        <div className="settings-layout">
          <main className="settings-main">
            <SettingsTabs />
            <LanguageSection />
            <AccessSection access={access} />
            <AppearanceSection />
            <DataStorageSection />
          </main>
          <aside className="settings-rail">
            <SummaryCard />
            <LimitsCard />
            <ProactivityCard />
          </aside>
        </div>
      </div>
      <div className="mobile-settings-screen">
        <h1 className="mobile-page-title">Settings</h1>
        <SettingsTabs />
        <LanguageSection />
        <AccessSection access={access} />
        <AppearanceSection />
        <DataStorageSection />
        <SummaryCard />
        <LimitsCard />
        <ProactivityCard />
      </div>
    </>
  );
}
