"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { controlCenterRequest } from "@/lib/control-center-request";
import type { AttachmentView } from "@/lib/codex-chat/types";

export type DraftAttachment = { id: string; file: File; state: "uploading" | "ready" | "error"; view?: AttachmentView; error?: string };

export function useChatAttachments(key: string) {
  const [drafts, setDrafts] = useState<Record<string, DraftAttachment[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const values = useRef(drafts);
  const uploads = useRef(new Map<string, AbortController>());
  const update = useCallback((key: string, change: (files: DraftAttachment[]) => DraftAttachment[]) => {
    values.current = { ...values.current, [key]: change(values.current[key] || []) };
    setDrafts(values.current);
  }, []);
  useEffect(() => { const pending = uploads.current; return () => { for (const controller of pending.values()) controller.abort(); }; }, []);
  const upload = useCallback(async (key: string, entry: DraftAttachment) => {
    const controller = new AbortController();
    uploads.current.set(entry.id, controller);
    update(key, files => files.map(file => file.id === entry.id ? { ...file, state: "uploading", error: undefined } : file));
    try {
      const response = await controlCenterRequest<AttachmentView>(`/api/codex-chat/v1/attachments/${entry.id}`, {
        method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Attachment-Name": encodeURIComponent(entry.file.name) }, body: entry.file, signal: controller.signal,
      }, { timeoutMs: 600_000 });
      if (!controller.signal.aborted) update(key, files => files.map(file => file.id === entry.id ? { ...file, state: "ready", view: response.data } : file));
    } catch (error) {
      if (!controller.signal.aborted) update(key, files => files.map(file => file.id === entry.id ? { ...file, state: "error", error: error instanceof Error ? error.message : "Upload failed. Retry this file." } : file));
    } finally { uploads.current.delete(entry.id); }
  }, [update]);
  const add = useCallback((files: File[]) => {
    setNotice(null);
    const current = values.current[key] || [];
    if (files.length + current.length > 10) { setNotice("Use up to 10 attachments per message. These files were not added."); return; }
    if (files.some(file => file.size > 100 * 1024 * 1024) || [...current.map(item => item.file), ...files].reduce((sum, file) => sum + file.size, 0) > 250 * 1024 * 1024) {
      setNotice("Use files up to 100 MiB each and 250 MiB per message. These files were not added."); return;
    }
    const entries: DraftAttachment[] = files.map(file => ({ id: crypto.randomUUID(), file, state: "uploading" }));
    update(key, current => [...current, ...entries]);
    for (const entry of entries) void upload(key, entry);
  }, [key, update, upload]);
  const clear = useCallback((key: string, ids: string[] = []) => {
    for (const id of ids) uploads.current.get(id)?.abort();
    update(key, files => files.filter(file => !ids.includes(file.id)));
  }, [update]);
  return { items: drafts[key] || [], notice, add, clear, remove: (id: string) => clear(key, [id]), retry: (file: DraftAttachment) => void upload(key, file) };
}
