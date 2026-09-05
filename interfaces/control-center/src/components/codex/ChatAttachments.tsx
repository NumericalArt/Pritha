"use client";
import { File, LoaderCircle, X } from "lucide-react";
import type { AttachmentView } from "@/lib/codex-chat/types";
import type { DraftAttachment } from "./useChatAttachments";

export function AttachmentLinks({ files }: { files: AttachmentView[] }) {
  return <div className="codex-attachments" aria-label="Message attachments">{files.map(file => <a key={file.id} className="codex-attachment" href={file.href} target="_blank" rel="noopener noreferrer" download={file.name}>
    {file.kind === "image" ? <img src={file.href} alt={file.name} loading="lazy" /> : <File size={20} />}
    <span>{file.name}<small>{Math.ceil(file.size / 1024)} KiB · Download original</small></span>
  </a>)}</div>;
}

export function DraftAttachments({ items, locked, remove, retry }: { items: DraftAttachment[]; locked: boolean; remove: (id: string) => void; retry: (file: DraftAttachment) => void }) {
  return <div className="codex-attachments codex-draft-attachments" aria-label="Draft attachments">{items.map(item => <div key={item.id} className="codex-attachment">
    {item.view?.kind === "image" ? <img src={item.view.href} alt={item.view.name} /> : item.state === "uploading" ? <LoaderCircle size={20} className="spin" /> : <File size={20} />}
    <span>{item.file.name}<small>{item.state === "uploading" ? "Uploading…" : item.state === "error" ? item.error : "Ready"}</small></span>
    {item.state === "error" ? <button type="button" className="codex-text-action" disabled={locked} onClick={() => retry(item)}>Retry upload</button> : null}
    <button type="button" className="codex-text-action" aria-label={`Remove ${item.file.name}`} disabled={locked} onClick={() => remove(item.id)}><X size={16} /></button>
  </div>)}</div>;
}
