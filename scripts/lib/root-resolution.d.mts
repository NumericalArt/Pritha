export type PrithaRootOptions={root?:string;cwd?:string;env?:Record<string,string|undefined>};
export class PrithaRootError extends Error {code:string;constructor(code:string,message:string);}
export function resolvePrithaRoot(options?:PrithaRootOptions):string;
export const resolveTechscopeRoot:typeof resolvePrithaRoot;
export function prithaRootEnvironment(root:string):{PRITHA_ROOT:string;TECHSCOPE_ROOT:string};
