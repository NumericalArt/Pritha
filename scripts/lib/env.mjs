import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./paths.mjs";

export function loadEnvFile(filePath, target = process.env) {
  if (!existsSync(filePath)) return false;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (target[key] === undefined) target[key] = value;
  }
  return true;
}

export function loadEnv(options = {}) {
  const root = options.root || resolveTechscopeRoot();
  loadEnvFile(path.join(root, ".env"), options.target || process.env);
  loadEnvFile(path.join(root, ".env.local"), options.target || process.env);
}
