import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { workspaceRevision, workspaceRevisionMatches } from "../scripts/agents-mother/workspace-revision.mjs";

test("non-Git workspace revision changes with authored content", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-directory-revision-"));
  mkdirSync(path.join(root, "docs"));
  writeFileSync(path.join(root, "docs", "result.md"), "first\n");
  const first = workspaceRevision(root);
  writeFileSync(path.join(root, "docs", "result.md"), "second\n");
  const second = workspaceRevision(root);

  assert.equal(first.kind, "directory");
  assert.notEqual(first.token, second.token);
  assert.equal(workspaceRevisionMatches(first, second), false);
});

test("unborn Git repository uses a directory revision without requiring a commit", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-unborn-git-revision-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  writeFileSync(path.join(root, "README.md"), "first\n");
  const first = workspaceRevision(root);
  writeFileSync(path.join(root, "README.md"), "second\n");
  const second = workspaceRevision(root);

  assert.equal(first.kind, "directory");
  assert.equal(first.head, null);
  assert.notEqual(first.token, second.token);
  assert.equal(workspaceRevisionMatches(first, second), false);
});

test("Git workspace revision binds HEAD, tracked diff and untracked content", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-git-revision-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  writeFileSync(path.join(root, "README.md"), "base\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Pritha Test", "-c", "user.email=pritha-test@local", "commit", "-m", "base"], { cwd: root, stdio: "ignore" });

  const clean = workspaceRevision(root);
  writeFileSync(path.join(root, "README.md"), "changed\n");
  const tracked = workspaceRevision(root);
  writeFileSync(path.join(root, "new.txt"), "untracked one\n");
  const untrackedOne = workspaceRevision(root);
  writeFileSync(path.join(root, "new.txt"), "untracked two\n");
  const untrackedTwo = workspaceRevision(root);

  assert.equal(clean.kind, "git");
  assert.equal(clean.dirty, false);
  assert.equal(tracked.dirty, true);
  assert.notEqual(clean.token, tracked.token);
  assert.notEqual(tracked.token, untrackedOne.token);
  assert.notEqual(untrackedOne.token, untrackedTwo.token);
  assert.doesNotMatch(JSON.stringify(untrackedTwo), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("strict revisions reject partial coverage rather than treating unseen content as verified", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-complete-revision-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "one.txt"), "large enough\n");
  writeFileSync(path.join(root, "two.txt"), "second\n");
  assert.throws(() => workspaceRevision(root, { requireComplete: true, maxEntries: 1 }), /complete directory coverage/);
  assert.throws(() => workspaceRevision(root, { requireComplete: true, maxFileBytes: 2 }), /complete file coverage/);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["add", "one.txt"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Pritha Test", "-c", "user.email=pritha-test@local", "commit", "-m", "fixture"], { cwd: root, stdio: "ignore" });
  assert.throws(() => workspaceRevision(root, { requireComplete: true, maxUntracked: 0 }), /complete untracked coverage/);
  execFileSync("git", ["update-index", "--assume-unchanged", "one.txt"], { cwd: root });
  writeFileSync(path.join(root, "one.txt"), "hidden change\n");
  assert.throws(() => workspaceRevision(root, { requireComplete: true }), /index hides file changes/);
});

test("revision reads never execute repository-controlled fsmonitor or textconv programs", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-safe-revision-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  const script = path.join(root, "unsafe-helper.sh");
  writeFileSync(script, "#!/bin/sh\ntouch helper-executed\ncat\n"); chmodSync(script, 0o755);
  writeFileSync(path.join(root, "result.dat"), "initial\n");
  writeFileSync(path.join(root, ".gitattributes"), "*.dat diff=unsafe\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Pritha Test", "-c", "user.email=pritha-test@local", "commit", "-m", "fixture"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "core.fsmonitor", script], { cwd: root });
  execFileSync("git", ["config", "diff.unsafe.textconv", script], { cwd: root });
  writeFileSync(path.join(root, "result.dat"), "changed\n");
  assert.equal(workspaceRevision(root, { requireComplete: true }).dirty, true);
  assert.equal(existsSync(path.join(root, "helper-executed")), false);
});
