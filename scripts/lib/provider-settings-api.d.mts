import type {CredentialOptions,CredentialProvider,CredentialStatus} from './provider-credential.mjs';
export function readProviderSettingsInput(request:Request):Promise<Record<string,unknown>>;
export function providerSettingsRequest(request:Request,connectorId:string,options:{stateRoot:string;env?:NodeJS.ProcessEnv;snapshot:(connectorId:any)=>Promise<unknown>;status?:(provider:CredentialProvider,options:CredentialOptions)=>CredentialStatus;save?:(provider:CredentialProvider,value:string,options:CredentialOptions)=>Promise<unknown>}):Promise<Response>;
