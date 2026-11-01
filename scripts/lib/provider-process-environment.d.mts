import type { ProviderConnectorId } from './provider-profile.mjs';
export function providerProcessEnvironment(options: {provider:ProviderConnectorId;root:string;stateRoot:string;codexHome?:string;claudeConfigDir?:string;temporary?:string;env?:NodeJS.ProcessEnv}):NodeJS.ProcessEnv;
export function createProviderTemporaryDirectory(options:{provider:ProviderConnectorId;stateRoot:string;temporaryRoot?:string}):string;
