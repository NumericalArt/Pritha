import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import {resolvePrithaStateRoot} from './paths.mjs';

/** Shared with bootstrap: computing this path does not create a venv. */
export function instancePythonPath({ root = process.cwd(), env = process.env, platform = process.platform } = {}) {
  const state = resolvePrithaStateRoot({root,env});
  return path.join(state!==path.resolve(root) ? state : path.join(root, ".private"),
    "venv", platform === "win32" ? "Scripts/python.exe" : "bin/python");
}

function executable(candidate) {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch { return false; }
}

/** No imports of Python ML libraries and no interpreter execution during resolution. */
export function resolvePrithaPython({ root = process.cwd(), env = process.env, platform = process.platform } = {}) {
  if (env.PRITHA_PYTHON !== undefined) {
    const selected = env.PRITHA_PYTHON.trim();
    // A command name is resolved by execFile's PATH lookup, never a shell.
    if (selected && /^[A-Za-z0-9_.-]+$/.test(selected)) return selected;
    if (selected && !selected.includes("\0") && path.isAbsolute(selected) && executable(selected)) return selected;
    throw Object.assign(new Error("The configured Python interpreter is unavailable."), { code: "python_interpreter_unavailable" });
  }
  const candidate = instancePythonPath({ root, env, platform });
  const venv = path.dirname(path.dirname(candidate));
  if (existsSync(venv)) {
    if (executable(candidate)) return candidate;
    // An incomplete instance environment must not silently use another Python.
    throw Object.assign(new Error("The instance Python environment needs repair."), { code: "python_environment_incomplete" });
  }
  return "python3";
}
