"use client";
import {useEffect,useState} from 'react';
type Mode='auto'|'requested'|'off';
type Saved={mode:Mode;revision:number};
export function NeuralDeepSearchSettings(){
  const [saved,setSaved]=useState<Saved|null>(null),[mode,setMode]=useState<Mode>('auto'),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{const controller=new AbortController();void(async()=>{try{const r=await fetch('/api/task-runtime/providers/neuraldeep/search',{cache:'no-store',signal:controller.signal}),v=await r.json();if(!r.ok || !v.ok)throw Error();setSaved(v.settings);setMode(v.settings.mode);}catch{if(!controller.signal.aborted)setNote('Search settings are unavailable. Retry before saving.');}})();return()=>controller.abort();},[reload]);
  async function save(){if(!saved || busy)return;setBusy(true);setNote('');try{
    const r=await fetch('/api/task-runtime/providers/neuraldeep/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,expectedRevision:saved.revision})}),v=await r.json();
    if(r.ok && v.ok){setSaved(v.settings);setMode(v.settings.mode);setNote('Search mode saved.');}else setNote(r.status===409?'Search settings changed elsewhere. Reload before saving.':'Search settings could not be saved.');
  }catch{setNote('Saving could not be confirmed. Reload to check the saved mode.');}finally{setBusy(false);}}
  return <div className="settings-rowline"><div><strong>NeuralDeep Search</strong><span>Auto allows relevant public web lookup. Requested requires a search request. Off blocks lookup. Each task has a search budget.</span></div><div className="settings-secret-form">
    <select aria-label="NeuralDeep Search mode" value={mode} disabled={!saved || busy} onChange={e=>setMode(e.currentTarget.value as Mode)}><option value="auto">Auto</option><option value="requested">Requested</option><option value="off">Off</option></select>
    <button className="outline-button" type="button" disabled={!saved || busy || saved.mode===mode} onClick={()=>void save()}>Save search mode</button>
    <button className="outline-button" type="button" disabled={busy} onClick={()=>setReload(v=>v+1)}>Reload search mode</button><span role="status">{note}</span>
  </div></div>;
}
