import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

function moduleUrl(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

const probeSource = readFileSync("interfaces/control-center/src/lib/control-center/sync-probe.ts", "utf8");
const probeUrl = moduleUrl(probeSource);
const { runSyncProbe } = await import(probeUrl);
const serverSource = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");
const serverTree = ts.createSourceFile("server.ts", serverSource, ts.ScriptTarget.Latest, true);

function serverFunction(name) {
  const declaration = serverTree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Missing server function: ${name}`);
  return declaration;
}

function isolatedProbe(code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    // This deadline lives outside spawnSync's blocked event loop. On failure it
    // stops only the process group created by this test, including its fixture.
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") reject(error);
      }
    }, 5_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, timedOut });
    });
  });
}

test("sync probes terminate a SIGTERM-ignoring command and report the timeout", async () => {
  const fixture = "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);";
  const checked = await isolatedProbe(`
    import { runSyncProbe } from ${JSON.stringify(probeUrl)};
    const start = Date.now();
    const result = runSyncProbe(process.execPath, ['-e', ${JSON.stringify(fixture)}], { timeout: 500 });
    console.log(JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.code, stdout: result.stdout, elapsed: Date.now() - start }));
  `);
  assert.equal(checked.timedOut, false, "Probe exceeded the independent 5-second deadline");
  assert.equal(checked.status, 0, checked.stderr);
  const result = JSON.parse(checked.stdout);
  assert.match(result.stdout, /ready/, "Fixture must install the signal handler before timeout");
  assert.equal(result.status, null);
  assert.equal(result.signal, "SIGKILL");
  assert.equal(result.error, "ETIMEDOUT");
  assert.ok(result.elapsed >= 400 && result.elapsed < 3_000, `Unexpected timeout duration: ${result.elapsed}ms`);
});

test("sync probes preserve argv, cwd, environment, output and nonzero exit codes", () => {
  const cwd = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-probe-cwd-")));
  try {
    const argument = "literal ; $(no-shell) argument";
    const result = runSyncProbe(process.execPath, ["-e", "console.log(JSON.stringify({ cwd: process.cwd(), value: process.env.PRITHA_TEST_PROBE, argument: process.argv[1] })); console.error('diagnostic'); process.exitCode = 7;", argument], {
      cwd, env: { ...process.env, PRITHA_TEST_PROBE: "fixture" }, timeout: 2_000,
    });
    assert.equal(result.status, 7);
    assert.equal(result.error, undefined);
    assert.deepEqual(JSON.parse(result.stdout), { cwd, value: "fixture", argument });
    assert.equal(result.stderr.trim(), "diagnostic");
    const missing = runSyncProbe(path.join(cwd, "missing-executable"), [], { timeout: 500 });
    assert.equal(missing.status, null);
    assert.equal(missing.error.code, "ENOENT");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("sync probes cannot disable the timeout with invalid options", () => {
  for (const timeout of [undefined, 0, -1, 0.5, NaN, Infinity]) {
    assert.throws(() => runSyncProbe(process.execPath, ["-e", "process.exit(0)"], { timeout }), RangeError);
  }
});

test("all status diagnostics use the bounded asynchronous helper; service actions remain separate", () => {
  const names = ["tailscaleSelfDnsName", "tailscaleServeStatusOutput", "tailscaleServeStatusJson", "sqliteMemoryStats", "launchdRootWarnings", "launchdRuntimeState", "screenSessionRunning"];
  for (const name of names) {
    const calls = [];
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push(node.expression.text);
      ts.forEachChild(node, visit);
    };
    visit(serverFunction(name));
    assert.ok(calls.includes("runAsyncProbe"), `${name} must use the bounded probe policy`);
    assert.ok(!calls.includes("spawnSync"), `${name} must not bypass the bounded probe policy`);
  }
  // The remaining raw spawnSync executes an operator-authorized service action.
  const rawCalls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "spawnSync") rawCalls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(serverTree);
  assert.equal(rawCalls.length, 1);
  assert.equal(rawCalls[0].arguments[0].getText(serverTree), "argv[0]");
});

test("partial diagnostic output after timeout cannot report a healthy audit or running screen", async () => {
  for (const error of [undefined, { code: "ETIMEDOUT" }, { code: "ENOENT" }]) {
    const response = { status: error ? null : 0, stdout: '{"ok":true}\n42.fixture\n', stderr: "", error };
    const screen = await import(moduleUrl(`
      const runAsyncProbe = async () => (${JSON.stringify(response)});
      export ${serverFunction("screenSessionRunning").getText(serverTree)}
    `));
    assert.equal(await screen.screenSessionRunning("fixture"), !error);

    response.stdout = '{"ok":true}';
    const audit = await import(moduleUrl(`
      import path from 'node:path';
      import assert from 'node:assert/strict';
      const runAsyncProbe = async (_command, _args, options) => {
        assert.equal(options.policy, 'runtimeRead', 'page diagnostics must not inherit the full operator audit deadline');
        return (${JSON.stringify(response)});
      };
      export ${serverFunction("launchdRootWarnings").getText(serverTree)}
    `));
    const warnings = await audit.launchdRootWarnings("fixture-root");
    if (error) assert.match(warnings[0], /audit unavailable: probe (timed out|failed)/);
    else assert.deepEqual(warnings, []);
  }
});
