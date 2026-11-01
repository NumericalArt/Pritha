import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolvePrithaRoot,resolvePrithaStateRoot,prithaRootEnvironment } from "./paths.mjs";

const PATH_KEYS = new Set(['PRITHA_ROOT','TECHSCOPE_ROOT','PRITHA_STATE_ROOT','PRITHA_AGENT_PARENT','PRITHA_INSTANCE_ID','PRITHA_INSTANCE_ROLE','PRITHA_CONTROL_CENTER_PORT','PRITHA_CONTROL_CENTER_ENV_FILE']);

export function loadEnvFile(filePath, target = process.env, allowedKeys = null) {
  if (!existsSync(filePath)) return false;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (allowedKeys && !allowedKeys.has(key)) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (target[key] === undefined) target[key] = value;
  }
  return true;
}

export function loadEnv(options = {}) {
  const root = options.root || resolvePrithaRoot({env:options.target || process.env});
  const target = options.target || process.env;
  loadEnvFile(path.join(root, ".env"), target, options.pathOnly ? PATH_KEYS : null);
  loadEnvFile(path.join(root, ".env.local"), target, options.pathOnly ? PATH_KEYS : null);
  return target;
}

export function loadPrithaRuntimeEnv(options = {}) {
  const target = options.target || process.env;
  const initialRoot=resolvePrithaRoot({root:options.root,env:target});
  if(options.root!==undefined)Object.assign(target,prithaRootEnvironment(initialRoot));
  loadEnv({ root:initialRoot, target, pathOnly: options.pathOnly });
  const root=resolvePrithaRoot({cwd:initialRoot,env:target});
  const stateRoot = resolvePrithaStateRoot({root,stateRoot:target.PRITHA_STATE_ROOT,env:target});
  if (stateRoot !== root) {
    loadEnvFile(path.join(stateRoot, "config", "runtime.env"), target, options.pathOnly ? PATH_KEYS : null);
  }
  const configuredRoot=resolvePrithaRoot({cwd:root,env:target});
  Object.assign(target,prithaRootEnvironment(configuredRoot));
  return { root:configuredRoot, stateRoot, target };
}
