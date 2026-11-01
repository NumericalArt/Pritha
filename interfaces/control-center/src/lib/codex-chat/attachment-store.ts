import path from "node:path";
import { ImmutableAttachmentStore, type AttachmentStoreOptions } from "../../../../../scripts/lib/chat-attachment-store.mjs";

export { AttachmentError, ATTACHMENT_LIMITS } from "../../../../../scripts/lib/chat-attachment-store.mjs";

/** Keep canonical IDs, URLs and legacy metadata readable without rewriting originals. */
export class ChatAttachmentStore extends ImmutableAttachmentStore {
  constructor(stateRoot: string, privateRoot: string, options: Omit<AttachmentStoreOptions, 'stateRoot' | 'privateRoot' | 'allowLegacyMetadata'> = {}) {
    super({ ...options, stateRoot, privateRoot, allowLegacyMetadata: true });
  }

  upload(id: string, name: string, request: Request) {
    const cleanedName = path.basename(name.replaceAll("\\", "/")).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 240) || "attachment";
    return super.upload(id, cleanedName, request);
  }
}
