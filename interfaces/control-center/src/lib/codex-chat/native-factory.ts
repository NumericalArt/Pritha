import path from 'node:path';
import {ProviderHostTools} from '../../../../../scripts/lib/provider-host-tools.mjs';
import {PROVIDER_FACTORY_TOOL,factoryBriefErrorDetail} from '../../../../../scripts/lib/provider-factory-tools.mjs';
import {ProviderApprovalBroker} from '../../../../../scripts/lib/provider-approvals.mjs';
import type {ExecutionCoordinator} from '../../../../../scripts/lib/execution-coordinator.mjs';
import {processTreeExited} from '../../../../../scripts/neuraldeep/process-snapshot.mjs';
import {FactoryBudget} from '../../../../../scripts/agents-mother/factory-budget.mjs';

/** A terminal native turn is not proof that its host workers also exited. */
export function nativeFactoryProcessesExited(coordinator:ExecutionCoordinator,chatId:string,turnId:string){
  const rows=coordinator.listIntents({kind:'provider-tool',chatId,turnId,limit:1000});
  if(rows.length===1000)return false; // Never infer complete coverage from a truncated list.
  return rows.every(row=>{
    if(row.processProof){try{return processTreeExited(row.processProof);}catch{return false;}}
    return row.state==='approval_pending' || row.state==='reserved' || row.exitConfirmed===true;
  });
}

export function nativeFactoryTools() {
  const {name,description,inputSchema}=PROVIDER_FACTORY_TOOL;
  return [{type:'function',name,description,inputSchema}];
}
export const nativeFactoryInstructions = [
  'This is a host-bound Pritha agent-creation workflow. Use factory_step for all factory actions; your ordinary workspace is read-only.',
  'Prioritize stable working behavior. Read workflowBudget and recommendedBuildBudget in status; use those generous defaults unless the user explicitly chooses smaller limits. Track useful progress, time and tokens; repeated tool errors call for a corrected approach.',
  'First call status and resume its saved phase. Prepare drafts, request separate Contract and Outcome approvals, then proceed through research, scaffold, bounded delivery, Trials and finish.',
  'Read scaffold_plan before Contract approval. For an API process product, use prepare_product_trial with the draft Outcome hash and exact HTTP/CLI JSON cases before Outcome approval. The host prepares its protected verifier before the child exists. Structural smoke alone cannot approve this product.',
  'When a brief specifies a deterministic local HTTP/CLI product, set childModelProvider and childModelId to none, use built-in Node and repositoryAdoptionMode none, and propose limits. Ask only for choices that affect behavior, expense or access. The host can supply operation_id. After a tool response with continued steps use the saved phase, not the next step from the original action. Read each research_status page using offset until nextOffset is null. Choose real passages, synthesize their applicability, then research_apply. Report the verified directory, first-use command and observed output; never report a completed controller turn as a completed product.',
  'Do not request approval again for accepted documents. Do not edit private factory state or use shell commands to bypass the host tools. Stop for a changed budget or user-judged acceptance; never publish, deploy, merge or enable services.',
].join('\n');

type Lease = {owner:string;generation:string;assertOwned:()=>void};
type Options = {root:string;stateRoot:string;privateRoot:string;cwd:string;chatId:string;turnId:string;threadId:string;agentParent?:string;
  nativeTurnId:()=>string;lease:Lease;coordinator:ExecutionCoordinator;slug:string;target:string;model:string;effort?:string;
  emit:()=>void};

/** Native transcript stays in Codex. Only factory tool receipts and document
 * decisions use the same host machinery as the external-provider workflows. */
export class NativeFactoryTurn {
  private controller=new AbortController();
  private approvals:ProviderApprovalBroker;
  private host:ProviderHostTools;
  private budget:FactoryBudget;
  private clock=Date.now();
  private paused=false;
  constructor(private options:Options){
    const o=options;
    this.budget=new FactoryBudget({...o,connectorId:'codex'});
    this.approvals=new ProviderApprovalBroker({coordinator:o.coordinator,chatId:o.chatId,turnId:o.turnId,lease:o.lease,signal:this.controller.signal,emit:o.emit});
    this.host=new ProviderHostTools({root:o.root,stateRoot:o.stateRoot,privateRoot:path.join(o.privateRoot,'factory-tools'),cwd:o.cwd,
      connectorId:'codex',chatId:o.chatId,turnId:o.turnId,lease:o.lease,coordinator:o.coordinator,sandbox:'read-only',signal:this.controller.signal,
      factory:{slug:o.slug,target:o.target,model:o.model,effort:o.effort,agentParent:o.agentParent},approve:(request:Parameters<ProviderApprovalBroker['ask']>[0])=>this.approvals.ask(request)});
  }
  async admit(previousCounter?:number){await this.budget.ensure();await this.budget.native('native-parent','preparation',previousCounter);this.budget.check();this.clock=Date.now();}
  async observeUsage(counter?:number){
    const now=Date.now(),delta=this.paused?0:now-this.clock;this.clock=now;
    const value=await this.budget.native('native-parent','preparation',counter,delta);
    return value.remainingTokens===0 || value.remainingActiveMs===0;
  }
  async call(params:Record<string,unknown>){
    if(params.threadId!==this.options.threadId || !params.turnId || params.turnId!==this.options.nativeTurnId()
      || params.tool!=='factory_step' || params.namespace!=null || typeof params.callId!=='string')throw new Error('factory_binding_changed');
    this.options.lease.assertOwned();
    let input=params.arguments;
    if(typeof input==='string'){if(Buffer.byteLength(input)>60000)throw new Error('factory_input_invalid');input=JSON.parse(input);}
    if(!input || typeof input!=='object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input))>60000)throw new Error('factory_input_invalid');
    await this.observeUsage();this.paused=true;
    try{
      const result=await this.host.call('factory_step',input);
      const failed=result.content.some(item=>{try{return JSON.parse(item.text).status==='failed';}catch{return false;}});
      return {success:result.isError!==true && !failed,contentItems:result.content.filter(item=>item.type==='text').map(item=>({type:'inputText',text:item.text}))};
    }catch(error){
      const code=(error as {code?:string}).code;
      return {success:false,contentItems:[{type:'inputText',text:JSON.stringify(factoryBriefErrorDetail(error) || {error:code && /^(factory|provider|operator)_[a-z_]{1,90}$/.test(code)?code:'factory_tool_failed'})}]};
    }finally{this.paused=false;this.clock=Date.now();}
  }
  async close(){await this.observeUsage();this.paused=true;this.controller.abort();this.approvals.close();return this.host.close();}
}
