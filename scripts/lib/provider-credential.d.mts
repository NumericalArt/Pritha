export type CredentialProvider = 'neuraldeep' | 'claude' | 'openrouter';
export type CredentialOptions = {stateRoot:string;env?:NodeJS.ProcessEnv};
export type CredentialStatus = {configured:boolean;status:string;source:string;maskedValue:string};
export function providerCredentialService(provider:CredentialProvider,options:CredentialOptions):string;
export function readProviderCredential(provider:CredentialProvider,options:CredentialOptions):string;
export function providerCredentialStatus(provider:CredentialProvider,options:CredentialOptions):CredentialStatus;
export function storeProviderCredential(provider:CredentialProvider,value:string,options:CredentialOptions):Promise<CredentialStatus & {stored:true}>;
