import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function canonicalPath(value: string) {
  return realpathSync(path.resolve(value));
}

export function effectiveCodexHome() {
  return canonicalPath(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

export function storageIdentity(home: string) {
  return `storage-v2:${createHash("sha256").update(canonicalPath(home)).digest("hex")}`;
}

// Old hashes are evidence, never authorization to read a different home.
export function legacyIdentityMatches(oldHash: string | null, provider: string, versions: string[], home: string) {
  if (!oldHash || oldHash.startsWith("storage-v2:")) return false;
  const effective = canonicalPath(home);
  const spellings = new Set([home, effective]);
  if (process.env.CODEX_HOME && canonicalPath(process.env.CODEX_HOME) === effective) spellings.add(process.env.CODEX_HOME);
  try {
    if (canonicalPath(path.join(os.homedir(), ".codex")) === effective) {
      spellings.add("default");
      spellings.add(path.join(os.homedir(), ".codex"));
    }
  } catch { /* a non-default home does not authorize historical default bindings */ }
  return versions.some((version) => [...spellings].some((spelling) =>
    createHash("sha256").update(`${provider}:${version}:${spelling}`).digest("hex").slice(0, 20) === oldHash));
}

export function verifyNativeThreadIdentity(thread: Record<string, unknown>, threadId: string, root: string) {
  if (thread.id !== threadId || typeof thread.cwd !== "string") return false;
  try { return canonicalPath(thread.cwd) === canonicalPath(root); } catch { return false; }
}
