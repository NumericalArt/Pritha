import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeLifecycleReport } from "../scripts/agents-mother/lifecycle-report.mjs";

test("lifecycle writer redacts secrets and filesystem paths before durable write and keeps ids unique", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pritha-lifecycle-writer-"));
  const basePath = path.join(directory, "2026-08-22-fixture-agent-test-report.md");
  const context = {
    projectRoot: "/workspace/fixture-project",
    stateRoot: "/srv/pritha-state/fixture",
    root: "/workspace/Pritha",
    homeDir: "/home/fixture-user",
  };
  const render = ({ artifactId }) => `---
id: ${artifactId}
type: agent-test-report
status: complete
---

Project: /workspace/fixture-project
State: /srv/pritha-state/fixture
Pritha: /workspace/Pritha
Home: /home/fixture-user
Temp: /tmp/fixture-secret/output.log
API_KEY=fixture-secret-value
`;
  try {
    const first = writeLifecycleReport(basePath, render, context);
    const second = writeLifecycleReport(basePath, render, context);
    for (const written of [first, second]) {
      const text = readFileSync(written.path, "utf8");
      assert.equal(path.basename(written.path, ".md"), written.artifactId);
      assert.match(text, new RegExp(`^id: ${written.artifactId}$`, "m"));
      assert.match(text, /<PROJECT_ROOT>/);
      assert.match(text, /<PRITHA_STATE_ROOT>/);
      assert.match(text, /<TECHSCOPE_ROOT>/);
      assert.match(text, /<USER_HOME>/);
      assert.match(text, /<TEMP_PATH>/);
      assert.match(text, /API_KEY=\[REDACTED\]/);
      assert.doesNotMatch(text, /fixture-secret-value|\/workspace\/fixture-project|\/srv\/pritha-state|\/home\/fixture-user|\/tmp\/fixture-secret/);
    }
    assert.equal(second.revision, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("every durable lifecycle report surface uses the shared final writer", () => {
  const files = [
    "scripts/agents-mother/scaffold/index.mjs",
    "scripts/agents-mother/test.mjs",
    "scripts/agents-mother/handoff.mjs",
    "scripts/agents-mother/operations.mjs",
    "scripts/agents-mother/registry.mjs",
    "scripts/agents-mother/delivery-loop.mjs",
  ];
  for (const file of files) {
    const source = readFileSync(path.resolve(file), "utf8");
    assert.match(source, /writeLifecycleReport\(/, `${file} must use the shared lifecycle writer`);
  }
});
