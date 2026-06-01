import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { contractData } from "../scripts/agents-mother/contract.mjs";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";

function listFiles(root) {
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        out.push(path.relative(root, fullPath).split(path.sep).join("/"));
      }
    }
  }
  walk(root);
  return out.sort();
}

test("Agents Mother scaffold output matches the frozen file-list snapshot", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "techscope-scaffold-test-"));
  const contractDir = path.join(root, "11_agents", "contracts");
  execFileSync("mkdir", ["-p", contractDir]);
  const contractPath = path.join(contractDir, "valid-agent-contract.md");
  cpSync("tests/fixtures/contracts/valid-agent-contract.md", contractPath);
  const outputDir = path.join(root, "out");

  const output = execFileSync("node", [
    path.resolve("scripts/agents-mother.mjs"),
    "scaffold",
    contractPath,
    "--output",
    outputDir,
  ], {
    encoding: "utf8",
    env: { ...process.env, TECHSCOPE_ROOT: root },
  });

  assert.match(output, /Smoke test: pass/);
  const actual = `${listFiles(outputDir).join("\n")}\n`;
  const expected = readFileSync("tests/snapshots/scaffold-basic-file-list.txt", "utf8");
  assert.equal(actual, expected);

  const smoke = execFileSync("node", ["scripts/smoke-test.mjs"], {
    cwd: outputDir,
    encoding: "utf8",
  });
  assert.match(smoke, /Smoke test passed/);
});

test("scaffold module exposes generated agent files directly", () => {
  const data = contractData("tests/fixtures/contracts/valid-agent-contract.md");
  const files = generatedAgentFiles(data);
  const paths = files.map((file) => file.path).sort();
  assert.ok(paths.includes("AGENTS.md"));
  assert.ok(paths.includes("scripts/smoke-test.mjs"));
  assert.ok(paths.includes("operations/manifest.json"));
  assert.ok(paths.includes("skills/manifest.json"));
  assert.ok(paths.includes("scripts/skills-status.mjs"));
});

test("scaffold adds realtime voice reference files when voice is selected", () => {
  const files = generatedAgentFiles({
    text: "",
    agentName: "Voice Child",
    primaryMission: "Voice controlled child agent",
    targetUser: "operator",
    primaryInterface: "web realtime voice",
    secondaryInterfaces: "",
    telegramMode: "none",
    runtimeFamily: "codex-native",
    memoryModel: "Markdown-first",
    coreFunctions: ["voice control"],
    criticalWorkflows: ["operator speaks and Codex handles deep task"],
  });
  const paths = files.map((file) => file.path);
  assert.ok(paths.includes("interfaces/realtime-voice/README.md"));
  assert.ok(paths.includes("interfaces/realtime-voice/FESPA26_REFERENCE.md"));
  assert.ok(paths.includes("interfaces/realtime-voice/pattern-manifest.json"));
  assert.equal(new Set(paths).size, paths.length);
});

test("scaffold vendors reviewed local skills only when contract selects vendor mode", () => {
  const files = generatedAgentFiles({
    text: "",
    agentName: "Telegram Intake Agent",
    primaryMission: "Triage Telegram intake into Markdown memory and evidence briefs",
    targetUser: "operator",
    successCriteria: "Telegram materials become reviewed Markdown artifacts",
    primaryInterface: "Telegram",
    telegramMode: "primary-chat",
    runtimeFamily: "codex-native",
    memoryModel: "Markdown-first",
    toolSystem: "filesystem markdown skills",
    skillInstallMode: "vendor",
    skillNeeds: "auto",
    allowedSkillSources: "local-only",
    skillMutationPolicy: "read-only",
    secretsRequired: "Telegram bot token",
    allowedNetworkAccess: "Telegram Bot API only",
    coreFunctions: ["Telegram intake triage", "Evidence classification", "Markdown memory update"],
    criticalWorkflows: ["Receive Telegram post and create a source note"],
  });
  const paths = files.map((file) => file.path);
  assert.ok(paths.includes("skills/telegram-intake-triage/SKILL.md"));
  assert.ok(paths.includes("skills/evidence-classification/SKILL.md"));
  assert.ok(paths.includes("skills/markdown-memory-update/SKILL.md"));
  const manifest = JSON.parse(files.find((file) => file.path === "skills/manifest.json").content);
  assert.equal(manifest.policy.install_mode, "vendor");
  assert.ok(manifest.installed.length >= 3);
});
