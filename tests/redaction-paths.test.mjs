import assert from "node:assert/strict";
import test from "node:test";
import { redactFilesystemPaths } from "../scripts/lib/redaction.mjs";

test("tracked report redaction replaces known roots and user-specific paths", () => {
  const text = [
    "project=/Users/alice/Agents/report-agent/out/result.md",
    "state=/Users/alice/.local/state/pritha/builds/run-1",
    "root=/Users/alice/Pritha/scripts/pritha.mjs",
    "temp=/private/var/folders/ab/cd/T/worktree/file.txt",
    "relative=tests/fixture.md",
  ].join("\n");
  const redacted = redactFilesystemPaths(text, {
    homeDir: "/Users/alice",
    root: "/Users/alice/Pritha",
    stateRoot: "/Users/alice/.local/state/pritha",
    projectRoot: "/Users/alice/Agents/report-agent",
  });

  assert.doesNotMatch(redacted, /\/Users\/alice|\/private\/var\/folders/);
  assert.match(redacted, /<PROJECT_ROOT>\/out\/result\.md/);
  assert.match(redacted, /<PRITHA_STATE_ROOT>\/builds\/run-1/);
  assert.match(redacted, /<TECHSCOPE_ROOT>\/scripts\/pritha\.mjs/);
  assert.match(redacted, /relative=tests\/fixture\.md/);
});

test("path redaction keeps secret redaction active", () => {
  const value = redactFilesystemPaths("/Users/alice/file token=ghp_abcdefghijklmnopqrstuvwxyz123456", { homeDir: "/Users/alice" });
  assert.doesNotMatch(value, /ghp_|\/Users\/alice/);
});
