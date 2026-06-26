import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PROJECT_ROOT = path.resolve(".");

function runRadar(args, root, options = {}) {
  const result = spawnSync("node", ["scripts/github-knowledge-radar.mjs", ...args, "--json"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TECHSCOPE_ROOT: root, ...(options.env || {}) },
  });
  if (options.check !== false) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return {
    status: result.status,
    payload: JSON.parse(result.stdout),
  };
}

test("GitHub Knowledge Radar initializes and registers repository candidates", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-"));
  try {
    const status = runRadar(["status"], root);
    assert.equal(status.payload.status, "not_initialized");

    const registered = runRadar(
      [
        "register",
        "--repo",
        "https://github.com/example/agent-kit",
        "--topics",
        "agent-harness,mcp-tools",
        "--why",
        "Useful architecture reference",
        "--stars",
        "42",
      ],
      root,
    );
    assert.equal(registered.payload.status, "registered");

    const registry = readFileSync(path.join(root, "01_sources", "registries", "github-agent-building-repos.md"), "utf8");
    assert.match(registry, /https:\/\/github\.com\/example\/agent-kit/);
    assert.match(registry, /agent-harness, mcp-tools/);

    const duplicate = runRadar(["register", "--repo", "git@github.com:example/agent-kit.git"], root);
    assert.equal(duplicate.payload.status, "already_registered");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("GitHub Knowledge Radar search can run from a fixture without network access", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-radar-fixture-"));
  const fixture = path.join(root, "fixture.json");
  try {
    writeFileSync(
      fixture,
      JSON.stringify({
        items: [
          {
            html_url: "https://github.com/example/agent-evals",
            description: "Agent evaluation toolkit",
            stargazers_count: 123,
            language: "TypeScript",
            topics: ["agents", "evals"],
          },
        ],
      }),
    );
    const result = runRadar(["search", "--topic", "agent-evals"], root, {
      env: { PRITHA_GITHUB_RADAR_FIXTURE: fixture },
    });
    assert.equal(result.payload.status, "candidates_found");
    assert.equal(result.payload.source, "fixture");
    assert.equal(result.payload.candidates[0].repo.fullName, "example/agent-evals");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
