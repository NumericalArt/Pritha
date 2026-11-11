import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prithaChildConnections,readPrithaChildCredential} from '../scripts/lib/pritha-child-credentials.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'child-credentials-')),stateRoot=path.join(root,'state');
  fs.mkdirSync(path.join(stateRoot,'config'),{recursive:true});
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,stateRoot,env:{},platform:'linux'};
}
test('selected instance connections expose metadata only and read credentials only on the host',t=>{
  const f=fixture(t),sibling=path.join(f.root,'sibling');fs.mkdirSync(path.join(sibling,'config'),{recursive:true});
  fs.writeFileSync(path.join(f.stateRoot,'config/runtime.env'),'OPENAI_API_KEY=fixture-openai\nNEURALDEEP_API_KEY=fixture-neuraldeep\nUNRELATED_SECRET=fixture-unrelated\n');
  fs.writeFileSync(path.join(sibling,'config/runtime.env'),'ANTHROPIC_API_KEY=foreign-instance\n');
  assert.deepEqual(prithaChildConnections(f),[
    {provider:'openai',configured:true,status:'configured'}, {provider:'claude',configured:false,status:'missing'},
    {provider:'neuraldeep',configured:true,status:'configured'}, {provider:'openrouter',configured:false,status:'missing'},
  ]);
  assert.equal(readPrithaChildCredential('neuraldeep',f),'fixture-neuraldeep');
  assert.equal(readPrithaChildCredential('claude',f),'');assert.deepEqual(f.env,{});
  assert.equal(readPrithaChildCredential('openai',{...f,env:{OPENAI_API_KEY:'explicit-instance'}}),'explicit-instance');
  assert.throws(()=>readPrithaChildCredential('unrelated',f),{code:'child_provider_configuration_invalid'});
});
test('Keychain connection preflight never requests a password',t=>{
  const f=fixture(t),calls=[];
  const options={...f,platform:'darwin',runSync:(command,args)=>{calls.push({command,args});return {status:args.includes('-w')?0:44,stdout:'fixture-keychain-key'};}};
  assert.ok(prithaChildConnections(options).every(row=>!row.configured));
  assert.equal(calls.length,3);assert.ok(calls.every(call=>!call.args.includes('-w')));
  assert.equal(readPrithaChildCredential('claude',options),'fixture-keychain-key');assert.ok(calls.at(-1).args.includes('-w'));
  const service=calls.at(-1).args[2];readPrithaChildCredential('claude',{...options,stateRoot:path.join(f.root,'another')});
  assert.notEqual(calls.at(-1).args[2],service);
});
