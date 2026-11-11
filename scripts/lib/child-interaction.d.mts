export type ChildInteractionDefinition={path:string;examples:Record<string,unknown>[]};
export function childInteractionDefinition(projectPath:string,outcomeText:string):ChildInteractionDefinition|null;
export function requestChildProduct(options:{projectPath:string;upstream:string;definition:ChildInteractionDefinition;input:unknown;fetchImpl?:typeof fetch;signal?:AbortSignal}):Promise<{ok:boolean;status:number;output:unknown}>;
