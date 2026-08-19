import { spawn } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const BACKEND_RESULT_SCHEMA = "pritha-trial-execution-result-v1";
const SANDBOX_TYPES = new Set(["none", "readOnly", "workspaceWrite", "externalSandbox"]);
const SHELL_EXECUTABLES = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);
const SHELL_OPERATOR_TOKENS = new Set(["&&", "||", ";", "|", ">", ">>", "<", "<<", "`"]);
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_OUTPUT_BYTES_CAP = 1_048_576;

export class ExecutionBackendError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ExecutionBackendError";
    this.code = code;
    this.details = details;
  }
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

function validateArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > 128) {
    throw new ExecutionBackendError("invalid_argv", "Execution requires a non-empty argv array");
  }
  if (argv.some((value) => typeof value !== "string" || !value || value.includes("\0") || value.length > 4096)) {
    throw new ExecutionBackendError("invalid_argv", "Every argv token must be a bounded non-empty string");
  }
  const executable = path.basename(argv[0]).toLowerCase();
  if (SHELL_EXECUTABLES.has(executable) || argv.some((value) => SHELL_OPERATOR_TOKENS.has(value.trim()))) {
    throw new ExecutionBackendError("shell_forbidden", "Shell executables and shell operator tokens are not accepted");
  }
  return [...argv];
}

function validatedCwd(value) {
  const requested = path.resolve(String(value || "."));
  if (!existsSync(requested)) throw new ExecutionBackendError("cwd_missing", "Execution cwd does not exist");
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ExecutionBackendError("cwd_invalid", "Execution cwd must be a regular directory, not a symlink");
  }
  return realpathSync(requested);
}

function normalizeSandbox(value = {}) {
  const type = String(value.type || "none");
  if (!SANDBOX_TYPES.has(type)) throw new ExecutionBackendError("sandbox_policy_invalid", `Unsupported sandbox type: ${type}`);
  const writableRoots = Array.isArray(value.writableRoots)
    ? value.writableRoots.map((entry) => path.resolve(String(entry)))
    : [];
  return {
    required: Boolean(value.required),
    type,
    writableRoots,
    networkAccess: Boolean(value.networkAccess),
  };
}

function normalizeRequest(request = {}) {
  return {
    argv: validateArgv(request.argv),
    cwd: validatedCwd(request.cwd),
    timeoutMs: positiveInteger(request.timeoutMs, DEFAULT_TIMEOUT_MS, 900_000),
    outputBytesCap: positiveInteger(request.outputBytesCap, DEFAULT_OUTPUT_BYTES_CAP, 16 * 1024 * 1024),
    sandbox: normalizeSandbox(request.sandbox),
    env: request.env && typeof request.env === "object" && !Array.isArray(request.env) ? request.env : {},
  };
}

function safeExecutionEnv(overrides = {}) {
  const allowed = [
    "PATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SYSTEMROOT",
    "COMSPEC",
    "PATHEXT",
    "CI",
    "NO_COLOR",
  ];
  const env = {};
  for (const key of allowed) if (typeof process.env[key] === "string") env[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new ExecutionBackendError("env_invalid", "Environment variable name is invalid");
    if (value === null || value === undefined) delete env[key];
    else if (typeof value === "string" && value.length <= 32_768) env[key] = value;
    else throw new ExecutionBackendError("env_invalid", "Environment overrides must be bounded strings or null");
  }
  return env;
}

function boundedCapture(limit) {
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  return {
    add(value) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = Math.max(0, limit - bytes);
      if (remaining > 0) {
        const accepted = chunk.subarray(0, remaining);
        chunks.push(accepted);
        bytes += accepted.length;
      }
      if (chunk.length > remaining) truncated = true;
    },
    result() {
      return { text: Buffer.concat(chunks).toString("utf8"), bytes, truncated };
    },
  };
}

export class LocalExecBackend {
  constructor(options = {}) {
    this.name = "local-exec";
    this.killGraceMs = positiveInteger(options.killGraceMs, 500, 5_000);
  }

  probe() {
    return {
      backend: this.name,
      available: true,
      isolation: "none",
      runtimeVersion: `${process.release.name}/${process.version}`,
      capabilities: { structuredArgv: true, commandExec: true, sandbox: false },
    };
  }

  async execute(value) {
    const request = normalizeRequest(value);
    if (request.sandbox.required || request.sandbox.type !== "none") {
      throw new ExecutionBackendError(
        "isolation_unavailable",
        "The local backend cannot prove sandbox isolation; select the App Server backend",
        { requestedPolicy: request.sandbox },
      );
    }

    const stdoutCapture = boundedCapture(request.outputBytesCap);
    const stderrCapture = boundedCapture(request.outputBytesCap);
    const startedAt = Date.now();
    let timedOut = false;

    return new Promise((resolve) => {
      let settled = false;
      let forceKillTimer = null;
      const child = spawn(request.argv[0], request.argv.slice(1), {
        cwd: request.cwd,
        env: safeExecutionEnv(request.env),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      child.stdout?.on("data", (chunk) => stdoutCapture.add(chunk));
      child.stderr?.on("data", (chunk) => stderrCapture.add(chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), this.killGraceMs);
        forceKillTimer.unref?.();
      }, request.timeoutMs);

      const finish = (exitCode, spawnError = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (spawnError) stderrCapture.add(`${spawnError.message}\n`);
        const stdout = stdoutCapture.result();
        const stderr = stderrCapture.result();
        resolve({
          schema: BACKEND_RESULT_SCHEMA,
          backend: this.name,
          isolation: "none",
          effectivePolicy: { type: "none", writableRoots: [], networkAccess: "host" },
          exitCode: Number.isInteger(exitCode) ? exitCode : timedOut ? 124 : 127,
          stdout: stdout.text,
          stderr: stderr.text,
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
          durationMs: Date.now() - startedAt,
          timedOut,
          runtimeVersion: `${process.release.name}/${process.version}`,
        });
      };

      child.once("error", (error) => finish(127, error));
      child.once("close", (code) => finish(code));
    });
  }
}

function rpcErrorMessage(error) {
  if (!error) return "Unknown App Server error";
  if (typeof error === "string") return error;
  const message = typeof error.message === "string" ? error.message : JSON.stringify(error);
  return message || "Unknown App Server error";
}

export class CodexAppServerConnection {
  constructor(options = {}) {
    this.codexBin = options.codexBin || process.env.PRITHA_CODEX_BIN || process.env.CODEX_BIN || "codex";
    this.cwd = validatedCwd(options.cwd || process.cwd());
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = boundedCapture(64 * 1024);
    this.notificationWaiters = new Set();
    this.recentNotifications = [];
    this.agentText = new Map();
  }

  start(timeoutMs = 10_000) {
    if (this.child) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const child = spawn(this.codexBin, ["app-server", "--listen", "stdio://"], {
        cwd: this.cwd,
        env: safeExecutionEnv(),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      this.child = child;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(new ExecutionBackendError("app_server_start_timeout", "Codex App Server startup timed out"));
      }, positiveInteger(timeoutMs, 10_000, 30_000));
      child.stderr?.on("data", (chunk) => this.stderr.add(chunk));
      readline.createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new ExecutionBackendError("app_server_unavailable", error.message));
        }
        this.rejectPending(error);
        this.rejectNotificationWaiters(error);
      });
      child.once("exit", (code) => {
        const error = new Error(`Codex App Server exited with code ${code ?? "unknown"}`);
        this.rejectPending(error);
        this.rejectNotificationWaiters(error);
        this.child = null;
      });
    });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message?.id !== undefined && message?.id !== null) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          const error = new ExecutionBackendError("app_server_rpc_error", rpcErrorMessage(message.error), {
            rpcCode: message.error.code,
            rpcData: message.error.data,
          });
          pending.reject(error);
        } else {
          pending.resolve(message.result);
        }
        return;
      }
    }
    if (!message.method) return;
    if (message.method === "item/agentMessage/delta") {
      const turnId = String(message?.params?.turnId || "");
      const delta = String(message?.params?.delta || "");
      if (turnId && delta) this.agentText.set(turnId, `${this.agentText.get(turnId) || ""}${delta}`);
    }
    this.dispatchNotification(message);
  }

  agentTextForTurn(turnId) {
    return this.agentText.get(String(turnId || "")) || "";
  }

  dispatchNotification(message) {
    this.recentNotifications.push(message);
    if (this.recentNotifications.length > 200) this.recentNotifications.shift();
    for (const waiter of [...this.notificationWaiters]) {
      let matches = false;
      try {
        matches = waiter.predicate(message);
      } catch (error) {
        this.notificationWaiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.reject(error);
        continue;
      }
      if (!matches) continue;
      this.notificationWaiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  rejectNotificationWaiters(error) {
    for (const waiter of this.notificationWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.notificationWaiters.clear();
  }

  request(method, params, timeoutMs = 10_000) {
    const stdin = this.child?.stdin;
    if (!stdin?.writable) return Promise.reject(new ExecutionBackendError("app_server_unavailable", "Codex App Server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ExecutionBackendError("app_server_request_timeout", `Codex App Server request timed out: ${method}`));
      }, positiveInteger(timeoutMs, 10_000, 920_000));
      this.pending.set(id, { resolve, reject, timer });
      stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  waitForNotification(predicate, timeoutMs = 10_000) {
    const priorIndex = this.recentNotifications.findIndex((message) => predicate(message));
    if (priorIndex !== -1) {
      const [message] = this.recentNotifications.splice(priorIndex, 1);
      return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.notificationWaiters.delete(waiter);
        reject(new ExecutionBackendError("app_server_notification_timeout", "Codex App Server notification timed out"));
      }, positiveInteger(timeoutMs, 10_000, 3_600_000));
      this.notificationWaiters.add(waiter);
    });
  }

  stop() {
    const child = this.child;
    this.child = null;
    const error = new ExecutionBackendError("app_server_unavailable", "Codex App Server connection closed");
    this.rejectPending(error);
    this.rejectNotificationWaiters(error);
    this.agentText.clear();
    if (!child) return;
    try {
      child.stdin?.end();
      child.kill("SIGTERM");
    } catch {
      // Best-effort sidecar cleanup; process exit also rejects pending requests.
    }
  }
}

function appServerPolicy(sandbox, cwd) {
  if (sandbox.type === "externalSandbox") {
    return { type: "externalSandbox", networkAccess: sandbox.networkAccess ? "enabled" : "restricted" };
  }
  if (sandbox.type === "workspaceWrite") {
    const roots = sandbox.writableRoots.length ? sandbox.writableRoots : [cwd];
    return { type: "workspaceWrite", writableRoots: roots, networkAccess: sandbox.networkAccess };
  }
  if (sandbox.type === "readOnly" || sandbox.type === "none") {
    return { type: "readOnly", networkAccess: sandbox.networkAccess };
  }
  throw new ExecutionBackendError("sandbox_policy_invalid", `Unsupported App Server sandbox type: ${sandbox.type}`);
}

function methodUnavailable(error) {
  return error?.details?.rpcCode === -32601 || /method.*(?:not found|unknown)|command\/exec.*(?:unavailable|unsupported)/i.test(error?.message || "");
}

export class CodexAppServerCommandBackend {
  constructor(options = {}) {
    this.name = "codex-app-server-command";
    this.options = options;
    this.connection = options.connection || null;
    this.initializeResponse = null;
    this.capabilityState = "unprobed";
  }

  async ensureReady(timeoutMs) {
    if (this.initializeResponse) return this.initializeResponse;
    if (!this.connection) {
      const factory = this.options.connectionFactory || ((value) => new CodexAppServerConnection(value));
      this.connection = factory({ codexBin: this.options.codexBin, cwd: this.options.cwd || process.cwd() });
    }
    await this.connection.start(Math.min(timeoutMs, 10_000));
    this.initializeResponse = await this.connection.request(
      "initialize",
      {
        clientInfo: { name: "pritha-outcome-delivery", title: "Pritha Outcome Delivery", version: "1.0" },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
          optOutNotificationMethods: ["command/exec/outputDelta"],
        },
      },
      Math.min(timeoutMs, 10_000),
    );
    this.capabilityState = "experimental-requested";
    return this.initializeResponse;
  }

  async probe(options = {}) {
    try {
      const response = await this.ensureReady(positiveInteger(options.timeoutMs, 10_000, 30_000));
      return {
        backend: this.name,
        available: true,
        isolation: "sandboxed",
        runtimeVersion: String(response?.userAgent || "codex-app-server/unknown"),
        platformFamily: String(response?.platformFamily || "unknown"),
        platformOs: String(response?.platformOs || "unknown"),
        capabilities: {
          structuredArgv: true,
          commandExec: this.capabilityState,
          sandbox: true,
          experimentalApi: true,
        },
      };
    } catch (error) {
      return {
        backend: this.name,
        available: false,
        isolation: "unavailable",
        runtimeVersion: "unknown",
        error: error instanceof Error ? error.message : String(error),
        capabilities: { structuredArgv: true, commandExec: false, sandbox: false, experimentalApi: true },
      };
    }
  }

  async execute(value) {
    const request = normalizeRequest(value);
    const policy = appServerPolicy(request.sandbox, request.cwd);
    const initialized = await this.ensureReady(request.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.connection.request(
        "command/exec",
        {
          command: request.argv,
          cwd: request.cwd,
          timeoutMs: request.timeoutMs,
          outputBytesCap: request.outputBytesCap,
          sandboxPolicy: policy,
          env: Object.keys(request.env).length ? request.env : undefined,
        },
        request.timeoutMs + 10_000,
      );
      this.capabilityState = true;
      const stdout = String(response?.stdout || "");
      const stderr = String(response?.stderr || "");
      return {
        schema: BACKEND_RESULT_SCHEMA,
        backend: this.name,
        isolation: policy.type === "dangerFullAccess" ? "none" : "sandboxed",
        effectivePolicy: {
          ...policy,
          writableRoots: policy.type === "workspaceWrite" ? policy.writableRoots : [],
        },
        exitCode: Number.isInteger(response?.exitCode) ? response.exitCode : 127,
        stdout,
        stderr,
        stdoutTruncated: Buffer.byteLength(stdout) >= request.outputBytesCap,
        stderrTruncated: Buffer.byteLength(stderr) >= request.outputBytesCap,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        runtimeVersion: String(initialized?.userAgent || "codex-app-server/unknown"),
      };
    } catch (error) {
      if (methodUnavailable(error)) {
        this.capabilityState = false;
        throw new ExecutionBackendError(
          "command_exec_unavailable",
          "Installed Codex App Server does not expose command/exec; required isolation is unavailable",
          { cause: error?.message || String(error) },
        );
      }
      throw error;
    }
  }

  close() {
    this.connection?.stop?.();
    this.connection = null;
    this.initializeResponse = null;
  }
}

export function createExecutionBackend(name = "local", options = {}) {
  if (name === "local" || name === "local-exec") return new LocalExecBackend(options);
  if (name === "app-server" || name === "codex-app-server-command") return new CodexAppServerCommandBackend(options);
  throw new ExecutionBackendError("backend_unknown", `Unknown Trial execution backend: ${name}`);
}

export function executionBackendResultSchema() {
  return BACKEND_RESULT_SCHEMA;
}
