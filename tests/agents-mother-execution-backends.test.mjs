import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CodexAppServerConnection,
  CodexAppServerCommandBackend,
  ExecutionBackendError,
  LocalExecBackend,
} from "../scripts/agents-mother/execution-backends.mjs";

function sandbox(type = "none", required = false, cwd = process.cwd()) {
  return { type, required, writableRoots: type === "workspaceWrite" ? [cwd] : [], networkAccess: false };
}

test("local backend executes structured argv and records no isolation", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pritha-local-backend-"));
  const backend = new LocalExecBackend();
  const result = await backend.execute({
    argv: [process.execPath, "-e", "process.stdout.write('ready')"],
    cwd,
    timeoutMs: 5_000,
    sandbox: sandbox("none", false, cwd),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ready");
  assert.equal(result.isolation, "none");
  assert.equal(result.schema, "pritha-trial-execution-result-v2");
  assert.equal(result.effectivePolicy.type, "none");
  assert.equal(result.effectivePolicy.networkAccess, "host");
});

test("local backend fails closed when sandbox isolation is required", async () => {
  const backend = new LocalExecBackend();
  await assert.rejects(
    backend.execute({
      argv: [process.execPath, "-e", "process.exit(0)"],
      cwd: process.cwd(),
      sandbox: sandbox("readOnly", true),
    }),
    (error) => error instanceof ExecutionBackendError && error.code === "isolation_unavailable",
  );
});

test("local backend enforces a per-stream output cap", async () => {
  const backend = new LocalExecBackend();
  const result = await backend.execute({
    argv: [process.execPath, "-e", "process.stdout.write('x'.repeat(10000))"],
    cwd: process.cwd(),
    outputBytesCap: 128,
    sandbox: sandbox(),
  });

  assert.equal(Buffer.byteLength(result.stdout), 128);
  assert.equal(result.stdoutTruncated, true);
});

class FakeConnection {
  constructor({ unavailable = false } = {}) {
    this.calls = [];
    this.unavailable = unavailable;
    this.started = false;
  }

  async start() {
    this.started = true;
  }

  async request(method, params) {
    this.calls.push({ method, params });
    if (method === "initialize") {
      return { userAgent: "codex-test/1.2.3", platformFamily: "unix", platformOs: "macos", codexHome: "/private/test" };
    }
    if (this.unavailable) {
      const error = new ExecutionBackendError("app_server_rpc_error", "Method not found: command/exec", { rpcCode: -32601 });
      throw error;
    }
    return { exitCode: 0, stdout: "app-ready", stderr: "" };
  }

  stop() {}
}

test("App Server backend negotiates experimental API and uses command/exec with explicit sandbox", async () => {
  const connection = new FakeConnection();
  const backend = new CodexAppServerCommandBackend({ connection });
  const result = await backend.execute({
    argv: [process.execPath, "-e", "process.exit(0)"],
    cwd: process.cwd(),
    timeoutMs: 5_000,
    sandbox: sandbox("workspaceWrite", true, process.cwd()),
  });

  assert.equal(connection.started, true);
  assert.equal(connection.calls[0].method, "initialize");
  assert.equal(connection.calls[0].params.capabilities.experimentalApi, true);
  assert.equal(connection.calls[1].method, "command/exec");
  assert.deepEqual(connection.calls[1].params.command, [process.execPath, "-e", "process.exit(0)"]);
  assert.equal(connection.calls[1].params.sandboxPolicy.type, "workspaceWrite");
  assert.equal(connection.calls[1].params.sandboxPolicy.networkAccess, false, "wire policy remains boolean for workspaceWrite");
  assert.equal(result.isolation, "sandboxed");
  assert.equal(result.schema, "pritha-trial-execution-result-v2");
  assert.equal(result.effectivePolicy.networkAccess, "disabled");
  assert.equal(result.runtimeVersion, "codex-test/1.2.3");
});

test("App Server evidence normalizes enabled and restricted network policy without changing wire values", async () => {
  const enabledConnection = new FakeConnection();
  const enabled = await new CodexAppServerCommandBackend({ connection: enabledConnection }).execute({
    argv: [process.execPath, "-e", "process.exit(0)"], cwd: process.cwd(),
    sandbox: { ...sandbox("workspaceWrite", true, process.cwd()), networkAccess: true },
  });
  assert.equal(enabledConnection.calls[1].params.sandboxPolicy.networkAccess, true);
  assert.equal(enabled.effectivePolicy.networkAccess, "enabled");

  const restrictedConnection = new FakeConnection();
  const restricted = await new CodexAppServerCommandBackend({ connection: restrictedConnection }).execute({
    argv: [process.execPath, "-e", "process.exit(0)"], cwd: process.cwd(),
    sandbox: sandbox("externalSandbox", true, process.cwd()),
  });
  assert.equal(restrictedConnection.calls[1].params.sandboxPolicy.networkAccess, "restricted");
  assert.equal(restricted.effectivePolicy.networkAccess, "restricted");
});

test("App Server backend reports missing command/exec as unavailable isolation", async () => {
  const backend = new CodexAppServerCommandBackend({ connection: new FakeConnection({ unavailable: true }) });
  await assert.rejects(
    backend.execute({
      argv: [process.execPath, "-e", "process.exit(0)"],
      cwd: process.cwd(),
      timeoutMs: 5_000,
      sandbox: sandbox("readOnly", true),
    }),
    (error) => error instanceof ExecutionBackendError && error.code === "command_exec_unavailable",
  );
});

test("all backends reject shell executables before execution", async () => {
  const backend = new LocalExecBackend();
  await assert.rejects(
    backend.execute({ argv: ["sh", "-c", "exit 0"], cwd: process.cwd(), sandbox: sandbox() }),
    (error) => error instanceof ExecutionBackendError && error.code === "shell_forbidden",
  );
});

test("App Server connection preserves streamed agent text for completed build turns", () => {
  const connection = new CodexAppServerConnection({ cwd: process.cwd() });
  connection.handleLine(JSON.stringify({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", turnId: "turn-1", delta: '{"summary":"done"' },
  }));
  connection.handleLine(JSON.stringify({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", turnId: "turn-1", delta: ",\"changed_files\":[]}" },
  }));
  assert.equal(connection.agentTextForTurn("turn-1"), '{"summary":"done","changed_files":[]}');
});
