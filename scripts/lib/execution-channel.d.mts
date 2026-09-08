import type { ExecutionCoordinator } from './execution-coordinator.mjs';
export function registerExecutionChannel(coordinator:ExecutionCoordinator,key:string,handler:{view:()=>Record<string,unknown>|null;call:(input:any)=>Promise<unknown>}):()=>void;
export function executionChannelView(coordinator:ExecutionCoordinator,key:string):Record<string,any>|null;
export function callExecutionChannel(coordinator:ExecutionCoordinator,key:string,input:unknown):Promise<any>;
