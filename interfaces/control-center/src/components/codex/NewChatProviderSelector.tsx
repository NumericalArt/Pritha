"use client";
import {useCallback,useEffect,useState} from 'react';
import {PROVIDER_CONNECTOR_IDS,PROVIDER_LABELS,type ProviderConnectorId,type ProviderSettings} from '@/lib/settings/provider-profile';
import type {DraftProviderSelection} from '@/lib/codex-chat/draft-session';
import type {RuntimeStatus} from '@/lib/codex-chat/types';

const EFFORT_RANK=['none','minimal','low','medium','high','xhigh','max','ultra'];
/** The strongest offered level that does not exceed the chosen one, or the
 * lowest offered level when none does. A non-ranked choice such as "default"
 * becomes the model's own default. */
export function supportedEffort(effortIds:string[],current:string|undefined,modelDefault?:string|null){
  if(!effortIds.length || !current || effortIds.includes(current))return current;
  const ranked=effortIds.filter(id=>EFFORT_RANK.includes(id)).sort((a,b)=>EFFORT_RANK.indexOf(a)-EFFORT_RANK.indexOf(b));
  if(!EFFORT_RANK.includes(current))return modelDefault && effortIds.includes(modelDefault)?modelDefault:effortIds[0];
  return ranked.filter(id=>EFFORT_RANK.indexOf(id)<=EFFORT_RANK.indexOf(current)).at(-1) ?? ranked[0] ?? effortIds[0];
}

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
  const requestedSelection:DraftProviderSelection={connectorId,...(runtime?.selected?.modelId?{modelId:runtime.selected.modelId}:{}),...(runtime?.selected?.effortId?{effortId:runtime.selected.effortId}:{}),...(connectorId==='codex' && runtime?.selected?.serviceTierId?{serviceTierId:runtime.selected.serviceTierId}:{}),...value};
  const models=Array.isArray(runtime?.models)?runtime.models.filter(row=>row.id):[];
  // A ready preview belongs to this draft selection (the parent rejects stale
  // responses). Its canonical model can resolve a saved alias such as sonnet.
  const model=models.find(row=>row.id===requestedSelection.modelId) || (runtime?.availability==='ready' && runtime.connectorId===connectorId?models.find(row=>row.id===runtime.selected.modelId):undefined);
  const selection=model?{...requestedSelection,modelId:model.id}:requestedSelection;
  // Older catalogs can omit optional capability arrays. Missing metadata must
  // hide unsupported controls, not crash when returning to the new-chat draft.
  const effortIds=Array.isArray(model?.effortIds)?model.effortIds:[], serviceTierIds=Array.isArray(model?.serviceTierIds)?model.serviceTierIds:[];
  // A level saved for another model (xhigh for a model that offers up to
  // high) must not stay selected as "unsupported": a factory build inherited
  // it and stopped for an approval (observed 2026-11-15). Pick the nearest
  // offered level once the model's capabilities are known.
  const offeredEffort=model && effortIds.length?supportedEffort(effortIds,selection.effortId,model.defaultEffortId):selection.effortId;
  useEffect(()=>{if(!disabled && model && offeredEffort && offeredEffort!==selection.effortId)onChange({...selection,effortId:offeredEffort});},[disabled,model,offeredEffort,selection,onChange]);
  return <div className="new-chat-provider-selector" aria-label="New chat provider settings">
    <label>Provider<select aria-label="New chat provider" value={connectorId} disabled={disabled || !settings || !checked} onChange={event=>{const next=event.currentTarget.value as ProviderConnectorId;if(!ready.includes(next) || !settings)return;const preset=settings.providerPresets[next];onChange({connectorId:next,...(preset.modelId?{modelId:preset.modelId}:{}),effortId:preset.reasoningEffort});}}>
      {!ready.includes(connectorId)?<option value={connectorId} disabled>{PROVIDER_LABELS[connectorId]} · {checked?'not ready':'checking'}</option>:null}{ready.map(id=><option key={id} value={id}>{PROVIDER_LABELS[id]}</option>)}
    </select></label>
    <label>Model<select aria-label="New chat model" value={selection.modelId || ''} disabled={disabled || !runtime || !models.length} onChange={event=>onChange({...selection,modelId:event.currentTarget.value})}>
      {!model?<option value={selection.modelId || ''} disabled>{selection.modelId || 'Choose in Settings'}</option>:null}{models.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
    </select></label>
    {effortIds.length?<label>Reasoning<select aria-label="New chat reasoning" value={selection.effortId || ''} disabled={disabled} onChange={event=>onChange({...selection,effortId:event.currentTarget.value})}>
      {!effortIds.includes(selection.effortId || '')?<option value={selection.effortId || ''} disabled>{selection.effortId || 'Choose'} · unsupported</option>:null}{effortIds.map(id=><option key={id} value={id}>{id==='default'?'Model default':id==='none'?'Off':id}</option>)}
    </select></label>:null}
    {connectorId==='codex' && serviceTierIds.length?<label>Service tier<select aria-label="New chat service tier" value={selection.serviceTierId || ''} disabled={disabled} onChange={event=>onChange({...selection,serviceTierId:event.currentTarget.value})}>{!serviceTierIds.includes(selection.serviceTierId || '')?<option value="" disabled>Choose</option>:null}{serviceTierIds.map(id=><option key={id} value={id}>{id}</option>)}</select></label>:null}
    <a href="/settings#providers">Configure providers</a>
    {parallelLimits[connectorId]?<small className="provider-parallel-limit">Provider parallel limit: {parallelLimits[connectorId]}</small>:null}
  </div>;
}
