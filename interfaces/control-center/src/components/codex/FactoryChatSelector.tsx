"use client";
import {FACTORY_PHASES} from '../../../../../scripts/lib/chat-subject.mjs';
import {composeDraftSubject,composeDraftFactoryIntent,DEFAULT_FACTORY_SELECTION,type DraftFactorySelection} from '@/lib/codex-chat/draft-session';

export function FactoryChatSelector({value=DEFAULT_FACTORY_SELECTION,disabled,canCreate=false,onChange}:{value?:DraftFactorySelection;disabled:boolean;canCreate?:boolean;onChange:(value:DraftFactorySelection)=>void}){
  let error='';try{composeDraftSubject(value);composeDraftFactoryIntent(value);}catch{error='Use a child slug with lowercase letters, digits and hyphens (up to 64 characters). Parent instance names are reserved.';}
  return <div className="factory-chat-selector" aria-label="Factory task settings">
    {(canCreate || value.createNew) && <label><input type="checkbox" aria-label="Create new agent" checked={Boolean(value.createNew)} disabled={disabled || (!canCreate && !value.createNew)} onChange={event=>onChange({...value,createNew:event.currentTarget.checked})}/> Create new agent</label>}
    {value.createNew?<>
      {!canCreate && <p role="alert">Agent creation is unavailable for this provider. Select a ready provider with command approvals, or turn off Create new agent to continue a regular chat.</p>}
      <label>New agent slug<input aria-label="New agent slug" value={value.slug} maxLength={64} placeholder="paper-radar" aria-invalid={Boolean(error)} aria-describedby="factory-subject-description" disabled={disabled} onChange={event=>onChange({...value,slug:event.currentTarget.value})}/></label>
      <p id="factory-subject-description" role="note">{error || 'Describe the result you want. Pritha will prepare a Contract and a separate Outcome Spec for your approval before creating the project. An existing project cannot be adopted here.'}</p>
    </>:<>
      <div className="factory-chat-fields">
        <label>Subject<select aria-label="Chat subject" disabled={disabled} value={value.kind} onChange={event=>onChange({...value,kind:event.currentTarget.value as DraftFactorySelection['kind']})}><option value="self">Pritha</option><option value="child">Child agent</option></select></label>
        {value.kind==='child'?<>
          <label>Child slug<input aria-label="Child agent slug" value={value.slug} maxLength={64} placeholder="paper-radar" aria-invalid={Boolean(error)} aria-describedby="factory-subject-description" disabled={disabled} onChange={event=>onChange({...value,slug:event.currentTarget.value})}/></label>
          <label>Phase focus<select aria-label="Factory phase" value={value.phase} disabled={disabled} onChange={event=>onChange({...value,phase:event.currentTarget.value as DraftFactorySelection['phase']})}>{FACTORY_PHASES.map(phase=><option key={phase.id} value={phase.id}>{phase.label}</option>)}</select></label>
        </>:null}
      </div>
      {value.kind==='child'?<p id="factory-subject-description" role="note">{error || FACTORY_PHASES.find(phase=>phase.id===value.phase)?.goal} Subject and phase stay with this chat. Artifact approvals are separate.</p>:null}
    </>}
  </div>;
}
