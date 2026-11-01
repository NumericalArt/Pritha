// Installed CLI and real model-process sandbox. All responses are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startCompatibleRun} from '../../scripts/openai-compatible-codex.mjs';
import {saveLocalServerConfiguration} from '../../scripts/openai-compatible/owned-local-server.mjs';
import {ExecutionCoordinator} from '../../scripts/lib/execution-coordinator.mjs';
import {providerProcessTreesExited} from '../../scripts/lib/provider-process-proof.mjs';
test('installed CLI uses only its owned offline model server, guarded tools and exact resumed session',{timeout:90000,skip:process.platform!=='darwin'},async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-local-stock-')),stateRoot=path.join(directory,'state'),cwd=path.join(directory,'code'),assets=path.join(directory,'model');for(const dir of [stateRoot,cwd,assets])mkdirSync(dir);
  let exited=true,proof,requests=0,session;const coordinator=new ExecutionCoordinator({stateRoot}),lease=coordinator.claim(['local-fixture'],'local-owner',{kind:'turn',capacity:4});
  t.after(()=>{lease.release();coordinator.close();if(exited)rmSync(directory,{recursive:true,force:true});});
  writeFileSync(path.join(cwd,'product.txt'),'LOCAL_PRODUCT');const script=path.join(assets,'server.mjs');
  writeFileSync(script,`import {createServer} from 'node:http';let count=0;
createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'fixture-local'}]}));return;}if(req.url!=='/v1/responses'){res.statusCode=404;res.end('{}');return;}
if(req.headers.authorization){res.statusCode=403;res.end('{}');return;}const parts=[];for await(const part of req)parts.push(part);const input=JSON.parse(Buffer.concat(parts));
if(input.model!=='fixture-local' || input.tools.length!==7){res.statusCode=400;res.end('{}');return;}
const hasResult=input.input.some(item=>item.type==='function_call_output' && item.call_id==='local_read');
const output=hasResult?[{id:'answer_'+(++count),type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'LOCAL_FIXTURE_OK',annotations:[]}]}]:[{id:'call_'+(++count),type:'function_call',call_id:'local_read',name:'mcp__pritha__read_file',arguments:JSON.stringify({path:'product.txt'}),status:'completed'}];
const response={id:'response_'+count,model:input.model,status:'completed',output,usage:{input_tokens:4,output_tokens:2,total_tokens:6}};
res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({type:'response.completed',response})+'\\n\\ndata: [DONE]\\n\\n');}).listen(Number(process.argv[2]),'127.0.0.1');`);
  const root=process.cwd(),baseUrl='http://127.0.0.1:1234/v1';saveLocalServerConfiguration({root,stateRoot},{schema:1,endpoint:baseUrl,command:process.execPath,args:[script,'{port}'],readRoots:[assets],model:{id:'fixture-local',tools:true,responses:true,contextTokens:32768,outputTokens:4096,efforts:['default']}});
  for(let i=0;i<2;i++){
    const events=[],run=await startCompatibleRun({connectorId:'local',root,cwd,stateRoot,privateRoot:path.join(stateRoot,'local'),baseUrl,model:'fixture-local',modelContextTokens:32768,effort:'default',timeoutMs:35000,sandbox:'read-only',resume:session,
      prompt:'Read product.txt, then reply LOCAL_FIXTURE_OK.',hostExecutionContext:{coordinator,lease,chatId:'chat_local_fixture',turnId:'turn_'+i},approve:async()=>({decision:'reject'}),onEvent:event=>events.push(event),beforeStart:event=>{proof=event.evidence;},onEvidence:event=>{proof=event;},onProviderRequest:()=>{requests++;}});
    const result=await run.completion;exited=result.processTreeExited;assert.equal(result.ok,true,JSON.stringify({code:result.errorCode,events}));assert.equal(exited,true);assert.equal(providerProcessTreesExited(proof),true);assert(proof.trees.some(tree=>tree.id==='inference'));
    if(session)assert.equal(result.sessionId,session);session=result.sessionId;assert(events.some(event=>event.item?.text==='LOCAL_FIXTURE_OK'));
  }
  assert.equal(requests,3);
});
