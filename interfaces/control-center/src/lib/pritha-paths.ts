// The Control Center and CLI share root identity and state layout. Keep these
// argument adapters for existing server callers; legacy root names are aliases.
import {
  resolvePrithaStateRoot as stateRoot,
  resolvePrithaAgentParent as agentParent,
  resolvePrithaAgentMemoryRoot as agentMemoryRoot,
} from '../../../../scripts/lib/paths.mjs';
export {resolvePrithaRoot,resolveTechscopeRoot,prithaRootEnvironment,PrithaRootError,isPrithaCodeCheckout,resolvePrithaStatePath} from '../../../../scripts/lib/paths.mjs';

export function resolvePrithaStateRoot(root?:string){return stateRoot({root});}
export function resolvePrithaAgentParent(root?:string){return agentParent({root});}
export function resolvePrithaAgentMemoryRoot(root?:string){return agentMemoryRoot({root});}

export {resolvePrithaMemoryDatabase,resolvePrithaSetupFile,PrithaStateFileError} from "../../../../scripts/lib/state-files.mjs";
