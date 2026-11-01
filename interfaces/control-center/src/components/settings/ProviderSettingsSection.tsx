"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import {RefreshCw,Save,SlidersHorizontal} from 'lucide-react';
import {PROVIDER_CONNECTOR_IDS,PROVIDER_LABELS,type ProviderConnectorId,type ProviderPreset,type ProviderPresetPatch,type ProviderSettings} from '@/lib/settings/provider-profile';
import {ProviderConnectorBar,providerStatusLabel} from './ProviderConnectorBar';
import {CodexAuthSection} from './CodexAuthSection';
import {CodexSettingsSection} from './CodexSettingsSection';
import {NeuralDeepSearchSettings} from './NeuralDeepSearchSettings';
import type {TaskProviderHealth} from '@/lib/codex-chat/driver-types';

type Settings=ProviderSettings & {revision:number};
type Model={id:string;efforts?:string[];thinkingBudget?:boolean;reasoningMandatory?:boolean;contextTokens?:number|null;maxInputTokens?:number|null;outputTokens?:number|null;maxOutputTokens?:number|null;tools?:boolean;requiresWallet?:boolean;visionAdvertised?:boolean|null;inputModalities?:string[]|null};
type Snapshot=TaskProviderHealth & {models?:Model[];model?:Model;account?:{usageUsd?:number|null;limitUsd?:number|null;remainingUsd?:number|null;isFreeTier?:boolean;limits?:{billingMode?:string;parallelLimit?:number;wallet?:{balanceRub?:number|null};session?:{used?:number;limit?:number;remaining?:number}}};shortlist?:Array<{id:string;available:boolean}>;discovery?:Array<{endpoint:string;status:string;models:Model[]}>};
type Detail={provider:Snapshot;credentials:{configured:boolean;status:string;source:string|null;maskedValue:string}};
type Draft={modelId:string;reasoningEffort:string;timeout:string;thinkingBudget:string;baseUrl:string;authMode:'api-key'|'local-cli-session'};
const draftOf=(preset:ProviderPreset):Draft=>({modelId:preset.modelId,reasoningEffort:preset.reasoningEffort,timeout:String(preset.timeoutMs/1000),thinkingBudget:preset.thinkingBudget===undefined?'':String(preset.thinkingBudget),baseUrl:preset.baseUrl || '',authMode:preset.authMode || 'api-key'});
const same=(a:Draft,b:Draft)=>JSON.stringify(a)===JSON.stringify(b);
const amount=(value:unknown,suffix='')=>typeof value==='number' && Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:4})+suffix:'Unknown';
const effortLabel=(value:string)=>value==='default'?'Model default':value==='none'?'Off':value;

/** Only the selected provider mounts a credential form. Keys are never part of
 * presets, drafts, browser storage or a response; switching clears this input. */
function CredentialForm({connectorId,detail,onSaved}:{connectorId:Exclude<ProviderConnectorId,'codex'|'local'>;detail?:Detail;onSaved:()=>void}){
  const [value,setValue]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function save(){if(!value.trim() || busy)return;const key=value;setValue('');setBusy(true);setNotice('');
    try{const response=await fetch(`/api/task-runtime/providers/${connectorId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:key,confirmation:`save-${connectorId}-key`})});const payload=await response.json();
      setNotice(payload.stored?'Key saved to this Pritha’s Keychain.':response.ok?'Key saved.':'The key could not be saved. Re-enter it and try again.');if(payload.stored || response.ok)onSaved();
    }catch{setNotice('Saving could not be confirmed. Refresh status before trying again.');}finally{setBusy(false);}
  }
  return <div className="settings-rowline settings-secret-row"><div><strong>{PROVIDER_LABELS[connectorId]} API key</strong><span>{detail?.credentials.configured?'Configured':'Not configured'}{detail?.credentials.source==='environment'?' · An environment key takes precedence over Keychain.':''}</span></div>
    <div className="settings-secret-form"><input type="password" autoComplete="off" maxLength={8192} aria-label={`${PROVIDER_LABELS[connectorId]} API key`} value={value} onChange={event=>setValue(event.currentTarget.value)} disabled={busy}/><button className="outline-button" type="button" disabled={busy || !value.trim()} onClick={()=>void save()}><Save size={16}/>{busy?'Saving…':'Save key'}</button><span role="status">{notice}</span></div></div>;
}

export function ProviderSettingsSection({id}:{id:string}){
  const [settings,setSettings]=useState<Settings|null>(null),[selected,setSelected]=useState<ProviderConnectorId>('codex');
  const [drafts,setDrafts]=useState<Partial<Record<ProviderConnectorId,Draft>>>({}),[statuses,setStatuses]=useState<Partial<Record<ProviderConnectorId,TaskProviderHealth>>>({}),[details,setDetails]=useState<Partial<Record<ProviderConnectorId,Detail>>>({});
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
  const alive=useRef(true),settingsRequest=useRef(0),initialized=useRef(false),settingsRef=useRef(settings),draftsRef=useRef(drafts);
  const imageVerification=useRef<AbortController|null>(null);
  settingsRef.current=settings;draftsRef.current=drafts;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;imageVerification.current?.abort();};},[]);
  const loadSettings=useCallback(async(nativeSaved=false)=>{
    const sequence=++settingsRequest.current;setLoading(true);
    try{const response=await fetch('/api/task-runtime/settings',{cache:'no-store'}),payload=await response.json();if(!response.ok || !payload.ok || !payload.settings)throw new Error();
      if(!alive.current || sequence!==settingsRequest.current)return;const next=payload.settings as Settings,previous=settingsRef.current;
      const keep=(key:ProviderConnectorId)=>nativeSaved && key!=='codex' && previous && draftsRef.current[key] && !same(draftsRef.current[key]!,draftOf(previous.providerPresets[key]));
      if(PROVIDER_CONNECTOR_IDS.some(key=>keep(key) && JSON.stringify(previous!.providerPresets[key])!==JSON.stringify(next.providerPresets[key]))){setNotice('A provider with unsaved edits changed elsewhere. Reload saved presets before saving.');return;}
      setSettings(next);setDrafts(current=>Object.fromEntries(PROVIDER_CONNECTOR_IDS.map(key=>[key,keep(key)?current[key]:draftOf(next.providerPresets[key])])));
      if(!initialized.current){initialized.current=true;setSelected(next.activeConnectorId);}
      if(!nativeSaved)setNotice('Saved presets loaded.');
    }catch{if(alive.current)setNotice('Provider settings could not be loaded. Retry before saving.');}finally{if(alive.current && sequence===settingsRequest.current)setLoading(false);}
  },[]);
  useEffect(()=>{void loadSettings();},[loadSettings]);
  useEffect(()=>{const controller=new AbortController();void(async()=>{try{const response=await fetch('/api/task-runtime/providers',{cache:'no-store',signal:controller.signal}),payload=await response.json();if(!response.ok || !payload.ok || !Array.isArray(payload.providers))return;setStatuses(Object.fromEntries(payload.providers.map((row:TaskProviderHealth)=>[row.connectorId,row])));}catch{/* Individual panel offers a retry. */}})();return()=>controller.abort();},[refresh]);
  useEffect(()=>{if(!settings)return;const controller=new AbortController();void(async()=>{try{const response=await fetch(`/api/task-runtime/providers/${selected}`,{cache:'no-store',signal:controller.signal}),payload=await response.json();if(!response.ok || !payload.ok || !payload.provider || !payload.credentials)return;
      setDetails(current=>({...current,[selected]:payload}));setStatuses(current=>({...current,[selected]:payload.provider}));}catch{/* Missing detail never fabricates readiness. */}})();return()=>controller.abort();},[selected,settings,refresh]);
  const draft=drafts[selected],detail=details[selected],health=statuses[selected],models=detail?.provider.models || [];
  const model=models.find(row=>row.id===draft?.modelId) || (detail?.provider.model && detail.provider.model.id===draft?.modelId?detail.provider.model:undefined);
  const dirty=Boolean(draft && settings && !same(draft,draftOf(settings.providerPresets[selected])));
  function update<K extends keyof Draft>(field:K,value:Draft[K]){setDrafts(current=>({...current,[selected]:{...current[selected]!,[field]:value}}));setNotice('Unsaved preset changes.');}
  async function persist(useDefault=false){if(!settings || !draft || busy)return;let preset:ProviderPresetPatch|undefined;
    if(!useDefault){const seconds=Number(draft.timeout),budget=Number(draft.thinkingBudget);
      if(!draft.timeout.trim() || !Number.isSafeInteger(seconds*1000) || seconds<10 || seconds>3600 || draft.thinkingBudget.trim() && (!Number.isSafeInteger(budget) || budget<1 || budget>200000)){setNotice('Enter a timeout from 10 to 3600 seconds and, if used, a thinking budget from 1 to 200000 tokens.');return;}
      preset={modelId:draft.modelId.trim(),reasoningEffort:draft.reasoningEffort,timeoutMs:seconds*1000,thinkingBudget:draft.thinkingBudget.trim()?budget:null,...(selected==='local'?{baseUrl:draft.baseUrl.trim() || null}:{}),...(selected==='claude'?{authMode:draft.authMode}:{})};}
    setBusy(true);setNotice('');const connectorId=selected;
    try{const response=await fetch('/api/task-runtime/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:settings.revision,...(useDefault?{activeConnectorId:connectorId}:{connectorId,preset})})}),payload=await response.json();
      if(!alive.current)return;if(!response.ok || !payload.ok || !payload.settings){setNotice(response.status===409?'Settings changed elsewhere. Reload saved presets before saving.':payload.message || 'The preset could not be saved.');return;}
      const next=payload.settings as Settings;setSettings(next);setDrafts(current=>({...current,[connectorId]:draftOf(next.providerPresets[connectorId])}));setNotice(useDefault?`${PROVIDER_LABELS[connectorId]} selected for new chats.`:'Preset saved. Checking provider status…');setRefresh(value=>value+1);
      window.dispatchEvent(new Event('pritha-task-provider-settings-changed'));
    }catch{if(alive.current)setNotice('Saving could not be confirmed. Reload saved presets to check the result.');}finally{if(alive.current)setBusy(false);}
  }
  async function verifyImages(){
    if(!settings || !draft || dirty || busy || selected!=='neuraldeep')return;
    const modelId=draft.modelId,controller=new AbortController();imageVerification.current=controller;setBusy(true);setNotice('Checking image delivery locally…');
    try{
      const response=await fetch('/api/task-runtime/providers/neuraldeep/attachments',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId,expectedRevision:settings.revision})}),result=await response.json();
      if(!alive.current)return;
      setNotice(response.ok && result.ok && result.verified && result.modelId===modelId?`Original PNG delivery verified for ${modelId}. No paid model request was made.`:response.status===409?'Image delivery was not verified. Refresh status and reload saved presets before retrying.':'Image delivery could not be verified. Your chats and files are preserved.');
      setRefresh(value=>value+1);
    }catch{if(alive.current)setNotice('Image verification was interrupted. Refresh status before retrying.');}
    finally{if(imageVerification.current===controller)imageVerification.current=null;if(alive.current)setBusy(false);}
  }
  return <div className="settings-section-stack provider-settings" data-testid="provider-settings">
    <section className="settings-section"><div className="section-header"><span className="section-icon"><SlidersHorizontal size={22}/></span><div><h2>Task providers</h2><p>Choose a provider to configure. Each keeps its own saved preset.</p></div></div>
      <ProviderConnectorBar id={id} selected={selected} onSelect={key=>{initialized.current=true;setSelected(key);setNotice('');}} statuses={statuses} presets={settings?.providerPresets} disabled={busy}/>
      <div className="settings-action-row"><span>New chats: <strong>{settings?PROVIDER_LABELS[settings.activeConnectorId]:'Loading…'}</strong></span><button className="outline-button" type="button" onClick={()=>setRefresh(value=>value+1)} disabled={busy}><RefreshCw size={16}/>Refresh status</button><button className="outline-button" type="button" onClick={()=>void loadSettings()} disabled={busy || loading}>Reload saved presets</button></div>
      <p role="status">{notice}</p>
    </section>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`} className="settings-section-stack">
      <section className="settings-section"><div className="settings-rowline"><div><strong>{PROVIDER_LABELS[selected]}</strong><span>{providerStatusLabel(health?.status)}{health?.version?` · CLI ${health.version}`:''}</span></div><button className="outline-button" type="button" disabled={loading || busy || dirty || health?.status!=='ready' || settings?.activeConnectorId===selected} onClick={()=>void persist(true)}>Use for new chats</button></div>
        {health?.error?<p className="info-note">{health.error.message}</p>:null}
        {selected==='codex'?<p>Native Codex history, transport, routing and service tier remain available below.</p>:<>
          {selected!=='local'?<CredentialForm key={selected} connectorId={selected} detail={detail} onSaved={()=>setRefresh(value=>value+1)}/>:<p>Local uses no API key. Offline tasks require a configured private model process. Pritha starts an isolated copy for each task and stops it afterward.</p>}
          {draft && settings?<fieldset className="provider-preset-fields" disabled={busy || loading}>
            {selected==='claude'?<div className="settings-rowline"><div><strong>Authentication</strong><span>Choose the credential lane for this instance.</span></div><select aria-label="Claude authentication" value={draft.authMode} onChange={event=>update('authMode',event.currentTarget.value as Draft['authMode'])}><option value="api-key">Anthropic API key</option><option value="local-cli-session">Local CLI session</option></select></div>:null}
            {selected==='local'?<div className="settings-rowline provider-input-row"><div><strong>Model server</strong><span>Select the configured model source. Its private task copy uses a temporary local port.</span></div><input aria-label="Local server URL" placeholder="http://127.0.0.1:11434/v1" value={draft.baseUrl} onChange={event=>update('baseUrl',event.currentTarget.value)}/></div>:null}
            {selected==='local' && detail?.provider.discovery?.length?<div className="provider-discovery">{detail.provider.discovery.map(row=><button className="outline-button" key={row.endpoint} type="button" disabled={row.status!=='reachable'} onClick={()=>update('baseUrl',row.endpoint)}>{row.endpoint} · {row.status}{row.status==='reachable'?` · ${row.models.length} models`:''}</button>)}</div>:null}
            <div className="settings-rowline provider-input-row"><div><strong>Model</strong><span>{selected==='openrouter'?'Choose a catalog model or enter its vendor/model ID.':'Only models available to this provider can start a task.'}</span></div><input list={`${id}-${selected}-models`} aria-label={`${PROVIDER_LABELS[selected]} model`} value={draft.modelId} maxLength={200} onChange={event=>update('modelId',event.currentTarget.value)}/><datalist id={`${id}-${selected}-models`}>{models.map(row=><option key={row.id} value={row.id}/>)}</datalist></div>
            {selected==='openrouter' && detail?.provider.shortlist?.length?<div className="provider-shortlist" aria-label="OpenRouter shortlist">{detail.provider.shortlist.map(row=><button type="button" className="outline-button" key={row.id} disabled={!row.available} onClick={()=>update('modelId',row.id)}>{row.id}{row.available?'':' · unavailable'}</button>)}</div>:null}
            <div className="settings-rowline"><div><strong>Reasoning</strong><span>{model?.reasoningMandatory?'This model always reasons; “Model default” keeps its own behavior.':model?.efforts?'Supported settings from this model’s catalog.':'The saved setting is retained until provider capabilities are available.'}</span></div><select aria-label={`${PROVIDER_LABELS[selected]} reasoning`} value={draft.reasoningEffort} onChange={event=>update('reasoningEffort',event.currentTarget.value)} disabled={!model?.efforts?.length}>{[...new Set([draft.reasoningEffort,...(model?.efforts || [])])].map(value=><option key={value} value={value}>{effortLabel(value)}{model?.efforts && !model.efforts.includes(value)?' · unsupported':''}</option>)}</select></div>
            {model?.thinkingBudget || draft.thinkingBudget?<div className="settings-rowline provider-input-row"><div><strong>Thinking budget</strong><span>Optional; leave blank to use the model default.</span></div><input type="text" inputMode="numeric" aria-label={`${PROVIDER_LABELS[selected]} thinking budget`} value={draft.thinkingBudget} onChange={event=>update('thinkingBudget',event.currentTarget.value)}/></div>:null}
            <div className="settings-rowline provider-input-row"><div><strong>Task timeout</strong><span>Seconds; applies to the next new chat.</span></div><input type="text" inputMode="decimal" aria-label={`${PROVIDER_LABELS[selected]} timeout seconds`} value={draft.timeout} onChange={event=>update('timeout',event.currentTarget.value)}/></div>
            {model?<p className="info-note">Context: {amount(model.contextTokens ?? model.maxInputTokens)} tokens · Output: {amount(model.outputTokens ?? model.maxOutputTokens)} tokens{model.requiresWallet?' · Wallet required':''}</p>:null}
            <div className="settings-action-row"><button className="outline-button" type="button" disabled={busy || loading || !dirty} onClick={()=>void persist()}><Save size={16}/>{busy?'Saving…':'Save preset'}</button>{dirty?<span>Unsaved changes apply after Save preset.</span>:<span>Saved for future chats. Existing chats keep their provider and model.</span>}</div>
          </fieldset>:<p>Loading saved preset…</p>}
          {selected==='openrouter' && detail?.provider.account?<div className="provider-account" aria-label="OpenRouter account"><span>Usage: {amount(detail.provider.account.usageUsd,' USD')}</span><span>Key limit: {amount(detail.provider.account.limitUsd,' USD')}</span><span>Remaining: {amount(detail.provider.account.remainingUsd,' USD')}</span><span>{detail.provider.account.isFreeTier?'Free tier':'Paid tier'}</span></div>:null}
          {selected==='neuraldeep' && detail?.provider.account?.limits?<div className="provider-account" aria-label="NeuralDeep account"><span>Billing: {detail.provider.account.limits.billingMode || 'Unknown'}</span><span>Parallel tasks: {amount(detail.provider.account.limits.parallelLimit)}</span><span>Wallet: {amount(detail.provider.account.limits.wallet?.balanceRub,' RUB')}</span></div>:null}
          {selected==='neuraldeep'?<NeuralDeepSearchSettings/>:null}
          {selected==='neuraldeep' && model?.visionAdvertised===true && model.inputModalities?.includes('image')?<div className="settings-rowline"><div><strong>Image attachments</strong><span>{health?.capabilities.attachments.images?'Original PNG delivery verified.':'Run a local check with test images before sending originals. No paid model request is made.'}</span></div><button className="outline-button" type="button" onClick={()=>void verifyImages()} disabled={busy || loading || dirty || health?.status!=='ready'}>Verify image delivery</button></div>:null}
        </>}
      </section>
      {selected==='codex'?<><CodexAuthSection/><CodexSettingsSection onSaved={()=>void loadSettings(true)}/></>:null}
    </div>
  </div>;
}
