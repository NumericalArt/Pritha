import { createHash } from 'node:crypto';
import { constants,existsSync,lstatSync,openSync,closeSync,fstatSync,readSync,readdirSync,realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { privateStateFile } from '../lib/private-state-path.mjs';

// Function-level adaptation of the pinned NeuralDeep native-history-proof module.
// The host checks the exact private home, provider, workspace and session before resume.
export function inspectProviderCliSession({stateRoot,codexHome,cwd,provider,sessionId,model}){
  const unavailable=code=>({available:false,code});
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sessionId || '') || !['neuraldeep','openrouter','local'].includes(provider))return unavailable('runtime_identity_mismatch');
  try{
    if(!existsSync(codexHome))return unavailable('provider_session_missing');
    const home=realpathSync(codexHome),expected=realpathSync(cwd);
    const indexes=readdirSync(home).filter(name=>/^state_\d+\.sqlite$/.test(name)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]));
    if(!indexes.length)return unavailable('provider_session_missing');
    const file=privateStateFile(stateRoot,path.join(home,indexes[0]),{createDirectory:false});
    privateStateFile(stateRoot,file+'-wal',{createDirectory:false});privateStateFile(stateRoot,file+'-shm',{createDirectory:false});
    const Type=process.getBuiltinModule('node:sqlite')?.DatabaseSync;if(!Type)return unavailable('execution_runtime_unsupported');
    let row,db;
    try{
      db=new Type(file,{readOnly:true});db.exec('PRAGMA busy_timeout=1500; PRAGMA query_only=ON;');
      const columns=db.prepare('PRAGMA table_info(threads)').all();
      row=db.prepare('SELECT id,rollout_path,model_provider,cwd'+(columns.some(column=>column.name==='model')?',model':'')+' FROM threads WHERE id=?').get(sessionId);
    }finally{db?.close();}
    if(!row)return unavailable('provider_session_missing');
    if(row.model_provider!==provider || row.model && row.model!==model || realpathSync(row.cwd)!==expected)return unavailable('runtime_identity_mismatch');
    const source=privateStateFile(stateRoot,row.rollout_path,{createDirectory:false});
    if(!source || !realpathSync(source).startsWith(home+path.sep) || !['sessions','archived_sessions'].includes(path.relative(home,source).split(path.sep)[0]))return unavailable('provider_session_unsafe');
    const original=lstatSync(source),fd=openSync(source,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let header;
    try{
      const opened=fstatSync(fd);if(opened.dev!==original.dev || opened.ino!==original.ino || !opened.isFile())return unavailable('provider_session_changed');
      const bytes=Buffer.alloc(1024*1024),length=readSync(fd,bytes,0,bytes.length,0),end=bytes.subarray(0,length).indexOf(10);
      if(end<0)return unavailable('provider_session_format_unknown');
      header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,end)));
    }finally{closeSync(fd);}
    if(header.type!=='session_meta' || header.payload?.id!==sessionId || header.payload?.model_provider!==provider || realpathSync(header.payload.cwd)!==expected)return unavailable('runtime_identity_mismatch');
    return {available:true,code:'provider_session_verified',proofHash:createHash('sha256').update(JSON.stringify([home,sessionId,provider,model,expected,original.dev,original.ino,header.payload])).digest('hex')};
  }catch{return unavailable('provider_session_unavailable');}
}
