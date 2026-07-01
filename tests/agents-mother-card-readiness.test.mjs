import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkCardReadiness } from "../scripts/agents-mother/card-readiness.mjs";

function writeRegistry(root, rows = []) {
  const registryDir = path.join(root, "11_agents");
  mkdirSync(registryDir, { recursive: true });
  writeFileSync(
    path.join(registryDir, "registry.md"),
    [
      "## Agents",
      "",
      "| Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
}

function writeManifest(projectRoot, overrides = {}) {
  const manifest = {
    version: 1,
    generated_by: "Pritha",
    agent: "AlphaAgent",
    service_mode: "manual",
    autostart: "disabled",
    control_center_managed: true,
    control_center_contract: {
      version: 1,
      command_shape: "structured-argv",
      executor: "scripts/control-center-runtime.mjs",
      default_execution: "control-center-managed-local-runtime",
      legacy_strings_executable: false,
      confirmation_required: false,
    },
    control_center_runtime: {
      manager: "detached-node-process",
      service_boundary: "project-local-control-center-runtime",
      prestart_argv: [],
      start_argv: ["node", "scripts/control-center-agent-service.mjs"],
      health_url: "http://127.0.0.1:4999/api/health",
    },
    start_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "start"],
      cwd: ".",
      control_center_managed: true,
    },
    stop_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "stop"],
      cwd: ".",
      control_center_managed: true,
    },
    healthcheck_argv: ["node", "scripts/healthcheck.mjs"],
    local_upstream_url: "http://127.0.0.1:4999",
    health_url: "http://127.0.0.1:4999/api/health",
    ...overrides,
  };

  mkdirSync(path.join(projectRoot, "operations"), { recursive: true });
  writeFileSync(
    path.join(projectRoot, "operations", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

test("card readiness reports missing when registry row is absent", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-missing-"));
  const root = path.join(parent, "Pritha");
  mkdirSync(root, { recursive: true });
  writeRegistry(root);

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "missing");
  assert.equal(result.registryPresent, false);
  assert.match(result.blockers.join("\n"), /missing from 11_agents\/registry\.md/);
});

test("card readiness reports ready for registered scaffold with card-ready manifest", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-ready-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot);

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "ready");
  assert.equal(result.registryPresent, true);
  assert.equal(result.folderPresent, true);
  assert.equal(result.manifestPresent, true);
  assert.equal(result.controlCenterVisible, "unknown");
  assert.deepEqual(result.blockers, []);
});

test("card readiness normalizes executable manual_only action plans to ready", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-live-ready-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    if (urlText.endsWith("/api/agents")) {
      return new Response(
        JSON.stringify({
          agents: [
            {
              id: "alpha-agent",
              name: "AlphaAgent",
              ui: { primaryAction: "start" },
              control: { planAction: "start" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (urlText.endsWith("/api/agents/alpha-agent/actions/start/plan")) {
      return new Response(
        JSON.stringify({
          status: "manual_only",
          actionEnabled: true,
          blockers: [],
          control: { executionMode: "executable" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const result = await checkCardReadiness("alpha-agent", { root, baseUrl: "http://control.test" });
    assert.equal(result.status, "ready");
    assert.equal(result.actionPlanStatus, "ready");
    assert.equal(result.rawActionPlanStatus, "manual_only");
    assert.equal(result.actionExecutionMode, "executable");
    assert.equal(result.actionEnabled, true);
    assert.deepEqual(result.blockers, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("card readiness reports needs_confirmation for executable confirmation-gated action plans", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-live-confirm-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    if (urlText.endsWith("/api/agents")) {
      return new Response(
        JSON.stringify({
          agents: [
            {
              id: "alpha-agent",
              name: "AlphaAgent",
              ui: { primaryAction: "start" },
              control: { planAction: "start" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (urlText.endsWith("/api/agents/alpha-agent/actions/start/plan")) {
      return new Response(
        JSON.stringify({
          status: "manual_only",
          actionEnabled: true,
          requiresConfirmation: true,
          confirmation: { requiredPhrase: "START alpha-agent" },
          blockers: [],
          control: { executionMode: "executable" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const result = await checkCardReadiness("alpha-agent", { root, baseUrl: "http://control.test" });
    assert.equal(result.status, "ready");
    assert.equal(result.actionPlanStatus, "needs_confirmation");
    assert.equal(result.rawActionPlanStatus, "manual_only");
    assert.equal(result.actionExecutionMode, "executable");
    assert.equal(result.actionEnabled, true);
    assert.deepEqual(result.blockers, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("card readiness blocks selected Control Center runtime without a health contract", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-runtime-contract-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot, {
    healthcheck_argv: [],
    health_url: undefined,
    local_upstream_url: undefined,
    control_center_runtime: {
      manager: "detached-node-process",
      service_boundary: "project-local-control-center-runtime",
      prestart_argv: [],
      start_argv: ["node", "scripts/control-center-agent-service.mjs"],
    },
  });

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /requires health_url, local_upstream_url, or healthcheck_argv/);
});

test("card readiness reports blocked for registered scaffold missing operations manifest", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-blocked-"));
  const root = path.join(parent, "Pritha");
  mkdirSync(path.join(parent, "AlphaAgent"), { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "blocked");
  assert.equal(result.registryPresent, true);
  assert.equal(result.folderPresent, true);
  assert.equal(result.manifestPresent, false);
  assert.match(result.blockers.join("\n"), /operations\/manifest\.json is missing or invalid/);
});
