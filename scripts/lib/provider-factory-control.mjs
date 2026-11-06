import path from 'node:path';
import {ProviderHostTools} from './provider-host-tools.mjs';
import {readBoundFactoryProgress} from '../agents-mother/factory-progress.mjs';

const fail=()=>Object.assign(new Error('Choose a valid action for this agent factory.'),{code:'factory_control_invalid',status:400});
const fields={status:[],delivery_status:[],delivery_resume:['answer'],verify:[],finish:[],configure_build:['effort'],configure_build_model:['model','effort'],delivery_extend:['expected_version','add_tokens','add_iterations','add_elapsed_ms']};

export function factoryControlView(runtime,binding){
  return readBoundFactoryProgress({root:runtime.root,stateRoot:runtime.stateRoot,agentParent:runtime.options.agentParent,
    slug:binding.workspace.factorySlug,target:binding.workspace.factoryTarget,chatId:binding.chatId,connectorId:runtime.connectorId,model:binding.modelId,effort:binding.effortId});
}

/** An operator selection is an exact request, never an approval inferred from prose. */
export function factoryControlInput(binding,input){
  if(!Object.hasOwn(input || {},'factoryAction'))return null;
  const value=input.factoryAction;
  if(!binding.workspace.factorySlug || input.attachments?.length || !value || typeof value!=='object' || Array.isArray(value)
    || !Object.hasOwn(fields,value.action) || !/^[A-Za-z0-9_-]{8,128}$/.test(value.operation_id || '')
    || Object.keys(value).some(key=>!['action','operation_id',...fields[value.action]].includes(key))
    || value.answer!==undefined && (typeof value.answer!=='string' || !/^[a-z][a-z0-9-]{0,79}$/.test(value.answer))
    || ['configure_build','configure_build_model'].includes(value.action) && typeof value.effort!=='string')throw fail();
  return structuredClone(value);
}

/** Use the same bound host, approval broker and worker as model tool calls. */
export async function runFactoryControl(runtime,binding,active,input){
  const action=factoryControlInput(binding,input),trees=new Map();
  let host,result,errorCode=null,exited=false;
  const event=(status,result)=>runtime.handleEvent(binding,active,{type:status==='in_progress'?'item.started':'item.completed',item:{id:'factory_'+action.operation_id,type:'mcp_tool_call',server:'pritha',tool:'factory_step',status,arguments:action,...(result?{result}:{})}});
  active.run={stop(){active.controller.abort();active.approvals?.close();return true;}};
  try{
    active.lease.assertOwned();
    const options={root:runtime.root,stateRoot:runtime.stateRoot,privateRoot:path.join(runtime.privateRoot,runtime.connectorId),cwd:binding.workspacePath,connectorId:runtime.connectorId,sandbox:'read-only',
      coordinator:runtime.execution,chatId:active.chat,turnId:active.turnId,lease:active.lease,signal:active.controller.signal,
      factory:{slug:binding.workspace.factorySlug,target:binding.workspace.factoryTarget,agentParent:runtime.options.agentParent,preset:binding.executionConfig,model:binding.modelId,effort:binding.effortId},
      approve:request=>active.approvals.ask(request),
      onProcessEvidence:(id,evidence)=>{
        trees.set(id,evidence);
        runtime.execution.updateIntent(active.key,{processProof:{kind:'provider-process-set',version:1,trees:[...trees].map(([id,evidence])=>({id,evidence}))}});
      }};
    host=new ProviderHostTools(options);
    host.factory.validate(action);
    runtime.execution.updateIntent(active.key,{dispatchKind:'factory-control',factoryAction:action.action});
    active.started=true;event('in_progress');
    result=await host.call('factory_step',action);
    event(result.isError?'failed':'completed',result);
    if(result.isError)errorCode='factory_control_failed';
  }catch(error){errorCode=/^[a-z][a-z0-9_]{0,79}$/.test(error?.code || '')?error.code:'factory_control_failed';}
  finally{
    try{exited=host?(await host.close()).processTreeExited===true:true;}catch{exited=false;}
    runtime.finish(active,{ok:!errorCode,errorCode,processTreeExited:exited});
  }
}
