// Installed CLI, real OS sandbox, synthetic model and search responses only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {SearchService} from '../../scripts/search/service.mjs';
import {ExecutionCoordinator} from '../../scripts/lib/execution-coordinator.mjs';
import {startNeuralDeepRun} from '../../scripts/neuraldeep-codex.mjs';

test('installed Codex uses host Search and Read with exact sources on initial and resumed NeuralDeep turns',{timeout:90000},async()=>{
  const root=fileURLToPath(new URL('../../',import.meta.url)),directory=mkdtempSync(path.join(os.tmpdir(),'pritha-search-cli-')),stateRoot=path.join(directory,'state'),cwd=path.join(directory,'workspace');mkdirSync(cwd);mkdirSync(stateRoot);
  const coordinator=new ExecutionCoordinator({stateRoot});let searches=0,reads=0,session,exited=true;
  const source={url:'https://example.com/document',title:'Primary source',content:'SEARCH_SOURCE_FIXTURE',date:'2026-10-30'};
  const search=new SearchService({codeRoot:root,stateRoot,environment:{},verifyUrl:async url=>url,providers:{neuraldeep:{search:async()=>{searches++;return {items:[source]};},read:async()=>{reads++;return {items:[{...source,content:'PAGE_SOURCE_FIXTURE'}]};}}}});
  try{
    for(const iteration of [0,1]){
      const lease=coordinator.claim(['search-fixture'],'search_turn_'+iteration,{kind:'turn',capacity:4});let step=0,fixtureError;
      const fetchImpl=async(url,init)=>{
        try{
          assert.equal(String(url).startsWith('https://api.neuraldeep.ru/v1/responses'),true);const payload=JSON.parse(init.body);step++;
          const names=payload.tools.map(tool=>tool.name);assert.ok(names.includes('mcp__pritha__web_search'));assert.ok(names.includes('mcp__pritha__read_page'));assert.equal(names.length,9);
          const encoded=JSON.stringify(payload);if(step===2)assert.match(encoded,/SEARCH_SOURCE_FIXTURE/);if(step===3){assert.match(encoded,/PAGE_SOURCE_FIXTURE/);assert.match(encoded,/published_at/);assert.match(encoded,/untrusted/);}
          const tool=step===1?{name:'mcp__pritha__web_search',args:{query:'Search official fixture '+iteration}}:step===2?{name:'mcp__pritha__read_page',args:{url:source.url}}:null;
          assert.ok(step<=3);const id='search_'+iteration+'_'+step,model='qwen3.8-27b';
          const output=tool?[{type:'function_call',id,call_id:id,name:tool.name,arguments:JSON.stringify(tool.args),status:'completed'}]:[{type:'message',id,role:'assistant',status:'completed',content:[{type:'output_text',text:'SEARCH_FIXTURE_OK',annotations:[]}]}];
          return new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'response_'+id,model,status:'completed',output,usage:{input_tokens:5,output_tokens:2,total_tokens:7}}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
        }catch(error){fixtureError=error.message;throw error;}
      };
      try{
        const run=await startNeuralDeepRun({root,cwd,stateRoot,privateRoot:path.join(stateRoot,'private','neuraldeep'),model:'qwen3.8-27b',effort:'none',sandbox:'workspace-write',timeoutMs:40000,resume:session,prompt:'Search and read public sources. Return SEARCH_FIXTURE_OK.',searchUserText:'Search official fixture '+iteration,hostExecutionContext:{coordinator,lease,chatId:'search_chat',turnId:'search_turn_'+iteration}},{readCredential:()=> 'SYNTHETIC_SEARCH_KEY',fetchImpl,searchService:search});
        const result=await run.completion;exited=result.processTreeExited;assert.equal(result.ok,true,JSON.stringify({error:result.errorCode,fixtureError,step}));assert.equal(exited,true);assert.equal(step,3);if(session)assert.equal(result.sessionId,session);session=result.sessionId;
      }finally{lease.release();}
    }
    assert.equal(searches,2);assert.equal(reads,1); // Owner-local page cache survives the exact resumed session.
  }finally{search.store.close();coordinator.close();if(exited)rmSync(directory,{recursive:true,force:true});}
});
