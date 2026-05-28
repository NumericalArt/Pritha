#!/usr/bin/env node
import { exists, printStatus, readJson, run } from "./status-lib.mjs";

const manifest = readJson("operations/manifest.json");
const health = manifest.healthcheck_command === "node scripts/healthcheck.mjs"
  ? run("node", ["scripts/healthcheck.mjs"], { timeout: 60000 })
  : { ok: true, output: "custom healthcheck not executed by status script" };

const status = {
  name: "operations",
  ok: Boolean(manifest.service_mode) && Boolean(manifest.autostart) && health.ok,
  agent: manifest.agent || "unknown",
  deployment_target: manifest.deployment_target || "unknown",
  service_mode: manifest.service_mode || "unknown",
  autostart: manifest.autostart || "unknown",
  healthcheck: health.ok ? "pass" : "fail",
  launchd_template: manifest.launchd_template || "",
  items: [
    { name: "operations/manifest.json", status: "present" },
    { name: manifest.launchd_template || "launchd template", status: manifest.launchd_template && exists(manifest.launchd_template) ? "present" : "missing" },
    { name: "smoke test", status: manifest.smoke_test_command ? "configured" : "missing", detail: manifest.smoke_test_command || "" },
    { name: "healthcheck", status: health.ok ? "pass" : "fail", detail: manifest.healthcheck_command || "" },
  ],
};

printStatus(status);
if (!status.ok) process.exit(1);
