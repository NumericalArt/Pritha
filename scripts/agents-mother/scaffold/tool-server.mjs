import { redactSensitiveText } from "../../lib/redaction.mjs";
import { slug } from "../../lib/slug.mjs";
import { today } from "../../lib/date.mjs";

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const safe = value => redactSensitiveText(String(value || "")).replace(/[\r\n]+/g, " ").slice(0, 2000);

export function toolServerConfiguration(data) {
  const name = slug(data.agentName, { fallback: "tool-server" });
  const prefix = name.toUpperCase().replaceAll("-", "_");
  const variable = `${prefix}_PORT`;
  const match = String(data.envExampleVariables || "").match(new RegExp(`\\b${variable}\\s*=\\s*([^\\s;,]+)`));
  if (match && !/^\d+$/.test(match[1])) throw new Error("Tool-server UI requires a valid declared port");
  const port = match ? Number(match[1]) : 3432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Tool-server UI requires a valid declared port");
  return { name, prefix, variable, port, entrypoint: `scripts/${name}.mjs`, stateVariable: `${prefix}_STATE` };
}

export function toolServerManifest(data, capability = { interfaces: ["mcp-stdio", "web", "cli"] }) {
  const c = toolServerConfiguration(data), ui = capability.interfaces.includes("web");
  const command = action => ({ argv: ["node", c.entrypoint, "ui", action], cwd: ".",
    env_allowlist: [c.stateVariable, c.variable, "PRITHA_STATE_ROOT"], control_center_managed: true,
    background: false, timeout_ms: 5000, success_exit_codes: [0] });
  return { version: 1, generated_by: "Pritha", agent: safe(data.agentName), agent_id: data.agentId,
    agent_kind: "tool-server", runtime_family: "cli", scaffold_adapter: "tool-server-stdio-v1",
    outcome_status: "implementation-required", deployment_target: safe(data.deploymentTarget),
    deployment_profile: safe(data.deploymentProfile), service_mode: ui ? "process" : "none",
    autostart: data.autostart || "disabled", restart_policy: "none",
    mcp: { transport: "stdio", argv: ["node", c.entrypoint, "serve"] },
    healthcheck_argv: ["node", c.entrypoint, "healthcheck"], healthcheck_command: `node ${c.entrypoint} healthcheck`,
    state: { env: c.stateVariable, parent_env: "PRITHA_STATE_ROOT", layout: "runtime/<agent>/<sha256-project-path>", fallback: ".state", writable_during_scaffold: false },
    proactivity: { mode: "none" },
    readiness: { primary: { surface: "mcp-stdio", status: "implementation-required" }, auxiliary: ui ? { surface: "web", status: "implementation-required" } : null },
    ...(ui ? { ui_port: c.port, ui_port_env: c.variable, control_center_managed: true,
      control_center_contract: { version: 1, agent_id: data.agentId, required: true, status: "implementation-required" },
      start_command: command("start"), stop_command: command("stop"),
      health_url: `http://127.0.0.1:${c.port}/health`, local_upstream_url: `http://127.0.0.1:${c.port}`,
      blockers: ["Implement the MCP outcome and owner UI lifecycle; no runtime has been started."] } : {}) };
}

export function toolServerFiles(baseFiles, data, capability, selected) {
  const c = toolServerConfiguration(data), ui = capability.interfaces.includes("web");
  const common = baseFiles.filter(file => /^(memory|tools|skills|sources|delivery|data)\//.test(file.path)
    || [".gitignore", "scripts/redaction.mjs", "scripts/memory-status.mjs", "scripts/tools-status.mjs", "scripts/skills-status.mjs"].includes(file.path));
  const markdown = (id, body) => `---\nid: ${c.name}-${id}\ntype: workflow\nstatus: draft\ncreated: ${today()}\nupdated: ${today()}\ntopics: [tool-server, mcp]\ntools: [Node.js]\nsources: [delivery/outcome-lineage.json]\nrelated: {}\nsupersedes: []\nsuperseded_by: []\n---\n\n${body}\n`;
  const files = [...common,
    { path: "AGENTS.md", content: markdown("instructions", `# ${safe(data.agentName)}\n\n${safe(data.primaryMission)}\n\nPrimary result: tool-server, MCP stdio. Runtime: deterministic Node.js cli; optional owner web surface has process-only managed lifecycle. Read the host-approved Contract and Outcome. Implement ${c.entrypoint}; stdout in serve is exclusively JSON-RPC. No LLM, dependencies, telemetry, secrets, autostart or hidden scheduler are implied. Use only contract-selected modules.\n\n## Boundaries\n\nBuild only in the disposable worktree; do not mutate approved specs, protected verifier inputs, approval store, budget or ledger. No push, merge, service installation, deployment or Tailscale. Temporary tests own and clean up their processes and state. No shell launch, platform-specific scripts or hardcoded user paths. Use path.join and explicit UTF-8/LF. Do not infer process ownership from a PID or port alone. UI health does not establish MCP readiness.\n\n## Harness evolution protocol\n\nInspect the local project and contract, consult Pritha memory for standards/workflows/decisions, verify current official docs where needed, then implement the smallest change with meaningful tests.\n\n${selected.skills ? "Audit selected skills with scripts/skills-status.mjs before reading instructions." : "No skill bundles selected."}`) },
    { path: "README.md", content: markdown("readme", `# ${safe(data.agentName)}\n\nScaffold only: implementation-required. No process is started.\n\nRun node scripts/smoke-test.mjs for structural checks. Product commands and engineering tests fail until the approved Outcome is implemented.\n\nMCP command: node ${c.entrypoint} serve (client-owned lifetime). ${ui ? `Owner UI commands: node ${c.entrypoint} ui start|stop|status. Bind 127.0.0.1, ${c.variable}=${c.port}.` : "No UI service selected."}\n\nState: ${c.stateVariable}, otherwise PRITHA_STATE_ROOT/runtime/${c.name}/<sha256-project-path>, otherwise .state. Configure identical state for MCP and UI. No credentials are copied.\n\nDelivery must add client-specific connection instructions and prove the main workflow with independent Trials. Codex, Cursor and Claude Desktop may use different configuration formats/path rules. Tailscale and service enablement require separate host approval.\n`) },
    { path: "workflows/user-training.md", content: markdown("training", "# First exercise\n\nAfter implementation, connect the agreed MCP client, list tools, execute the approved safe workflow, inspect its durable result/audit and exercise a typed refusal. If an owner UI is selected, prove Start/Stop independently. See the approved Outcome demo; scaffold status is not verification.") },
    { path: ".env.example", content: `# Nonsecret configuration only; no automatic env file loader.\n${ui ? `${c.variable}=${c.port}\n` : ""}# ${c.stateVariable}=<local-state-directory>\n# PRITHA_STATE_ROOT=<optional-parent-state-directory>\n` },
    { path: "package.json", content: json({ name: c.name, version: "0.1.0", private: true, type: "module", engines: { node: ">=22" }, dependencies: {}, devDependencies: {}, scripts: { smoke: "node scripts/smoke-test.mjs", check: `node ${c.entrypoint} healthcheck` } }) },
    { path: c.entrypoint, content: '// Implement the host-approved Outcome; never report product readiness from a scaffold.\nconsole.error(JSON.stringify({code:"IMPLEMENTATION_REQUIRED",status:"implementation-required"}));\nprocess.exitCode=78;\n' },
    { path: "scripts/smoke-test.mjs", content: `import assert from "node:assert/strict";\nimport { lstatSync, readFileSync } from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");\nfor(const segments of ${JSON.stringify(["AGENTS.md", "README.md", "package.json", c.entrypoint, "interfaces/manifest.json", "operations/manifest.json"].map(p => p.split("/")))}) { const info=lstatSync(path.join(root,...segments));assert.ok(info.isFile()&&!info.isSymbolicLink()); }\nconst manifest=JSON.parse(readFileSync(path.join(root,"operations","manifest.json"),"utf8"));\nassert.equal(manifest.agent_kind,"tool-server");assert.equal(manifest.mcp.transport,"stdio");\nconsole.log("Tool-server scaffold structure: pass; product implementation required.");\n` },
    // The factory's structural healthcheck is distinct from the product's offline healthcheck.
    { path: "scripts/healthcheck.mjs", content: 'import "./smoke-test.mjs";\n' },
    { path: "interfaces/manifest.json", content: json({ version: 1, agent: safe(data.agentName), agent_id: data.agentId, agent_kind: "tool-server", runtime_family: "cli", scaffold_adapter: capability.adapter,
      primary_interface: "MCP stdio", adapters: capability.interfaces.map(name => ({ name, enabled: true, primary: name === "mcp-stdio", status: "implementation-required", required_secrets: [] })),
      healthcheck_argv: ["node", c.entrypoint, "healthcheck"] }) },
    { path: "operations/manifest.json", content: json(toolServerManifest(data, capability)) },
    { path: "tests/mcp-protocol.test.mjs", content: `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { spawnSync } from "node:child_process";\nimport { mkdtempSync, rmSync } from "node:fs";\nimport os from "node:os";\nimport path from "node:path";\ntest("MCP handshake responds before client EOF",t=>{\n const state=mkdtempSync(path.join(os.tmpdir(),"tool-server test "));t.after(()=>rmSync(state,{recursive:true,force:true}));\n const input=JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"child-test",version:"1"}}})+"\\n";\n const env={...process.env,${JSON.stringify(c.stateVariable)}:state};delete env.NODE_OPTIONS;\n const result=spawnSync(process.execPath,[path.join("scripts",${JSON.stringify(c.name + ".mjs")}),"serve"],{input,env,encoding:"utf8",timeout:5000});\n assert.equal(result.status,0,"implementation-required: "+result.stderr);\n const reply=JSON.parse(result.stdout.trim().split("\\n")[0]);assert.equal(reply.id,1);assert.equal(reply.jsonrpc,"2.0");assert.ok(reply.result?.serverInfo);\n});\n` },
  ];
  return files;
}
