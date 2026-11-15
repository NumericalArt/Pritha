import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {atomicWriteFile,withFileLock} from './atomic-file.mjs';
import {privateStateFile} from './private-state-path.mjs';
import {readBoundedRegularFile} from './safe-file-read.mjs';
import {childProviderConfiguration} from './child-provider-configuration.mjs';
import {requestChildModel} from './child-model-client.mjs';
import {canonicalChildModelId} from './child-model-aliases.mjs';
import {resolvePrithaStatePathFrom} from './paths.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>Object.assign(new Error('The child model connection is unavailable.'),{code});
const read=file=>JSON.parse(readBoundedRegularFile(file,{allowedRoots:[path.dirname(file)],maxBytes:512000}).text);
const fileFor=(root,stateRoot,agentId)=>{
  if(!/^agent-[a-f0-9]{24}$/.test(agentId))throw fail('pritha_connection_identity');
  return privateStateFile(stateRoot,resolvePrithaStatePathFrom({root,stateRoot},'private','child-model',agentId+'.json'));
};
export function readChildModelConfiguration(root){
  const value=read(path.join(root,'runtime','provider.json'));
  const expected=childProviderConfiguration({childModelProvider:value.connectorId,childModelId:value.modelId,childModelConnection:value.connection,childMaxOutputTokens:value.maxOutputTokens});
  if(!expected || !isDeepStrictEqual(value,expected))throw fail('pritha_connection_configuration');
  return expected;
}
export function issueChildModelConnection({root,stateRoot,agentId,projectPath,configuration,contractHash,port}){
  if(configuration.connection!=='pritha' || !/^[a-f0-9]{64}$/.test(contractHash) || !Number.isInteger(port) || port<1 || port>65535)throw fail('pritha_connection_configuration');
  const actual=readChildModelConfiguration(projectPath);
  if(JSON.stringify(actual)!==JSON.stringify(configuration))throw fail('pritha_connection_configuration');
  const token=randomBytes(32).toString('hex'),file=fileFor(root,stateRoot,agentId);
  withFileLock(file,()=>atomicWriteFile(file,JSON.stringify({version:1,agentId,projectPath:fs.realpathSync(projectPath),configuration,contractHash,tokenHash:hash(token),createdAt:new Date().toISOString(),requests:{},usage:{requests:0,tokens:0,unknown:0}})));
  return {PRITHA_CHILD_MODEL_URL:'http://127.0.0.1:'+port+'/api/child-model',PRITHA_CHILD_MODEL_TOKEN:token};
}
export function revokeChildModelConnection({root,stateRoot,agentId}){
  const file=fileFor(root,stateRoot,agentId);if(!fs.existsSync(file))return;
  withFileLock(file,()=>{const value=read(file);value.revokedAt=new Date().toISOString();atomicWriteFile(file,JSON.stringify(value));});
}
export async function serveChildModel({root,stateRoot,token,request,readCredential,validateGrant,fetchImpl,signal}){
  if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token) || !request || Object.keys(request).some(k=>!['requestId','input'].includes(k)) || !/^[a-zA-Z0-9-]{16,64}$/.test(request.requestId || ''))throw fail('pritha_connection_invalid');
  const directory=path.dirname(fileFor(root,stateRoot,'agent-'+'0'.repeat(24))),tokenHash=hash(token);
  let file;
  for(const name of fs.readdirSync(directory).filter(n=>/^agent-[a-f0-9]{24}\.json$/.test(n)).slice(0,1000)){
    const candidate=path.join(directory,name),value=read(candidate);
    if(value.tokenHash===tokenHash && !value.revokedAt){file=candidate;break;}
  }
  if(!file)throw fail('pritha_connection_revoked');
  const requestHash=hash(JSON.stringify(request.input));
  let grant;
  withFileLock(file,()=>{
    grant=read(file);if(grant.revokedAt || grant.tokenHash!==tokenHash)throw fail('pritha_connection_revoked');
    if(JSON.stringify(readChildModelConfiguration(grant.projectPath))!==JSON.stringify(grant.configuration) || validateGrant(grant)!==true)throw fail('pritha_connection_changed');
    if(grant.requests[request.requestId])throw fail('pritha_request_already_dispatched');
    const recent=Object.entries(grant.requests).filter(([,r])=>Date.now()-r.at<60000);
    if(Object.values(grant.requests).some(r=>r.state==='started') || recent.length>=30)throw fail('provider_rate_limited');
    // Keep bounded request identities, never prompts, responses or credentials.
    grant.requests=Object.fromEntries(Object.entries(grant.requests).slice(-999));
    grant.requests[request.requestId]={hash:requestHash,state:'started',at:Date.now()};
    atomicWriteFile(file,JSON.stringify(grant));
  });
  let result,dispatchedAt;
  try{
    const selected=grant.configuration,apiKey=await readCredential(selected.connectorId);
    // A provider reports the dated ID of a documented alias. Ask for that exact
    // ID so the unchanged strict identity check still applies to the response,
    // then answer the child with the model its accepted Contract selected.
    const modelId=canonicalChildModelId(selected.connectorId,selected.modelId);
    const upstream=modelId===selected.modelId?selected:childProviderConfiguration({childModelProvider:selected.connectorId,childModelId:modelId,childModelConnection:selected.connection,childMaxOutputTokens:selected.maxOutputTokens});
    result=await requestChildModel(upstream,request.input,{apiKey,fetchImpl,signal,direct:true,onDispatch:()=>{dispatchedAt=Date.now();}});
    return upstream===selected?result:{...result,model:selected.modelId};
  }finally{
    withFileLock(file,()=>{
      const current=read(file);if(current.tokenHash!==tokenHash)return;
      current.requests[request.requestId].state=result?'completed':dispatchedAt?'failed':'not-dispatched';
      current.usage.requests+=Number(Boolean(dispatchedAt));current.usage.tokens+=result?.usage?.totalTokens || 0;current.usage.unknown+=Number(Boolean(dispatchedAt) && !result?.usageKnown);
      current.usage.activeMs=(current.usage.activeMs || 0)+(dispatchedAt?Date.now()-dispatchedAt:0);
      atomicWriteFile(file,JSON.stringify(current));
    });
  }
}
