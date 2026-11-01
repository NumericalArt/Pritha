"use client";
import {useCallback,useEffect,useState} from 'react';
import {PROVIDER_CONNECTOR_IDS,PROVIDER_LABELS,type ProviderConnectorId,type ProviderSettings} from '@/lib/settings/provider-profile';
import type {DraftProviderSelection} from '@/lib/codex-chat/draft-session';
import type {RuntimeStatus} from '@/lib/codex-chat/types';

/** Per-draft selection. Reading readiness or choosing here never writes global
 * settings or changes the binding of an existing chat. */
export function NewChatProviderSelector({value,runtime,disabled,onChange}:{value?:DraftProviderSelection;runtime:RuntimeStatus|null;disabled:boolean;onChange:(value:DraftProviderSelection)=>void}){
  const [settings,setSettings]=useState<ProviderSettings|null>(null),[ready,setReady]=useState<ProviderConnectorId[]>([]),[checked,setChecked]=useState(false);
  const [parallelLimits,setParallelLimits]=useState<Partial<Record<ProviderConnectorId,number>>>({});
  const load=useCallback(async(signal:AbortSignal)=>{try{
    const [configuration,health]=await Promise.all([fetch('/api/task-runtime/settings',{cache:'no-store',signal}),fetch('/api/task-runtime/providers',{cache:'no-store',signal})]);
    const [saved,status]=await Promise.all([configuration.json(),health.json()]);if(!configuration.ok || !health.ok || !saved.ok || !status.ok || !Array.isArray(status.providers))throw new Error();
    if(signal.aborted)return;setSettings(saved.settings);setReady(PROVIDER_CONNECTOR_IDS.filter(id=>status.providers.some((row:{connectorId:string;status:string})=>row.connectorId===id && row.status==='ready')));setChecked(true);
    setParallelLimits(Object.fromEntries(status.providers.filter((row:{connectorId:string;capabilities?:{parallelLimit?:number}})=>PROVIDER_CONNECTOR_IDS.includes(row.connectorId as ProviderConnectorId) && Number.isSafeInteger(row.capabilities?.parallelLimit) && Number(row.capabilities?.parallelLimit)>0).map((row:{connectorId:string;capabilities:{parallelLimit:number}})=>[row.connectorId,row.capabilities.parallelLimit])));
  }catch{if(!signal.aborted){setReady([]);setParallelLimits({});setChecked(true);}}},[]);
  useEffect(()=>{let controller=new AbortController();void load(controller.signal);const focus=()=>{controller.abort();controller=new AbortController();void load(controller.signal);};window.addEventListener('focus',focus);return()=>{controller.abort();window.removeEventListener('focus',focus);};},[load]);
  const connectorId=value?.connectorId || runtime?.connectorId || settings?.activeConnectorId || 'codex';
  const selection:DraftProviderSelection={connectorId,...(runtime?.selected.modelId?{modelId:runtime.selected.modelId}:{}),...(runtime?.selected.effortId?{effortId:runtime.selected.effortId}:{}),...(connectorId==='codex' && runtime?.selected.serviceTierId?{serviceTierId:runtime.selected.serviceTierId}:{}),...value};
  const models=runtime?.models.filter(row=>row.id) || [],model=models.find(row=>row.id===selection.modelId);
  return <div className="new-chat-provider-selector" aria-label="New chat provider settings">
    <label>Provider<select aria-label="New chat provider" value={connectorId} disabled={disabled || !settings || !checked} onChange={event=>{const next=event.currentTarget.value as ProviderConnectorId;if(!ready.includes(next) || !settings)return;const preset=settings.providerPresets[next];onChange({connectorId:next,...(preset.modelId?{modelId:preset.modelId}:{}),effortId:preset.reasoningEffort});}}>
      {!ready.includes(connectorId)?<option value={connectorId} disabled>{PROVIDER_LABELS[connectorId]} · {checked?'not ready':'checking'}</option>:null}{ready.map(id=><option key={id} value={id}>{PROVIDER_LABELS[id]}</option>)}
    </select></label>
    <label>Model<select aria-label="New chat model" value={selection.modelId || ''} disabled={disabled || !runtime || !models.length} onChange={event=>onChange({...selection,modelId:event.currentTarget.value})}>
      {!model?<option value={selection.modelId || ''} disabled>{selection.modelId || 'Choose in Settings'}</option>:null}{models.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
    </select></label>
    {model?.effortIds.length?<label>Reasoning<select aria-label="New chat reasoning" value={selection.effortId || ''} disabled={disabled} onChange={event=>onChange({...selection,effortId:event.currentTarget.value})}>
      {!model.effortIds.includes(selection.effortId || '')?<option value={selection.effortId || ''} disabled>{selection.effortId || 'Choose'} · unsupported</option>:null}{model.effortIds.map(id=><option key={id} value={id}>{id==='default'?'Model default':id==='none'?'Off':id}</option>)}
    </select></label>:null}
    {connectorId==='codex' && model?.serviceTierIds.length?<label>Service tier<select aria-label="New chat service tier" value={selection.serviceTierId || ''} disabled={disabled} onChange={event=>onChange({...selection,serviceTierId:event.currentTarget.value})}>{!model.serviceTierIds.includes(selection.serviceTierId || '')?<option value="" disabled>Choose</option>:null}{model.serviceTierIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label>:null}
    <a href="/settings#providers">Configure providers</a>
    {parallelLimits[connectorId]?<small className="provider-parallel-limit">Provider parallel limit: {parallelLimits[connectorId]}</small>:null}
  </div>;
}
