import type {ExecutionCoordinator,ExecutionLease} from './execution-coordinator.mjs';
import type {PendingRequestView} from '../../interfaces/control-center/src/lib/codex-chat/types';
export type ProviderApprovalQuestion={operationId:string;kind:string;presentation:Record<string,unknown>;reason:string;timeoutMs?:number};
export class ProviderApprovalBroker {
  constructor(options:{coordinator:ExecutionCoordinator;chatId:string;turnId:string;lease:Pick<ExecutionLease,'owner'|'generation'|'assertOwned'>;signal:AbortSignal;emit:()=>void});
  ask(request:ProviderApprovalQuestion):Promise<Record<string,unknown>>;
  close():void;
}
export function pendingProviderRequests(coordinator:ExecutionCoordinator,chatId:string):PendingRequestView[];
export function answerProviderRequest(coordinator:ExecutionCoordinator,chatId:string,input:unknown):Promise<{submitted:boolean;replayed:boolean}>;
