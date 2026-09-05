import { AttachmentError } from "./attachment-store";
import type { RuntimeCapabilityMap } from "./types";

export function assertAttachmentCapabilities(options: { hasImages: boolean; hasFiles: boolean; capabilities: RuntimeCapabilityMap; inputModalities: string[] | null }) {
  if (options.hasFiles && !options.capabilities.fileMetadata) throw new AttachmentError("attachment_runtime_unsupported", "This runtime cannot verify access to attachments. Use a supported runtime before sending.", 409);
  if (options.hasImages && (!options.capabilities.imageInput || !options.inputModalities?.includes("image"))) {
    throw new AttachmentError("model_image_unsupported", "The selected model's image support is unavailable or unverified. Choose an image-capable model to continue this conversation. Your draft and files have been kept.", 409);
  }
}
