#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const strictMode = args.has("--strict");

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: options.maxBuffer || 30 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function trackedFiles() {
  const result = git(["ls-files", "-z"]);
  if (!result.ok) throw new Error(result.stderr || "git ls-files failed");
  return result.stdout.split("\0").filter(Boolean);
}

function textFilesWithMatches(files, pattern) {
  const matches = [];
  for (const relPath of files) {
    const fullPath = path.join(ROOT, relPath);
    if (!existsSync(fullPath)) continue;
    let text = "";
    try {
      text = readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (pattern.test(lines[index])) {
        matches.push({ file: relPath, line: index + 1, text: lines[index].trim().slice(0, 220) });
      }
      pattern.lastIndex = 0;
    }
  }
  return matches;
}

function compact(matches, limit = 80) {
  return {
    count: matches.length,
    sample: matches.slice(0, limit),
    truncated: Math.max(0, matches.length - limit),
  };
}

const files = trackedFiles();
const secretHistory = git(["log", "--all", "--oneline", "--", ".env", ".env.local", "*.sqlite", "*.token", "secrets/*"]);
const forbiddenTracked = files.filter((file) =>
  file === ".env" ||
  file === ".env.local" ||
  file.endsWith(".sqlite") ||
  file.endsWith(".token") ||
  file.startsWith("secrets/") ||
  file.startsWith("secure-handoffs/"),
);
const localPathMatches = textFilesWithMatches(files, /\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+/g);
const longTokenCandidates = textFilesWithMatches(files, /[A-Za-z0-9_-]{40,}/g);
const telegramIdMatches = textFilesWithMatches(files, /\b\d{9,12}\b/g).filter((match) =>
  /telegram|allowed_users|user_id|chat_id/i.test(match.text) || /telegram/i.test(match.file),
);

const optionalScanners = {
  gitleaks: commandExists("gitleaks"),
  trufflehog: commandExists("trufflehog"),
};

const checks = [
  {
    id: "secret-history",
    status: secretHistory.stdout.trim() ? "fail" : "pass",
    detail: secretHistory.stdout.trim() || "no tracked secret-file history found",
  },
  {
    id: "forbidden-tracked-files",
    status: forbiddenTracked.length ? "fail" : "pass",
    detail: forbiddenTracked.length ? forbiddenTracked.join("\n") : "no forbidden tracked files",
  },
  {
    id: "local-absolute-paths",
    status: localPathMatches.length ? "fail" : "pass",
    detail: compact(localPathMatches),
  },
  {
    id: "long-token-candidates",
    status: longTokenCandidates.length ? "warn" : "pass",
    detail: compact(longTokenCandidates),
  },
  {
    id: "telegram-id-candidates",
    status: telegramIdMatches.length ? "warn" : "pass",
    detail: compact(telegramIdMatches),
  },
  {
    id: "secure-handoffs-location",
    status: existsSync(path.join(ROOT, "secure-handoffs")) ? "fail" : "pass",
    detail: existsSync(path.join(ROOT, "secure-handoffs")) ? "secure-handoffs exists inside repo" : "secure-handoffs not tracked inside repo",
  },
  {
    id: "gitleaks",
    status: optionalScanners.gitleaks ? "available" : "missing",
    detail: optionalScanners.gitleaks || "install locally for one-time release scan",
  },
  {
    id: "trufflehog",
    status: optionalScanners.trufflehog ? "available" : "missing",
    detail: optionalScanners.trufflehog || "install locally for one-time release scan",
  },
];

const failed = checks.filter((check) => check.status === "fail");
const warnings = checks.filter((check) => check.status === "warn" || check.status === "missing");
const payload = {
  schema: "pritha-pre-push-audit-v1",
  root: ROOT,
  status: failed.length === 0 ? "pass" : "fail",
  strict: strictMode,
  failed: failed.length,
  warnings: warnings.length,
  checks,
};

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Pritha pre-push audit: ${payload.status}`);
  for (const check of checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.id}`);
    if (typeof check.detail === "string") {
      console.log(`  ${check.detail.split("\n").slice(0, 6).join("\n  ")}`);
    } else {
      console.log(`  count=${check.detail.count}, truncated=${check.detail.truncated}`);
      for (const item of check.detail.sample.slice(0, 5)) {
        console.log(`  ${item.file}:${item.line}: ${item.text}`);
      }
    }
  }
}

if (failed.length > 0 || (strictMode && warnings.length > 0)) {
  process.exitCode = 1;
}
