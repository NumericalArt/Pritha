import type {ExecutionCoordinator,ExecutionLease} from './execution-coordinator.mjs';
import type {ProviderApprovalQuestion} from './provider-approvals.mjs';
export class ProviderHostTools {
  constructor(options:{root:string;stateRoot:string;privateRoot:string;cwd:string;connectorId:string;chatId:string;turnId:string;
    lease:Pick<ExecutionLease,'owner'|'generation'|'assertOwned'>;coordinator:ExecutionCoordinator;sandbox:string;signal:AbortSignal;
    factory:{slug:string;target:string;model:string;effort?:string;agentParent?:string};approve:(request:ProviderApprovalQuestion)=>Promise<Record<string,unknown>>});
  call(name:string,input:object):Promise<{isError?:boolean;content:Array<{type:string;text:string}>}>;
  close():Promise<{processTreeExited:boolean}>;
}
