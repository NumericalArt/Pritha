import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readBoundedRegularFile } from "./safe-file-read.mjs";

// Only explicitly declared dotenv files inside an existing child project.
export function normalizeCredentialTarget(target = ".env.local") {
  if (typeof target !== "string" || target.length > 240) return null;
  return /^(?:[A-Za-z0-9_-]+\/){0,8}\.env\.local$/.test(target) ? target : null;
}

export function credentialFilePath(projectRoot, target = ".env.local") {
  const relative = normalizeCredentialTarget(target);
  if (!relative || !path.isAbsolute(projectRoot)) throw new Error("unsafe_credential_store");
  let cursor = path.resolve(projectRoot);
  const rootStat = lstatSync(cursor);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("unsafe_credential_store");
  for (const segment of relative.split("/").slice(0, -1)) {
    cursor = path.join(cursor, segment);
    const stat = lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe_credential_store");
  }
  const file = path.join(cursor, ".env.local");
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("unsafe_credential_store");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return file;
}

export function readCredentialFile(projectRoot, target = ".env.local") {
  const file = credentialFilePath(projectRoot, target);
  try { return readBoundedRegularFile(file, { allowedRoots: [projectRoot], maxBytes: 32_000 }).text; }
  catch (error) { if (error.code === "ENOENT") return ""; throw error; }
}

export function updateCredentialFile(projectRoot, target, transform) {
  const file = credentialFilePath(projectRoot, target);
  const current = readCredentialFile(projectRoot, target);
  const next = transform(current);
  if (typeof next !== "string" || Buffer.byteLength(next) > 32_000) throw new Error("invalid_credential_store");
  const backupDir = `${file}.backups`;
  if (existsSync(file)) {
    try { mkdirSync(backupDir, { mode: 0o700 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = lstatSync(backupDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe_credential_store");
    chmodSync(backupDir, 0o700);
    // A private .gitignore also protects repositories without a root ignore rule.
    const ignore = path.join(backupDir, ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, "*\n", { mode: 0o600, flag: "wx" });
    writeFileSync(path.join(backupDir, `${Date.now()}-${randomUUID()}.bak`), current, { mode: 0o600, flag: "wx" });
    const backups = readdirSync(backupDir).filter(name => /^\d+-[a-f0-9-]+\.bak$/.test(name)).sort().reverse();
    for (const name of backups.slice(5)) rmSync(path.join(backupDir, name));
  }
  const tmp = path.join(path.dirname(file), `.env.local.tmp-${randomUUID()}`);
  try {
    const fd = openSync(tmp, "wx", 0o600);
    try { writeFileSync(fd, next, "utf8"); fsyncSync(fd); }
    finally { closeSync(fd); }
    credentialFilePath(projectRoot, target);
    if (readCredentialFile(projectRoot, target) !== current) throw new Error("credential_store_changed");
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  } finally { rmSync(tmp, { force: true }); }
}
