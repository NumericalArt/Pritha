import { existsSync } from "node:fs";
import path from "node:path";

export function resolveTechscopeRoot() {
  if (process.env.TECHSCOPE_ROOT) {
    const envRoot = path.resolve(process.env.TECHSCOPE_ROOT);
    if (existsSync(envRoot)) return envRoot;
  }

  let cursor = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(cursor, "AGENTS.md")) && existsSync(path.join(cursor, "11_agents"))) return cursor;
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }

  return process.cwd();
}

export function resolvePrithaStateRoot(root = resolveTechscopeRoot()) {
  return process.env.PRITHA_STATE_ROOT ? path.resolve(process.env.PRITHA_STATE_ROOT) : root;
}

export function resolvePrithaAgentParent(root = resolveTechscopeRoot()) {
  return process.env.PRITHA_AGENT_PARENT ? path.resolve(process.env.PRITHA_AGENT_PARENT) : path.dirname(root);
}

export function resolvePrithaAgentMemoryRoot(root = resolveTechscopeRoot()) {
  const stateRoot = resolvePrithaStateRoot(root);
  return stateRoot === root ? path.join(root, "11_agents") : path.join(stateRoot, "agents");
}

export function isPrithaCodeCheckout(candidate: string) {
  const directory = path.resolve(candidate);
  return existsSync(path.join(directory, "11_agents"))
    && existsSync(path.join(directory, "scripts", "pritha.mjs"))
    && existsSync(path.join(directory, "interfaces", "control-center"));
}

const stateLayout = {
  config: "config",
  setup: "setup",
  memory: "memory",
  private: "private",
  queue: "queue",
  logs: "logs",
  audit: "audit",
  snapshots: "snapshots",
  voiceDrafts: "voice-drafts",
  agents: "agents",
  releases: "releases",
} as const;

const legacyStateLayout: Record<keyof typeof stateLayout, string> = {
  config: "",
  setup: "",
  memory: ".memory",
  private: ".private",
  queue: ".queue",
  logs: ".logs",
  audit: path.join(".snapshots", "audit"),
  snapshots: ".snapshots",
  voiceDrafts: "03_reviews",
  agents: "11_agents",
  releases: path.join(".snapshots", "releases"),
};

export function resolvePrithaStatePath(kind: keyof typeof stateLayout, ...segments: string[]) {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  const directory = stateRoot === root ? legacyStateLayout[kind] : stateLayout[kind];
  return path.join(stateRoot, directory, ...segments);
}
