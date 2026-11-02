import {lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {agentInstanceKey,findCatalogAgent,readAgentCatalog} from '../agents-mother/identity.mjs';
import {resolvePrithaAgentParent} from './paths.mjs';
import {scopedAgentWorkspace} from './task-workspace.mjs';

const fail=()=>{throw Object.assign(new Error('Select an existing child project owned by this Pritha instance.'),{code:'provider_agent_workspace_unavailable'});};
/** A model-supplied path never selects the execution root. Resolve a catalog ID
 * or unambiguous alias, then check its current instance and exact sibling root. */
export function resolveProviderAgentWorkspace(options,target){
  if(typeof target!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(target))fail();
  try{
    const agentParent=resolvePrithaAgentParent(options),catalog=readAgentCatalog({...options,agentParent,fresh:true}),agent=findCatalogAgent(catalog,target);
    if(!agent || agent.instanceKey!==agentInstanceKey(options.stateRoot) || agent.identityStatus==='conflict' || !agent.projectPath)fail();
    // An accepted, instance-local child may carry the product's name. Folder
    // discovery alone never grants this exception to the reserved clone prefix.
    const acceptedExistingChild=agent.identityStatus==='identified' && agent.artifacts.some(item=>item.type==='agent-contract' && item.fm.status==='accepted' && item.agentId===agent.agentId && !item.issue);
    const source=scopedAgentWorkspace(agentParent,path.basename(agent.projectPath),{acceptedExistingChild});
    if(source!==realpathSync(agent.projectPath) || source===realpathSync(options.root))fail();
    const instructions=lstatSync(path.join(source,'AGENTS.md'));if(!instructions.isFile() || instructions.isSymbolicLink() || instructions.nlink!==1)fail();
    return {agentId:agent.id,source};
  }catch{fail();}
}
