"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { controlCenterRequest } from "@/lib/control-center-request";
import type { AttachmentView } from "@/lib/codex-chat/types";

export type DraftAttachment = { id: string; file: File; localFileMissing?:boolean; state: "uploading" | "ready" | "error"; view?: AttachmentView; error?: string };
const STORAGE_KEY="pritha.task-chat.attachments.v1";

export function useChatAttachments(key: string) {
  const [drafts, setDrafts] = useState<Record<string, DraftAttachment[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const values = useRef(drafts);
  const uploads = useRef(new Map<string, AbortController>());
  const owners = useRef(new Map<string,string>());
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
          return {id:row.id,file:new File([],row.name),view:row.view,localFileMissing:true,state:row.state === "ready" && row.view ? "ready" : "error",error:"Choose this file again; its upload did not finish before reload."};
        });
      }
      values.current=next;setDrafts(next);
    } catch { /* Storage can be disabled; current-page uploads continue normally. */ }
    restored.current=true;
  },[]);
  const persist=useCallback(()=>{
    if(!restored.current)return;
    try {
      const saved=Object.fromEntries(Object.entries(values.current).filter(([,files])=>files.length).map(([id,files])=>[id,files.map(file=>({id:file.id,name:file.file.name,state:file.state,view:file.view}))]));
      const text=JSON.stringify(saved);if(text.length<256_000)sessionStorage.setItem(STORAGE_KEY,text);
    } catch { /* Never persist binary File contents. */ }
  },[]);
  const update = useCallback((key: string, change: (files: DraftAttachment[]) => DraftAttachment[]) => {
    values.current = { ...values.current, [key]: change(values.current[key] || []) };
    setDrafts(values.current);
    persist();
  }, [persist]);
  useEffect(() => { const pending = uploads.current; return () => { for (const controller of pending.values()) controller.abort(); }; }, []);
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
    for (const id of ids) {uploads.current.get(id)?.abort();owners.current.delete(id);}
    update(key, files => files.filter(file => !ids.includes(file.id)));
  }, [update]);
  const move=useCallback((from:string,to:string)=>{
    const files=values.current[from] || [];
    for(const file of files)owners.current.set(file.id,to);
    values.current={...values.current,[from]:[],[to]:[...(values.current[to] || []),...files]};
    setDrafts(values.current);persist();
  },[persist]);
  return { items: drafts[key] || [], notice, add, clear, move, remove: (id: string) => clear(key, [id]), retry: (file: DraftAttachment) => void upload(key, file) };
}
