#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const ROOT = process.env.TECHSCOPE_ROOT
  ? path.resolve(process.env.TECHSCOPE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const args = new Set(argv);
const jsonMode = args.has("--json");
const markdownMode = args.has("--markdown");
const dryRun = args.has("--dry-run");
const strictEnv = args.has("--strict-env");
const profileIndex = argv.indexOf("--profile");
const profile = profileIndex >= 0 ? argv[profileIndex + 1] || "full" : "full";
const simulatedFailures = new Set(
  argv
    .filter((arg) => arg.startsWith("--simulate-fail="))
    .flatMap((arg) => arg.slice("--simulate-fail=".length).split(","))
    .map((item) => item.trim())
    .filter(Boolean),
);

function listTestFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const name of readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTestFiles(fullPath));
    } else if (name.endsWith(".test.mjs")) {
      files.push(path.relative(ROOT, fullPath));
    }
  }
  return files.sort();
}

function commandString(command, commandArgs) {
  return [command, ...commandArgs].join(" ");
}

function run(id, name, command, commandArgs, options = {}) {
  const started = Date.now();
  if (simulatedFailures.has(id)) {
    return {
      id,
      name,
      command: commandString(command, commandArgs),
      status: "fail",
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: `simulated failure for ${id}`,
      notes: "simulated failure",
    };
  }

  if (dryRun) {
    return {
      id,
      name,
      command: commandString(command, commandArgs),
      status: "planned",
      exitCode: 0,
      durationMs: 0,
      stdout: "",
      stderr: "",
      notes: "dry-run",
    };
  }

  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 120000,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });

  return {
    id,
    name,
    command: commandString(command, commandArgs),
    status: result.status === 0 ? "pass" : "fail",
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? result.error.message : undefined,
  };
}

const unitTestFiles = listTestFiles(path.join(ROOT, "tests"));
const allCheckSpecs = [
  ["env-doctor", "Environment doctor", "node", ["scripts/env-doctor.mjs", ...(strictEnv ? ["--strict"] : [])]],
  ["privacy-audit", "Privacy retention audit", "node", ["scripts/privacy-audit.mjs", "--strict"]],
  ["validate-memory", "Markdown memory validation", "node", ["scripts/validate-memory.mjs"]],
  ["rebuild-memory", "Memory rebuild", "node", ["scripts/rebuild-memory.mjs"], { timeoutMs: 180000 }],
  ["smoke-test", "Smoke test", "node", ["scripts/smoke-test.mjs"]],
  ["unit-tests", "Unit tests", "node", ["--test", ...unitTestFiles], { timeoutMs: 180000 }],
  ["agents-mother-test", "Agents Mother self-inspection", "node", ["scripts/agents-mother.mjs", "test", ".", "--no-report"]],
  ["telegram-dry-run", "Telegram dry-run", "node", ["scripts/telegram-bot.mjs", "poll-once", "--dry-run"]],
];

const profileChecks = {
  full: allCheckSpecs.map((spec) => spec[0]),
  "self-test": ["env-doctor", "privacy-audit", "validate-memory", "rebuild-memory", "smoke-test", "unit-tests", "telegram-dry-run"],
};

if (!profileChecks[profile]) {
  console.error(`Unknown quality gate profile: ${profile}`);
  process.exit(1);
}

const checks = allCheckSpecs
  .filter((spec) => profileChecks[profile].includes(spec[0]))
  .map((spec) => run(...spec));

const failed = checks.filter((check) => check.status === "fail");
const payload = {
  schema: "techscope-quality-gate-v1",
  root: ROOT,
  profile,
  status: failed.length > 0 ? "fail" : dryRun ? "planned" : "pass",
  createdAt: new Date().toISOString(),
  dryRun,
  failed: failed.length,
  checks,
};

function compact(text, max = 360) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function printMarkdown() {
  console.log(`# Techscope Quality Gate: ${payload.status}`);
  console.log();
  console.log(`- Root: \`${payload.root}\``);
  console.log(`- Created: \`${payload.createdAt}\``);
  console.log(`- Failed checks: \`${payload.failed}\``);
  console.log();
  console.log("| Status | Check | Command | Duration |");
  console.log("| --- | --- | --- | --- |");
  for (const check of checks) {
    console.log(`| ${check.status} | ${check.name} | \`${check.command}\` | ${check.durationMs}ms |`);
  }
  const failedChecks = checks.filter((check) => check.status === "fail");
  if (failedChecks.length > 0) {
    console.log();
    console.log("## Failures");
    for (const check of failedChecks) {
      console.log();
      console.log(`### ${check.name}`);
      if (check.stderr) console.log(`- stderr: ${compact(check.stderr)}`);
      if (check.stdout) console.log(`- stdout: ${compact(check.stdout)}`);
      if (check.error) console.log(`- error: ${check.error}`);
    }
  }
}

function printHuman() {
  console.log(`Techscope quality gate: ${payload.status}`);
  console.log(`Root: ${payload.root}`);
  for (const check of checks) {
    const suffix = check.status === "planned" ? ` (${check.notes})` : ` (${check.durationMs}ms)`;
    console.log(`- ${check.status.toUpperCase()} ${check.name}${suffix}`);
    if (check.status === "fail") {
      if (check.stderr) console.log(`  stderr: ${check.stderr.split("\n").slice(-4).join(" | ")}`);
      if (check.stdout) console.log(`  stdout: ${check.stdout.split("\n").slice(-4).join(" | ")}`);
      if (check.error) console.log(`  error: ${check.error}`);
    }
  }
}

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else if (markdownMode) {
  printMarkdown();
} else {
  printHuman();
}

if (failed.length > 0) {
  process.exitCode = 1;
}
