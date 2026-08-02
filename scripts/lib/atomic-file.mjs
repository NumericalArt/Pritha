import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export function withFileLock(filePath, callback) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`);
    fsyncSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error?.code === "EEXIST") throw new Error(`File is locked by another operation: ${filePath}`);
    throw error;
  }
  try {
    return callback();
  } finally {
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
  }
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
