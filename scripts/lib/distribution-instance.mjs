// Adapted from the pinned NeuralDeep distribution. No Git mutation, secret
// inheritance, service start or runtime-state copying belongs to this module.
import {constants,openSync,closeSync,fstatSync,readFileSync,realpathSync,existsSync,mkdirSync,writeFileSync,renameSync,rmSync,fsyncSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {normalizeProviderConnectorId} from './provider-profile.mjs';
import {prithaRootEnvironment} from './root-resolution.mjs';

const fail=code=>Object.assign(new Error('Review this checkout’s private instance configuration before continuing.'),{code});
const canonical=value=>{const resolved=path.resolve(value);return existsSync(resolved)?realpathSync(resolved):resolved;};
function validate(config,root){
  if(!config || config.schema!=='pritha-instance-v1' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(config.id || '') || !Number.isInteger(config.port) || config.port<1024 || config.port>65535)throw fail('instance_configuration_invalid');
  for(const key of ['codeRoot','stateRoot','agentParent'])if(typeof config[key]!=='string' || !path.isAbsolute(config[key]) || config[key].includes('\0'))throw fail('instance_configuration_invalid');
  if(canonical(config.codeRoot)!==canonical(root))throw fail('instance_checkout_mismatch');
  const stateRoot=canonical(config.stateRoot),agentParent=canonical(config.agentParent),codeRoot=canonical(root);
  if(stateRoot!==codeRoot && (stateRoot.startsWith(codeRoot+path.sep) || codeRoot.startsWith(stateRoot+path.sep)) || agentParent===codeRoot || agentParent.startsWith(codeRoot+path.sep)
    || stateRoot===agentParent || stateRoot.startsWith(agentParent+path.sep) && agentParent!==path.dirname(codeRoot) || agentParent.startsWith(stateRoot+path.sep))throw fail('instance_roots_overlap');
  return {schema:'pritha-instance-v1',id:config.id,codeRoot,stateRoot,agentParent,port:config.port,providerProfile:normalizeProviderConnectorId(config.providerProfile || 'codex')};
}
export function readInstancePointer(root){
  let fd;try{fd=openSync(path.join(root,'.pritha-instance.json'),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(error){if(error.code==='ENOENT')return null;throw fail('instance_configuration_unreadable');}
  try{const stat=fstatSync(fd);if(!stat.isFile() || stat.nlink!==1 || stat.size>16000 || stat.uid!==process.getuid() || (stat.mode&0o077)!==0)throw fail('instance_configuration_unreadable');return validate(JSON.parse(readFileSync(fd,'utf8')),root);}
  catch(error){if(error.code?.startsWith('instance_'))throw error;throw fail('instance_configuration_invalid');}finally{closeSync(fd);}
}
export function instanceConfig(root,{env=process.env,providerProfile}={}){
  root=canonical(root);const saved=readInstancePointer(root),id=env.PRITHA_INSTANCE_ID || saved?.id || 'pritha-'+createHash('sha256').update(root).digest('hex').slice(0,12);
  const legacy=['.pritha-setup.json','.techscope-setup.json','.private','.memory/pritha.sqlite','.memory/techscope.sqlite'].some(name=>existsSync(path.join(root,name)));
  return validate({schema:'pritha-instance-v1',id,codeRoot:root,stateRoot:env.PRITHA_STATE_ROOT || saved?.stateRoot || (legacy?root:path.join(path.dirname(root),path.basename(root)+'-state',id)),
    agentParent:env.PRITHA_AGENT_PARENT || saved?.agentParent || (legacy?path.dirname(root):path.join(path.dirname(root),path.basename(root)+'-agents',id)),
    port:Number(env.PRITHA_CONTROL_CENTER_PORT || saved?.port || 3520),providerProfile:providerProfile || env.PRITHA_PROVIDER_PROFILE || saved?.providerProfile || 'codex'},root);
}
export function applyInstanceEnvironment(root,config,env=process.env){
  const value=validate(config,root);
  Object.assign(env,{...prithaRootEnvironment(value.codeRoot),PRITHA_INSTANCE_ID:value.id,PRITHA_STATE_ROOT:value.stateRoot,PRITHA_AGENT_PARENT:value.agentParent,
    PRITHA_CONTROL_CENTER_PORT:String(value.port),PRITHA_PROVIDER_PROFILE:value.providerProfile});return env;
}
function privateDirectory(directory){
  if(existsSync(directory)){if(lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())throw fail('instance_directory_invalid');return;}
  mkdirSync(directory,{recursive:true,mode:0o700});
}
export function prepareDistributionInstance(root,{env=process.env,providerProfile}={}){
  const config=instanceConfig(root,{env,providerProfile}),prior=readInstancePointer(root);
  if(prior && ['id','stateRoot','agentParent','port'].some(key=>prior[key]!==config[key]))throw fail('instance_identity_conflict');
  for(const directory of [config.stateRoot,config.agentParent,path.join(config.stateRoot===config.codeRoot?path.join(config.codeRoot,'.private'):config.stateRoot,'config')])privateDirectory(directory);
  const file=path.join(root,'.pritha-instance.json'),temporary=file+'.'+process.pid+'.tmp';
  const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(config,null,2)+'\n');fsyncSync(fd);}catch(error){rmSync(temporary,{force:true});throw error;}finally{closeSync(fd);}
  renameSync(temporary,file);applyInstanceEnvironment(root,config,env);return config;
}
