import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sourceRoot = path.resolve(import.meta.dirname, "..");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout || 30_000,
  });
}

function git(cwd, ...args) {
  const result = run("git", args, { cwd });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function makeFixture() {
  const fixture = path.join(os.tmpdir(), `pritha-update-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const checkout = path.join(fixture, "checkout");
  const remote = path.join(fixture, "origin.git");
  const remoteWork = path.join(fixture, "remote-work");
  const scripts = path.join(checkout, "scripts");
  const lib = path.join(scripts, "lib");
  mkdirSync(lib, { recursive: true });
  mkdirSync(path.join(checkout, "interfaces", "control-center", ".next"), { recursive: true });
  copyFileSync(path.join(sourceRoot, "scripts", "pritha-instance.mjs"), path.join(scripts, "pritha-instance.mjs"));
  writeFileSync(path.join(scripts, "control-center-runtime.mjs"), `
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const action = process.argv[2] || "status";
const stateRoot = process.env.PRITHA_STATE_ROOT;
const pidPath = path.join(stateRoot, "setup", "fixture-runtime.pid");
const readPid = () => existsSync(pidPath) ? Number(readFileSync(pidPath, "utf8")) : null;
if (action === "start") {
  mkdirSync(path.dirname(pidPath), { recursive: true });
  const codexChatRoot = path.join(stateRoot, "codex-chat");
  mkdirSync(codexChatRoot, { recursive: true });
  writeFileSync(path.join(codexChatRoot, "registry.audit.jsonl"), "fixture audit event\\n");
  const child = spawn("npm", ["--prefix", "interfaces/control-center", "run", "start"], {
    cwd: process.env.TECHSCOPE_ROOT,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  writeFileSync(pidPath, String(child.pid));
  console.log(JSON.stringify({ ok: true, action, started: true }));
} else if (action === "stop") {
  const pid = readPid();
  if (pid) { try { process.kill(pid, "SIGTERM"); } catch {} }
  rmSync(pidPath, { force: true });
  console.log(JSON.stringify({ ok: true, action, stopped: true }));
} else if (action === "status") {
  const pid = readPid();
  console.log(JSON.stringify({ ok: true, process: { wrapperPid: null, childPid: pid, processGroupId: pid } }));
} else {
  console.log(JSON.stringify({ ok: false, error: "unsupported" }));
  process.exitCode = 1;
}
`);
  copyFileSync(path.join(sourceRoot, "scripts", "lib", "env.mjs"), path.join(lib, "env.mjs"));
  copyFileSync(path.join(sourceRoot, "scripts", "lib", "paths.mjs"), path.join(lib, "paths.mjs"));
  writeFileSync(path.join(checkout, "interfaces", "control-center", ".next", "version"), "good\n");
  writeFileSync(path.join(checkout, "interfaces", "control-center", "next-env.d.ts"), "stable next env\n");
  writeFileSync(path.join(checkout, "interfaces", "control-center", "tsconfig.json"), "{}\n");
  writeFileSync(path.join(checkout, "README.md"), "base\n");
  writeFileSync(path.join(checkout, ".gitignore"), "node_modules/\n.next/\n.next-pritha-staging/\n.next-pritha-previous/\n");

  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Pritha Test");
  git(checkout, "config", "user.email", "pritha-test@example.invalid");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "base");
  git(fixture, "init", "--bare", remote);
  git(checkout, "remote", "add", "origin", remote);
  git(checkout, "push", "-u", "origin", "main");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");

  git(fixture, "clone", remote, remoteWork);
  git(remoteWork, "config", "user.name", "Pritha Test");
  git(remoteWork, "config", "user.email", "pritha-test@example.invalid");
  writeFileSync(path.join(remoteWork, "README.md"), "remote release\n");
  git(remoteWork, "add", "README.md");
  git(remoteWork, "commit", "-m", "remote release");
  git(remoteWork, "push", "origin", "main");

  const fakeBin = path.join(fixture, "bin");
  mkdirSync(fakeBin, { recursive: true });
  const fakeNpm = path.join(fakeBin, "npm");
  writeFileSync(fakeNpm, `#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const live = path.join(process.cwd(), "interfaces", "control-center", ".next");
const command = process.argv.slice(2).join(" ");
if (command.includes("run build")) {
  const target = path.join(process.cwd(), "interfaces", "control-center", process.env.PRITHA_CONTROL_CENTER_DIST_DIR || ".next");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "version"), (process.env.PRITHA_TEST_RELEASE_VERSION || "bad") + "\\n");
  fs.writeFileSync(path.join(process.cwd(), "interfaces", "control-center", "next-env.d.ts"), "generated next env\\n");
  fs.writeFileSync(path.join(process.cwd(), "interfaces", "control-center", "tsconfig.json"), "generated tsconfig\\n");
  process.exit(0);
}
if (command.includes("run start")) {
  const version = fs.readFileSync(path.join(live, "version"), "utf8").trim();
  if (version !== "good") process.exit(0);
  const port = Number(process.env.PRITHA_CONTROL_CENTER_PORT);
  http.createServer((request, response) => {
    response.writeHead(request.url === "/api/health" ? 200 : 404, { "content-type": "application/json" });
    response.end(JSON.stringify({
      schema: "pritha-control-center-health-v2",
      ok: request.url === "/api/health",
      service: "pritha-control-center",
      status: "ready",
      instance: { id: process.env.PRITHA_INSTANCE_ID, role: process.env.PRITHA_INSTANCE_ROLE, port },
      release: { commit: "fixture", buildId: version },
    }));
  }).listen(port, "127.0.0.1");
}
`);
  chmodSync(fakeNpm, 0o755);
  const fakeNode = path.join(fakeBin, "node");
  writeFileSync(fakeNode, `#!/bin/sh
case "$1" in
  scripts/env-doctor.mjs|scripts/validate-memory.mjs) exit 0 ;;
  scripts/rebuild-memory.mjs)
    mkdir -p "$PRITHA_STATE_ROOT/memory"
    : > "$PRITHA_STATE_ROOT/memory/techscope.sqlite"
    mkdir -p "$PRITHA_AGENT_PARENT/.codex"
    printf 'runtime changed during bootstrap\n' > "$PRITHA_AGENT_PARENT/.codex/runtime-state"
    if [ "$PRITHA_TEST_MUTATE_AGENT_STATE" = "1" ]; then
      printf 'mutated registry\\n' > "$PRITHA_STATE_ROOT/agents/registry.md"
    fi
    if [ "$PRITHA_TEST_FINDER_METADATA" = "1" ]; then
      printf 'Finder display metadata\\n' > "$PRITHA_STATE_ROOT/.DS_Store"
      printf 'Finder display metadata\\n' > "$PRITHA_AGENT_PARENT/FixtureChild/.DS_Store"
    fi
    exit 0
    ;;
esac
exec ${JSON.stringify(process.execPath)} "$@"
`);
  chmodSync(fakeNode, 0o755);
  const fakePython = path.join(fakeBin, "python3");
  writeFileSync(fakePython, "#!/bin/sh\nexit 0\n");
  chmodSync(fakePython, 0o755);
  const fakeSqlite = path.join(fakeBin, "sqlite3");
  writeFileSync(fakeSqlite, "#!/bin/sh\nprintf '1\\n'\n");
  chmodSync(fakeSqlite, 0o755);
  return { fixture, checkout, remoteWork, fakeBin };
}

function invoke(fixture, port, releaseVersion = "bad", expectedCommit = null, mutateAgentState = false, finderMetadata = false) {
  const stateRoot = path.join(fixture.fixture, "state");
  const agentParent = path.join(fixture.fixture, "agents");
  mkdirSync(agentParent, { recursive: true });
  mkdirSync(path.join(stateRoot, "agents"), { recursive: true });
  mkdirSync(path.join(agentParent, "FixtureChild"), { recursive: true });
  mkdirSync(path.join(agentParent, ".codex"), { recursive: true });
  if (!existsSync(path.join(stateRoot, "agents", "registry.md"))) writeFileSync(path.join(stateRoot, "agents", "registry.md"), "fixture registry\n");
  if (!existsSync(path.join(agentParent, "FixtureChild", "AGENTS.md"))) writeFileSync(path.join(agentParent, "FixtureChild", "AGENTS.md"), "# Fixture child\n");
  if (!existsSync(path.join(agentParent, "FixtureChild", "agent.mjs"))) writeFileSync(path.join(agentParent, "FixtureChild", "agent.mjs"), "export const ready = true;\n");
  if (!existsSync(path.join(agentParent, ".codex", "AGENTS.md"))) writeFileSync(path.join(agentParent, ".codex", "AGENTS.md"), "# Runtime metadata, not a child agent\n");
  writeFileSync(path.join(agentParent, ".codex", "runtime-state"), `${Date.now()}\n`);
  return run(process.execPath, [
    path.join(fixture.checkout, "scripts", "pritha-instance.mjs"),
    "update", "--apply", "--yes", ...(expectedCommit ? ["--expected-commit", expectedCommit] : []), "--json",
  ], {
    cwd: fixture.checkout,
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH || ""}`,
      TECHSCOPE_ROOT: fixture.checkout,
      PRITHA_STATE_ROOT: stateRoot,
      PRITHA_AGENT_PARENT: agentParent,
      PRITHA_INSTANCE_ID: "fixture",
      PRITHA_INSTANCE_ROLE: "replica",
      PRITHA_CONTROL_CENTER_PORT: String(port),
      PRITHA_TEST_RELEASE_VERSION: releaseVersion,
      PRITHA_TEST_MUTATE_AGENT_STATE: mutateAgentState ? "1" : "0",
      PRITHA_TEST_FINDER_METADATA: finderMetadata ? "1" : "0",
      PRITHA_UPDATE_HEALTH_TIMEOUT_MS: "1000",
      PRITHA_UPDATE_ROLLBACK_HEALTH_TIMEOUT_MS: "3000",
    },
  });
}

test("instance update blocks dirty/diverged trees and restores the previous build after a failed healthcheck", async () => {
  const fixture = makeFixture();
  const port = await freePort();
  let rollbackPid = null;
  try {
    writeFileSync(path.join(fixture.checkout, "dirty.txt"), "dirty\n");
    const dirty = invoke(fixture, port);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stdout, /uncommitted or untracked changes/);
    rmSync(path.join(fixture.checkout, "dirty.txt"));

    const rollback = invoke(fixture, port);
    assert.equal(rollback.status, 1, rollback.stderr || rollback.stdout);
    const payload = JSON.parse(rollback.stdout);
    assert.equal(payload.status, "health-failed-rolled-back");
    assert.equal(payload.rollbackHealth.ok, true);
    assert.equal(readFileSync(path.join(fixture.checkout, "interfaces", "control-center", ".next", "version"), "utf8"), "good\n");
    assert.equal(readFileSync(path.join(fixture.checkout, "interfaces", "control-center", "next-env.d.ts"), "utf8"), "stable next env\n");
    assert.equal(readFileSync(path.join(fixture.checkout, "interfaces", "control-center", "tsconfig.json"), "utf8"), "{}\n");
    assert.equal(readFileSync(path.join(fixture.fixture, "state", "agents", "registry.md"), "utf8"), "fixture registry\n");
    assert.equal(readFileSync(path.join(fixture.fixture, "agents", "FixtureChild", "agent.mjs"), "utf8"), "export const ready = true;\n");
    const release = JSON.parse(readFileSync(payload.manifest, "utf8"));
    assert.equal(release.schema, "pritha-instance-release-v2");
    assert.equal(release.bootstrap.ok, true);
    assert.equal(release.bootstrap.memory_documents, 1);
    assert.equal(release.pre_isolation.agent_state.sha256, release.after_bootstrap_isolation.agent_state.sha256);
    assert.equal(release.pre_isolation.protected_state.sha256, release.after_bootstrap_isolation.protected_state.sha256);
    assert.equal(statSync(payload.manifest).mode & 0o777, 0o600);
    rollbackPid = payload.rollbackPid;
    assert.ok(Number.isInteger(rollbackPid));
    process.kill(rollbackPid, "SIGTERM");
    rollbackPid = null;

    writeFileSync(path.join(fixture.checkout, "local.txt"), "local\n");
    git(fixture.checkout, "add", "local.txt");
    git(fixture.checkout, "commit", "-m", "local divergence");
    writeFileSync(path.join(fixture.remoteWork, "remote.txt"), "remote\n");
    git(fixture.remoteWork, "add", "remote.txt");
    git(fixture.remoteWork, "commit", "-m", "remote divergence");
    git(fixture.remoteWork, "push", "origin", "main");

    const diverged = invoke(fixture, port);
    assert.equal(diverged.status, 1);
    assert.match(diverged.stdout, /diverged or cannot fast-forward/);
  } finally {
    if (rollbackPid) {
      try { process.kill(rollbackPid, "SIGTERM"); } catch { /* already stopped */ }
    }
    rmSync(fixture.fixture, { recursive: true, force: true });
  }
});

test("instance update pins the target and preserves agent fingerprints through a successful release", async () => {
  const fixture = makeFixture();
  const port = await freePort();
  let pid = null;
  try {
    const target = git(fixture.remoteWork, "rev-parse", "HEAD");
    const deployed = invoke(fixture, port, "good", target, false, true);
    assert.equal(deployed.status, 0, deployed.stderr || deployed.stdout);
    const payload = JSON.parse(deployed.stdout);
    assert.equal(payload.status, "deployed");
    assert.equal(payload.finalHead, target);
    assert.equal(payload.finalGitClean, true);
    assert.equal(payload.health.ok, true);
    assert.equal(payload.isolationMatch, true);
    assert.equal(payload.memoryDocuments, 1);
    assert.equal(payload.pre_isolation.agent_state.sha256, payload.postIsolation.agent_state.sha256);
    assert.equal(payload.pre_isolation.protected_state.sha256, payload.postIsolation.protected_state.sha256);
    assert.deepEqual(payload.postIsolation.protected_state.ignored_regular_files, [".DS_Store"]);
    assert.equal(readFileSync(path.join(fixture.fixture, "state", ".DS_Store"), "utf8"), "Finder display metadata\n");
    assert.equal(readFileSync(path.join(fixture.fixture, "agents", "FixtureChild", ".DS_Store"), "utf8"), "Finder display metadata\n");
    assert.equal(readFileSync(path.join(fixture.fixture, "state", "agents", "registry.md"), "utf8"), "fixture registry\n");
    assert.equal(readFileSync(path.join(fixture.fixture, "agents", "FixtureChild", "agent.mjs"), "utf8"), "export const ready = true;\n");
    pid = payload.pid;
    process.kill(pid, "SIGTERM");
    pid = null;
  } finally {
    if (pid) {
      try { process.kill(pid, "SIGTERM"); } catch { /* already stopped */ }
    }
    rmSync(fixture.fixture, { recursive: true, force: true });
  }
});

test("instance update stops before the UI swap when bootstrap changes local agent state", async () => {
  const fixture = makeFixture();
  const port = await freePort();
  try {
    const target = git(fixture.remoteWork, "rev-parse", "HEAD");
    const result = invoke(fixture, port, "good", target, true);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, "instance-isolation-changed");
    assert.equal(payload.isolationMatch, false);
    assert.equal(readFileSync(path.join(fixture.checkout, "interfaces", "control-center", ".next", "version"), "utf8"), "good\n");
  } finally {
    rmSync(fixture.fixture, { recursive: true, force: true });
  }
});

test("Finder exception protects other dotfiles and similarly named directories or symlinks", async () => {
  const fixture = makeFixture();
  const state = path.join(fixture.fixture, "state");
  const agents = path.join(fixture.fixture, "agents");
  mkdirSync(state);
  mkdirSync(agents);
  const port = await freePort();
  const snapshot = () => {
    const result = run(process.execPath, [path.join(fixture.checkout, "scripts/pritha-instance.mjs"), "status", "--json"], {
      cwd: fixture.checkout,
      env: { ...process.env, TECHSCOPE_ROOT: fixture.checkout, PRITHA_STATE_ROOT: state, PRITHA_AGENT_PARENT: agents, PRITHA_INSTANCE_ID: "fixture", PRITHA_CONTROL_CENTER_PORT: String(port) },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout).isolation.protected_state.sha256;
  };
  try {
    const empty = snapshot();
    const metadata = path.join(state, ".DS_Store");
    writeFileSync(metadata, "Finder");
    assert.equal(snapshot(), empty);
    writeFileSync(path.join(state, ".operator-state"), "private setting");
    const protectedFile = snapshot();
    assert.notEqual(protectedFile, empty);
    rmSync(metadata);
    symlinkSync("first", metadata);
    const firstLink = snapshot();
    assert.notEqual(firstLink, protectedFile);
    rmSync(metadata);
    symlinkSync("second", metadata);
    assert.notEqual(snapshot(), firstLink);
    rmSync(metadata);
    mkdirSync(metadata);
    writeFileSync(path.join(metadata, "settings.json"), "{}");
    assert.notEqual(snapshot(), protectedFile);
  } finally { rmSync(fixture.fixture, { recursive: true, force: true }); }
});

test("instance update gives post-start health more time than read-only status probes", () => {
  const source = readFileSync(path.join(sourceRoot, "scripts", "pritha-instance.mjs"), "utf8");
  assert.match(source, /AbortSignal\.timeout\(Number\(options\.timeoutMs \|\| 2_000\)\)/);
  assert.match(source, /PRITHA_UPDATE_HEALTH_REQUEST_TIMEOUT_MS \|\| 8_000/);
  assert.match(source, /httpStatus\(\{ requireIdentity: true, timeoutMs: requestTimeoutMs \}\)/);
});
