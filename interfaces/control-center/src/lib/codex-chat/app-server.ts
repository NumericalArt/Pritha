import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { getPrithaRuntimeSettings } from "@/lib/realtime/pritha-runtime";
import { DESKTOP_CODEX_BIN_CANDIDATES } from "@/lib/settings/codex-binaries";
import { codexAppTurnSettings } from "@/lib/settings/codex-model-catalog";
import { resolveTechscopeRoot } from "@/lib/pritha-paths";
import { CodexChatPrivateStore } from "./private-store";
import { effectiveCodexHome, legacyIdentityMatches, storageIdentity } from "./storage-identity";
import type { RuntimeCapabilityMap, RuntimeProviderId, RuntimeProviderView, RuntimeStatus } from "./types";

export type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type ProviderProbe = {
  providerId: RuntimeProviderId;
  binary: string;
  view: RuntimeProviderView;
  probedAt: number;
};

type NotificationHandler = (providerId: RuntimeProviderId, message: RpcMessage) => void | Promise<void>;
type ExitHandler = (providerId: RuntimeProviderId, exitCode: number | null, signal: NodeJS.Signals | null) => void | Promise<void>;

const PROBE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

function asText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function transportFailure(value: unknown) {
  const message = String(value instanceof Error ? value.message : value || "");
  return /unavailable|exited|connection closed|broken pipe|EPIPE|write after end|could not start|startup timed out/i.test(message);
}

function retryableReadFailure(value: unknown) {
  const message = String(value instanceof Error ? value.message : value || "");
  return transportFailure(value) || /request timed out: thread\/read/i.test(message);
}

function emptyCapabilities(): RuntimeCapabilityMap {
  return {
    fullChat: false,
    nativeHistory: false,
    listThreads: false,
    readThread: false,
    forkThread: false,
    archiveThread: false,
    unarchiveThread: false,
    renameThread: false,
    pinThread: false,
    steerTurn: false,
    interruptTurn: false,
    commandApprovals: false,
    fileChangeApprovals: false,
    permissionApprovals: false,
    requestUserInput: false,
    historyPagination: false,
    audioInput: false,
  };
}

function childEnvironment(home = effectiveCodexHome()) {
  const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: home };
  if (process.env.PRITHA_REALTIME_CODEX_USE_PROXY === "1" || process.env.TECHSCOPE_VOICE_CODEX_USE_PROXY === "1") return env;
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete env[key];
  env.NO_PROXY = env.NO_PROXY || "127.0.0.1,localhost";
  env.no_proxy = env.no_proxy || env.NO_PROXY;
  return env;
}

function commandPath(command: string) {
  if (path.isAbsolute(command)) return existsSync(command) ? command : null;
  const result = spawnSync("which", [command], { encoding: "utf8", timeout: 3_000 });
  return result.status === 0 ? asText(result.stdout, 2_000) : null;
}

function firstExisting(candidates: Array<string | undefined | null>) {
  for (const candidate of candidates) {
    const value = asText(candidate, 2_000);
    if (!value) continue;
    const resolved = commandPath(value);
    if (resolved) return resolved;
  }
  return null;
}

function resolveProviderBinary(providerId: RuntimeProviderId) {
  if (providerId === "desktop_bundled") {
    return firstExisting([
      process.env.PRITHA_CODEX_CHAT_DESKTOP_BIN,
      process.env.PRITHA_DESKTOP_CODEX_BIN,
      ...DESKTOP_CODEX_BIN_CANDIDATES,
    ]);
  }
  return firstExisting([
    process.env.PRITHA_CODEX_CHAT_CLI_BIN,
    process.env.CODEX_BIN,
    path.join(os.homedir(), ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "codex",
  ]);
}

function fileNamesRecursively(directory: string, output = new Set<string>()) {
  if (!existsSync(directory)) return output;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) fileNamesRecursively(absolute, output);
    else if (entry.isFile()) output.add(entry.name);
  }
  return output;
}

function has(files: Set<string>, name: string) {
  return files.has(`${name}.json`);
}

function capabilitiesFromSchema(files: Set<string>) {
  const capabilities = emptyCapabilities();
  capabilities.listThreads = has(files, "ThreadListParams") && has(files, "ThreadListResponse");
  capabilities.readThread = has(files, "ThreadReadParams") && has(files, "ThreadReadResponse");
  capabilities.nativeHistory = capabilities.readThread;
  capabilities.forkThread = has(files, "ThreadForkParams");
  capabilities.archiveThread = has(files, "ThreadArchiveParams");
  capabilities.unarchiveThread = has(files, "ThreadUnarchiveParams");
  capabilities.renameThread = has(files, "ThreadNameSetParams");
  capabilities.pinThread = has(files, "ThreadMetadataUpdateParams");
  capabilities.steerTurn = has(files, "TurnSteerParams");
  capabilities.interruptTurn = has(files, "TurnInterruptParams");
  capabilities.commandApprovals = [...files].some((name) => /Command.*Approval.*Params\.json/i.test(name));
  capabilities.fileChangeApprovals = [...files].some((name) => /(FileChange|ApplyPatch).*Approval.*Params\.json/i.test(name));
  capabilities.permissionApprovals = [...files].some((name) => /Permission.*Request.*Params\.json/i.test(name));
  capabilities.requestUserInput = has(files, "ToolRequestUserInputParams");
  capabilities.historyPagination = has(files, "ThreadTurnsListParams");
  capabilities.audioInput = false;
  capabilities.fullChat = [
    "ThreadStartParams",
    "ThreadResumeParams",
    "ThreadListParams",
    "ThreadReadParams",
    "TurnStartParams",
    "AgentMessageDeltaNotification",
    "TurnCompletedNotification",
  ].every((name) => has(files, name));
  return capabilities;
}

function sandboxModeForAppServer(value: string) {
  if (value === "read-only") return "read-only";
  if (value === "danger-full-access") return "danger-full-access";
  return "workspace-write";
}

function sandboxModeForView(value: string): RuntimeStatus["selected"]["sandboxMode"] {
  if (value === "read-only") return "read_only";
  if (value === "danger-full-access") return "danger_full_access";
  return "workspace_write";
}

export class AppServerConnection {
  readonly codexHome = effectiveCodexHome();
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<string | number, PendingRequest>();
  private loadedThreads = new Set<string>();
  private startPromise: Promise<void> | null = null;
  private notificationHandler: NotificationHandler;
  private disposing = false;

  constructor(
    readonly providerId: RuntimeProviderId,
    readonly binary: string,
    private readonly cwd: string,
    notificationHandler: NotificationHandler,
    private readonly exitHandler?: ExitHandler,
  ) {
    this.notificationHandler = notificationHandler;
  }

  setNotificationHandler(handler: NotificationHandler) {
    this.notificationHandler = handler;
  }

  isRunning() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    if (this.isRunning()) return;
    this.startPromise = this.startConnection();
    try {
      await this.startPromise;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("Codex App Server could not start.");
      this.close(error);
      throw error;
    } finally {
      this.startPromise = null;
    }
  }

  async request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS) {
    await this.start();
    const stdin = this.child?.stdin;
    if (!stdin?.writable) throw new Error("Codex App Server is unavailable.");
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, Math.max(1_000, timeoutMs));
      this.pending.set(id, { resolve, reject, timer });
      stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method: string, params: unknown = {}) {
    const stdin = this.child?.stdin;
    if (!stdin?.writable) throw new Error("Codex App Server is unavailable.");
    stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  markThreadLoaded(threadId: string) {
    if (threadId) this.loadedThreads.add(threadId);
  }

  async ensureThreadLoaded(threadId: string) {
    if (this.loadedThreads.has(threadId)) return;
    await this.request("thread/resume", { threadId });
    this.loadedThreads.add(threadId);
  }

  close(reason = new Error("Codex App Server connection closed.")) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pending.clear();
    this.loadedThreads.clear();
    this.child?.stdin.end();
    this.child?.kill("SIGTERM");
    this.child = null;
  }

  async dispose(reason = new Error("Codex App Server connection disposed.")) {
    if (this.disposing) return;
    this.disposing = true;
    const child = this.child;
    this.close(reason);
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 5_000);
      timer.unref?.();
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async startConnection() {
    const child = spawn(this.binary, ["app-server", "--listen", "stdio://"], {
      cwd: this.cwd,
      env: childEnvironment(this.codexHome),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    readline.createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    child.stderr.on("data", () => undefined);
    child.once("close", (exitCode, signal) => {
      void this.exitHandler?.(this.providerId, exitCode, signal);
      if (this.child === child) this.close(new Error("Codex App Server exited."));
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Codex App Server startup timed out.")), 10_000);
      child.once("spawn", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    await this.requestWithoutStart(
      "initialize",
      {
        clientInfo: { name: "pritha_control_center", title: "Pritha Control Center", version: "0.1.0" },
        capabilities: {
          experimentalApi: false,
          requestAttestation: false,
          optOutNotificationMethods: ["item/reasoning/textDelta", "item/reasoning/summaryTextDelta"],
        },
      },
      15_000,
    );
    this.notify("initialized", {});
  }

  private requestWithoutStart(method: string, params: unknown, timeoutMs: number) {
    const stdin = this.child?.stdin;
    if (!stdin?.writable) return Promise.reject(new Error("Codex App Server is unavailable."));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: RpcMessage;
    try {
      message = JSON.parse(trimmed) as RpcMessage;
    } catch {
      return;
    }

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || "Codex App Server rejected the request."));
      else pending.resolve(message.result);
      return;
    }

    if (message.id !== undefined && message.method) {
      void this.notificationHandler(this.providerId, message);
      this.child?.stdin.write(`${JSON.stringify({ id: message.id, error: { code: -32601, message: "Unsupported in Codex Chat core v1" } })}\n`);
      return;
    }

    if (message.method) void this.notificationHandler(this.providerId, message);
  }
}

export class CodexRuntimeManager {
  private probes = new Map<RuntimeProviderId, ProviderProbe>();
  private probePromises = new Map<RuntimeProviderId, Promise<ProviderProbe>>();
  private connections = new Map<RuntimeProviderId, AppServerConnection>();

  constructor(
    private readonly store: CodexChatPrivateStore,
    private readonly onNotification: NotificationHandler,
    private readonly root = resolveTechscopeRoot(),
  ) {}

  async status(): Promise<RuntimeStatus> {
    const settings = getPrithaRuntimeSettings();
    const preferredProvider = this.preferredProvider();
    const providers = await Promise.all([this.probe("desktop_bundled"), this.probe("standalone_cli")]);
    const ordered = preferredProvider === "standalone_cli" ? [...providers].reverse() : providers;
    const effective = ordered.find((row) => row.view.availability === "ready")?.view || null;
    const turnSettings = codexAppTurnSettings({
      model: settings.codexModel,
      effort: settings.codexReasoningEffort,
      serviceTier: settings.codexServiceTier,
    });
    return {
      preferredProvider,
      effectiveProvider: effective?.providerId || null,
      effectiveProtocol: effective?.protocol || null,
      availability: effective ? "ready" : providers.some((row) => row.view.availability === "degraded") ? "degraded" : "unavailable",
      fallbackEnabled: true,
      providers: providers.map((row) => row.view),
      models: settings.codexModel
        ? [{
            id: settings.codexModel,
            label: settings.codexModel,
            effortIds: [settings.codexReasoningEffort],
            serviceTierIds: [settings.codexServiceTier],
            defaultEffortId: settings.codexReasoningEffort,
          }]
        : [],
      selected: {
        modelId: turnSettings.model || null,
        effortId: turnSettings.effort || null,
        serviceTierId: turnSettings.serviceTier || null,
        sandboxMode: sandboxModeForView(settings.codexSandbox),
        approvalMode: "never",
      },
      probedAt: new Date().toISOString(),
    };
  }

  preferredProvider(): "auto" | RuntimeProviderId {
    const explicit = asText(process.env.PRITHA_CODEX_CHAT_RUNTIME, 40).toLowerCase();
    if (explicit === "auto") return "auto";
    if (explicit === "desktop_bundled" || explicit === "standalone_cli") return explicit;
    return getPrithaRuntimeSettings().deepTaskPrimaryTransport === "codex-cli" ? "standalone_cli" : "desktop_bundled";
  }

  async effectiveProvider() {
    const preferred = this.preferredProvider();
    const order: RuntimeProviderId[] = preferred === "standalone_cli"
      ? ["standalone_cli", "desktop_bundled"]
      : ["desktop_bundled", "standalone_cli"];
    for (const providerId of order) {
      const probe = await this.probe(providerId);
      if (probe.view.availability === "ready") return probe;
    }
    return null;
  }

  async provider(providerId: RuntimeProviderId) {
    return this.probe(providerId);
  }

  async canRecoverIdentity(providerId: RuntimeProviderId, identity: string | null) {
    const probe = await this.probe(providerId);
    const versions = new Set<string>(probe.view.version ? [probe.view.version] : []);
    if (existsSync(this.store.capabilitiesRoot)) {
      for (const entry of readdirSync(this.store.capabilitiesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[a-f0-9]{20}$/.test(entry.name)) continue;
        try {
          const saved = JSON.parse(readFileSync(path.join(this.store.capabilitiesRoot, entry.name, "capabilities.json"), "utf8"));
          if (typeof saved.version === "string" && saved.version.length <= 120) versions.add(saved.version);
        } catch { /* damaged caches cannot authorize recovery */ }
      }
    }
    return legacyIdentityMatches(identity, providerId, [...versions], effectiveCodexHome());
  }

  async connection(providerId: RuntimeProviderId) {
    const probe = await this.probe(providerId);
    if (probe.view.availability !== "ready") throw new Error("Selected Codex runtime is unavailable.");
    let existing = this.connections.get(providerId);
    if (existing && (existing.codexHome !== effectiveCodexHome() || existing.binary !== probe.binary)) {
      this.discardConnection(providerId, existing, new Error("Runtime environment changed."));
      existing = undefined;
    }
    if (existing) {
      existing.setNotificationHandler(this.onNotification);
      try {
        await existing.start();
        return existing;
      } catch (error) {
        this.discardConnection(providerId, existing, error);
        throw error;
      }
    }
    const connection = new AppServerConnection(
      providerId,
      probe.binary,
      this.root,
      this.onNotification,
      (exitedProvider, exitCode, signal) => this.store.recordRuntimeEvent("app-server-exit", {
        providerId: exitedProvider,
        exitCode,
        signal,
      }),
    );
    this.connections.set(providerId, connection);
    try {
      await connection.start();
      return connection;
    } catch (error) {
      this.discardConnection(providerId, connection, error);
      throw error;
    }
  }

  async readThread(providerId: RuntimeProviderId, threadId: string, includeTurns: boolean) {
    let lastError: Error = new Error("Codex App Server thread read failed.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let connection: AppServerConnection | null = null;
      try {
        connection = await this.connection(providerId);
        return await connection.request("thread/read", { threadId, includeTurns });
      } catch (cause) {
        lastError = cause instanceof Error ? cause : lastError;
        if (connection && transportFailure(lastError)) this.discardConnection(providerId, connection, lastError);
        if (!retryableReadFailure(lastError)) break;
      }
    }
    throw lastError;
  }

  threadDefaults() {
    const settings = getPrithaRuntimeSettings();
    const turnSettings = codexAppTurnSettings({
      model: settings.codexModel,
      effort: settings.codexReasoningEffort,
      serviceTier: settings.codexServiceTier,
    });
    return {
      cwd: this.root,
      model: turnSettings.model || undefined,
      approvalPolicy: "never",
      sandbox: sandboxModeForAppServer(settings.codexSandbox),
      personality: "pragmatic",
      serviceTier: turnSettings.serviceTier,
      serviceName: "pritha_control_center",
    };
  }

  turnDefaults() {
    const settings = getPrithaRuntimeSettings();
    const turnSettings = codexAppTurnSettings({
      model: settings.codexModel,
      effort: settings.codexReasoningEffort,
      serviceTier: settings.codexServiceTier,
    });
    return {
      cwd: this.root,
      model: turnSettings.model || undefined,
      effort: turnSettings.effort,
      serviceTier: turnSettings.serviceTier,
      approvalPolicy: "never",
      summary: "none",
      personality: "pragmatic",
    };
  }

  async dispose() {
    const connections = [...this.connections.values()];
    this.connections.clear();
    await Promise.allSettled(connections.map((connection) => connection.dispose()));
  }

  private discardConnection(providerId: RuntimeProviderId, connection: AppServerConnection, reason: unknown) {
    if (this.connections.get(providerId) !== connection) return;
    this.connections.delete(providerId);
    connection.close(reason instanceof Error ? reason : new Error("Codex App Server connection was reset."));
  }

  private async probe(providerId: RuntimeProviderId) {
    const cached = this.probes.get(providerId);
    if (cached && Date.now() - cached.probedAt < PROBE_TTL_MS) return cached;
    const inFlight = this.probePromises.get(providerId);
    if (inFlight) return inFlight;
    const promise = this.runProbe(providerId).finally(() => this.probePromises.delete(providerId));
    this.probePromises.set(providerId, promise);
    return promise;
  }

  private async runProbe(providerId: RuntimeProviderId) {
    const binary = resolveProviderBinary(providerId);
    const label = providerId === "desktop_bundled" ? "Codex Desktop runtime" : "Codex CLI runtime";
    const locationLabel = providerId === "desktop_bundled" ? "Desktop bundled" : "Standalone CLI";
    if (!binary) {
      const missing: ProviderProbe = {
        providerId,
        binary: "",
        probedAt: Date.now(),
        view: {
          providerId,
          label,
          availability: "unavailable",
          version: null,
          protocol: null,
          locationLabel,
          stateIdentityHash: null,
          capabilities: emptyCapabilities(),
          warning: `${locationLabel} Codex binary was not found.`,
        },
      };
      this.probes.set(providerId, missing);
      return missing;
    }

    const versionResult = spawnSync(binary, ["--version"], {
      cwd: this.root,
      env: childEnvironment(),
      encoding: "utf8",
      timeout: 5_000,
    });
    const version = versionResult.status === 0 ? asText(versionResult.stdout || versionResult.stderr, 120) : null;
    let capabilities = emptyCapabilities();
    let warning: string | null = null;
    if (version) {
      const key = createHash("sha256").update(`${providerId}:${version}:${binary}`).digest("hex").slice(0, 20);
      const schemaRoot = path.join(this.store.capabilitiesRoot, key, "schemas");
      const markerPath = path.join(this.store.capabilitiesRoot, key, "capabilities.json");
      try {
        mkdirSync(schemaRoot, { recursive: true, mode: 0o700 });
        if (!existsSync(markerPath)) {
          const generated = spawnSync(binary, ["app-server", "generate-json-schema", "--out", schemaRoot], {
            cwd: this.root,
            env: childEnvironment(),
            encoding: "utf8",
            timeout: 30_000,
          });
          if (generated.status !== 0) throw new Error("schema_generation_failed");
          const probedCapabilities = capabilitiesFromSchema(fileNamesRecursively(schemaRoot));
          writeFileSync(markerPath, `${JSON.stringify({ version, capabilities: probedCapabilities }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
        }
        const saved = JSON.parse(readFileSync(markerPath, "utf8")) as { capabilities?: RuntimeCapabilityMap };
        capabilities = saved.capabilities || capabilitiesFromSchema(fileNamesRecursively(schemaRoot));
        if (!capabilities.fullChat) warning = "This Codex runtime does not expose the required stable chat core.";
      } catch {
        warning = "The installed Codex runtime schema could not be verified.";
      }
    } else {
      warning = "The installed Codex runtime did not report a version.";
    }

    const stateIdentityHash = version ? storageIdentity(effectiveCodexHome()) : null;
    const ready = Boolean(version && capabilities.fullChat);
    const probe: ProviderProbe = {
      providerId,
      binary,
      probedAt: Date.now(),
      view: {
        providerId,
        label,
        availability: ready ? "ready" : version ? "degraded" : "unavailable",
        version,
        protocol: ready ? "app_server" : null,
        locationLabel,
        stateIdentityHash,
        capabilities,
        warning,
      },
    };
    this.probes.set(providerId, probe);
    return probe;
  }
}
