import type { FileHandle } from "node:fs/promises";
export type AttachmentView = { id: string; name: string; size: number; mediaType: string; kind: "image" | "file"; href: string };
export type PreparedAttachment = { view: AttachmentView; sha256: string; filePath: string };
export const ATTACHMENT_LIMITS: Readonly<{ count: number; fileBytes: number; messageBytes: number; storageBytes: number; unreferencedHours: number }>;
export type AttachmentStoreOptions = { stateRoot: string; privateRoot: string; limits?: Partial<typeof ATTACHMENT_LIMITS>; lockTimeoutMs?: number; uploadIdleMs?: number; allowLegacyMetadata?: boolean };
export class AttachmentError extends Error {
  code: string; status: number; retryable: boolean;
  constructor(code: string, message: string, status?: number, retryable?: boolean);
}
export class ImmutableAttachmentStore {
  root: string; stateRoot: string; limits: typeof ATTACHMENT_LIMITS;
  constructor(options: AttachmentStoreOptions);
  initialize(): Promise<void>;
  upload(id: string, name: string, request: Request): Promise<AttachmentView>;
  openOriginal(id: string): Promise<PreparedAttachment & { handle: FileHandle }>;
  resolve(id: string): Promise<PreparedAttachment>;
  prepare(ids: string[], options?: { retain?: boolean }): Promise<PreparedAttachment[]>;
  retain(ids: string[]): Promise<void>;
  snapshotForDispatch(ids: string[], directory: string): Promise<(PreparedAttachment & { filePath: string })[]>;
  close(): Promise<void>;
}
