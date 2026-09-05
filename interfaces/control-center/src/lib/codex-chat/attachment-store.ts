import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { atomicWritePrivateJson } from "@/lib/private-json";
import type { AttachmentView } from "./types";

export const ATTACHMENT_LIMITS = { count: 10, fileBytes: 100 * 1024 * 1024, messageBytes: 250 * 1024 * 1024, storageBytes: 10 * 1024 ** 3, unreferencedHours: 24 };
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type StoredAttachment = AttachmentView & { sha256: string; createdAt: string; referenced: boolean; filename: string };
const queues = new Map<string, Promise<unknown>>();

export class AttachmentError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly retryable = false) { super(message); }
}

function imageType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

function publicView(record: StoredAttachment): AttachmentView {
  const { id, name, size, mediaType, kind } = record;
  return { id, name, size, mediaType, kind, href: `/api/codex-chat/v1/attachments/${id}` };
}

export class ChatAttachmentStore {
  readonly root: string;
  constructor(readonly stateRoot: string, privateRoot: string) { this.root = path.join(privateRoot, "attachments"); }

  private async directory(id?: string, create = false) {
    if (id && !ID.test(id)) throw new AttachmentError("attachment_not_found", "Attachment not found.", 404);
    await mkdir(this.stateRoot, { recursive: true, mode: 0o700 });
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const state = await realpath(this.stateRoot);
    const root = await realpath(this.root);
    if (!root.startsWith(`${state}${path.sep}`)) throw new AttachmentError("attachment_storage_unavailable", "Attachment storage is unavailable.", 503);
    if (!id) return root;
    const candidate = path.join(root, id);
    if (create) await mkdir(candidate, { recursive: true, mode: 0o700 });
    const resolved = await realpath(candidate).catch(() => { throw new AttachmentError("attachment_not_found", "Attachment not found.", 404); });
    if (resolved !== candidate) throw new AttachmentError("attachment_storage_unavailable", "Attachment storage is unavailable.", 503);
    return candidate;
  }

  private async record(id: string): Promise<StoredAttachment> {
    const directory = await this.directory(id);
    let record: StoredAttachment;
    try {
      const handle = await open(path.join(directory, "metadata.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { record = JSON.parse(await handle.readFile("utf8")); } finally { await handle.close(); }
    } catch { throw new AttachmentError("attachment_not_found", "An attachment is unavailable. Upload it again before sending.", 404); }
    if (!record || record.id !== id || !/^original(?:\.[a-z0-9]{1,16})?$/.test(record.filename) || !Number.isSafeInteger(record.size) || record.size < 0 || record.size > ATTACHMENT_LIMITS.fileBytes || !/^[a-f0-9]{64}$/.test(record.sha256)
      || typeof record.name !== "string" || !record.name || record.name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(record.name)
      || typeof record.referenced !== "boolean" || !Number.isFinite(Date.parse(record.createdAt))
      || !(record.kind === "file" && record.mediaType === "application/octet-stream" || record.kind === "image" && ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(record.mediaType))) {
      throw new AttachmentError("attachment_corrupt", "Attachment metadata could not be verified.", 409);
    }
    return record;
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const previous = queues.get(this.root) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    queues.set(this.root, current);
    return current.finally(() => { if (queues.get(this.root) === current) queues.delete(this.root); });
  }

  private async storageUsage() {
    const root = await this.directory();
    let bytes = 0;
    const cutoff = Date.now() - ATTACHMENT_LIMITS.unreferencedHours * 3600_000;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ID.test(entry.name)) continue;
      let record: StoredAttachment;
      try { record = await this.record(entry.name); }
      catch {
        const metadataExists = await lstat(path.join(root, entry.name, "metadata.json")).then(() => true, (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
        if (metadataExists) throw new AttachmentError("attachment_storage_unavailable", "Attachment metadata needs recovery. Existing files have been preserved.", 503);
        // An interrupted upload has no published metadata. Only remove old
        // owned directories while this store's upload queue is exclusively held.
        const directory = path.join(root, entry.name);
        if ((await stat(directory)).mtimeMs < cutoff) await rm(directory, { recursive: true, force: true });
        continue;
      }
      if (!record.referenced && Date.parse(record.createdAt) < cutoff) {
        await rm(path.join(root, entry.name), { recursive: true, force: true });
      } else { bytes += record.size; }
    }
    return bytes;
  }

  async upload(id: string, name: string, request: Request): Promise<AttachmentView> {
    if (!ID.test(id)) throw new AttachmentError("invalid_attachment_id", "The upload identifier is invalid.");
    const cleanedName = path.basename(name.replaceAll("\\", "/")).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 240) || "attachment";
    const declared = request.headers.has("content-length") ? Number(request.headers.get("content-length")) : null;
    if (declared != null && (!Number.isSafeInteger(declared) || declared < 0)) throw new AttachmentError("invalid_request", "Invalid upload size.");
    if (declared != null && declared > ATTACHMENT_LIMITS.fileBytes) throw new AttachmentError("attachment_too_large", "Each attachment must be 100 MiB or smaller.", 413);
    return this.enqueue(async () => {
      const usage = await this.storageUsage();
      const directory = await this.directory(id, true);
      let existing: StoredAttachment | null = null;
      try { existing = await this.record(id); } catch (error) { if (!(error instanceof AttachmentError) || error.code !== "attachment_not_found") throw error; }
      const temporary = path.join(directory, `.upload-${randomUUID()}`);
      const file = await open(temporary, "wx", 0o600);
      const reader = request.body?.getReader();
      const hash = createHash("sha256");
      let size = 0;
      let prefix = Buffer.alloc(0);
      try {
        while (reader) {
          const next = await reader.read();
          if (next.done) break;
          const chunk = Buffer.from(next.value);
          size += chunk.length;
          if (size > ATTACHMENT_LIMITS.fileBytes) throw new AttachmentError("attachment_too_large", "Each attachment must be 100 MiB or smaller.", 413);
          if (usage - (existing?.size || 0) + size > ATTACHMENT_LIMITS.storageBytes) throw new AttachmentError("attachment_storage_full", "Attachment storage is full. Existing files have been preserved.", 507);
          if (prefix.length < 16) prefix = Buffer.concat([prefix, chunk.subarray(0, 16 - prefix.length)]);
          hash.update(chunk);
          await file.writeFile(chunk);
        }
        if (declared != null && size !== declared) throw new AttachmentError("attachment_upload_interrupted", "Upload was incomplete. Retry this file.", 503, true);
        await file.sync();
      } catch (error) {
        await reader?.cancel().catch(() => undefined);
        await file.close(); await rm(temporary, { force: true });
        throw error instanceof AttachmentError ? error : new AttachmentError("attachment_upload_interrupted", "Upload was interrupted. Retry this file.", 503, true);
      } finally { reader?.releaseLock(); }
      await file.close();
      const digest = hash.digest("hex");
      if (existing) {
        await rm(temporary, { force: true });
        if (existing.sha256 !== digest || existing.name !== cleanedName) throw new AttachmentError("attachment_conflict", "This upload identifier was already used for another file.", 409);
        return publicView(existing);
      }
      const extension = path.extname(cleanedName).toLowerCase();
      const filename = `original${/^\.[a-z0-9]{1,16}$/.test(extension) ? extension : ""}`;
      const mediaType = imageType(prefix) || "application/octet-stream";
      const record: StoredAttachment = { id, name: cleanedName, size, kind: mediaType.startsWith("image/") ? "image" : "file", mediaType, href: `/api/codex-chat/v1/attachments/${id}`, sha256: digest, createdAt: new Date().toISOString(), referenced: false, filename };
      await rename(temporary, path.join(directory, filename));
      await atomicWritePrivateJson({ stateRoot: await realpath(this.stateRoot), filePath: path.join(directory, "metadata.json"), value: record });
      return publicView(record);
    });
  }

  async resolve(id: string) {
    const record = await this.record(id);
    const filePath = path.join(await this.directory(id), record.filename);
    const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => { throw new AttachmentError("attachment_not_found", "The original attachment is unavailable.", 404); });
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== record.size) throw new AttachmentError("attachment_corrupt", "The original attachment could not be verified.", 409);
    } finally { await handle.close(); }
    return { view: publicView(record), filePath, sha256: record.sha256 };
  }

  async prepare(ids: string[]) {
    if (ids.length > ATTACHMENT_LIMITS.count || new Set(ids).size !== ids.length) throw new AttachmentError("attachment_limit", "Use up to 10 different attachments per message.");
    const files = await Promise.all(ids.map(id => this.resolve(id)));
    if (files.reduce((sum, file) => sum + file.view.size, 0) > ATTACHMENT_LIMITS.messageBytes) throw new AttachmentError("attachment_limit", "Attachments in one message must total 250 MiB or less.", 413);
    for (const file of files) {
      const handle = await open(file.filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const hash = createHash("sha256");
      try { for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk); } finally { await handle.close(); }
      if (hash.digest("hex") !== file.sha256) throw new AttachmentError("attachment_corrupt", "The original attachment changed. Upload it again.", 409);
    }
    return files;
  }

  async retain(ids: string[]) {
    return this.enqueue(async () => {
      for (const id of ids) {
        const record = await this.record(id);
        if (!record.referenced) await atomicWritePrivateJson({ stateRoot: await realpath(this.stateRoot), filePath: path.join(await this.directory(id), "metadata.json"), value: { ...record, referenced: true } });
      }
    });
  }
}
