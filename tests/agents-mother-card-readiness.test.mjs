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

function writeManifest(projectRoot) {
  mkdirSync(path.join(projectRoot, "operations"), { recursive: true });
  writeFileSync(
    path.join(projectRoot, "operations", "manifest.json"),
    `${JSON.stringify(
      {
        version: 1,
        generated_by: "Pritha",
        agent: "AlphaAgent",
        service_mode: "manual",
        autostart: "disabled",
        control_center_managed: false,
        control_center_contract: {
          version: 1,
          command_shape: "structured-argv",
          executor: "scripts/control-center-runtime.mjs",
          default_execution: "disabled-until-managed-runtime-is-explicitly-approved",
          legacy_strings_executable: false,
        },
        control_center_runtime: {
          manager: "none",
          service_boundary: "not-managed-by-control-center",
          prestart_argv: [],
          start_argv: [],
          health_url: null,
        },
        start_command: {
          argv: ["node", "scripts/control-center-runtime.mjs", "start"],
          cwd: ".",
          control_center_managed: false,
        },
        stop_command: {
          argv: ["node", "scripts/control-center-runtime.mjs", "stop"],
          cwd: ".",
          control_center_managed: false,
        },
      },
      null,
      2,
    )}\n`,
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
