import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile, withFileLock } from "./atomic-file.mjs";
import { readBoundedRegularFile } from "./safe-file-read.mjs";
import { normalizeProviderSettings, updateProviderPreset, VOICE_ENGINES, ProviderConfigurationError } from "./provider-profile.mjs";

const MAX_BYTES = 128 * 1024;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
function statOrMissing(file) { try { return lstatSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
function fail(code, message) { throw new ProviderConfigurationError(code, message); }
function revision(document) {
  const value = document.providerSettingsRevision ?? 0;
  if (!Number.isSafeInteger(value) || value < 0) fail("runtime_settings_corrupt", "Runtime settings need recovery. The saved file has been preserved.");
  return value;
}

/** The same lock protects native settings and provider presets across server workers. */
export class RuntimeSettingsStore {
  constructor(file, { allowedRoot = path.dirname(file) } = {}) {
    this.file = path.resolve(file);
    this.allowedRoot = path.resolve(allowedRoot);
    const relative = path.relative(this.allowedRoot, this.file);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) fail("runtime_settings_path_invalid", "Runtime settings must remain inside this instance.");
  }
  safePath(create = false) {
    try {
      if (create) mkdirSync(this.allowedRoot, { recursive: true, mode: 0o700 });
      const rootStat = statOrMissing(this.allowedRoot);
      if (!rootStat) return;
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error();
      const parts = path.relative(this.allowedRoot, path.dirname(this.file)).split(path.sep).filter(Boolean);
      let current = this.allowedRoot;
      for (const part of parts) {
        current = path.join(current, part);
        if (!statOrMissing(current) && create) mkdirSync(current, { mode: 0o700 });
        const stat = statOrMissing(current);
        if (!stat) continue;
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
      }
      for (const file of [this.file, `${this.file}.lock`, `${this.file}.previous`]) {
        // lstat also detects a dangling symlink, unlike existsSync.
        let stat;
        try { stat = lstatSync(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error();
      }
    } catch { fail("runtime_settings_path_invalid", "Runtime settings contain an unsafe path. No file was changed."); }
  }
  readRaw(file = this.file) {
    this.safePath();
    try { return readBoundedRegularFile(file, { maxBytes: MAX_BYTES, allowedRoots: [realpathSync(this.allowedRoot)] }).text; }
    catch (error) {
      if (error.code === "ENOENT") return null;
      fail("runtime_settings_unreadable", "Runtime settings cannot be read safely. The saved file has been preserved.");
    }
  }
  parse(raw) {
    try {
      const value = raw === null ? {} : JSON.parse(raw);
      if (!record(value)) throw new Error();
      revision(value);
      return value;
    } catch { fail("runtime_settings_corrupt", "Runtime settings need recovery. The saved file has been preserved."); }
  }
  read() { return this.parse(this.readRaw()); }
  mutate(change, { expectedRevision } = {}) {
    this.safePath(true);
    try {
      return withFileLock(this.file, () => {
        const raw = this.readRaw(), current = this.parse(raw), previousRevision = revision(current);
        if (expectedRevision !== undefined && expectedRevision !== previousRevision) fail("provider_settings_revision_conflict", "Settings changed in another window. Reload before saving.");
        const changed = change(structuredClone(current));
        if (!record(changed)) fail("provider_configuration_invalid", "The settings update is invalid.");
        const next = { ...changed, providerSettingsRevision: previousRevision + 1 };
        const content = `${JSON.stringify(next, null, 2)}\n`;
        if (Buffer.byteLength(content) > MAX_BYTES) fail("provider_configuration_invalid", "The settings update is too large.");
        if (raw !== null) atomicWriteFile(`${this.file}.previous`, raw);
        atomicWriteFile(this.file, content);
        return next;
      });
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error;
      if (/locked by another operation/.test(error.message)) fail("runtime_settings_busy", "Another settings update is in progress. Retry after reloading.");
      fail("runtime_settings_write_failed", "Runtime settings could not be saved. Reload to verify their state.");
    }
  }
  recoveryStatus() {
    const raw = this.readRaw();
    return { fingerprint: createHash("sha256").update(raw ?? "").digest("hex"), previousAvailable: this.readRaw(`${this.file}.previous`) !== null };
  }
  /** Explicit recovery keeps corrupt bytes and refuses to overwrite a concurrent change. */
  restorePrevious(fingerprint, validate = value => value) {
    this.safePath(true);
    try {
      return withFileLock(this.file, () => {
        const raw = this.readRaw();
        if (typeof fingerprint !== "string" || createHash("sha256").update(raw ?? "").digest("hex") !== fingerprint) fail("provider_settings_revision_conflict", "Settings changed before recovery. Reload before trying again.");
        const previous = this.readRaw(`${this.file}.previous`);
        if (previous === null) fail("runtime_settings_recovery_unavailable", "No previous settings snapshot is available.");
        const restored = this.parse(previous);
        validate(restored);
        let observedRevision = 0;
        try { observedRevision = revision(this.parse(raw)); } catch { /* Recovery also handles invalid JSON. */ }
        restored.providerSettingsRevision = Math.max(Date.now(), revision(restored) + 2, observedRevision + 1);
        if (raw !== null) atomicWriteFile(`${this.file}.recovered-${fingerprint}`, raw);
        atomicWriteFile(this.file, `${JSON.stringify(restored, null, 2)}\n`);
        return restored;
      });
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw error;
      fail("runtime_settings_recovery_failed", "Settings recovery could not finish. Reload to verify their state.");
    }
  }
}

export function providerSettingsSnapshot(document, options = {}) {
  const settings = normalizeProviderSettings({
    version: document.providerSettingsVersion,
    activeConnectorId: document.activeConnectorId,
    providerPresets: document.providerPresets,
  }, { ...options, legacy: { ...options.legacy, ...document } });
  const voiceEngine = document.voiceEngine ?? "auto";
  if (!VOICE_ENGINES.includes(voiceEngine)) fail("voice_engine_invalid", "Choose an available voice engine in Settings.");
  return { ...settings, voiceEngine, revision: revision(document) };
}

export function updateStoredProviderSettings(store, patch, options = {}) {
  if (!record(patch) || Object.keys(patch).some(key => !["expectedRevision", "activeConnectorId", "connectorId", "preset", "voiceEngine"].includes(key))
      || !Number.isSafeInteger(patch.expectedRevision) || patch.expectedRevision < 0) fail("provider_configuration_invalid", "Reload Settings before saving this update.");
  const next = store.mutate(current => {
    let { revision: _revision, voiceEngine, ...settings } = providerSettingsSnapshot(current, options);
    if (patch.preset !== undefined) settings = updateProviderPreset(settings, patch.connectorId, patch.preset);
    else if (patch.connectorId !== undefined) fail("provider_configuration_invalid", "A provider preset is required.");
    if (patch.activeConnectorId !== undefined) settings = normalizeProviderSettings({ ...settings, activeConnectorId: patch.activeConnectorId });
    if (patch.voiceEngine !== undefined) {
      if (!VOICE_ENGINES.includes(patch.voiceEngine)) fail("voice_engine_invalid", "Choose an available voice engine in Settings.");
      voiceEngine = patch.voiceEngine;
    }
    const native = settings.providerPresets.codex;
    return { ...current, providerSettingsVersion: settings.version, activeConnectorId: settings.activeConnectorId,
      providerPresets: settings.providerPresets, voiceEngine,
      codexModel: native.modelId, codexReasoningEffort: native.reasoningEffort, codexTimeoutMs: native.timeoutMs };
  }, { expectedRevision: patch.expectedRevision });
  return providerSettingsSnapshot(next, options);
}

/** Legacy native settings writers use the same document and never erase other providers. */
export function mergeLegacyRuntimeSettings(current, legacy) {
  const next = { ...current, ...legacy };
  if (current.providerPresets !== undefined) {
    const { revision: _revision, voiceEngine: _voiceEngine, ...snapshot } = providerSettingsSnapshot(current);
    const settings = updateProviderPreset(snapshot, "codex", {
      modelId: legacy.codexModel, reasoningEffort: legacy.codexReasoningEffort, timeoutMs: legacy.codexTimeoutMs,
    });
    next.providerPresets = settings.providerPresets;
  }
  return next;
}
