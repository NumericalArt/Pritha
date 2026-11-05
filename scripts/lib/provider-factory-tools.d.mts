export const PROVIDER_FACTORY_TOOL:{name:string;description:string;inputSchema:Record<string,unknown>};
export const PROVIDER_FACTORY_TOOLS:Array<typeof PROVIDER_FACTORY_TOOL>;
export function normalizeFactoryToolCall(name:string,input:unknown):{name:string;input:unknown};
export function factoryBriefErrorDetail(error:unknown):{error:string;field:string;expected:string}|{error:string;issues:string[]}|{error:string;action:string;allowedFields:string[];requiredFields:string[];hint:string}|null;
