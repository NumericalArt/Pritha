import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { contractData, validateContract } from "../scripts/agents-mother/contract.mjs";
import { scaffoldCapability } from "../scripts/agents-mother/scaffold/capabilities.mjs";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";
import { deriveExternalResearchTopics } from "../scripts/agents-mother/external-research-topics.mjs";

const selected = {agentKind: "service", runtimeFamily: "hybrid", primaryInterface: "web", secondaryInterfaces: "Telegram", telegramMode: "operator-control", serviceMode: "process", autostart: "optional", proactiveMode: "manual", runtimePlacementProfile: "deterministic-first", repositoryAdoptionMode: "none", skillNeeds: "none", mcpNeeds: "none", memoryModel: "structured-json", untrustedInputPolicy: "high; bounded hostile input and human approval"};
function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-hybrid-scaffold-")));
  t.after(() => rmSync(parent, {recursive: true, force: true}));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children");
  mkdirSync(root); mkdirSync(agentParent); mkdirSync(path.join(stateRoot, "agents/contracts"), {recursive: true});
  const target = path.join(agentParent, "example-agent"), file = path.join(stateRoot, "agents/contracts/hybrid-contract.md");
  let source = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8").replace("type: agent-contract", "type: agent-contract\ncontract_schema_version: 2\nagent_kind: service");
  const labels = {"Agent name": "example-agent", "Runtime family": "hybrid", "Primary interface": "web", "Secondary interfaces": "Telegram", "Telegram mode": "operator-control", "Service mode": "process", "Autostart": "optional", "Proactive mode": "manual", "Runtime placement profile": "deterministic-first", "Repository adoption mode": "none", "Skill needs": "none", "MCP needs": "none", "Memory model": "bounded atomic JSON state; no SQLite/embeddings/vector DB", "Untrusted input policy": selected.untrustedInputPolicy, "Target folder": target};
  for (const [label, value] of Object.entries(labels)) {
    const pattern = new RegExp(`^- ${label}:.*$`, "m");
    source = pattern.test(source) ? source.replace(pattern, `- ${label}: ${value}`) : source + `\n- ${label}: ${value}\n`;
  }
  source = source.replace(/^- Secrets required:.*$/m, "- Secrets required: Telegram bot token only in local credentials")
    .replace(/^- User authorization model:.*$/m, "- User authorization model: Telegram user id allowlist and owner UI approval");
  source = source.replace(/^- `\.env\.example` variables:.*$/m, "- `.env.example` variables: EXAMPLE_PORT=3432");
  writeFileSync(file, source);
  return {root, stateRoot, agentParent, target, file, source, env: {...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: agentParent}};
}

test("hybrid editor capability accepts only the explicitly reviewed service combination", () => {
  assert.equal(scaffoldCapability(selected).adapter, "hybrid-editor-process-v1");
  for (const patch of [
    {agentKind: undefined}, {agentKind: "interactive-agent"}, {primaryInterface: "CLI"}, {secondaryInterfaces: "Telegram, API"}, {secondaryInterfaces: "Telegram + voice"},
    {telegramMode: "primary-chat"}, {telegramMode: "none", secondaryInterfaces: "none"}, {serviceMode: "launchd"}, {autostart: "launchd-on-approval"},
    {proactiveMode: "heartbeat"}, {proactiveMode: "event-driven"}, {repositoryAdoptionMode: "selected-module"}, {skillNeeds: "auto"}, {mcpNeeds: "selected"},
    {runtimePlacementProfile: "frontier-first"}, {memoryModel: "SQLite and vector RAG"}, {untrustedInputPolicy: "low"},
  ]) assert.equal(scaffoldCapability({...selected, ...patch}).supported, false, JSON.stringify(patch));
  assert.equal(scaffoldCapability({runtimeFamily: "hybrid"}).reason, "runtime-adapter-missing");
  assert.equal(scaffoldCapability({...selected, runtimeFamily: "api"}).supported, false);
});

test("hybrid research covers editor isolation and Node/Telegram without excluded SDK, MCP, memory or macOS choices", () => {
  const topics = deriveExternalResearchTopics({...selected, dependencies: "Node.js built-ins; Codex CLI", inputDataTypes: "untrusted HTML and Telegram", memoryModel: "bounded atomic JSON state; no SQLite/embeddings/vector DB"});
  const ids = topics.map(topic => topic.id);
  for (const id of ["node-http-runtime", "codex-editor-isolation", "telegram-bot-api", "interface-runtime-security", "operations-deployment", "untrusted-input-security"]) assert(ids.includes(id), id);
  for (const id of ["openai-agents-sdk", "mcp-connectors", "memory-rag-storage"]) assert(!ids.includes(id), id);
  assert.doesNotMatch(topics.find(topic => topic.id === "operations-deployment").query, /macOS launchd cron/);
  assert(deriveExternalResearchTopics({runtimeFamily: "api"}).some(topic => topic.id === "openai-agents-sdk"));
});

test("hybrid scaffold preserves runtime and credential boundaries without starting integrations or copying heavy layers", t => {
  const f = fixture(t), data = contractData(f.file);
  assert.deepEqual(validateContract(f.file, {print: false}), []);
  const files = generatedAgentFiles(data), names = files.map(file => file.path);
  assert.equal(new Set(names).size, names.length);
  assert(!names.some(name => /launchd|control-center-agent-service|memory\/(?:index|embeddings|external)|skills\/|\.env$/.test(name)));
  mkdirSync(f.target);
  for (const file of files) {const target = path.join(f.target, file.path); mkdirSync(path.dirname(target), {recursive: true}); writeFileSync(target, file.content);}
  const run = argv => spawnSync(process.execPath, argv, {cwd: f.target, encoding: "utf8", timeout: 5000});
  assert.equal(run(["scripts/run-tests.mjs"]).status, 0);
  for (const args of [["scripts/example-agent.mjs", "serve"], ["scripts/server.mjs"], ["scripts/service-control.mjs", "start"], ["scripts/service-control.mjs", "stop"]]) assert.equal(run(args).status, 78);
  assert.equal(run(["scripts/deploy-service.mjs", "install", "--yes"]).status, 64);
  assert.equal(JSON.parse(run(["scripts/deploy-service.mjs", "status"]).stdout).mutates, false);
  const get = name => JSON.parse(readFileSync(path.join(f.target, name), "utf8"));
  const ops = get("operations/manifest.json"), ui = get("interfaces/manifest.json"), tools = get("tools/manifest.json");
  assert.equal(ops.runtime_family, "hybrid"); assert.equal(ui.runtime_family, "hybrid"); assert.equal(ops.service_mode, "process");
  assert.deepEqual(ops.start_command.env_allowlist, ["EXAMPLE_PORT"]);
  assert.deepEqual(ops.control_center_runtime.start_argv, ["node", "scripts/example-agent.mjs", "serve"]);
  assert.equal(ops.health_url, "http://127.0.0.1:3432/health");
  assert.equal(ui.adapters.find(row => row.name === "telegram").enabled, false);
  assert.deepEqual(tools.editor.tools, []); assert.equal(tools.publish.approval_required, true); assert.equal(tools.credentials.inherit_host_env, false);
  assert.equal(get("memory/manifest.json").profile, "structured-json"); assert.equal(get("memory/manifest.json").pritha_memory_access, false);
  assert.match(readFileSync(path.join(f.target, ".env.example"), "utf8"), /^TELEGRAM_PUBLISH_CHAT_ID=$/m);
  assert.match(readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), /child runtime has no Pritha memory access/);
  assert.equal(existsSync(path.join(f.target, ".state")), false); assert.equal(existsSync(path.join(f.target, ".private")), false);
  assert.equal(readFileSync(f.file, "utf8"), f.source);
});

test("hybrid scaffold CLI keeps acceptance/research gates and creates only a clean local scaffold baseline", t => {
  const f = fixture(t), args = ["scripts/pritha.mjs", "scaffold", f.file];
  const denied = spawnSync(process.execPath, args, {encoding: "utf8", env: f.env, timeout: 10000});
  assert.notEqual(denied.status, 0); assert.equal(existsSync(f.target), false);
  // This fixture tests wiring, not production research authorization.
  const result = spawnSync(process.execPath, [...args, "--allow-missing-research", "--allow-pending-external-verification"], {encoding: "utf8", env: f.env, timeout: 30000});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(execFileSync("git", ["status", "--porcelain"], {cwd: f.target, encoding: "utf8"}), "");
  const reports = path.join(f.stateRoot, "agents/reports"), report = readFileSync(path.join(reports, readdirSync(reports).find(name => name.endsWith("-scaffold-report.md"))), "utf8");
  assert.match(report, /scaffold_adapter: hybrid-editor-process-v1/); assert.match(report, /runtime_environment:[\s\S]*hybrid/);
  assert.match(report, /Control Center runtime contract \| implementation-required/); assert.match(report, /structured-json/);
  assert.doesNotMatch(report, /scripts\/control-center-agent-service|scripts\/control-center-runtime/);
  assert.equal(readFileSync(f.file, "utf8"), f.source);
});
