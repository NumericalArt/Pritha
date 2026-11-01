import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function existingLockMetadata(lockPath) {
  try {
    const value = JSON.parse(readFileSync(lockPath, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function lockCanBeRecovered(lockPath, options = {}) {
  const metadata = existingLockMetadata(lockPath);
  const staleAfterMs = Number.isFinite(options.staleAfterMs) ? Math.max(0, options.staleAfterMs) : 6 * 60 * 60 * 1000;
  const createdAt = Date.parse(metadata?.created_at || "");
  // A new lock is visible between open("wx") and writing its owner metadata.
  // Missing/partial metadata is not evidence that its owner is dead.
  let stat;
  try { stat = lstatSync(lockPath); } catch { return false; }
  if (!stat.isFile() || stat.isSymbolicLink()) return false;
  const ageMs = Date.now() - (Number.isFinite(createdAt) ? createdAt : stat.mtimeMs);
  const sameHost = !metadata?.hostname || metadata.hostname === os.hostname();
  if (sameHost && Number.isSafeInteger(metadata?.pid)) return !processIsAlive(metadata.pid);
  return ageMs >= Math.max(5_000, staleAfterMs);
}

function recoverLock(lockPath, token, options) {
  // Serialize stale-owner recovery separately. Otherwise two recoverers can
  // both observe a dead PID and the second can rename the first's new lock.
  const recoveryPath = `${lockPath}.recovery`;
  let descriptor;
  try { descriptor = openSync(recoveryPath, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") return false; throw error; }
  try {
    writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, token })}\n`);
    fsyncSync(descriptor);
    if (!lockCanBeRecovered(lockPath, options)) return false;
    renameSync(lockPath, `${lockPath}.stale.${Date.now()}.${token}`);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  } finally {
    closeSync(descriptor);
    rmSync(recoveryPath, { force: true });
  }
}

export function acquireFileLock(filePath, options = {}) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const token = randomUUID();
  const metadata = {
    schema: "pritha-local-file-lock-v1",
    token,
    pid: process.pid,
    hostname: os.hostname(),
    created_at: new Date().toISOString(),
  };
  let descriptor;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
      writeFileSync(descriptor, `${JSON.stringify(metadata)}\n`);
      fsyncSync(descriptor);
      break;
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      descriptor = undefined;
      if (error?.code !== "EEXIST") throw error;
      if (attempt === 0 && recoverLock(lockPath, token, options)) continue;
      const owner = existingLockMetadata(lockPath);
      const ownerSummary = owner?.pid ? ` pid=${owner.pid}` : "";
      throw new Error(`File is locked by another operation:${ownerSummary} ${filePath}`);
    }
  }
  if (descriptor === undefined) throw new Error(`Could not acquire file lock: ${filePath}`);
  closeSync(descriptor);
  let released = false;
  return {
    lockPath,
    metadata,
    release() {
      if (released) return;
      released = true;
      const current = existingLockMetadata(lockPath);
      if (current?.token === token) rmSync(lockPath, { force: true });
    },
  };
}

export function withFileLock(filePath, callback, options = {}) {
  const lock = acquireFileLock(filePath, options);
  let result;
  try {
    result = callback(lock.metadata);
  } catch (error) {
    lock.release();
    throw error;
  }
  if (result && typeof result.then === "function") return Promise.resolve(result).finally(() => lock.release());
  lock.release();
  return result;
}

export function atomicWriteFile(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }
}

export function atomicCompareAndSwapFile(filePath, expectedContent, nextContent) {
  return withFileLock(filePath, () => {
    const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
    if (current !== expectedContent) throw new Error(`File changed during operation; refusing to overwrite: ${filePath}`);
    atomicWriteFile(filePath, nextContent);
  });
}
