export type ChildCredentialConfiguration = {status:'selected';modelId:string;baseUrl:string;assignments:Record<string,string>} | {status:'invalid'};
export type ChildProviderConfiguration={schema:string;connectorId:string;modelId:string;baseUrl:string;keyName:string;label:string;maxOutputTokens:number;timeoutMs:number;credentialTarget?:string;connection?:string;maxInputBytes?:number};
export function childProviderConfiguration(data?:{childModelProvider?:string;childModelId?:string;childModelConnection?:string;childMaxOutputTokens?:string|number}):null | ChildProviderConfiguration;
export function childModelIdentityMatches(provider:string,selected:string,returned:string):boolean;
export function childCredentialConfiguration(definition:{provider_configuration?:unknown;provider?:string;name:string}):ChildCredentialConfiguration | undefined;
