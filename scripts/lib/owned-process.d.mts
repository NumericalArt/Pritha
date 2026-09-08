import type {ChildProcess} from 'node:child_process';
export type OwnedProcess={stopRequested?:boolean;child:ChildProcess;pid:number;generation:string;cwd:string;birth:string;group:number};
export function ownChildProcess(child:ChildProcess,cwd:string):OwnedProcess;
export function signalOwnedProcess(owner:OwnedProcess|undefined,signal?:NodeJS.Signals):{attempted:boolean;signaled:boolean;reason:string};
export function ownedGroupExited(owner:OwnedProcess|undefined):boolean;
