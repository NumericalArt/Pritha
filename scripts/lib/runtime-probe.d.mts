export function runtimeProbe(binary:string,args:string[],cwd:string,options?:{timeoutMs?:number;ttlMs?:number}):Promise<{ok:boolean;stdout:string;stderr:string}>;
