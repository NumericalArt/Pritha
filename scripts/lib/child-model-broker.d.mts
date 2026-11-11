import type {ChildProviderConfiguration} from './child-provider-configuration.mjs';
export type ChildModelGrant={agentId:string;projectPath:string;contractHash:string;configuration:ChildProviderConfiguration};
export function readChildModelConfiguration(root:string):ChildProviderConfiguration;
export function issueChildModelConnection(options:{root:string;stateRoot:string;agentId:string;projectPath:string;configuration:ChildProviderConfiguration;contractHash:string;port:number}):Record<string,string>;
export function revokeChildModelConnection(options:{root:string;stateRoot:string;agentId:string}):void;
export function serveChildModel(options:{root:string;stateRoot:string;token:string;request:unknown;readCredential:(provider:string)=>string|Promise<string>;validateGrant:(grant:ChildModelGrant)=>boolean;fetchImpl?:typeof fetch;signal?:AbortSignal}):Promise<unknown>;
