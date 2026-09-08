import { apiProcessManifest } from "./api-process.mjs";
import { slug } from "../../lib/slug.mjs";
import { today } from "../../lib/date.mjs";
import { redactSensitiveText } from "../../lib/redaction.mjs";

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const text = value => redactSensitiveText(String(value || "")).replace(/[\r\n]+/g, " ").slice(0, 1500);

// Reuse the reviewed manifest shape, never another child's runtime or state.
export function hybridProcessManifest(data) {
  const manifest = apiProcessManifest(data);
  const entry = `scripts/${slug(data.agentName)}.mjs`;
  const portVariable = manifest.start_command.env_allowlist.find(name => name.endsWith("_PORT"));
  manifest.runtime_family = "hybrid";
  manifest.scaffold_adapter = "hybrid-editor-process-v1";
  manifest.control_center_runtime.start_argv = ["node", entry, "serve"];
  for (const action of ["start", "stop"]) manifest[`${action}_command`].env_allowlist = [portVariable];
  manifest.proactivity = { mode: data.proactiveMode, trigger_sources: "explicit operator request or allowlisted Telegram command", schedule: "none", heartbeat_interval: "none" };
  manifest.blockers = ["Implement and verify the approved service, editor isolation, Telegram approval and owned-process lifecycle before Start."];
  return manifest;
}

export function hybridProcessFiles(baseFiles, data, capability) {
  const name = text(data.agentName), agentSlug = slug(data.agentName), entry = `scripts/${agentSlug}.mjs`;
  const ops = hybridProcessManifest(data);
  const portVariable = ops.start_command.env_allowlist[0], port = new URL(ops.health_url).port;
  const markdown = (id, body) => `---\nid: ${agentSlug}-${id}\ntype: workflow\nstatus: draft\ncreated: ${today()}\nupdated: ${today()}\ntopics: [agent, hybrid, process-service, telegram-adapter]\ntools: [Node.js, Codex CLI]\nsources: [delivery/outcome-lineage.json]\nrelated: {}\nsupersedes: []\nsuperseded_by: []\n---\n\n${body}\n`;
  const pending = 'console.error(JSON.stringify({status:"implementation-required",message:"Implement and verify the approved Outcome before enabling this capability."}));\nprocess.exitCode=78;\n';
  const guide = `# ${name}\n\n${text(data.primaryMission)}\n\nRuntime: hybrid; Node HTTP process plus a tool-free Codex CLI editor. Scaffold only: no running service, editor, Telegram poller or publication. Implement the accepted Contract and Outcome before delivery.\n\nRun \`npm test\` for structural engineering checks. Protected Outcome Trials are independent and must pass for a committed revision. Default loopback endpoint: 127.0.0.1:${port}; port variable ${portVariable}. Product entrypoint: \`node ${entry} serve\`.\n\nPersistent Start/Stop and private Tailscale Serve use separate host UI decisions. Autostart is not installed; Funnel and schedulers are not selected. Configure Telegram values only through local credential UI or a 0600 .env after handoff. The example contains empty placeholders. Missing live credentials do not block deterministic fixture verification.\n\nDelivery must replace this guide with the first briefing, Edit/Approve/Reject/history exercise, unavailable-editor recovery and exact process Stop instructions.`;
  const files = [
    ...baseFiles.filter(file => file.path.startsWith("delivery/")),
    { path: ".gitignore", content: ".env\n.env.*\n!.env.example\n.private/\n.state/\n.queue/\n.logs/\nnode_modules/\n" },
    { path: "AGENTS.md", content: markdown("instructions", `# ${name}\n\n## Mission\n\n${text(data.primaryMission)}\n\nRuntime: hybrid. Build the deterministic Node HTTP service, narrow Telegram adapter and Codex CLI editorial sidecar selected by the host-owned Contract/Outcome. Generated stubs are implementation-required, not a verified product.\n\n## Authority and privacy\n\nCode owns search, allowlisted fetch, redaction/quarantine/scanning, state and publish. Codex receives only bounded cleaned evidence and returns schema-checked JSON; no tools, arbitrary network, filesystem, .env, hooks, plugins or MCP. An unavailable editor returns draft_unavailable without invented text or publication. Telegram ingress checks its user allowlist before processing. UI Approve or allowlisted /publish must approve the exact revision before a fixed-channel send; Edit revokes approval. Never copy host-pulse runtime or any Pritha data/credentials.\n\nUse child-owned bounded JSON state only. No Pritha memory, embeddings, external store, additional model API key, voice, MCP, images, scheduler, heartbeat, Funnel or OS-specific helper. No live integration is enabled by scaffold.\n\n## Build and operations\n\nWork only in the disposable build worktree. Never modify approved specs, protected verifiers, approval store, ledger or budgets. No push, merge, deployment, secret provisioning or persistent service enablement by the build executor. Temporary fixture servers must be cleaned up. Loopback only; Start/Stop require exact process ownership and host UI approval, never port-based killing.\n\n## Harness evolution protocol\n\n1. Inspect this local project and the accepted contract.\n2. The host Pritha may consult its own memory and pass reviewed static decisions; the child runtime has no Pritha memory access.\n3. The host verifies current official documentation when needed.\n4. Implement minimal changes and rerun relevant independent checks.`) },
    { path: "README.md", content: markdown("readme", guide) },
    { path: "workflows/user-training.md", content: markdown("training", guide) },
    { path: ".env.example", content: `${portVariable}=${port}\nTELEGRAM_BOT_TOKEN=\nTELEGRAM_ALLOWED_USER_IDS=\nTELEGRAM_PUBLISH_CHAT_ID=\n` },
    { path: "package.json", content: json({ name: agentSlug, version: "0.1.0", private: true, type: "module", scripts: {start: `node ${entry} serve`, smoke: "node scripts/smoke-test.mjs", check: "node scripts/healthcheck.mjs"} }) },
    { path: "operations/manifest.json", content: json(ops) },
    { path: "interfaces/manifest.json", content: json({version: 1, agent: name, agent_id: data.agentId, runtime_family: "hybrid", primary_interface: "web", scaffold_adapter: capability.adapter, adapters: [
      {name: "web", enabled: true, status: "implementation-required", required_secrets: []},
      {name: "telegram", enabled: false, selected: true, status: "implementation-required", mode: "operator-control", required_secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USER_IDS", "TELEGRAM_PUBLISH_CHAT_ID"]},
    ], healthcheck_argv: ["node", "scripts/healthcheck.mjs"]}) },
    { path: "tools/manifest.json", content: json({version: 1, agent: name, profiles: ["cli-script", "telegram-adapter"], mcp: {enabled: false}, editor: {selected: true, status: "implementation-required", tools: [], input: "bounded-cleaned-evidence", output: "validated-json", unavailable: "draft_unavailable"}, publish: {approval_required: true, destinations: 1}, credentials: {inherit_host_env: false, log_values: false}}) },
    { path: "data/manifest.json", content: json({version: 1, agent: name, profile: "structured-json", state_root: ".private", source_of_truth: "child-owned-atomic-json", pritha_memory_access: false, indexing: "none", credentials_in_git: false}) },
    { path: "memory/manifest.json", content: json({version: 1, agent: name, profile: "structured-json", source_of_truth: "child-owned-atomic-json", pritha_memory_access: false, embeddings: false, external_store: false}) },
    { path: "memory/README.md", content: markdown("memory", "# Application state\n\nBounded child-owned atomic JSON only. No Pritha data, index, embeddings or external memory. Runtime/private files are gitignored.") },
    { path: "scripts/server.mjs", content: `import "./${agentSlug}.mjs";\n` },
    { path: entry, content: pending },
    { path: "scripts/service-control.mjs", content: pending },
    { path: "lib/app.mjs", content: 'export async function createService() { const error = new Error("implementation-required"); error.code = "IMPLEMENTATION_REQUIRED"; throw error; }\n' },
    { path: "lib/editor.mjs", content: 'export async function edit() { const error = new Error("editor-unavailable"); error.code = "EDITOR_UNAVAILABLE"; throw error; }\n' },
    { path: "lib/telegram.mjs", content: 'export async function handleTelegramUpdate() { return {status:"implementation-required",published:false}; }\n' },
    { path: "scripts/healthcheck.mjs", content: '// Scaffold health is structural only, never HTTP readiness.\nimport "./smoke-test.mjs";\n' },
    { path: "scripts/deploy-service.mjs", content: 'const action=process.argv[2]||"plan";\nif(["plan","status"].includes(action)) console.log(JSON.stringify({service_mode:"process",installed:false,action,implementation:"required",mutates:false}));\nelse { console.error("Process service has no install/uninstall or autostart action.");process.exitCode=64; }\n' },
  ];
  files.push({path: "scripts/smoke-test.mjs", content: `import assert from "node:assert/strict";\nimport {lstatSync,readFileSync} from "node:fs";\nfor(const file of ${JSON.stringify(files.map(file => file.path))}) {const info=lstatSync(new URL("../"+file,import.meta.url));assert(info.isFile()&&!info.isSymbolicLink());}\nconst ops=JSON.parse(readFileSync(new URL("../operations/manifest.json",import.meta.url),"utf8"));\nassert.equal(ops.runtime_family,"hybrid");assert.equal(ops.service_mode,"process");assert(["disabled","optional"].includes(ops.autostart));\nconsole.log("Hybrid process scaffold structure: pass; product and integrations require independent verification.");\n`});
  return files;
}
