import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function text(path) {
  return readFileSync(path, "utf8");
}

test("public install docs use bootstrap as the fresh-clone entrypoint", () => {
  const publicDocs = [
    "README.md",
    "docs/getting-started.md",
    "docs/prerequisites.md",
    "docs/troubleshooting.md",
    "interfaces/control-center/README.md",
  ];
  for (const file of publicDocs) {
    const body = text(file);
    assert.match(body, /bootstrap\.mjs/, `${file} should mention bootstrap`);
  }

  const freshCloneDocs = [
    "README.md",
    "docs/getting-started.md",
    "docs/github-publish-and-push.md",
  ];
  for (const file of freshCloneDocs) {
    const body = text(file);
    assert.doesNotMatch(body, /cp \.env\.example \.env/, `${file} should not require copying .env for fresh clone`);
    assert.doesNotMatch(body, /setup\.mjs --non-interactive/, `${file} should not use setup.mjs as the fresh-clone path`);
  }
});

test("README defines Pritha as a universal trainable child-agent creator", () => {
  const body = text("README.md");
  assert.match(body, /universal, trainable agent/i);
  assert.match(body, /Improve its own knowledge base, tools and agent-creation capabilities/);
  assert.match(body, /Create new child agents and improve existing child agents/);
  assert.match(body, /does not install\s+launchd, cron, Tailscale, durable services or credentials/);
});
