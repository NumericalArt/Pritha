import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {managedStopVerifier} from '../scripts/agents-mother/factory-product-trial.mjs';
import {managedFixtureHandler,installStopFixture} from './helpers/managed-stop-fixture.mjs';

for(const unsafe of [true,false])test('independent Stop Trial '+(unsafe?'rejects foreign-PID kill':'passes owned shutdown and idempotence'),async()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'managed-stop-')));
  try{
    fs.mkdirSync(path.join(root,'scripts'));
    fs.writeFileSync(path.join(root,'scripts/server.mjs'),`import http from 'node:http';\n${managedFixtureHandler()}\nconst server=http.createServer((q,r)=>{if(!managed(q,r,server))r.end('{}');});server.listen(Number(process.env.TEST_PORT),'127.0.0.1');`);
    installStopFixture(root,'TEST_PORT',{unsafe});
    fs.writeFileSync(path.join(root,'check.mjs'),managedStopVerifier({agentName:'Test',envExampleVariables:'TEST_PORT=3000'}));
    const child=spawn(process.execPath,['check.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk);
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
    if(unsafe){assert.equal(code,1);assert.match(output,/Stop killed a foreign process in foreign-pid/);}
    else{assert.equal(code,0,output);assert.match(output,/"stale-record"/);}
    assert.equal(fs.existsSync(path.join(root,'.state')),false,'All test-owned processes and records must be cleaned on both pass and failure.');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
