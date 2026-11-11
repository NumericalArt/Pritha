"use client";

import {useEffect,useState} from 'react';
import type {ControlCenterOperatorActionPlan} from '@/lib/control-center/types';

type Plan={examples:Record<string,unknown>[];running:boolean;verified:boolean;connection?:null|{configured:boolean;status:string};model:null|{provider:string;model:string;connection:string}};
const messages:Record<string,string>={
  agent_verification_required:'The agent is still being verified. Pritha will make this form available when the checks pass.',
  agent_verification_changed:'The project changed after verification. Open its Task Chat to check the current version.',
  agent_runtime_unavailable:'The agent is stopped or unavailable. Start it and send the request again.',
  agent_runtime_unverified:'The running process does not match this agent. Pritha did not send your input to it.',
  agent_request_timeout:'The agent did not finish within the request time. The request will not repeat automatically.',
  agent_input_invalid:'Check the input fields and keep the request below 16 KB.',
  pritha_connection_unavailable:'The model connection is unavailable. Check the selected provider in Pritha Settings, then restart this agent.',
  provider_pending_auth:'The selected API connection needs a key in Pritha Settings.',
  provider_rate_limited:'The provider is busy. You can send the request again later.',
  provider_unavailable:'The model provider is unavailable. Your request will not repeat automatically.',
  provider_transport_failed:'Pritha could not finish the connection to the model provider. You can try again; it will be a new request.',
  provider_timeout:'The model provider did not finish in time. Your input is preserved; the request will not repeat automatically.',
  provider_output_limit:'The model reached its response limit. Open this agent’s Task Chat to adjust its response allowance.',
  runtime_identity_mismatch:'The provider returned a different model from the one selected. Pritha stopped this request; check the model in Settings.',
  pritha_connection_changed:'The approved model configuration changed. Return to this agent’s Task Chat to verify it.',
  pritha_connection_revoked:'This model connection was stopped. Restart the agent to receive its current connection.',
  pritha_request_already_dispatched:'Pritha already sent this request. It will not send a duplicate automatically.',
};
export function AgentInteraction({agentId}:{agentId:string}){
  const [plan,setPlan]=useState<Plan|null>(null),[startPlan,setStartPlan]=useState<ControlCenterOperatorActionPlan|null>(null);
  const [input,setInput]=useState<Record<string,unknown>>({}),[json,setJson]=useState('{}'),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[output,setOutput]=useState<unknown>(undefined);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/agents/'+encodeURIComponent(agentId)+'/interact',{signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const next:Plan=await response.json();setPlan(next);setInput(next.examples[0]);setJson(JSON.stringify(next.examples[0],null,2));
      if(!next.running){const response=await fetch('/api/agents/'+encodeURIComponent(agentId)+'/actions/start/plan',{signal:controller.signal});if(response.ok)setStartPlan(await response.json());}
    }).catch(()=>{});
    return()=>controller.abort();
  },[agentId]);
  if(!plan)return null;
  const simple=Object.values(plan.examples[0]).every(v=>typeof v==='string');
  async function send(){
    if(!plan || busy)return;setBusy(true);setOutput(undefined);setStatus(plan.running?'The agent is working…':'Starting the agent…');
    try{
      const body=simple?input:JSON.parse(json);
      if(!plan.running){
        if(!startPlan?.actionEnabled)throw Error('agent_runtime_unavailable');
        const started=await fetch('/api/agents/'+encodeURIComponent(agentId)+'/actions/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmation:startPlan.confirmation?.requiredPhrase || ''})});
        const result=await started.json();if(!started.ok || !result.ok || result.status!=='running')throw Error('agent_runtime_unavailable');
        setPlan({...plan,running:true});setStatus('The agent is working…');
      }
      const response=await fetch('/api/agents/'+encodeURIComponent(agentId)+'/interact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      setOutput(result.output);
      const error=result.output && typeof result.output==='object'?result.output.error:undefined;
      setStatus(result.ok?'Response received.':messages[error] || 'The agent could not complete this request. Its response is shown below.');
    }catch(error){
      const code=error instanceof Error?error.message:'';
      setStatus(messages[code] || 'The request could not complete. Check the input and the agent status.');
      if(code==='agent_runtime_unavailable'){
        setPlan({...plan,running:false});setStartPlan(null);
        try{const response=await fetch('/api/agents/'+encodeURIComponent(agentId)+'/actions/start/plan');if(response.ok)setStartPlan(await response.json());}catch{/* Keep the input and diagnosis if the service itself is unavailable. */}
      }
    }
    finally{setBusy(false);}
  }
  return <section className="agent-status-note agent-interaction" aria-label="Try this agent" id="try-agent">
    <h2>Try this agent</h2>
    <p>{plan.model?`${plan.model.model} · ${plan.model.connection==='pritha'?'Connected through Pritha':'Child API connection'}. Send input to get a model response.`:'Send input to the agent and inspect its response.'}</p>
    {!plan.verified?<p>{messages.agent_verification_required}</p>:null}
    {plan.connection && !plan.connection.configured?<p>The selected connection needs attention in <a href="/settings">Pritha Settings</a>. Reopen this agent after configuring it.</p>:null}
    <form onSubmit={event=>{event.preventDefault();void send();}}>
      {simple?Object.keys(input).map(key=><label key={key}>{key}<textarea aria-label={key} value={String(input[key]??'')} onChange={event=>setInput({...input,[key]:event.target.value})} rows={3} maxLength={16000} disabled={busy}/></label>):<label>Input JSON<textarea aria-label="Input JSON" value={json} onChange={event=>setJson(event.target.value)} rows={6} maxLength={16000} disabled={busy}/></label>}
      <button className="agent-status-primary-link" type="submit" disabled={busy || !plan.verified || plan.connection?.configured===false || !plan.running && !startPlan?.actionEnabled}>{busy?'Working…':plan.running?'Send':'Start agent and send'}</button>
    </form>
    {!plan.running?<p>This starts the local agent and sends the input above.</p>:null}
    <p role="status" aria-live="polite">{status}</p>
    {output!==undefined?<pre aria-label="Agent response">{typeof output==='string'?output:JSON.stringify(output,null,2)}</pre>:null}
  </section>;
}
