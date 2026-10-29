"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { controlCenterRequest } from "@/lib/control-center-request";
import type { AttachmentView } from "@/lib/codex-chat/types";

export type DraftAttachment = { id: string; file: File; localFileMissing?:boolean; state: "uploading" | "ready" | "error"; view?: AttachmentView; error?: string; original?: AttachmentView; edit?: { id: string; file: File; blob: Blob; state: "uploading" | "error"; error?: string }; restoring?: boolean };
const STORAGE_KEY="pritha.task-chat.attachments.v1";
function validView(value: AttachmentView | undefined): value is AttachmentView {
  return Boolean(value && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.id) && value.href === `/api/codex-chat/v1/attachments/${value.id}` && typeof value.name === "string" && value.name.length <= 240 && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= 100 * 1024 * 1024 && ["image", "file"].includes(value.kind));
}

export function useChatAttachments(key: string) {
  const [drafts, setDrafts] = useState<Record<string, DraftAttachment[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [editNotices, setEditNotices] = useState<Record<string, string | null>>({});
  const values = useRef(drafts);
  const uploads = useRef(new Map<string, AbortController>());
  const owners = useRef(new Map<string,string>());
  const edits = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const restored = useRef(false);
  useEffect(()=>{
    try {
      const text=sessionStorage.getItem(STORAGE_KEY);
      const saved=text && text.length<256_000 ? JSON.parse(text) : {};
      const next:Record<string,DraftAttachment[]>={};
      if(saved && typeof saved === "object" && !Array.isArray(saved) && Object.keys(saved).length<=100)for(const [draft,rows] of Object.entries(saved)) {
        if(!Array.isArray(rows) || rows.length>10)continue;
        next[draft]=rows.filter(row=>typeof row?.id === "string" && typeof row.name === "string").map(row=>{
          owners.current.set(row.id,draft);
          const view = validView(row.view) && row.view.id === row.id ? row.view : undefined;
          return {id:row.id,file:new File([],row.name),view,original:validView(row.original) ? row.original : undefined,localFileMissing:true,state:row.state === "ready" && view ? "ready" : "error",error:"Choose this file again; its upload did not finish before reload."};
        });
      }
      values.current=next;setDrafts(next);
    } catch { /* Storage can be disabled; current-page uploads continue normally. */ }
    restored.current=true;
  },[]);
  const persist=useCallback(()=>{
    if(!restored.current)return;
    try {
      const saved=Object.fromEntries(Object.entries(values.current).filter(([,files])=>files.length).map(([id,files])=>[id,files.map(file=>({id:file.id,name:file.file.name,state:file.state,view:file.view,...(file.original ? {original:file.original} : {})}))]));
      const text=JSON.stringify(saved);if(text.length<256_000)sessionStorage.setItem(STORAGE_KEY,text);
    } catch { /* Never persist binary File contents. */ }
  },[]);
  const update = useCallback((key: string, change: (files: DraftAttachment[]) => DraftAttachment[]) => {
    values.current = { ...values.current, [key]: change(values.current[key] || []) };
    setDrafts(values.current);
    persist();
  }, [persist]);
  useEffect(() => { mounted.current = true; const pending = uploads.current, editing = edits.current; return () => { mounted.current = false; for (const controller of [...pending.values(), ...editing.values()]) controller.abort(); }; }, []);
  const upload = useCallback(async (key: string, entry: DraftAttachment) => {
    if(entry.localFileMissing)return;
    const controller = new AbortController();
    uploads.current.set(entry.id, controller);
    update(key, files => files.map(file => file.id === entry.id ? { ...file, state: "uploading", error: undefined } : file));
    try {
      const response = await controlCenterRequest<AttachmentView>(`/api/codex-chat/v1/attachments/${entry.id}`, {
        method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Attachment-Name": encodeURIComponent(entry.file.name) }, body: entry.file, signal: controller.signal,
      }, { timeoutMs: 600_000 });
      if (!controller.signal.aborted) update(owners.current.get(entry.id) || key, files => files.map(file => file.id === entry.id ? { ...file, state: "ready", view: response.data } : file));
    } catch (error) {
      if (!controller.signal.aborted) update(owners.current.get(entry.id) || key, files => files.map(file => file.id === entry.id ? { ...file, state: "error", error: error instanceof Error ? error.message : "Upload failed. Retry this file." } : file));
    } finally { uploads.current.delete(entry.id); }
  }, [update]);
  const add = useCallback((files: File[]) => {
    setNotice(null);
    const current = values.current[key] || [];
    if (files.length + current.length > 10) { setNotice("Use up to 10 attachments per message. These files were not added."); return; }
    if (files.some(file => file.size > 100 * 1024 * 1024) || current.reduce((sum,item)=>sum+(item.view?.size ?? item.file.size),0)+files.reduce((sum,file)=>sum+file.size,0) > 250 * 1024 * 1024) {
      setNotice("Use files up to 100 MiB each and 250 MiB per message. These files were not added."); return;
    }
    const entries: DraftAttachment[] = files.map(file => ({ id: crypto.randomUUID(), file, state: "uploading" }));
    for(const entry of entries)owners.current.set(entry.id,key);
    update(key, current => [...current, ...entries]);
    for (const entry of entries) void upload(key, entry);
  }, [key, update, upload]);
  const clear = useCallback((key: string, ids: string[] = []) => {
    for (const id of ids) {uploads.current.get(id)?.abort();edits.current.get(id)?.abort();edits.current.delete(id);owners.current.delete(id);}
    update(key, files => files.filter(file => !ids.includes(file.id)));
  }, [update]);
  const move=useCallback((from:string,to:string)=>{
    const files=values.current[from] || [];
    for(const file of files)owners.current.set(file.id,to);
    values.current={...values.current,[from]:[],[to]:[...(values.current[to] || []),...files]};
    setDrafts(values.current);persist();
  },[persist]);
  const cancelEdit = useCallback((owner: string, id: string) => {
    edits.current.get(id)?.abort(); edits.current.delete(id);
    if (mounted.current) update(owner, files => files.map(file => file.id === id ? { ...file, edit: undefined, restoring: false } : file));
  }, [update]);
  const applyEdit = useCallback(async (owner: string, id: string, blob: Blob) => {
    const current = (values.current[owner] || []).find(file => file.id === id);
    if (!current?.view || current.state !== "ready" || owners.current.get(id) !== owner) throw new Error("This attachment is no longer in this draft.");
    if (edits.current.has(id)) throw new Error("This image is already being saved.");
    const total = (values.current[owner] || []).reduce((sum, file) => sum + (file.view?.size ?? file.file.size), 0);
    if (blob.type !== "image/png" || !blob.size || blob.size > 100 * 1024 * 1024 || total - current.view.size + blob.size > 250 * 1024 * 1024) throw new Error("The annotated copy exceeds the attachment limits. Your original was kept.");
    const entry = current.edit?.blob === blob ? current.edit : { id: crypto.randomUUID(), blob, file: new File([blob], `${current.file.name.replace(/(?:\.annotated)?\.[^.]+$/, "").slice(0, 200) || "image"}.annotated.png`, { type: "image/png" }), state: "uploading" as const };
    const controller = new AbortController(); edits.current.set(id, controller);
    update(owner, files => files.map(file => file.id === id ? { ...file, edit: { ...entry, state: "uploading", error: undefined } } : file));
    try {
      const response = await controlCenterRequest<AttachmentView>(`/api/codex-chat/v1/attachments/${entry.id}`, {
        method: "PUT", headers: { "Content-Type": "application/octet-stream", "X-Attachment-Name": encodeURIComponent(entry.file.name) }, body: entry.file, signal: controller.signal,
      }, { timeoutMs: 600_000 });
      if (!validView(response.data) || response.data.id !== entry.id || response.data.kind !== "image" || response.data.mediaType !== "image/png" || response.data.size !== entry.file.size) throw new Error("The annotated upload could not be verified. Your original was kept.");
      if (controller.signal.aborted || !mounted.current || edits.current.get(id) !== controller || owners.current.get(id) !== owner || !(values.current[owner] || []).some(file => file.id === id)) throw new Error("The image edit was cancelled.");
      const latestTotal = (values.current[owner] || []).reduce((sum, file) => sum + (file.view?.size ?? file.file.size), 0);
      if (latestTotal - current.view.size + response.data.size > 250 * 1024 * 1024) throw new Error("The draft changed and the copy no longer fits the message limit. Your original was kept.");
      owners.current.delete(id); owners.current.set(entry.id, owner);
      update(owner, files => files.map(file => file.id === id ? { id: entry.id, file: entry.file, state: "ready", view: response.data, original: current.original || current.view } : file));
      return response.data;
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current && edits.current.get(id) === controller) update(owner, files => files.map(file => file.id === id ? { ...file, edit: { ...entry, state: "error", error: cause instanceof Error ? cause.message : "The copy could not be uploaded." } } : file));
      throw cause;
    } finally { if (edits.current.get(id) === controller) edits.current.delete(id); }
  }, [update]);
  const restoreOriginal = useCallback(async (owner: string, id: string) => {
    const current = (values.current[owner] || []).find(file => file.id === id);
    if (!current?.original || edits.current.has(id)) return;
    const original = current.original;
    setEditNotices(rows => ({ ...rows, [owner]: null }));
    const total = (values.current[owner] || []).reduce((sum, file) => sum + (file.view?.size ?? file.file.size), 0);
    if (total - (current.view?.size || 0) + original.size > 250 * 1024 * 1024) { setEditNotices(rows => ({ ...rows, [owner]: "Restoring the original would exceed the 250 MiB message limit. The copy was kept." })); return; }
    const controller = new AbortController(); edits.current.set(id, controller);
    update(owner, files => files.map(file => file.id === id ? { ...file, restoring: true } : file));
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch(original.href, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      await response.body?.cancel();
      if (!response.ok) throw new Error("The original is no longer available. Your annotated copy was kept.");
      if (controller.signal.aborted || !mounted.current || owners.current.get(id) !== owner || edits.current.get(id) !== controller) return;
      owners.current.delete(id); owners.current.set(original.id, owner);
      update(owner, files => files.map(file => file.id === id ? { id: original.id, file: new File([], original.name), localFileMissing: true, state: "ready", view: original } : file));
    } catch (cause) { if (mounted.current && edits.current.get(id) === controller) setEditNotices(rows => ({ ...rows, [owner]: cause instanceof Error && !controller.signal.aborted ? cause.message : "The original could not be checked. Your annotated copy was kept." })); }
    finally { clearTimeout(timer); if (edits.current.get(id) === controller) { edits.current.delete(id); if (mounted.current) update(owner, files => files.map(file => file.id === id ? { ...file, restoring: false } : file)); } }
  }, [update]);
  const isBusy = useCallback((owner: string) => edits.current.size > 0 && (values.current[owner] || []).some(file => edits.current.has(file.id)), []);
  return { items: drafts[key] || [], notice: editNotices[key] || notice, add, clear, move, cancelEdit, applyEdit, restoreOriginal, isBusy, remove: (id: string) => clear(key, [id]), retry: (file: DraftAttachment) => void upload(key, file) };
}
