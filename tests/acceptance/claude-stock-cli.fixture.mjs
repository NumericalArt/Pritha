// Explicit opt-in protocol acceptance: installed CLI, real OS sandbox, synthetic
// Anthropic upstream. No account key, paid inference or remote model request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startClaudeCodeRun } from '../../scripts/claude-code-runner.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),model='claude-sonnet-5-5';
function reply(id){
  const events=[
    {type:'message_start',message:{id,role:'assistant',model,type:'message',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:5,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0}}},
    {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
    {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'FIXTURE_OK'}},
    {type:'content_block_stop',index:0},
    {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:3}},
    {type:'message_stop'},
  ];
  return new Response(events.map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
}
test('stock Claude API lane starts and resumes exactly under an enforced sandbox',{timeout:90000,skip:process.platform!=='darwin'},async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-claude-stock-')),cwd=path.join(directory,'workspace'),stateRoot=path.join(directory,'state');mkdirSync(cwd);mkdirSync(stateRoot);
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  let requests=0;const events=[],diagnostics=[];
  const dependencies={readCredential:()=> 'SYNTHETIC_ONLY_NOT_A_REAL_KEY',fetchImpl:async(url,init)=>{
    assert.equal(url.startsWith('https://api.anthropic.com/v1/messages'),true);assert.equal(init.headers.authorization,'Bearer SYNTHETIC_ONLY_NOT_A_REAL_KEY');
    const body=JSON.parse(init.body);assert.equal(body.model,model);assert.equal(body.tools?.length || 0,0);requests++;
    if(url.includes('/count_tokens'))return Response.json({input_tokens:10});
    return reply('msg_fixture_'+requests);
  }};
  const options={root,cwd,stateRoot,privateRoot:path.join(stateRoot,'claude'),model,effort:'medium',authMode:'api-key',timeoutMs:40000,prompt:'Reply FIXTURE_OK.',maxTurns:2,
    onEvent:event=>events.push(event),onDiagnosticChunk:chunk=>diagnostics.push(String(chunk))};
  const first=await (await startClaudeCodeRun(options,dependencies)).completion;
  assert.equal(first.ok,true,JSON.stringify({first,diagnostics}));assert.equal(first.processTreeExited,true);assert.ok(first.sessionId);
  const second=await (await startClaudeCodeRun({...options,resume:first.sessionId,prompt:'Reply FIXTURE_OK again.'},dependencies)).completion;
  assert.equal(second.ok,true,JSON.stringify({second,diagnostics}));assert.equal(second.sessionId,first.sessionId);assert.equal(second.processTreeExited,true);
  assert.equal(events.filter(event=>event.item?.text==='FIXTURE_OK').length,2);assert.equal(requests,2);
  assert.doesNotMatch(JSON.stringify(events),/SYNTHETIC_ONLY_NOT_A_REAL_KEY/);
});
