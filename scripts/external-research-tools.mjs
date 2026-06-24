#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const LOCK_PATH = path.join("tools", "external-research", "last30days-lock.json");
const PYTHON_VERSION_PROBE = "import json,sys; print(json.dumps({'executable': sys.executable, 'version': '.'.join(map(str, sys.version_info[:3])), 'major': sys.version_info[0], 'minor': sys.version_info[1], 'micro': sys.version_info[2]}))";

const SECRET_ENV_PATTERNS = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /COOKIE/i,
  /AUTH/i,
  /API[_-]?KEY/i,
  /^CT0$/i,
  /^OPENAI_API_KEY$/i,
  /^SCRAPECREATORS_API_KEY$/i,
  /^PERPLEXITY_API_KEY$/i,
  /^OPENROUTER_API_KEY$/i,
  /^XAI_API_KEY$/i,
  /^APIFY_API_TOKEN$/i,
  /^BRAVE_API_KEY$/i,
  /^SERPER_API_KEY$/i,
  /^PARALLEL_API_KEY$/i,
  /^BSKY_APP_PASSWORD$/i,
  /^TRUTHSOCIAL_TOKEN$/i,
];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 30_000,
  });
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}

export function loadExternalResearchToolLock(options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const lockPath = path.join(root, LOCK_PATH);
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  return { root, lockPath, lock };
}

export function last30DaysConfig(options = {}) {
  const { root, lockPath, lock } = loadExternalResearchToolLock(options);
  const cfg = lock?.tools?.last30days;
  if (!cfg) throw new Error(`Missing last30days lock entry in ${path.relative(root, lockPath)}`);
  const installPath = path.resolve(root, cfg.install_path);
  const enginePath = path.resolve(installPath, cfg.engine_path);
  return {
    ...cfg,
    root,
    lockPath,
    installPath,
    enginePath,
  };
}

export function pythonVersionMeets(version, minimum = { major: 3, minor: 12 }) {
  if (!version) return false;
  const major = Number(version.major);
  const minor = Number(version.minor);
  return Number.isFinite(major) && Number.isFinite(minor)
    && (major > minimum.major || (major === minimum.major && minor >= minimum.minor));
}

export function localPythonCandidates(root) {
  const base = path.join(root, ".tools", "python");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((entry) => entry.startsWith("cpython-"))
    .sort()
    .reverse()
    .flatMap((entry) => [
      path.join(base, entry, "bin", "python3"),
      path.join(base, entry, "bin", "python3.13"),
      path.join(base, entry, "bin", "python3.12"),
    ])
    .filter((candidate, index, all) => existsSync(candidate) && all.indexOf(candidate) === index);
}

export function detectPython(options = {}) {
  const env = options.env || process.env;
  const candidates = options.candidates || [
    env.PRITHA_LAST30DAYS_PYTHON,
    "python3.13",
    "python3.12",
    "python3",
  ].filter(Boolean);
  const found = [];

  for (const command of candidates) {
    const result = run(command, ["-c", PYTHON_VERSION_PROBE], {
      env,
      timeoutMs: options.timeoutMs || 10_000,
    });
    if (result.status !== 0) {
      found.push({
        command,
        ok: false,
        error: firstLine(result.stderr) || result.error?.message || "not found",
      });
      continue;
    }
    try {
      const parsed = JSON.parse(result.stdout);
      const ok = pythonVersionMeets(parsed);
      const entry = {
        command,
        ok,
        executable: parsed.executable,
        version: parsed.version,
        major: parsed.major,
        minor: parsed.minor,
        micro: parsed.micro,
      };
      found.push(entry);
      if (ok) return { ok: true, selected: entry, found };
    } catch (error) {
      found.push({ command, ok: false, error: error.message });
    }
  }

  return { ok: false, selected: null, found };
}

export function sanitizedLast30DaysEnv(baseEnv = process.env, options = {}) {
  const keep = {};
  const keepPath = options.allowHostTools !== false;
  for (const key of ["HOME", "TMPDIR", "LANG", "LC_ALL", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"]) {
    if (baseEnv[key]) keep[key] = baseEnv[key];
  }
  if (keepPath && baseEnv.PATH) keep.PATH = baseEnv.PATH;
  if (!keepPath) keep.PATH = "";
  for (const [key, value] of Object.entries(options.extra || {})) {
    if (value !== undefined && value !== null) keep[key] = String(value);
  }
  for (const key of Object.keys(keep)) {
    if (SECRET_ENV_PATTERNS.some((pattern) => pattern.test(key))) delete keep[key];
  }
  keep.PYTHONIOENCODING = "utf-8";
  keep.CODEX_AUTH_FILE = "/dev/null";
  keep.LAST30DAYS_CONFIG_DIR = "";
  keep.LAST30DAYS_MEMORY_DIR = "";
  keep.LAST30DAYS_STORE = "";
  keep.FROM_BROWSER = "off";
  keep.SETUP_COMPLETE = "true";
  return keep;
}

function gitAvailable(env = process.env) {
  const result = run("git", ["--version"], { env, timeoutMs: 10_000 });
  return {
    ok: result.status === 0,
    version: result.status === 0 ? firstLine(result.stdout) : "",
    error: result.status === 0 ? "" : firstLine(result.stderr) || result.error?.message || "git unavailable",
  };
}

function checkoutCommit(installPath, env = process.env) {
  if (!existsSync(path.join(installPath, ".git"))) return "";
  const result = run("git", ["rev-parse", "HEAD"], { cwd: installPath, env, timeoutMs: 10_000 });
  return result.status === 0 ? firstLine(result.stdout).trim() : "";
}

export function statusForLast30Days(options = {}) {
  const cfg = last30DaysConfig(options);
  const env = options.env || process.env;
  const pythonCandidates = options.pythonCandidates || [
    env.PRITHA_LAST30DAYS_PYTHON,
    ...localPythonCandidates(cfg.root),
    "python3.13",
    "python3.12",
    "python3",
  ].filter(Boolean);
  const python = detectPython({ env, candidates: pythonCandidates });
  const git = gitAvailable(env);
  const installPathExists = existsSync(cfg.installPath);
  const enginePathExists = existsSync(cfg.enginePath);
  const installed = installPathExists && enginePathExists;
  const currentCommit = installPathExists ? checkoutCommit(cfg.installPath, env) : "";
  const issues = [];

  if (!python.ok) issues.push("python>=3.12 not found");
  if (!git.ok) issues.push("git not available");
  if (!installed) issues.push("pinned checkout not installed");
  if (installed && currentCommit && currentCommit !== cfg.commit) {
    issues.push(`installed checkout is ${currentCommit}, expected ${cfg.commit}`);
  }

  let status = "ready";
  if (installed && currentCommit && currentCommit !== cfg.commit) {
    status = "failed-pin-mismatch";
  } else if (!python.ok) {
    status = "pending-runtime";
  } else if (!installed) {
    status = "pending-install";
  } else if (!git.ok) {
    status = "pending-runtime";
  }

  return {
    name: "last30days",
    status,
    ok: status === "ready",
    repo: cfg.repo,
    commit: cfg.commit,
    version: cfg.version,
    pythonRequirement: cfg.python,
    installPath: path.relative(cfg.root, cfg.installPath),
    enginePath: path.relative(cfg.root, cfg.enginePath),
    installed,
    installPathExists,
    enginePathExists,
    currentCommit,
    git,
    python,
    issues,
  };
}

function installLast30Days(options = {}) {
  if (!options.yes) {
    throw new Error("Installing last30days is a mutating action. Re-run with `--yes` to create/update the pinned checkout.");
  }
  const cfg = last30DaysConfig(options);
  const env = sanitizedLast30DaysEnv(process.env, { allowHostTools: false });
  const parent = path.dirname(cfg.installPath);
  mkdirSync(parent, { recursive: true });

  if (existsSync(cfg.installPath)) {
    const stat = statSync(cfg.installPath);
    if (!stat.isDirectory()) throw new Error(`Install path exists and is not a directory: ${cfg.installPath}`);
    if (!existsSync(path.join(cfg.installPath, ".git"))) {
      throw new Error(`Install path exists but is not a git checkout: ${cfg.installPath}`);
    }
    const fetch = run("git", ["fetch", "--tags", "origin"], { cwd: cfg.installPath, env, stdio: "inherit", timeoutMs: 120_000 });
    if (fetch.status !== 0) throw new Error(`git fetch failed in ${cfg.installPath}`);
  } else {
    const clone = run("git", ["clone", cfg.repo, cfg.installPath], { env, stdio: "inherit", timeoutMs: 240_000 });
    if (clone.status !== 0) throw new Error(`git clone failed for ${cfg.repo}`);
  }

  const checkout = run("git", ["checkout", "--detach", cfg.commit], { cwd: cfg.installPath, env, stdio: "inherit", timeoutMs: 120_000 });
  if (checkout.status !== 0) throw new Error(`git checkout failed for ${cfg.commit}`);
  return statusForLast30Days(options);
}

function diagnoseLast30Days(options = {}) {
  const status = statusForLast30Days(options);
  if (!status.ok) return { ...status, diagnose: "skipped", diagnoseError: "backend is not ready" };
  const cfg = last30DaysConfig(options);
  const env = sanitizedLast30DaysEnv(process.env);
  const python = status.python.selected.command;
  const result = run(python, [cfg.enginePath, "--help"], { env, timeoutMs: 30_000 });
  return {
    ...status,
    diagnose: result.status === 0 ? "ok" : "failed",
    diagnoseOutput: firstLine(result.stdout),
    diagnoseError: firstLine(result.stderr) || result.error?.message || "",
  };
}

function usage() {
  console.log(`Usage:
  node scripts/external-research-tools.mjs status [--json]
  node scripts/external-research-tools.mjs install last30days --yes
  node scripts/external-research-tools.mjs diagnose last30days [--json]

Notes:
  status is read-only.
  install writes only to the ignored .tools/ directory and checks out the pinned commit.
  diagnose runs the pinned local engine with a sanitized environment.`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function main() {
  const command = process.argv[2] || "status";
  const options = parseArgs(process.argv.slice(3));
  try {
    if (command === "help" || command === "--help") {
      usage();
      return;
    }
    if (command === "status") {
      printJson(statusForLast30Days());
      return;
    }
    if (command === "install") {
      const tool = options._[0] || "last30days";
      if (tool !== "last30days") throw new Error(`Unknown external research tool: ${tool}`);
      printJson(installLast30Days({ yes: Boolean(options.yes) }));
      return;
    }
    if (command === "diagnose") {
      const tool = options._[0] || "last30days";
      if (tool !== "last30days") throw new Error(`Unknown external research tool: ${tool}`);
      printJson(diagnoseLast30Days());
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
