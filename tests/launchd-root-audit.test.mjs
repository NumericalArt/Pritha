import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const script = path.resolve("scripts/launchd-root-audit.mjs");

function writePlist(filePath, root) {
  writeFileSync(
    filePath,
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.techscope.web</string>
  <key>WorkingDirectory</key>
  <string>${root}</string>
  <key>StandardOutPath</key>
  <string>${root}/.logs/out.log</string>
</dict>
</plist>
`,
  );
}

function fakeLaunchctl(binDir, outputRoot) {
  const filePath = path.join(binDir, "launchctl");
  writeFileSync(
    filePath,
    `#!/bin/sh
if [ "$1" = "print" ]; then
  echo "working directory = ${outputRoot}"
  echo "stdout path = ${outputRoot}/.logs/out.log"
  exit 0
fi
echo "$@" >> "${binDir}/launchctl-actions.log"
exit 0
`,
  );
  chmodSync(filePath, 0o755);
}

test("launchd root audit detects loaded stale state after disk plist is fixed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-root-"));
  const agentDir = mkdtempSync(path.join(os.tmpdir(), "pritha-launchagents-"));
  const binDir = mkdtempSync(path.join(os.tmpdir(), "pritha-fake-bin-"));
  writePlist(path.join(agentDir, "com.techscope.web.plist"), root);
  fakeLaunchctl(binDir, "/Users/jkl/Techscope");

  const result = spawnSync("node", [script, "status", "--json"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      TECHSCOPE_ROOT: root,
      PRITHA_LAUNCHD_AGENT_DIR: agentDir,
      PRITHA_LAUNCHD_LABELS: "com.techscope.web",
      PRITHA_LAUNCHD_AUDIT_PLATFORM: "darwin",
    },
  });

  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.jobs[0].status, "disk-fixed-loaded-stale");
});

test("launchd root audit accepts fixed disk and loaded state", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-root-"));
  const agentDir = mkdtempSync(path.join(os.tmpdir(), "pritha-launchagents-"));
  const binDir = mkdtempSync(path.join(os.tmpdir(), "pritha-fake-bin-"));
  writePlist(path.join(agentDir, "com.techscope.web.plist"), root);
  fakeLaunchctl(binDir, root);

  const result = spawnSync("node", [script, "status", "--json"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      TECHSCOPE_ROOT: root,
      PRITHA_LAUNCHD_AGENT_DIR: agentDir,
      PRITHA_LAUNCHD_LABELS: "com.techscope.web",
      PRITHA_LAUNCHD_AUDIT_PLATFORM: "darwin",
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.jobs[0].status, "ok");
});

test("launchd reload retries bootstrap after bootout settles", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-root-"));
  const agentDir = mkdtempSync(path.join(os.tmpdir(), "pritha-launchagents-"));
  const binDir = mkdtempSync(path.join(os.tmpdir(), "pritha-fake-bin-"));
  const stateFile = path.join(binDir, "state.txt");
  const attemptsFile = path.join(binDir, "attempts.txt");
  writePlist(path.join(agentDir, "com.techscope.web.plist"), root);
  writeFileSync(stateFile, "stale");
  writeFileSync(attemptsFile, "0");
  const launchctl = path.join(binDir, "launchctl");
  writeFileSync(
    launchctl,
    `#!/bin/sh
state="$(cat "${stateFile}")"
if [ "$1" = "print" ]; then
  if [ "$state" = "not-loaded" ]; then
    echo "not loaded" >&2
    exit 113
  fi
  if [ "$state" = "ok" ]; then
    echo "working directory = ${root}"
    echo "stdout path = ${root}/.logs/out.log"
    exit 0
  fi
  echo "working directory = /Users/jkl/Techscope"
  echo "stdout path = /Users/jkl/Techscope/.logs/out.log"
  exit 0
fi
if [ "$1" = "bootout" ]; then
  echo "not-loaded" > "${stateFile}"
  exit 0
fi
if [ "$1" = "bootstrap" ]; then
  attempts="$(cat "${attemptsFile}")"
  attempts=$((attempts + 1))
  echo "$attempts" > "${attemptsFile}"
  if [ "$attempts" -eq 1 ]; then
    echo "Bootstrap failed: 5: Input/output error" >&2
    exit 5
  fi
  echo "ok" > "${stateFile}"
  exit 0
fi
exit 0
`,
  );
  chmodSync(launchctl, 0o755);

  const result = spawnSync("node", [script, "reload", "--yes", "--json"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      TECHSCOPE_ROOT: root,
      PRITHA_LAUNCHD_AGENT_DIR: agentDir,
      PRITHA_LAUNCHD_LABELS: "com.techscope.web",
      PRITHA_LAUNCHD_AUDIT_PLATFORM: "darwin",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.after.ok, true);
  assert.equal(payload.actions.find((action) => action.action === "bootstrap").attempt, 2);
});
