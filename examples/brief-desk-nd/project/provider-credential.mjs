import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
function readFile(file) {
  let fd;
  try {
    fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.nlink!==1||stat.size>64000)throw new Error('unsafe_settings_file');
    return parseEnv(fs.readFileSync(fd,'utf8'));
  }catch(error){if(error.code==='ENOENT')return {};throw new Error('unsafe_settings_file');}
  finally{if(fd!==undefined)fs.closeSync(fd);}
}
// Child credentials come only from its own files or explicitly child-scoped env.
export function readPrivateEnv(folder) {
  return {...readFile(path.join(folder,'.env')),...readFile(path.join(folder,'.env.local'))};
}
export function updatePrivateEnv(folder,update) {
  const file=path.join(folder,'.env.local'),next={...readFile(file),...update};
  const text=Object.entries(next).map(([key,value])=>`${key}=${JSON.stringify(String(value))}`).join('\n')+'\n';
  if(Buffer.byteLength(text)>64000)throw new Error('settings_too_large');
  const temporary=path.join(folder,`.env.local.${randomUUID()}.tmp`);
  let fd;
  try {
    fd=fs.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    fs.writeFileSync(fd,text);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(temporary,file);
  }finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(temporary,{force:true});}
}
