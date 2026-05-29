#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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
const rawMediaPattern = /^01_sources\/raw\/.*\.(mp4|wav|mov|mkv|webm|mp3|m4a|avi|flac)$/i;
const maxRegularFileBytes = 95 * 1024 * 1024;
const requiredMemorySnapshotFiles = [
  ".memory/README.md",
  ".memory/schema.sql",
  ".memory/techscope.sqlite",
  ".memory/last-rebuild.sql",
  ".memory/last-self-test.json",
];
const secretHistory = git(["log", "--all", "--oneline", "--", ".env", ".env.local", "*.token", "secrets/*", "secure-handoffs/*"]);
const forbiddenTracked = files.filter((file) =>
  file === ".env" ||
  file === ".env.local" ||
  file.endsWith(".token") ||
  file.startsWith("secrets/") ||
  file.startsWith(".queue/") ||
  file.startsWith(".logs/") ||
  file.startsWith(".tools/") ||
  file.startsWith("secure-handoffs/"),
);
const forbiddenRawMedia = files.filter((file) => rawMediaPattern.test(file));
const oversizedTrackedFiles = files.filter((file) => {
  try {
    return statSync(path.join(ROOT, file)).size > maxRegularFileBytes;
  } catch {
    return false;
  }
});
const missingMemorySnapshot = requiredMemorySnapshotFiles.filter((file) => !existsSync(path.join(ROOT, file)));
const untrackedMemorySnapshot = requiredMemorySnapshotFiles.filter((file) => existsSync(path.join(ROOT, file)) && !files.includes(file));
const ignoredMemorySnapshot = requiredMemorySnapshotFiles.filter((file) => {
  const result = git(["check-ignore", "-q", "--", file]);
  return result.status === 0;
});
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
    id: "raw-audio-video-media",
    status: forbiddenRawMedia.length ? "fail" : "pass",
    detail: forbiddenRawMedia.length ? forbiddenRawMedia.join("\n") : "no raw audio/video media tracked",
  },
  {
    id: "oversized-tracked-files",
    status: oversizedTrackedFiles.length ? "fail" : "pass",
    detail: oversizedTrackedFiles.length
      ? oversizedTrackedFiles.map((file) => {
          const size = statSync(path.join(ROOT, file)).size;
          return `${file} (${Math.round(size / 1024 / 1024)} MiB)`;
        }).join("\n")
      : "no tracked file exceeds 95 MiB",
  },
  {
    id: "portable-memory-snapshot",
    status: missingMemorySnapshot.length || ignoredMemorySnapshot.length ? "fail" : "pass",
    detail: missingMemorySnapshot.length || ignoredMemorySnapshot.length
      ? [
          missingMemorySnapshot.length ? `missing required files: ${missingMemorySnapshot.join(", ")}` : "",
          ignoredMemorySnapshot.length ? `ignored by gitignore: ${ignoredMemorySnapshot.join(", ")}` : "",
        ].filter(Boolean).join("\n")
      : "required .memory snapshot files exist and are not ignored",
  },
  {
    id: "portable-memory-tracking",
    status: untrackedMemorySnapshot.length ? "warn" : "pass",
    detail: untrackedMemorySnapshot.length
      ? `add before commit: ${untrackedMemorySnapshot.join(", ")}`
      : "portable .memory snapshot files are tracked",
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
  schema: "pritha-pre-push-audit-v2",
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
