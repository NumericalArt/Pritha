import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
    response.end(JSON.stringify({ ok: request.url === "/api/health" }));
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
    if [ "$PRITHA_TEST_MUTATE_AGENT_STATE" = "1" ]; then
      printf 'mutated registry\\n' > "$PRITHA_STATE_ROOT/agents/registry.md"
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

function invoke(fixture, port, releaseVersion = "bad", expectedCommit = null, mutateAgentState = false) {
  const stateRoot = path.join(fixture.fixture, "state");
  const agentParent = path.join(fixture.fixture, "agents");
  mkdirSync(agentParent, { recursive: true });
  mkdirSync(path.join(stateRoot, "agents"), { recursive: true });
  mkdirSync(path.join(agentParent, "FixtureChild"), { recursive: true });
  if (!existsSync(path.join(stateRoot, "agents", "registry.md"))) writeFileSync(path.join(stateRoot, "agents", "registry.md"), "fixture registry\n");
  if (!existsSync(path.join(agentParent, "FixtureChild", "AGENTS.md"))) writeFileSync(path.join(agentParent, "FixtureChild", "AGENTS.md"), "# Fixture child\n");
  if (!existsSync(path.join(agentParent, "FixtureChild", "agent.mjs"))) writeFileSync(path.join(agentParent, "FixtureChild", "agent.mjs"), "export const ready = true;\n");
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
    const deployed = invoke(fixture, port, "good", target);
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
