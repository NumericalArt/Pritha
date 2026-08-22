import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function text(filePath) {
  return readFileSync(filePath, "utf8");
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

test("README presents the Codex-first core before optional operator surfaces", () => {
  const body = text("README.md");
  const startPosition = body.indexOf("## Start In Codex");
  const optionalPosition = body.indexOf("## Optional Control Center And Voice");

  assert.match(body, /local-first, Codex-native agent foundry and knowledge OS/i);
  assert.match(body, /primary workbench is a Codex task/i);
  assert.match(body, /Set up and start Pritha\./);
  assert.match(body, /bootstrap\.mjs prepare --profile local/);
  assert.ok(startPosition >= 0 && optionalPosition > startPosition, "Codex start should precede the optional UI section");
  assert.doesNotMatch(body, /local-first, voice-first Control Center/i);
});

test("public docs describe Control Center and integrated Voice as active, functional, and optional", () => {
  const readme = text("README.md");
  const gettingStarted = text("docs/getting-started.md");
  const architecture = text("docs/architecture.md");

  assert.match(readme, /active, functional operator surfaces/i);
  assert.match(readme, /they are optional/i);
  assert.match(gettingStarted, /active, functional\s+operator surfaces/i);
  assert.match(architecture, /active,\s+functional operator layer/i);
  assert.match(readme, /does not\s+install launchd, cron, Tailscale, credentials, or a durable service/i);
});

test("interface manifests distinguish current Control Center and integrated Voice from legacy Voice", () => {
  const interfaces = JSON.parse(text("interfaces/manifest.json"));
  const controlCenterManifest = JSON.parse(text("interfaces/control-center/manifest.json"));
  const controlCenter = interfaces.adapters.find((adapter) => adapter.name === "pritha-control-center");
  const legacyVoice = interfaces.adapters.find((adapter) => adapter.name === "pritha-voice-control");

  assert.equal(interfaces.primary_interface, "Codex project");
  assert.equal(controlCenter?.status, "active");
  assert.equal(controlCenterManifest.status, "active");
  assert.equal(legacyVoice?.status, "deprecated");
  assert.equal(legacyVoice?.replaced_by, "pritha-control-center");
  assert.equal(legacyVoice?.replacement_url, "http://127.0.0.1:3420/voice");
});

test("README.ru points to the canonical public README instead of duplicating stale claims", () => {
  const body = text("README.ru.md");
  assert.match(body, /\[канонический README\]\(README\.md\)/);
  assert.doesNotMatch(body, /^---$/m);
  assert.doesNotMatch(body, /# Artifact:/);
  assert.doesNotMatch(body, /agents-mother\.mjs/);
});

test("canonical public docs explain outcome delivery, Goals, cleanup and instance isolation", () => {
  const readme = text("README.md");
  const gettingStarted = text("docs/getting-started.md");
  const architecture = text("docs/architecture.md");
  const canonical = `${readme}\n${gettingStarted}\n${architecture}`;

  assert.match(readme, /outcome init → outcome approve → deliver → delivery accept/);
  assert.match(canonical, /separately approved Outcome Spec/i);
  assert.match(canonical, /verified.*distinct.*accepted/is);
  assert.match(canonical, /disposable.*worktree/is);
  assert.match(canonical, /typed blocker/i);
  assert.match(canonical, /1,000,000/);
  assert.match(canonical, /Goal/i);
  assert.match(canonical, /local Trial backend.*not.*sandbox/is);
  assert.match(canonical, /instance-local/i);
  assert.match(canonical, /not.*copied.*Pritha instances/is);
  assert.match(gettingStarted, /delivery cleanup <run-id> --apply --yes/);
});

test("local Markdown links in the public packaging files resolve", () => {
  const files = ["README.md", "README.ru.md", "docs/getting-started.md", "docs/architecture.md"];
  const markdownLink = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;

  for (const file of files) {
    const body = text(file);
    for (const match of body.matchAll(markdownLink)) {
      const target = match[1].trim();
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
      const pathOnly = target.split("#", 1)[0].split("?", 1)[0];
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(pathOnly));
      assert.ok(existsSync(resolved), `${file} links to missing local target ${target}`);
    }
  }
});
