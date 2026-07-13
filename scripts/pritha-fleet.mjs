#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) out._.push(value);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) out[value.slice(2)] = argv[++index];
    else out[value.slice(2)] = true;
  }
  return out;
}

const options = parseArgs(process.argv.slice(2));
const root = resolveTechscopeRoot();
const stateRoot = resolvePrithaStateRoot({ root });
const manifestPath = path.resolve(String(options.manifest || process.env.PRITHA_FLEET_CONFIG || path.join(stateRoot, "config", "fleet.json")));

function loadManifest() {
  if (!existsSync(manifestPath)) throw new Error(`Fleet manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.instances) || !manifest.instances.length) throw new Error("Fleet manifest must contain a non-empty instances array");
  return manifest;
}

function invoke(instance, commandArgs) {
  const checkout = path.resolve(instance.checkout);
  const env = {
    ...process.env,
    TECHSCOPE_ROOT: checkout,
    PRITHA_INSTANCE_ID: instance.id,
    PRITHA_INSTANCE_ROLE: instance.role || "replica",
    PRITHA_STATE_ROOT: path.resolve(instance.state_root),
    PRITHA_AGENT_PARENT: path.resolve(instance.agent_parent),
    PRITHA_CONTROL_CENTER_PORT: String(instance.port),
    PRITHA_CONTROL_CENTER_ENV_FILE: path.join(path.resolve(instance.state_root), "config", "runtime.env"),
  };
  const result = spawnSync("node", [path.join(checkout, "scripts", "pritha-instance.mjs"), ...commandArgs, "--json"], {
    cwd: checkout,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 1_200_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  let payload = null;
  try { payload = JSON.parse(String(result.stdout || "")); } catch { /* reported below */ }
  return {
    id: instance.id,
    ok: result.status === 0 && Boolean(payload?.ok),
    exit_code: result.status ?? 1,
    payload,
    error: payload ? "" : String(result.stderr || result.stdout || "invalid instance output").trim(),
  };
}

function print(payload) {
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Pritha fleet: ${payload.ok ? "ok" : "attention"}`);
    for (const item of payload.instances || []) console.log(`- ${item.id}: ${item.ok ? "ok" : "failed"}`);
    if (payload.stopped_after) console.log(`Rollout stopped after: ${payload.stopped_after}`);
  }
}

try {
  const manifest = loadManifest();
  const command = options._[0] || "status";
  const instances = [];
  if (command === "status") {
    for (const instance of manifest.instances) instances.push(invoke(instance, ["status"]));
  } else if (command === "rollout") {
    const apply = Boolean(options.apply);
    if (apply && !options.yes) throw new Error("fleet rollout --apply requires --yes");
    for (const instance of manifest.instances) {
      const result = invoke(instance, ["update", apply ? "--apply" : "--plan", ...(apply ? ["--yes"] : [])]);
      instances.push(result);
      if (!result.ok) break;
    }
  } else {
    throw new Error("Usage: node scripts/pritha-fleet.mjs status|rollout [--apply --yes] [--manifest path]");
  }
  const payload = {
    schema: "pritha-fleet-result-v1",
    ok: instances.length === manifest.instances.length && instances.every((item) => item.ok),
    command,
    manifest: manifestPath,
    instances,
    stopped_after: instances.find((item) => !item.ok)?.id || null,
  };
  print(payload);
  if (!payload.ok) process.exitCode = 1;
} catch (error) {
  const payload = { schema: "pritha-fleet-error-v1", ok: false, error: error instanceof Error ? error.message : String(error) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.error(payload.error);
  process.exitCode = 1;
}
