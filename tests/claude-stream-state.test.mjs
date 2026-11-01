import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { ClaudeStreamState,claudeUsage } from '../scripts/claude/stream-state.mjs';
import { readJsonlLines } from '../scripts/neuraldeep/jsonl-reader.mjs';

const session='12345678-1234-1234-1234-123456789012',model='claude-sonnet-5-5';
const usage=(input=5,output=2,write=3,read=7)=>({input_tokens:input,output_tokens:output,cache_creation_input_tokens:write,cache_read_input_tokens:read});
const init={type:'system',subtype:'init',session_id:session,model};
const assistant=(content,extra={})=>({type:'assistant',session_id:session,message:{id:'msg_one',model,content,usage:usage()},...extra});
const result=(extra={})=>({type:'result',subtype:'success',is_error:false,session_id:session,uuid:'final-result',usage:usage(),total_cost_usd:0.013,...extra});

test('fragmented UTF-8 stream preserves public text and omits private reasoning from emitted records',async()=>{
  const emitted=[],state=new ClaudeStreamState({model,sessionId:session,onEvent:event=>emitted.push(event)});
  const bytes=Buffer.from([init,assistant([{type:'thinking',thinking:'PRIVATE_REASONING_CANARY',signature:'PRIVATE_SIGNATURE_CANARY'},{type:'text',text:'Привет, Прита 🐈'}]),result()].map(JSON.stringify).join('\n'));
  for await(const line of readJsonlLines(Readable.from([...bytes].map(byte=>Buffer.from([byte])))))await state.accept(JSON.parse(line));
  const done=await state.finish();assert.equal(done.ok,true);assert.equal(done.usage.totalTokens,17);assert.equal(done.costUsd,0.013);
  assert.equal(emitted[1].item.text,'Привет, Прита 🐈');assert.doesNotMatch(JSON.stringify(emitted)+JSON.stringify(done),/PRIVATE_REASONING|PRIVATE_SIGNATURE/);
});

test('usage merges per-message cumulative snapshots and never adds the aggregate result twice',async()=>{
  const state=new ClaudeStreamState({model,sessionId:session});await state.accept(init);
  await state.accept(assistant([{type:'text',text:'A'}]));
  const update=assistant([{type:'text',text:'A longer'}]);update.message.usage=usage(5,4,3,7);await state.accept(update);
  const other=assistant([{type:'text',text:'B'}]);other.message.id='msg_two';other.message.usage=usage(2,3,0,1);await state.accept(other);
  const final=result({usage:usage(7,7,3,8)});await state.accept(final);await state.accept(final);
  assert.deepEqual((await state.finish()).usage,{inputTokens:7,outputTokens:7,cacheWriteTokens:3,cacheReadTokens:8,totalTokens:25});
  assert.equal(claudeUsage({input_tokens:1,output_tokens:-1}),null);assert.equal(claudeUsage(usage(Number.MAX_SAFE_INTEGER,2)),null);
});

test('parallel tool receipts attach by exact ID; missing or conflicting receipts never become success',async()=>{
  const emitted=[],state=new ClaudeStreamState({model,sessionId:session,onEvent:event=>emitted.push(event)});await state.accept(init);
  await state.accept(assistant([{type:'tool_use',id:'tool_one',name:'read_file',input:{path:'a'}},{type:'tool_use',id:'tool_two',name:'read_file',input:{path:'b'}}]));
  const receipt={type:'user',session_id:session,message:{content:[{type:'tool_result',tool_use_id:'tool_two',content:'Second file'}]}};
  await state.accept(receipt);await state.accept(receipt);await state.accept(result());const done=await state.finish();
  assert.equal(done.ok,false);assert.equal(done.errorCode,'cancelled_or_ambiguous_tool_receipt');assert.equal(done.unresolvedTools,1);
  assert.equal(emitted.filter(event=>event.type==='item.completed').length,2);assert.equal(emitted.at(-1).item.status,'failed');
  const another=new ClaudeStreamState({model,sessionId:session});await another.accept(init);
  await assert.rejects(another.accept(receipt),{code:'provider_tool_receipt_orphan'});
});

test('a session, model or result change fails before it can become a new binding',async()=>{
  for(const event of [{...init,model:'claude-opus-5-5'},{...init,session_id:'87654321-4321-4321-4321-210987654321'}]){
    const state=new ClaudeStreamState({model,sessionId:session});await assert.rejects(state.accept(event),{code:'runtime_identity_mismatch'});
  }
  const state=new ClaudeStreamState({model,sessionId:session});await state.accept(init);await state.accept(result());
  await assert.rejects(state.accept(result({total_cost_usd:4})),{code:'provider_result_conflict'});
  const wrong=new ClaudeStreamState({model,sessionId:session});await wrong.accept(init);
  await assert.rejects(wrong.accept(result({modelUsage:{'claude-opus-5-5':{}}})),{code:'runtime_identity_mismatch'});
});

test('errors, absent usage and interrupted output remain observable rather than zero-cost success',async()=>{
  const state=new ClaudeStreamState({model,sessionId:session});await state.accept(init);
  await state.accept(result({subtype:'error_max_turns',is_error:true,usage:null,total_cost_usd:undefined}));
  const done=await state.finish();assert.equal(done.ok,false);assert.equal(done.errorCode,'provider_max_turns');assert.equal(done.usageKnown,false);assert.equal(done.usage,null);assert.equal(done.costUsd,null);
  const stopped=new ClaudeStreamState({model,sessionId:session});await stopped.accept(init);assert.equal((await stopped.finish('operator_cancel')).errorCode,'operator_cancel');
  const inconsistent=new ClaudeStreamState({model,sessionId:session});await inconsistent.accept(init);await inconsistent.accept(assistant([{type:'text',text:'A'}]));await inconsistent.accept(result({usage:usage(0,0,0,0)}));
  assert.equal((await inconsistent.finish()).usageKnown,false);assert.equal(inconsistent.usage().usageInconsistent,true);
});

test('parser limits and missing init reject malformed records without exposing payload text',async()=>{
  const state=new ClaudeStreamState({model,sessionId:session});await assert.rejects(state.accept(assistant([{type:'text',text:'SECRET'}])),{code:'provider_stream_missing_init'});
  await assert.rejects(async()=>{for await(const line of readJsonlLines(Readable.from([Buffer.alloc(1024,65)]),{maximumLineBytes:100}))void line;},{code:'cli_record_too_large'});
  await assert.rejects(async()=>{for await(const line of readJsonlLines(Readable.from([Buffer.from([0xff,10])])) )void line;},TypeError);
});
