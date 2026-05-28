import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

function gitRootFromCwd(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function resolveTechscopeRoot(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  if (process.env.TECHSCOPE_ROOT) {
    return path.resolve(process.env.TECHSCOPE_ROOT);
  }
  return gitRootFromCwd(cwd) || cwd;
}

export function resolveSiblingAgentPath(name, options = {}) {
  if (options.overridePath) {
    return path.resolve(options.overridePath);
  }
  if (!name || typeof name !== "string") {
    throw new Error("resolveSiblingAgentPath(name) requires a non-empty agent name.");
  }
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot(options);
  return path.join(path.dirname(root), name);
}

export function pathFromRoot(...segments) {
  return path.join(resolveTechscopeRoot(), ...segments);
}
