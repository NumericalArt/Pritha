"use client";

import {useRef} from 'react';
import {PROVIDER_CONNECTOR_IDS,PROVIDER_LABELS,type ProviderConnectorId,type ProviderPreset} from '@/lib/settings/provider-profile';

const STATUS_LABELS:Record<string,string>={ready:'Ready',configured:'Needs check','not-configured':'Not configured','pending-auth':'Sign in',unavailable:'Unavailable',error:'Needs attention','rate-limited':'Rate limited','billing-required':'Billing required'};
export const providerStatusLabel=(status?:string)=>STATUS_LABELS[status || ''] || 'Checking';

export function ProviderConnectorBar({id,selected,onSelect,statuses,presets,disabled=false}:{id:string;selected:ProviderConnectorId;onSelect:(id:ProviderConnectorId)=>void;statuses:Partial<Record<ProviderConnectorId,{status:string}>>;presets?:Partial<Record<ProviderConnectorId,ProviderPreset>>;disabled?:boolean}){
  const buttons=useRef<Partial<Record<ProviderConnectorId,HTMLButtonElement|null>>>({});
  return <div className="provider-connector-bar" role="tablist" aria-label="Task providers">
    {PROVIDER_CONNECTOR_IDS.map((connectorId,index)=><button key={connectorId} ref={node=>{buttons.current[connectorId]=node;}} type="button" role="tab" id={`${id}-tab-${connectorId}`} aria-controls={`${id}-panel`} aria-selected={selected===connectorId} tabIndex={selected===connectorId?0:-1} disabled={disabled}
      className={`provider-connector-pill ${selected===connectorId?'active':''}`} onClick={()=>onSelect(connectorId)} onKeyDown={event=>{
        const target=event.key==='ArrowRight'?(index+1)%5:event.key==='ArrowLeft'?(index+4)%5:event.key==='Home'?0:event.key==='End'?4:null;
        if(target===null)return;event.preventDefault();const next=PROVIDER_CONNECTOR_IDS[target];onSelect(next);buttons.current[next]?.focus();
      }}>
      <strong>{PROVIDER_LABELS[connectorId]}</strong><span className={`provider-status-dot ${statuses[connectorId]?.status==='ready'?'ready':''}`}>{providerStatusLabel(statuses[connectorId]?.status)}</span>
      <small title={presets?.[connectorId]?.modelId}>{presets?.[connectorId]?.modelId || 'Choose a model'}</small>
    </button>)}
  </div>;
}
