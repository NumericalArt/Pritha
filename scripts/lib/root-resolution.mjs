import {execFileSync} from 'node:child_process';
import {realpathSync,statSync} from 'node:fs';
import path from 'node:path';

export class PrithaRootError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
function directory(value,cwd){
  if(typeof value!=='string' || !value || value.includes('\0'))throw new PrithaRootError('pritha_root_invalid','Set PRITHA_ROOT to an existing project directory.');
  // Validate the physical directory, but preserve its selected spelling. Saved
  // contracts/approvals can contain absolute paths; /var -> /private/var is not
  // a data migration and must not invalidate those references.
  try{const resolved=path.resolve(cwd,value);realpathSync(resolved);if(!statSync(resolved).isDirectory())throw new Error();return resolved;}
  catch{throw new PrithaRootError('pritha_root_invalid','The selected Pritha root is not an accessible directory. Correct PRITHA_ROOT (or its legacy TECHSCOPE_ROOT alias); no other instance was selected.');}
}
/** Canonical identity is shared by Node and the Control Center. The old export
 * remains an alias, not an independently evolving resolver. Reads never write. */
export function resolvePrithaRoot(options={}){
  const cwd=path.resolve(options.cwd || process.cwd()),env=options.env || process.env;
  if(options.root!==undefined)return directory(options.root,cwd);
  const current=env.PRITHA_ROOT ? directory(env.PRITHA_ROOT,cwd) : null;
  const legacy=env.TECHSCOPE_ROOT ? directory(env.TECHSCOPE_ROOT,cwd) : null;
  if(current && legacy && realpathSync(current)!==realpathSync(legacy))throw new PrithaRootError('pritha_root_conflict','PRITHA_ROOT and TECHSCOPE_ROOT select different directories. Set both to the same project, unset the legacy alias, or choose an explicit --root.');
  if(current || legacy)return current || legacy;
  const base=directory(cwd,process.cwd());
  const gitEnv={...process.env,...env};for(const key of Object.keys(gitEnv))if(key.startsWith('GIT_'))delete gitEnv[key];
  try{const result=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:base,env:gitEnv,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:2000,maxBuffer:65536}).trim();if(result)return directory(result,base);}catch{/* A directory outside Git is a supported cwd fallback. */}
  return base;
}
export const resolveTechscopeRoot=resolvePrithaRoot;
/** Use at subprocess boundaries: an explicit target replaces both names so an
 * inherited alias can never retarget a child to a different checkout. */
export function prithaRootEnvironment(root){
  const canonical=resolvePrithaRoot({root});
  return {PRITHA_ROOT:canonical,TECHSCOPE_ROOT:canonical};
}
