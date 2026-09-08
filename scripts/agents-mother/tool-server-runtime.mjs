import { createHash } from "node:crypto";

const systemNames = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR"];
const configName = name => name === "PRITHA_STATE_ROOT" || /^[A-Z][A-Z0-9_]*_(?:STATE|PORT)$/.test(name);
function invalid() {
  const error = new Error("Tool-server runtime configuration is invalid; review its declared state, port and environment.");
  error.code = "tool_server_runtime_invalid";
  throw error;
}

// This restriction applies only to the explicit deterministic tool-server kind.
// Preserve legacy managed-command behavior for other existing adapters.
export function toolServerLaunchEnvironment(manifest, command, parent = process.env) {
  if (manifest?.agent_kind !== "tool-server") return { ...parent };
  const env = {};
  for (const name of systemNames) if (typeof parent[name] === "string") env[name] = parent[name];
  if (!command || typeof command !== "object" || !Array.isArray(command.env_allowlist)) invalid();
  for (const name of command.env_allowlist) {
    if (typeof name !== "string" || name.length > 100 || !configName(name)
      || /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|PROXY)/.test(name)) invalid();
    const value = parent[name];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 4096 || /[\0\r\n]/.test(value)) invalid();
    env[name] = value;
  }
  return env;
}

export function resolveToolServerManifest(manifest, parent = process.env) {
  if (manifest?.agent_kind !== "tool-server") return manifest;
  if (!manifest.local_upstream_url && !manifest.health_url && !manifest.start_command && !manifest.stop_command) return manifest;
  let local, health;
  try { local = new URL(manifest.local_upstream_url); health = new URL(manifest.health_url); } catch { invalid(); }
  if (local.protocol !== "http:" || local.hostname !== "127.0.0.1" || local.username || local.password
    || local.pathname !== "/" || local.search || local.hash || health.origin !== local.origin
    || health.username || health.password || health.search || health.hash || !/^\/[A-Za-z0-9/_-]+$/.test(health.pathname)) invalid();
  const declared = Number(manifest.ui_port ?? local.port);
  if (!Number.isInteger(declared) || declared < 1 || declared > 65535 || declared !== Number(local.port || 80)) invalid();
  let port = declared;
  if (manifest.ui_port_env !== undefined) {
    const name = manifest.ui_port_env;
    if (typeof name !== "string" || !/^[A-Z][A-Z0-9_]*_PORT$/.test(name)) invalid();
    for (const command of [manifest.start_command, manifest.stop_command]) {
      toolServerLaunchEnvironment(manifest, command, parent);
      if (!command.env_allowlist.includes(name)) invalid();
    }
    if (parent[name] !== undefined) {
      if (typeof parent[name] !== "string" || !/^\d+$/.test(parent[name])) invalid();
      port = Number(parent[name]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) invalid();
    }
  }
  local.port = String(port); health.port = String(port);
  const resolved = { ...manifest, ui_port: port, local_upstream_url: local.origin, health_url: health.href };
  for (const field of ["start_command", "stop_command"]) {
    const command = manifest[field];
    toolServerLaunchEnvironment(manifest, command, parent);
    if (command.readiness?.url && command.readiness.url !== manifest.health_url) invalid();
    resolved[field] = { ...command, ...(command.readiness?.url ? { readiness: { ...command.readiness, url: health.href } } : {}) };
  }
  return resolved;
}

export function toolServerRuntimeBinding(manifest, parent = process.env) {
  if (manifest?.agent_kind !== "tool-server") return undefined;
  const resolved = resolveToolServerManifest(manifest, parent);
  const commands = ["start_command", "stop_command"].map(field => resolved[field]
    ? { command: resolved[field], env: toolServerLaunchEnvironment(resolved, resolved[field], parent) } : null);
  // Values stay private; plans and confirmation phrases expose only the digest.
  return createHash("sha256").update(JSON.stringify({ manifest: resolved, commands })).digest("hex");
}
