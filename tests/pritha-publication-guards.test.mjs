import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const promoteScript = path.resolve("scripts/pritha-promote.mjs");
const auditScript = path.resolve("scripts/pre-push-audit.mjs");

function write(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL", ...options });
}

function git(cwd, args) {
  const result = run("git", args, { cwd });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function publicationFixture() {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-publication-base-"));
  const root = path.join(base, "Pritha");
  mkdirSync(root);
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "fixture@example.com"]);
  git(root, ["config", "user.name", "Fixture"]);
  write(path.join(root, ".memory", "README.md"), "# Memory\n");
  write(path.join(root, ".memory", "schema.sql"), "CREATE TABLE fixture(id TEXT);\n");
  write(path.join(root, "11_agents", "contracts", "historical.md"), "---\nid: historical\ntype: agent-contract\n---\n\n# Historical\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);
  return { base, root, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function audit(root, extraEnv = {}) {
  const result = run(process.execPath, [auditScript, "--json"], {
    env: { ...process.env, TECHSCOPE_ROOT: root, ...extraEnv },
  });
  assert.equal(result.error, undefined, result.error?.message);
  const payload = JSON.parse(result.stdout);
  return { result, payload, guard: payload.checks.find((check) => check.id === "instance-local-child-agent-publication") };
}

function assertUnknownBase(audited) {
  assert.equal(audited.result.status, 1);
  assert.equal(audited.payload.status, "fail");
  assert.equal(audited.guard.status, "fail");
  assert.match(audited.guard.detail, /merge-base.*HEAD.*origin\/main/);
  assert.doesNotMatch(audited.guard.detail, /no new, modified/);
}

test("pre-push audit fails closed without origin/main and still runs privacy checks", () => {
  const fixture = publicationFixture();
  try {
    assertUnknownBase(audit(fixture.root));
    write(path.join(fixture.root, ".env"), "FIXTURE_SETTING=example\n");
    git(fixture.root, ["add", ".env"]);
    const audited = audit(fixture.root);
    assertUnknownBase(audited);
    assert.equal(audited.payload.checks.find((check) => check.id === "forbidden-tracked-files").status, "fail");
  } finally {
    fixture.cleanup();
  }
});

test("pre-push audit fails closed for unrelated histories", () => {
  const fixture = publicationFixture();
  try {
    const tree = git(fixture.root, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
    const unrelated = git(fixture.root, ["commit-tree", tree, "-m", "independent root"]).stdout.trim();
    git(fixture.root, ["update-ref", "refs/remotes/origin/main", unrelated]);
    assertUnknownBase(audit(fixture.root));
  } finally {
    fixture.cleanup();
  }
});

test("pre-push audit fails closed when shallow history hides the common ancestor", () => {
  const fixture = publicationFixture();
  try {
    git(fixture.root, ["checkout", "-b", "candidate"]);
    write(path.join(fixture.root, "candidate.txt"), "candidate\n");
    git(fixture.root, ["add", "."]);
    git(fixture.root, ["commit", "-m", "candidate"]);
    git(fixture.root, ["checkout", "main"]);
    write(path.join(fixture.root, "main.txt"), "main\n");
    git(fixture.root, ["add", "."]);
    git(fixture.root, ["commit", "-m", "main advanced"]);
    const shallow = path.join(fixture.base, "shallow");
    git(fixture.base, ["clone", "--depth", "1", "--branch", "candidate", pathToFileURL(fixture.root).href, shallow]);
    git(shallow, ["fetch", "--depth", "1", "origin", "main:refs/remotes/origin/main"]);
    assert.equal(git(shallow, ["rev-parse", "--is-shallow-repository"]).stdout.trim(), "true");
    assertUnknownBase(audit(shallow));
  } finally {
    fixture.cleanup();
  }
});

test("pre-push audit rejects failed, empty or malformed merge-base output", () => {
  const fixture = publicationFixture();
  try {
    git(fixture.root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    const shimDir = path.join(fixture.base, "bin");
    const realGit = run("sh", ["-c", "command -v git"]).stdout.trim();
    assert.ok(path.isAbsolute(realGit));
    const shim = path.join(shimDir, "git");
    write(shim, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'merge-base') {
  if (process.env.PRITHA_TEST_GIT_MODE === 'failed') process.exit(128);
  if (process.env.PRITHA_TEST_GIT_MODE === 'malformed') process.stdout.write('not-a-commit\\n');
  process.exit(0);
}
const result = spawnSync(process.env.PRITHA_TEST_REAL_GIT, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`);
    chmodSync(shim, 0o755);
    for (const mode of ["failed", "empty", "malformed"]) {
      assertUnknownBase(audit(fixture.root, {
        PATH: `${shimDir}${path.delimiter}${process.env.PATH || ""}`,
        PRITHA_TEST_REAL_GIT: realGit,
        PRITHA_TEST_GIT_MODE: mode,
      }));
    }
  } finally {
    fixture.cleanup();
  }
});

test("pre-push audit permits a known base and rejects untracked and deleted child artifacts", () => {
  const fixture = publicationFixture();
  try {
    git(fixture.root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    write(path.join(fixture.root, "03_reviews", "portable.md"), "---\nid: portable\ntype: assessment\n---\n\n# Portable\n");
    git(fixture.root, ["add", "03_reviews"]);
    const clean = audit(fixture.root);
    assert.equal(clean.result.status, 0);
    assert.equal(clean.guard.status, "pass");

    const added = path.join(fixture.root, "11_agents", "contracts", "new.md");
    write(added, "---\nid: new\ntype: agent-contract\n---\n\n# New\n");
    const untracked = audit(fixture.root);
    assert.equal(untracked.result.status, 1);
    assert.equal(untracked.guard.status, "fail");
    assert.match(untracked.guard.detail, /contracts\/new\.md/);
    rmSync(added);

    rmSync(path.join(fixture.root, "11_agents", "contracts", "historical.md"));
    const deleted = audit(fixture.root);
    assert.equal(deleted.result.status, 1);
    assert.equal(deleted.guard.status, "fail");
    assert.match(deleted.guard.detail, /contracts\/historical\.md/);
  } finally {
    fixture.cleanup();
  }
});

test("promotion rejects child-agent lifecycle documents and permits a separately authored assessment", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-promotion-guard-"));
  const root = path.join(base, "Pritha");
  const stateRoot = path.join(base, "state");
  const env = { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot };
  try {
    write(path.join(root, "README.md"), "# Fixture\n");
    write(path.join(stateRoot, "agents", "contracts", "fixture-agent.md"), `---\nid: fixture-agent\ntype: agent-contract\nstatus: accepted\nsubject:\n  kind: child-agent\n  id: fixture-agent\n---\n\n# Fixture agent\n`);
    const blocked = run("node", [promoteScript, "apply", "--source", "contracts/fixture-agent.md", "--target", "11_agents/contracts/fixture-agent.md", "--yes"], { env });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /child-agent lifecycle artifacts are instance-local/);
    assert.equal(existsSync(path.join(root, "11_agents", "contracts", "fixture-agent.md")), false);

    write(path.join(stateRoot, "agents", "reviews", "portable-assessment.md"), `---\nid: portable-assessment\ntype: assessment\nstatus: draft\n---\n\n# Anonymized assessment\n`);
    const allowed = run("node", [promoteScript, "apply", "--source", "reviews/portable-assessment.md", "--target", "03_reviews/portable-assessment.md", "--yes"], { env });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(readFileSync(path.join(root, "03_reviews", "portable-assessment.md"), "utf8"), /Anonymized assessment/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pre-push audit rejects modifications to historical child-agent lifecycle artifacts", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-pre-push-agent-guard-"));
  const root = path.join(base, "Pritha");
  const origin = path.join(base, "origin.git");
  try {
    mkdirSync(root, { recursive: true });
    git(base, ["init", "--bare", origin]);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "fixture@example.com"]);
    git(root, ["config", "user.name", "Fixture"]);
    write(path.join(root, ".memory", "README.md"), "# Memory\n");
    write(path.join(root, ".memory", "schema.sql"), "CREATE TABLE fixture(id TEXT);\n");
    write(path.join(root, "11_agents", "contracts", "historical-agent.md"), `---\nid: historical-agent\ntype: agent-contract\nstatus: accepted\nsubject:\n  kind: child-agent\n  id: historical-agent\n---\n\n# Historical agent\n`);
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "baseline"]);
    git(root, ["remote", "add", "origin", origin]);
    git(root, ["push", "-u", "origin", "main"]);
    write(path.join(root, "11_agents", "contracts", "historical-agent.md"), `---\nid: historical-agent\ntype: agent-contract\nstatus: accepted\nsubject:\n  kind: child-agent\n  id: historical-agent\n---\n\n# Modified historical agent\n`);

    const audited = run("node", [auditScript, "--json"], { env: { ...process.env, TECHSCOPE_ROOT: root } });
    assert.notEqual(audited.status, 0);
    const payload = JSON.parse(audited.stdout);
    const guard = payload.checks.find((check) => check.id === "instance-local-child-agent-publication");
    assert.equal(guard.status, "fail");
    assert.match(guard.detail, /11_agents\/contracts\/historical-agent\.md/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
