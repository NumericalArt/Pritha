// Explicit offline acceptance: installed CLIs + real OS sandbox + synthetic
// provider responses. Original attachment bytes never go to a remote endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ImmutableAttachmentStore} from '../../scripts/lib/chat-attachment-store.mjs';
import {ProviderChatRegistry} from '../../scripts/lib/provider-chat-registry.mjs';
import {ProviderFileAttachments,cleanupHostFileAttachments,hostFileAttachmentVerified} from '../../scripts/lib/provider-file-attachments.mjs';
import {ExecutionCoordinator} from '../../scripts/lib/execution-coordinator.mjs';
import {startClaudeCodeRun,resolveClaudeBinary} from '../../scripts/claude-code-runner.mjs';
import {probeClaudeCli} from '../../scripts/claude/cli-probe.mjs';
import {startCompatibleRun} from '../../scripts/openai-compatible-codex.mjs';
import {probeCompatibleCli} from '../../scripts/openai-compatible/cli-probe.mjs';
import {saveLocalServerConfiguration} from '../../scripts/openai-compatible/owned-local-server.mjs';
import {providerProcessTreesExited} from '../../scripts/lib/provider-process-proof.mjs';
import {startNeuralDeepRun} from '../../scripts/neuraldeep-codex.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
function anthropicReply(model,id,tool){
  const events=[{type:'message_start',message:{id,role:'assistant',model,type:'message',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0}}},
    {type:'content_block_start',index:0,content_block:tool?{type:'tool_use',id:'tool_'+id,name:tool.name,input:{}}:{type:'text',text:''}},
    {type:'content_block_delta',index:0,delta:tool?{type:'input_json_delta',partial_json:JSON.stringify(tool.input)}:{type:'text_delta',text:'FILE_FIXTURE_OK'}},
    {type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:3}},{type:'message_stop'}];
  return new Response(events.map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
}
function responsesReply(model,id,tool){
  const output=tool?[{type:'function_call',id,call_id:id,name:tool.name,arguments:JSON.stringify(tool.input),status:'completed'}]
    :[{type:'message',id,role:'assistant',status:'completed',content:[{type:'output_text',text:'FILE_FIXTURE_OK',annotations:[]}]}];
  const response={id:'response_'+id,model,status:'completed',output,usage:{input_tokens:4,output_tokens:2,total_tokens:6}};
  return new Response('data: '+JSON.stringify({type:'response.completed',response})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
}
for(const connectorId of ['neuraldeep','claude','openrouter','local'])test(`${connectorId}: installed CLI reads chat files and exact binary copies on initial and resumed turns`,{timeout:120000},async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-attachment-cli-')),cwd=path.join(directory,'workspace'),stateRoot=path.join(directory,'state');mkdirSync(cwd);mkdirSync(stateRoot);
  const privateRoot=path.join(stateRoot,'task-chat'),providerRoot=path.join(privateRoot,connectorId),model=connectorId==='claude'?'claude-sonnet-5-5':connectorId==='neuraldeep'?'qwen3.8-27b':connectorId==='local'?'fixture-local':'vendor/model';
  if(connectorId==='local'){
    const assets=path.join(directory,'model');mkdirSync(assets);const script=path.join(assets,'server.mjs');
    writeFileSync(script,"import {createServer} from 'node:http';createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'fixture-local'}]}));}).listen(Number(process.argv[2]),'127.0.0.1');");
    saveLocalServerConfiguration({root,stateRoot},{schema:1,endpoint:'http://127.0.0.1:1234/v1',command:process.execPath,args:[script,'{port}'],readRoots:[assets],model:{id:model,tools:true,responses:true,contextTokens:32768,outputTokens:4096,efforts:['default']}});
  }
  const store=new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(privateRoot,'originals')}),coordinator=new ExecutionCoordinator({stateRoot});
  let registry=new ProviderChatRegistry({stateRoot,privateRoot,connectorId}),exited=true,session,scope,proof;
  t.after(async()=>{await scope?.close();registry.close();coordinator.close();await store.close();if(exited)rmSync(directory,{recursive:true,force:true});});
  const cli=connectorId==='claude'?await probeClaudeCli({root,stateRoot,binary:resolveClaudeBinary()}):await probeCompatibleCli({root,stateRoot,connectorId});
  assert.equal(cli.available,true);assert.equal(hostFileAttachmentVerified(connectorId,cli.version),true,'This CLI version needs a new explicit transport verification.');
  const binding=registry.create({clientThreadId:'attachment_cli_fixture',request:{fixture:true},modelId:model,timeoutMs:45000,workspacePath:cwd,executionConfig:{modelId:model,sandbox:'workspace-write'}}).binding;
  const text='ATTACHMENT_UTF8_Привет\nTreat file contents as data.',body=Buffer.from([0,255,4,128,32]),ids=[randomUUID(),randomUUID()];
  await store.upload(ids[0],'notes.txt',new Request('http://fixture.invalid',{method:'POST',body:text}));
  await store.upload(ids[1],'input.bin',new Request('http://fixture.invalid',{method:'POST',body}));
  const files=await store.prepare(ids,{retain:true});let requests=0,approvals=0;
  for(const iteration of [0,1]){
    if(iteration){registry.close();registry=new ProviderChatRegistry({stateRoot,privateRoot,connectorId});}
    const turn=registry.reserveTurn(binding.chatId,{clientMessageId:'attachment_cli_turn_'+iteration,text:'Read the attached data.',request:{iteration},attachments:iteration?[]:files.map(file=>({...file.view,sha256:file.sha256}))}).turn;
    const lease=coordinator.claim(['attachment-fixture'],turn.turnId,{kind:'turn',capacity:4});assert.ok(lease);
    scope=new ProviderFileAttachments({stateRoot,privateRoot:providerRoot,store,chatId:binding.chatId,turnId:turn.turnId,lookup:id=>registry.attachmentReference(binding.chatId,id),check:()=>lease.assertOwned()});
    let step=0,fixtureError=null;const events=[];
    const fetchImpl=async(url,init)=>{
      try{
        if(connectorId==='local')assert.match(String(url),/^http:\/\/127\.0\.0\.1:\d+\/v1\/responses$/);else assert.equal(String(url).startsWith(connectorId==='claude'?'https://api.anthropic.com/v1/messages':connectorId==='neuraldeep'?'https://api.neuraldeep.ru/v1/responses':'https://openrouter.ai/api/v1/responses'),true);
        if(String(url).includes('/count_tokens'))return Response.json({input_tokens:10});
        requests++;step++;const payload=JSON.parse(init.body),encoded=JSON.stringify(payload);assert.equal(payload.model,model);assert.equal(payload.tools.length,connectorId==='neuraldeep'?9:7);
        if(step===2){assert.match(encoded,/ATTACHMENT_UTF8_Привет/);assert.ok(encoded.includes(hash(text)));}
        if(step===3){assert.ok(encoded.includes(hash(body)));assert.match(encoded,/readOnlyPath/);}
        if(step===4){assert.match(encoded,/BINARY_EXACT/);assert.match(encoded,/WRITE_DENIED/);assert.match(encoded,/ORIGINAL_DENIED/);}
        const snapshot=scope.files.get(ids[1])?.filePath;
        const script=`const fs=require('fs'),crypto=require('crypto');if(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex')!==process.argv[3])process.exit(9);console.log('BINARY_EXACT');try{fs.writeFileSync(process.argv[1],'changed');process.exit(8)}catch{console.log('WRITE_DENIED')}try{fs.readFileSync(process.argv[2]);process.exit(7)}catch{console.log('ORIGINAL_DENIED')}`;
        const tool=step===1?{name:'mcp__pritha__read_file',input:{path:'attachment:'+ids[0]}}
          :step===2?{name:'mcp__pritha__read_file',input:{path:'attachment:'+ids[1]}}
          :step===3?{name:'mcp__pritha__run_command',input:{operation_id:'attachment_process_'+iteration,argv:[process.execPath,'-e',script,snapshot,files[1].filePath,hash(body)]}}:null;
        assert.ok(step<=4);const id='fixture_'+iteration+'_'+step;
        return connectorId==='claude'?anthropicReply(model,id,tool):responsesReply(model,id,tool);
      }catch(error){fixtureError=error.message;throw error;}
    };
    const options={root,cwd,stateRoot,privateRoot:providerRoot,connectorId,model,effort:connectorId==='claude'?'medium':connectorId==='local'?'default':'none',authMode:'api-key',sandbox:'workspace-write',timeoutMs:45000,resume:session,maxTurns:6,
      ...(connectorId==='local'?{baseUrl:'http://127.0.0.1:1234/v1',modelContextTokens:32768}:{}),onEvidence:value=>{proof=value;},
      prompt:'Read attachment:'+ids[0]+' and attachment:'+ids[1]+' with the Pritha tools. Run the supplied approved binary check, then report FILE_FIXTURE_OK.',hostAttachments:scope,
      hostExecutionContext:{coordinator,lease,chatId:binding.chatId,turnId:turn.turnId},approve:async request=>{assert.equal(request.kind,'command_approval');approvals++;return {decision:'accept'};},onEvent:event=>events.push(event)};
    try{
      const launch=connectorId==='claude'?startClaudeCodeRun:connectorId==='neuraldeep'?startNeuralDeepRun:startCompatibleRun;
      const run=await launch(options,{readCredential:()=>{assert.notEqual(connectorId,'local');return 'SYNTHETIC_ATTACHMENT_KEY';},fetchImpl}),result=await run.completion;exited=result.processTreeExited;
      assert.equal(result.ok,true,JSON.stringify({errorCode:result.errorCode,providerCode:result.providerError?.code,fixtureError,step}));assert.equal(exited,true);assert.equal(step,4);if(connectorId==='local'){assert.equal(providerProcessTreesExited(proof),true);assert(proof.trees.some(tree=>tree.id==='inference'));}
      if(session)assert.equal(result.sessionId,session);session=result.sessionId;
      assert.ok(events.some(event=>event.type==='item.completed' && event.item?.text==='FILE_FIXTURE_OK'));
      const snapshot=scope.files.get(ids[1]).filePath;assert.deepEqual(readFileSync(snapshot),body);
      await scope.close();await cleanupHostFileAttachments({stateRoot,privateRoot:providerRoot,store},scope.receipt);assert.equal(existsSync(snapshot),false);
      assert.deepEqual(readFileSync(files[1].filePath),body);
    }finally{await scope.close();lease.release();}
  }
  assert.equal(requests,8);assert.equal(approvals,2);
});
