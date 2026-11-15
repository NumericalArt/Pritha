import path from 'node:path';
import {createHash} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {readBoundedRegularFile} from './safe-file-read.mjs';

const fail=code=>Object.assign(new Error('The agent request could not complete.'),{code});
const read=(root,file,maxBytes=262144)=>readBoundedRegularFile(path.join(root,file),{allowedRoots:[root],maxBytes}).text;
export function childInteractionDefinition(projectPath,outcomeText){
  const digest=outcomeText.match(/^- Verifier input: verification\/product\.mjs :: sha256:([a-f0-9]{64}) :: host-template:api-cli-product-v2$/m)?.[1];
  if(!digest)return null;
  const content=read(projectPath,'verification/product.mjs');
  if(createHash('sha256').update(content).digest('hex')!==digest)throw fail('agent_verification_changed');
  const prefix=content.match(/^const checks = JSON\.parse\(([^\n]+)\);\n/);
  if(!prefix)throw fail('agent_interaction_unavailable');
  const checks=JSON.parse(JSON.parse(prefix[1]));
  const examples=checks.http?.filter(c=>(c.expected_status??200)===200);
  if(!examples?.length || examples.some(c=>!/^\/[A-Za-z0-9/_-]{0,120}$/.test(c.path) || c.path.startsWith('//')))throw fail('agent_interaction_unavailable');
  return {path:examples[0].path,examples:examples.filter(c=>c.path===examples[0].path).map(c=>c.input_json)};
}

const recordedProcessAlive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
/** The managed-process protocol given to builders requires /health to return
 * the launch instance_id; the managed Stop Trial verifies exactly that. A
 * reported pid must still agree with the service record. The recorded process
 * is checked with the operating system, so a server that follows the
 * documented protocol without echoing its pid remains usable from its card. */
function ownedRuntime(identity,record){
  return Boolean(identity) && typeof identity==='object' && !Array.isArray(identity) && identity.instance_id===record.instance_id
    && (identity.pid===undefined || identity.pid===record.pid) && recordedProcessAlive(record.pid);
}

/** Same-origin Control Center proxy: destination and shape come from the
 * approved protected Trial, never a URL supplied by the browser. */
export async function requestChildProduct({projectPath,upstream,definition,input,fetchImpl=globalThis.fetch,signal}){
  if(!input || typeof input!=='object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input))>16384)throw fail('agent_input_invalid');
  const url=new URL(upstream);
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))throw fail('agent_endpoint_invalid');
  const record=JSON.parse(read(projectPath,'.state/service.pid.json',8000));
  if(!Number.isSafeInteger(record.pid) || record.pid<1 || typeof record.instance_id!=='string' || record.instance_id.length>128
    || record.project_root!==realpathSync(projectPath) || record.server_path!==path.join(realpathSync(projectPath),'scripts/server.mjs') || record.port!==Number(url.port))throw fail('agent_runtime_unverified');
  const bounded=async(response,max)=>{
    if(!response.body)throw fail('agent_response_invalid');const chunks=[];let n=0;
    for await(const chunk of response.body){n+=chunk.length;if(n>max){await response.body.cancel().catch(()=>{});throw fail('agent_response_too_large');}chunks.push(chunk);}
    return Buffer.concat(chunks).toString('utf8');
  };
  const timer=AbortSignal.timeout(185000),requestSignal=signal?AbortSignal.any([signal,timer]):timer;
  try{
    const health=await fetchImpl(url.origin+'/health',{redirect:'error',signal:AbortSignal.any([requestSignal,AbortSignal.timeout(3000)])});
    const identity=JSON.parse(await bounded(health,8000));
    if(!health.ok || !ownedRuntime(identity,record))throw fail('agent_runtime_unverified');
    const response=await fetchImpl(url.origin+definition.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),redirect:'error',signal:requestSignal});
    const text=await bounded(response,65536);let output;try{output=JSON.parse(text);}catch{output=text;}
    return {ok:response.ok,status:response.status,output};
  }catch(error){throw fail(/^agent_[a-z_]+$/.test(error.code || '')?error.code:requestSignal.aborted?'agent_request_timeout':'agent_runtime_unavailable');}
}
