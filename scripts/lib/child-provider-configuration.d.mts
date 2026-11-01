export type ChildCredentialConfiguration = {status:'selected';modelId:string;baseUrl:string;assignments:Record<string,string>} | {status:'invalid'};
export function childProviderConfiguration(data?:{childModelProvider?:string;childModelId?:string}):null | {schema:string;connectorId:string;modelId:string;baseUrl:string;keyName:string;label:string;maxOutputTokens:number;timeoutMs:number;credentialTarget:string};
export function childCredentialConfiguration(definition:{provider_configuration?:unknown;provider?:string;name:string}):ChildCredentialConfiguration | undefined;
