import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

const fail=()=>{throw Object.assign(new Error('The provider state directory needs repair.'),{code:'provider_state_path_invalid'});};
const inside=(root,target)=>target===root || target.startsWith(root+path.sep);
/** Root is an explicit instance boundary. Every descendant must be a real directory. */
export function privateStateDirectory(stateRoot,directory,{create=true}={}){
  const root=path.resolve(stateRoot),target=path.resolve(directory);
  const existingRoot=existsSync(root)?realpathSync(root):null;
  if(!inside(root,target) && !(existingRoot && inside(existingRoot,target)))fail();
  if(!existsSync(root)){if(!create)return null;mkdirSync(root,{recursive:true,mode:0o700});}
  const canonical=realpathSync(root);if(!lstatSync(canonical).isDirectory())fail();
  let current=canonical;
  for(const part of path.relative(inside(root,target)?root:canonical,target).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    try{const info=lstatSync(current);if(!info.isDirectory() || info.isSymbolicLink())fail();}
    catch(error){if(error.code!=='ENOENT')throw error;if(!create)return null;try{mkdirSync(current,{mode:0o700});}catch(race){if(race.code!=='EEXIST')throw race;const info=lstatSync(current);if(!info.isDirectory() || info.isSymbolicLink())fail();}}
  }
  if(!inside(canonical,realpathSync(current)))fail();
  if(create && current!==canonical)chmodSync(current,0o700);
  return current;
}
export function privateStateFile(stateRoot,file,{createDirectory=true}={}){
  const parent=privateStateDirectory(stateRoot,path.dirname(file),{create:createDirectory});
  if(parent===null)return null;
  const target=path.join(parent,path.basename(file));
  try{const info=lstatSync(target);if(!info.isFile() || info.isSymbolicLink() || info.nlink!==1)fail();}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return target;
}
