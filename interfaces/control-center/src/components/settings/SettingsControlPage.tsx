"use client";

import {
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Globe2,
  Home,
  Info,
  Laptop,
  Monitor,
  Moon,
  Play,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TimerReset,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CodexAuthSection } from "@/components/settings/CodexAuthSection";
import { CodexSettingsSection } from "@/components/settings/CodexSettingsSection";
import { LimitsSettingsSection } from "@/components/settings/LimitsSettingsSection";
import { OpenAIKeysSection } from "@/components/settings/OpenAIKeysSection";
import { LanguageDropdown } from "@/components/primitives/LanguageDropdown";
import { VoiceSettingsSection } from "@/components/settings/VoiceSettingsSection";
import type { CapabilityStatus, ControlCenterStatus } from "@/lib/control-center/types";
import {
  type AccessMode,
  accessModeReady,
  accessVoiceUrl,
  preferredAccessMode,
  readStoredAccessMode,
  writeStoredAccessMode,
} from "@/lib/access-mode";

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

type ThemePreference = "dark" | "system" | "light";
type ResolvedTheme = "dark" | "light";

const THEME_STORAGE_KEY = "pritha-control-center-theme";
const ENABLE_EXPERIMENTAL_LIGHT_THEME = false;
const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  detail: string;
  icon: typeof Moon;
}> = [
  { id: "dark", label: "Dark", detail: "Deep control room", icon: Moon },
  { id: "system", label: "System", detail: "Follow this device", icon: Monitor },
  { id: "light", label: "Light", detail: "Bright operations", icon: Sun },
];
const VISIBLE_THEME_OPTIONS = ENABLE_EXPERIMENTAL_LIGHT_THEME ? THEME_OPTIONS : THEME_OPTIONS.filter((option) => option.id === "dark");

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "dark" || value === "system" || value === "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (!ENABLE_EXPERIMENTAL_LIGHT_THEME) return "dark";
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyThemePreference(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = resolved;
  }
  return resolved;
}

function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!ENABLE_EXPERIMENTAL_LIGHT_THEME) return "dark";
    return isThemePreference(stored) ? stored : "dark";
  } catch {
    return "dark";
  }
}

function memoryIndexLabel(status?: ControlCenterStatus) {
  const stats = status?.selfTest.memoryStats;
  if (!stats?.documents && !stats?.chunks) return "Unknown";
  return `${stats.documents.toLocaleString("en-US")} docs / ${stats.chunks.toLocaleString("en-US")} chunks`;
}

type SettingsSectionId = "general" | "access" | "codex" | "voice" | "limits" | "proactivity";

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: "general", label: "General" },
  { id: "access", label: "Access" },
  { id: "codex", label: "Codex" },
  { id: "voice", label: "Voice" },
  { id: "limits", label: "Limits" },
  { id: "proactivity", label: "Proactivity" },
];

function useSettingsAnchors(prefix: string) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const elements = SETTINGS_SECTIONS.map((section) => document.getElementById(`${prefix}-${section.id}`)).filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
        const section = visible?.target.getAttribute("data-settings-section") as SettingsSectionId | null;
        if (section) setActiveSection(section);
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: [0.1, 0.35, 0.6] },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [prefix]);

  const scrollToSection = useCallback(
    (section: SettingsSectionId) => {
      setActiveSection(section);
      document.getElementById(`${prefix}-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [prefix],
  );

  return { activeSection, scrollToSection };
}

function SettingsTabs({ activeSection, onSelect, controlsPrefix }: { activeSection: SettingsSectionId; onSelect: (section: SettingsSectionId) => void; controlsPrefix: string }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => (
        <button
          className={`settings-tab ${section.id === activeSection ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={section.id === activeSection}
          aria-controls={`${controlsPrefix}-${section.id}`}
          onClick={() => onSelect(section.id)}
          key={section.id}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}

function SettingsAnchorSection({ prefix, section, children }: { prefix: string; section: SettingsSectionId; children: React.ReactNode }) {
  return (
    <div id={`${prefix}-${section}`} className="settings-anchor-target settings-section-stack" data-settings-section={section}>
      {children}
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

function VoiceLinkModal({ mode, url, onClose }: { mode: AccessMode; url?: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl("");
    setError("");
    if (!url) return;
    QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: "#111827", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError("QR code unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const localOnly = mode === "localhost";
  return (
    <div className="access-modal-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? onClose() : undefined)}>
      <div className="access-modal voice-link-modal" role="dialog" aria-modal="true" aria-label="Voice link QR code">
        <div className="access-modal-header">
          <h2>Voice Link</h2>
          <button className="icon-button" type="button" aria-label="Close voice link" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="voice-link-qr-frame">
          {qrDataUrl ? <img src={qrDataUrl} alt="QR code for Voice Link" /> : <span>{error || "Generating QR..."}</span>}
        </div>
        <p>{url || "Voice URL unavailable"}</p>
        <div className={`voice-link-note ${localOnly ? "warn" : ""}`}>
          {localOnly ? "Localhost works only on this Mac. Select LAN or Tailscale for a phone." : "Scan this with iPhone, Android, or another smartphone."}
        </div>
      </div>
    </div>
  );
}

function AccessSection({ access }: AccessProps) {
  const [selectedMode, setSelectedMode] = useState<AccessMode>(() => (access ? preferredAccessMode(access) : "localhost"));
  const [voiceLinkOpen, setVoiceLinkOpen] = useState(false);

  useEffect(() => {
    if (!access) return;
    setSelectedMode(preferredAccessMode(access, readStoredAccessMode()));
  }, [access]);

  function chooseMode(mode: AccessMode) {
    if (!access || !accessModeReady(access, mode)) return;
    setSelectedMode(mode);
    writeStoredAccessMode(mode);
  }

  const voiceMode = access && accessModeReady(access, "tailscale") ? "tailscale" : selectedMode;
  const voiceUrl = access ? accessVoiceUrl(access, voiceMode) : undefined;
  const options = [
    { id: "localhost" as const, label: "Localhost", value: access?.localhost || "http://127.0.0.1:3420", icon: Laptop },
    { id: "lan" as const, label: "LAN", value: access?.lanUrl || "Unavailable", icon: Home },
    { id: "tailscale" as const, label: "Tailscale", value: access?.tailscaleUrl || "Not configured", icon: ShieldCheck },
  ].map((option) => ({ ...option, ready: access ? accessModeReady(access, option.id) : false }));

  return (
    <section className="settings-section">
      <SectionHeader icon={<SlidersHorizontal size={22} />} title="Access & Connections" subtitle="How devices connect to Pritha Control Center" />
      <div className="access-grid">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = option.id === selectedMode && option.ready;
          return (
            <button
              className={`access-option ${selected ? "selected" : ""} ${option.ready ? "ready" : "unavailable"}`}
              type="button"
              aria-pressed={selected}
              disabled={!option.ready}
              onClick={() => chooseMode(option.id)}
              key={option.id}
            >
              <Icon size={25} />
              <strong>{option.label}</strong>
              <span>{option.value}</span>
              {option.ready ? (
                <span className="ready-check ready" aria-label={`${option.label} connection ready`}>
                  <CheckCircle2 size={18} />
                </span>
              ) : null}
            </button>
          );
        })}
        <button className={`access-option voice-link-action ${voiceUrl ? "ready" : "unavailable"}`} type="button" onClick={() => setVoiceLinkOpen(true)} disabled={!voiceUrl}>
          <QrCode size={25} />
          <strong>Voice Link</strong>
          <span>{voiceUrl ? "Open /voice on phone" : "Select an available connection"}</span>
        </button>
      </div>
      <div className="info-note">
        <Info size={17} />
        The purple frame marks the default UI path. Green checks mark configured connection methods.
      </div>
      {voiceLinkOpen ? <VoiceLinkModal mode={voiceMode} url={voiceUrl} onClose={() => setVoiceLinkOpen(false)} /> : null}
    </section>
  );
}

function AppearanceSection() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStoredThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(themePreference));

  useEffect(() => {
    setResolvedTheme(applyThemePreference(themePreference));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // Theme selection is still applied for this session.
    }

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => {
      if (themePreference === "system") setResolvedTheme(applyThemePreference(themePreference));
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, [themePreference]);

  const activeOption = THEME_OPTIONS.find((option) => option.id === themePreference) || THEME_OPTIONS[0];
  const appliedLabel = themePreference === "system" ? `System: ${resolvedTheme}` : activeOption.label;

  return (
    <section className="settings-section appearance-section">
      <div className="appearance-header-row">
        <SectionHeader icon={<Moon size={23} />} title="Appearance" subtitle="Theme" />
        <span className="appearance-applied" aria-live="polite">
          Applied: {appliedLabel}
        </span>
      </div>
      <div className="theme-toggle" role="radiogroup" aria-label="Theme">
        {VISIBLE_THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = option.id === themePreference;
          return (
            <button
              className={selected ? "active" : ""}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setThemePreference(option.id)}
              key={option.id}
            >
              <Icon size={16} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <div className={`theme-preview theme-preview-${resolvedTheme}`}>
        <div className="theme-preview-window" aria-hidden="true">
          <span className="theme-preview-sidebar" />
          <span className="theme-preview-main">
            <span className="theme-preview-bar" />
            <span className="theme-preview-row strong" />
            <span className="theme-preview-row" />
            <span className="theme-preview-row short" />
          </span>
        </div>
        <div>
          <strong>{activeOption.detail}</strong>
          <span>{themePreference === "system" ? `Pritha is following the current ${resolvedTheme} system appearance.` : `${activeOption.label} theme is active across the control surface.`}</span>
        </div>
        <Check size={18} />
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

function ProactivitySettingsSection({ status }: { status?: ControlCenterStatus }) {
  const proactivity = status?.proactivity;
  const statusLabel = proactivity ? statusText(proactivity.status) : "unknown";
  const cronLabel = proactivity?.cronAdapter === "not_installed" ? "Cron adapter not installed" : `Cron adapter ${proactivity ? statusText(proactivity.cronAdapter) : "unknown"}`;
  const modeLabel = proactivity?.mode === "manual" ? "Manual-only" : proactivity?.mode === "planned" ? "Planned" : "Disabled";

  return (
    <section className="settings-section">
      <div className="settings-section-row">
        <SectionHeader icon={<Clock3 size={22} />} title="Proactivity" subtitle="Manual-first activity model" />
        <span className="inline-status orange">{modeLabel}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Mode</strong>
          <span>Pritha remains manual-first until a separate operations decision enables scheduled work.</span>
        </div>
        <span className="settings-status-chip unknown">{modeLabel}</span>
      </div>
      <div className="settings-rowline">
        <div>
          <strong>Cron adapter</strong>
          <span>{cronLabel}. Proactivity status: {statusLabel}.</span>
        </div>
        <button className="outline-button" type="button" aria-disabled="true" title="Proactivity configuration is planned">
          Configure Draft
        </button>
      </div>
    </section>
  );
}

function SettingsContent({ prefix, access, status }: AccessProps & { prefix: string }) {
  const { activeSection, scrollToSection } = useSettingsAnchors(prefix);
  return (
    <>
      <SettingsTabs activeSection={activeSection} onSelect={scrollToSection} controlsPrefix={prefix} />
      <SettingsAnchorSection prefix={prefix} section="general">
        <LanguageSection id={`${prefix}-language`} />
        <OpenAIKeysSection />
        <CodexAuthSection />
        <AppearanceSection />
        <DataStorageSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="access">
        <AccessSection access={access} />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="codex">
        <CodexSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="voice">
        <VoiceSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="limits">
        <LimitsSettingsSection />
      </SettingsAnchorSection>
      <SettingsAnchorSection prefix={prefix} section="proactivity">
        <ProactivitySettingsSection status={status} />
      </SettingsAnchorSection>
    </>
  );
}

export function SettingsControlPage({ access, status }: AccessProps) {
  return (
    <>
      <div className="settings-desktop-content">
        <PageHeader title="Settings" subtitle="Configure Pritha to work the way you want." variant="voice" showCodexButton status={status} />
        <div className="settings-layout">
          <main className="settings-main">
            <SettingsContent prefix="desktop-settings" access={access} status={status} />
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
        <SettingsContent prefix="mobile-settings" access={access} status={status} />
        <SummaryCard status={status} />
      </div>
    </>
  );
}
