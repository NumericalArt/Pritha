import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scaffoldCapability } from "../scripts/agents-mother/scaffold/capabilities.mjs";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";
import { contractData } from "../scripts/agents-mother/contract.mjs";
import { deriveExternalResearchTopics } from "../scripts/agents-mother/external-research-topics.mjs";
import { operationsApplicability } from "../scripts/agents-mother/agent-kind.mjs";

const selected = { text: "", agentName: "Link Vault", agentId: "agent-fixture", agentKind: "tool-server", runtimeFamily: "cli", primaryInterface: "MCP stdio", secondaryInterfaces: "web, CLI",
  serviceMode: "process", autostart: "disabled", proactiveMode: "none", telegramMode: "none", repositoryAdoptionMode: "none",
  memoryModel: "none", toolSystem: "none", skillNeeds: "none", untrustedInputPolicy: "quarantine", inputDataTypes: "untrusted web text", envExampleVariables: "LINK_VAULT_PORT=3432",
  coreFunctions: ["MCP tools"], criticalWorkflows: ["save and read"], primaryMission: "Safe links", deploymentTarget: "Node.js cross-platform" };

test("stdio provider capability is explicit, narrow and independent of service result type", () => {
  assert.equal(scaffoldCapability(selected).adapter, "tool-server-stdio-v1");
  assert.deepEqual(scaffoldCapability(selected).interfaces, ["mcp-stdio", "web", "cli"]);
  for (const patch of [{ agentKind: "service" }, { agentKind: undefined }, { runtimeFamily: "api" }, { secondaryInterfaces: "web, Telegram" }, { serviceMode: "launchd" },
    { autostart: "launchd-on-approval" }, { proactiveMode: "heartbeat" }, { repositoryAdoptionMode: "reference-only" }, { secondaryInterfaces: "web, arbitrary" }]) {
    assert.equal(scaffoldCapability({ ...selected, ...patch }).supported, false, JSON.stringify(patch));
  }
  assert.equal(scaffoldCapability({ ...selected, agentKind: { kind: "tool-server" }, secondaryInterfaces: "CLI", serviceMode: "none" }).adapter, "tool-server-stdio-v1");
  assert.equal(scaffoldCapability({ ...selected, secondaryInterfaces: "CLI" }).supported, false);
  assert.equal(scaffoldCapability({ runtimeFamily: "cli", primaryInterface: "CLI" }).adapter, "headless-cli-v1");
  assert.equal(scaffoldCapability({ runtimeFamily: "api", primaryInterface: "web", serviceMode: "process" }).adapter, "api-process-v1");
});

test("provider research chooses MCP protocol and portable Node HTTP, not connectors or an LLM SDK", () => {
  const topics = deriveExternalResearchTopics(selected);
  for (const id of ["mcp-provider", "node-http-runtime", "operations-deployment", "untrusted-input-security"]) assert.ok(topics.some(t => t.id === id));
  for (const id of ["mcp-connectors", "openai-agents-sdk", "local-inference-runtime"]) assert.equal(topics.some(t => t.id === id), false);
  assert.doesNotMatch(topics.find(t => t.id === "operations-deployment").query, /launchd|cron/);
});

test("tool-server scaffold preserves A1/A2 and structured operations in paths with spaces and Unicode", t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tool scaffold \u0442\u0435\u0441\u0442 "));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = generatedAgentFiles(selected), names = files.map(f => f.path);
  for (const port of ["0", "-1", "65536", "bad"]) assert.throws(() => generatedAgentFiles({ ...selected, envExampleVariables: `LINK_VAULT_PORT=${port}` }), /valid declared port/);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.some(n => /^(memory|tools|skills)\//.test(n) || /^scripts\/(memory|tools|skills)-status/.test(n)), false);
  assert.ok(names.includes("scripts/redaction.mjs"));
  assert.equal(names.some(n => /launchd|telegram|control-center-runtime|deploy-service/.test(n)), false);
  for (const f of files) { const target = path.join(dir, ...f.path.split("/")); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, f.content, "utf8"); }
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test, "node scripts/run-tests.mjs"); assert.deepEqual(pkg.dependencies, {});
  const env = { ...process.env, LINK_VAULT_STATE: path.join(dir, "isolated state"), PRITHA_STATE_ROOT: path.join(dir, "parent") }; delete env.NODE_TEST_CONTEXT;
  const run = args => spawnSync(process.execPath, args, { cwd: dir, env, encoding: "utf8", timeout: 15000 });
  assert.equal(run([path.join("scripts", "smoke-test.mjs")]).status, 0);
  assert.equal(run([path.join("scripts", "healthcheck.mjs")]).status, 0);
  const outcome = run([path.join("scripts", "run-tests.mjs")]);
  assert.notEqual(outcome.status, 0); assert.match(outcome.stdout + outcome.stderr, /implementation-required/);
  for (const args of [["serve"], ["ui", "start"], ["healthcheck"]]) assert.equal(run([path.join("scripts", "link-vault.mjs"), ...args]).status, 78);
  assert.equal(existsSync(env.LINK_VAULT_STATE), false); assert.equal(existsSync(path.join(dir, ".state")), false);
  const ops = JSON.parse(readFileSync(path.join(dir, "operations", "manifest.json"), "utf8"));
  assert.equal(ops.agent_kind, "tool-server"); assert.equal(ops.service_mode, "process"); assert.equal(ops.ui_port, 3432);
  assert.deepEqual(ops.mcp, { transport: "stdio", argv: ["node", "scripts/link-vault.mjs", "serve"] });
  assert.deepEqual(ops.start_command.argv, ["node", "scripts/link-vault.mjs", "ui", "start"]);
  assert.deepEqual(ops.stop_command.env_allowlist, ["LINK_VAULT_STATE", "LINK_VAULT_PORT", "PRITHA_STATE_ROOT"]);
  assert.deepEqual(ops.healthcheck_argv, ["node", "scripts/link-vault.mjs", "healthcheck"]);
  assert.equal(ops.health_url, "http://127.0.0.1:3432/health");
  const withoutUi = generatedAgentFiles({ ...selected, secondaryInterfaces: "CLI", serviceMode: "none" });
  const headlessOps = JSON.parse(withoutUi.find(f => f.path === "operations/manifest.json").content);
  assert.equal(headlessOps.service_mode, "none"); assert.equal(headlessOps.health_url, undefined); assert.equal(headlessOps.start_command, undefined);
});

test("tool-server scaffold keeps accepted contract and research gates before writes and reports actual entrypoints", t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tool-server-gates-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "mother"), state = path.join(dir, "state"), parent = path.join(dir, "children"), target = path.join(parent, "tool-result");
  mkdirSync(root); mkdirSync(parent); mkdirSync(path.join(state, "agents", "contracts"), { recursive: true });
  const file = path.join(state, "agents", "contracts", "contract.md");
  let source = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8").replace("type: agent-contract", "type: agent-contract\ncontract_schema_version: 2\nagent_kind: tool-server");
  for (const [label, value] of Object.entries({ "Agent name": "Tool Result", "Runtime family": "cli", "Primary interface": "MCP stdio", "Secondary interfaces": "web, CLI", "Service mode": "process", "Autostart": "disabled", "Proactive mode": "none", "Target folder": target, "Memory model": "none", "Tool system": "none", "Skill needs": "none" })) source = source.replace(new RegExp(`^- ${label}:.*$`, "m"), `- ${label}: ${value}`);
  writeFileSync(file, source, "utf8");
  assert.equal(scaffoldCapability(contractData(file)).adapter, "tool-server-stdio-v1");
  const env = { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: state, PRITHA_AGENT_PARENT: parent };
  const args = ["scripts/pritha.mjs", "scaffold", file];
  const denied = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 10000 });
  assert.notEqual(denied.status, 0); assert.equal(existsSync(target), false);
  // Deliberately marked fixture overrides test adapter wiring, never the production research gate.
  const result = spawnSync(process.execPath, [...args, "--allow-missing-research", "--allow-pending-external-verification"], { env, encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const reportDir = path.join(state, "agents", "reports");
  const report = readFileSync(path.join(reportDir, readdirSync(reportDir).find(n => n.endsWith("scaffold-report.md"))), "utf8");
  assert.match(report, /scaffold_adapter: tool-server-stdio-v1/);
  assert.match(report, /scripts\/tool-result\.mjs serve/);
  assert.doesNotMatch(report, /scripts\/(?:server|service-control|control-center-runtime|deploy-service)\.mjs/);
  assert.equal(readFileSync(file, "utf8"), source);
  assert.equal(operationsApplicability(source).manifestRequired, true);
});
