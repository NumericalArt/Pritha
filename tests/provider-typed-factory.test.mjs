import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ProviderTaskRuntime} from '../scripts/lib/provider-task-runtime.mjs';
import {ProviderHostTools} from '../scripts/lib/provider-host-tools.mjs';
import {voiceFactoryPaths,loadVoiceFactory,factoryArtifact} from '../scripts/agents-mother/voice-factory-state.mjs';

const root=fs.realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const create=(id='typed_factory_create')=>({clientThreadId:id,source:'chat',factoryIntent:{action:'create-new-agent',slug:'typed-child'},workspace:{mode:'read-only'}});
const message=(id)=>({clientMessageId:id,input:[{type:'text',text:'Build the approved local product.'}]});
const until=async predicate=>{for(let i=0;i<400;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Fixture did not settle');};
function fixture(t,connectorId='claude',capabilities={tools:true,approvals:true}){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-typed-factory-'))),stateRoot=path.join(directory,'state'),agentParent=path.join(directory,'children');fs.mkdirSync(stateRoot);fs.mkdirSync(agentParent);
  const runs=[],instances=[],tools=[];const settings={modelId:'pinned-model',reasoningEffort:'low',timeoutMs:30000,sandbox:'workspace-write'};
  const make=()=>{const runtime=new ProviderTaskRuntime({connectorId,root,stateRoot,agentParent,privateRoot:path.join(stateRoot,'private','task-chat'),executionDirectory:path.join(stateRoot,'execution'),configuration:()=>settings,preflight:async()=>({interrupt:true,steer:false,...capabilities}),launch:async input=>{
    await input.beforeStart({identity:'a'.repeat(64),evidence:{fixture:true}});await input.onEvent({type:'thread.started',thread_id:'11111111-2222-4333-8444-555555555555'});
    const host=new ProviderHostTools({...input,...input.hostExecutionContext,connectorId,onProcessEvidence:()=>{}});tools.push(host);
    let resolve;const completion=new Promise(done=>{resolve=done;});const run={input,host,resolve,completion,stop:()=>{resolve({ok:false,errorCode:'operator_cancel',processTreeExited:true});return true;}};runs.push(run);return run;
  }});instances.push(runtime);return runtime;};
  t.after(async()=>{for(const host of tools)await host.close();for(const runtime of instances)await runtime.dispose();fs.rmSync(directory,{recursive:true,force:true});});
  return {make,runs,settings,stateRoot,agentParent,directory};
}
for(const provider of ['claude','neuraldeep','openrouter','local'])test(`${provider}: explicit typed creation exposes real factory tools, pins readonly binding and replays after target creation`,async t=>{
  const f=fixture(t,provider),runtime=f.make(),input=create(),binding=(await runtime.create(input)).binding;
  assert.equal(binding.executionConfig.sandbox,'read-only');assert.equal(binding.workspace.mode,'read-only');assert.equal(binding.workspacePath,root);assert.equal(binding.workspace.factoryTarget,path.join(f.agentParent,'typed-child'));
  assert.deepEqual(binding.subject,{kind:'child',slug:'typed-child',phase:'interview'});
  await runtime.start(binding.chatId,message('typed_first_turn'));await until(()=>f.runs.length===1);
  const run=f.runs[0];assert(run.host.definitions.some(tool=>tool.name==='factory_step'));assert.equal(run.input.hostExecutionContext.factory.model,'pinned-model');assert.equal(run.input.sandbox,'read-only');assert.equal(run.input.cwd,root);
  await assert.rejects(run.host.call('write_file',{operation_id:'ordinary_write_denied',path:'unapproved.txt',content:'no',expected_sha256:null}),{code:'provider_tool_write_denied'});
  run.resolve({ok:true,processTreeExited:true});await until(()=>runtime.active.size===0);
  fs.mkdirSync(binding.workspace.factoryTarget);f.settings.modelId='changed-default';
  const restarted=f.make();assert.equal((await restarted.create(input)).binding.chatId,binding.chatId);
  for(const change of [{factoryIntent:{action:'create-new-agent',slug:'another-child'}},{settings:{modelId:'changed-model'}},{workspace:undefined}])await assert.rejects(restarted.create({...input,...change}),{code:'idempotency_conflict'});
  await restarted.start(binding.chatId,message('typed_after_restart'));await until(()=>f.runs.length===2);assert.equal(f.runs[1].input.model,'pinned-model');assert.deepEqual(f.runs[1].input.hostExecutionContext.factory,run.input.hostExecutionContext.factory);
  for(const key of ['factoryIntent','workspace']){
    const forged={...message('forged_'+key),[key]:key==='factoryIntent'?{action:'create-new-agent',slug:'elsewhere'}:{factorySlug:'elsewhere'}};
    await assert.rejects(restarted.start(binding.chatId,forged),{code:'runtime_identity_mismatch'});await assert.rejects(restarted.enqueue(binding.chatId,forged),{code:'runtime_identity_mismatch'});
  }
});
test('subject context alone never grants factory authority',async t=>{
  const f=fixture(t),runtime=f.make();f.settings.sandbox='read-only';
  const binding=(await runtime.create({clientThreadId:'context_only_creation',source:'chat',subject:{kind:'child',slug:'typed-child',phase:'interview'}})).binding;
  await runtime.start(binding.chatId,message('context_only_turn'));await until(()=>f.runs.length===1);
  assert.equal(binding.workspace.factorySlug,undefined);assert.equal(f.runs[0].input.hostExecutionContext.factory,undefined);assert(!f.runs[0].host.definitions.some(tool=>tool.name==='factory_step'));
  await assert.rejects(f.runs[0].host.call('factory_step',{operation_id:'forged_factory_action',action:'status'}),{code:'provider_tool_unknown'});
});
test('malformed intent, authority fields, existing targets and missing capabilities fail before chat creation',async t=>{
  const f=fixture(t),runtime=f.make(),base=create();
  for(const intent of [null,[],false,{action:'adopt',slug:'typed-child'},{action:'create-new-agent',slug:'../escape'},{action:'create-new-agent',slug:'/escape'},{...base.factoryIntent,provider:'openrouter'},{...base.factoryIntent,target:'/escape'},{...base.factoryIntent,approved:true}])await assert.rejects(runtime.create({...base,factoryIntent:intent}),{code:'chat_subject_invalid'});
  for(const extra of [{subject:{kind:'child',slug:'typed-child',phase:'interview'}},{workspace:{mode:'isolated'}},{workspace:{mode:'read-only',factorySlug:'typed-child'}},{workspace:{mode:'read-only',agentId:'other'}},{workspace:{mode:'read-only',baseRevision:'abc'}},{hostVoice:{topicId:'forged'}},{voice:{}},{factoryTarget:'/escape'},{connectorId:'openrouter'}])await assert.rejects(runtime.create({...base,...extra}),{code:'factory_intent_invalid'});
  await assert.rejects(runtime.create({clientThreadId:'ordinary_factory_payload',source:'chat',workspace:{mode:'read-only',factorySlug:'typed-child'},subject:{kind:'child',slug:'typed-child',phase:'interview'}}),{code:'voice_factory_subject_binding_required'});
  assert.equal(runtime.registry.list().data.length,0);
  fs.mkdirSync(path.join(f.agentParent,'typed-child'));await assert.rejects(runtime.create(base),{code:'factory_target_exists'});assert.equal(runtime.registry.list().data.length,0);
  for(const capabilities of [{tools:false,approvals:true},{tools:true,approvals:false}]){
    const missing=fixture(t,'claude',capabilities),r=missing.make();await assert.rejects(r.create(base),{code:'voice_factory_tools_unavailable'});assert.equal(r.registry.list().data.length,0);assert.equal(fs.existsSync(path.join(missing.stateRoot,'agents','voice-factory')),false);
  }
});
test('typed entry prepares private drafts without a redundant approval and cannot adopt its draft in another chat',{timeout:60000},async t=>{
  const f=fixture(t),runtime=f.make(),binding=(await runtime.create(create())).binding;
  await runtime.start(binding.chatId,message('typed_worker_turn'));await until(()=>f.runs.length===1);const run=f.runs[0];
  const brief={identity:{name:'Typed Child',slug:'typed-child'},goal:'Count lines in a local text file.',user:'Local operator',successCriteria:['Returns the exact JSON line count.'],coreFunctions:['Count a selected file'],nonGoals:['No network or services'],technical:{runtimeFamily:'cli',primaryInterface:'CLI',serviceMode:'none',repositoryResearchPolicy:'not-applicable',repositoryAdoptionMode:'none',repositoryResearchWaiverReason:'A deterministic line counter needs no third-party repository.'}};
  const call=run.host.call('factory_step',{operation_id:'typed_factory_init',action:'init',brief,build_token_budget:10000});
  assert.equal(runtime.pendingRequests(binding.chatId).length,0);
  const result=JSON.parse((await call).content[0].text);assert.equal(result.status,'completed',result.text);
  const p=voiceFactoryPaths({root,stateRoot:f.stateRoot,agentParent:f.agentParent,slug:'typed-child'}),state=loadVoiceFactory(p,{chatId:binding.chatId,connectorId:'claude'});
  assert.equal(state.phase,'contract-draft');assert.equal(factoryArtifact(p,state,'contract').frontmatter.status,'draft');assert.equal(state.contractApproval,undefined);assert.equal(state.outcomeApproval,undefined);assert.equal(fs.existsSync(p.target),false);
  assert.equal((await runtime.create(create())).binding.chatId,binding.chatId);
  await assert.rejects(runtime.create(create('another_factory_chat')),{code:'factory_target_exists'});
  await assert.rejects(run.host.call('factory_step',{operation_id:'outcome_without_approval',action:'create_outcome'}),{code:'factory_contract_approval_required'});
});

for(const provider of ['claude','neuraldeep'])test(`${provider}: explicit factory status retains the chat and replay receipt without a parent inference`,async t=>{
  const f=fixture(t,provider),runtime=f.make(),binding=(await runtime.create(create('factory_control_create'))).binding;
  const input={...message('factory_control_status'),factoryAction:{operation_id:'factory_control_status_01',action:'status'}};
  const started=await runtime.start(binding.chatId,input);
  await until(()=>runtime.active.size===0);
  assert.equal(f.runs.length,0);
  assert.equal(runtime.registry.turn(binding.chatId,started.accepted.turn.turnId).status,'completed');
  assert.equal(runtime.require(binding.chatId).nativeThreadId,binding.nativeThreadId);
  assert.equal(runtime.require(binding.chatId).modelId,'pinned-model');
  const replay=await f.make().start(binding.chatId,input);
  assert.equal(replay.replayed,true);assert.equal(replay.accepted.turn.turnId,started.accepted.turn.turnId);assert.equal(f.runs.length,0);
  await assert.rejects(runtime.start(binding.chatId,{...input,factoryAction:{...input.factoryAction,action:'finish'}}),{code:'idempotency_conflict'});
});

test('explicit factory control rejects authority, retargeting, attachments and queueing before dispatch',async t=>{
  const f=fixture(t),runtime=f.make(),binding=(await runtime.create(create('factory_control_guards'))).binding;
  const input={...message('factory_control_invalid'),factoryAction:{operation_id:'factory_control_guard_01',action:'status'}};
  for(const factoryAction of [null,[],{}, {...input.factoryAction,approved:true},{...input.factoryAction,root:'/other'}, {...input.factoryAction,action:'approve_contract'}, {...input.factoryAction,action:'init'}, {...input.factoryAction,operation_id:'../escape'},{...input.factoryAction,action:'delivery_resume',answer:42}])await assert.rejects(runtime.start(binding.chatId,{...input,factoryAction}),{code:'factory_control_invalid'});
  await assert.rejects(runtime.start(binding.chatId,{...input,attachments:['image']}),{code:'factory_control_invalid'});
  await assert.rejects(runtime.enqueue(binding.chatId,input),{code:'factory_control_queue_denied'});
  assert.equal(f.runs.length,0);assert.equal(runtime.registry.turnsPage(binding.chatId).data.length,0);
  const ordinary=(await runtime.create({clientThreadId:'ordinary_control_scope',source:'chat',workspace:{mode:'read-only'}})).binding;
  await assert.rejects(runtime.start(ordinary.chatId,input),{code:'factory_control_invalid'});
});
