export type PrithaChildConnection={provider:string;configured:boolean;status:string};
export function prithaChildConnections(options:{root:string;stateRoot:string;env?:NodeJS.ProcessEnv}):PrithaChildConnection[];
export function readPrithaChildCredential(provider:string,options:{root:string;stateRoot:string;env?:NodeJS.ProcessEnv}):string;
