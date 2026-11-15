import fs from 'node:fs';
import path from 'node:path';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';

// Local API ports declared by the sibling agents of one Pritha instance. A new
// agent that repeats a declared port cannot run beside its sibling, and both
// cards then report each other's health. Observed 2026-11-14: three agents
// declared 3000 (the default when a brief names no port) and two pairs shared
// 3141 and 3187.
const MANIFEST='operations/manifest.json';
const portOf=value=>{
  if(typeof value!=='string')return null;
  let url;try{url=new URL(value);}catch{return null;}
  const port=Number(url.port);
  return url.protocol==='http:' && url.hostname==='127.0.0.1' && Number.isInteger(port) && port>=1 && port<=65535?port:null;
};

/** Map of port -> agent folder name. Looks only at the folders the agent
 * catalog itself treats as agents (an AGENTS.md at the top level) and reads
 * only their bounded regular manifest; unreadable projects are ignored. */
export function declaredAgentPorts(agentParent,{exclude}={}){
  const ports=new Map();
  let entries;try{entries=fs.readdirSync(agentParent,{withFileTypes:true});}catch{return ports;}
  for(const entry of entries.filter(item=>item.isDirectory() && !item.name.startsWith('.')).slice(0,500)){
    const project=path.join(agentParent,entry.name);
    if(exclude && path.resolve(exclude)===project)continue;
    if(!fs.existsSync(path.join(project,'AGENTS.md')))continue;
    let manifest;
    try{manifest=JSON.parse(readBoundedRegularFile(path.join(project,MANIFEST),{allowedRoots:[project],maxBytes:262144}).text);}catch{continue;}
    for(const port of new Set([portOf(manifest?.health_url),portOf(manifest?.local_upstream_url)]))if(port!==null && !ports.has(port))ports.set(port,entry.name);
  }
  return ports;
}

/** First port of the factory range that no sibling declares and that is not reserved. */
export function suggestAgentPort(taken,{reserved=[],from=3100,to=3999}={}){
  const blocked=new Set(reserved);
  for(let port=from;port<=to;port++)if(!taken.has(port) && !blocked.has(port))return port;
  return null;
}
