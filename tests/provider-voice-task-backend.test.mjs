import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync, renameSync, symlinkSync } from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ProviderTaskRuntime } from '../scripts/lib/provider-task-runtime.mjs';
import { VoiceTopicBindings } from '../scripts/lib/voice-topic-bindings.mjs';
import { VoiceTaskBridge, voiceTaskRequestHash } from '../scripts/lib/voice-task-bridge.mjs';
import { providerVoiceTaskBackend } from '../scripts/lib/provider-voice-task-backend.mjs';
import { executionChannelView } from '../scripts/lib/execution-channel.mjs';
import {ImmutableAttachmentStore} from '../scripts/lib/chat-attachment-store.mjs';
import {hostFileAttachmentTransport} from '../scripts/lib/provider-file-attachments.mjs';
import {randomUUID} from 'node:crypto';
import {resolveProviderAgentWorkspace} from '../scripts/lib/provider-agent-workspace.mjs';
import {voiceFactoryPaths} from '../scripts/agents-mother/voice-factory-state.mjs';

async function until(predicate) { for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Fixture did not settle'); }
const request = text => ({ chat: { title: 'Voice fixture', workspace: { mode: 'read-only' } }, turn: { input: [{ type: 'text', text }] } });
function fixture(t, connectorId = 'neuraldeep', options = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pritha-provider-voice-'));
  const root = path.join(directory, 'source'), stateRoot = path.join(directory, 'state'),agentParent=path.join(directory,'children'); mkdirSync(root); mkdirSync(stateRoot);mkdirSync(agentParent);
  const settings = { modelId: 'new-default', reasoningEffort: 'high', timeoutMs: 90000, sandbox: 'read-only' }, runs = [], instances = [];
  const attachments=options.files?new ImmutableAttachmentStore({stateRoot,privateRoot:path.join(stateRoot,'originals')}):null;
  const snapshot=async()=>({status:'ready',version:connectorId==='claude'?'2.1.296':'0.153.0',capabilities:{attachments:{files:true,images:false}}});
  const make = () => {
    const runtime = new ProviderTaskRuntime({ connectorId, root, stateRoot, privateRoot: path.join(stateRoot, 'task-chat'), executionDirectory: path.join(stateRoot, 'execution'),
      configuration: () => settings, agentParent, preflight: async () => ({ interrupt: true, steer: false }), ...options,
      ...(attachments?{attachmentStore:attachments,preflight:async()=>({interrupt:true,steer:false,attachments:{files:true,images:false}}),attachmentTransport:hostFileAttachmentTransport({stateRoot,privateRoot:path.join(stateRoot,'provider-inputs'),snapshot})}:{}),
      launch: async input => {
        await input.beforeStart({ identity: 'a'.repeat(64), evidence: { schema: 1, fixture: true } });
        await input.onRawChunk(Buffer.from('{"type":"fixture"}\n'));
        await input.onEvent({ type: 'thread.started', thread_id: '11111111-2222-4333-8444-555555555555' });
        let resolve; const completion = new Promise(done => { resolve = done; });
        const run = { input, resolve, completion, stop() { resolve({ ok: false, errorCode: 'operator_cancel', processTreeExited: true }); return true; } };
        runs.push(run); return run;
      } });
    instances.push(runtime); return runtime;
  };
  const runtime = make(), bindings = new VoiceTopicBindings({ coordinator: runtime.execution, stateRoot });
  const reserve = (taskId, body) => bindings.reserve({ taskId, scope: { kind: 'pritha', id: 'fixture' }, connectorId,
    preset: { modelId: 'voice-pinned', reasoningEffort: 'low', timeoutMs: 30000 }, requestHash: voiceTaskRequestHash(body) });
  t.after(async () => { for (const item of instances) await item.dispose(); await attachments?.close();rmSync(directory, { recursive: true, force: true }); });
  return { runtime, bindings, bridge: new VoiceTaskBridge({ bindings, backend: providerVoiceTaskBackend(runtime) }), runs, settings, make, reserve,attachments,root,stateRoot,agentParent };
}

function childFixture(f,{git=false}={}){
  const project=path.join(f.agentParent,'child-one');mkdirSync(project);writeFileSync(path.join(project,'AGENTS.md'),'# Child fixture\n');
  writeFileSync(path.join(project,'product.txt'),'original');
  if(git){for(const args of [['init','-q'],['add','AGENTS.md','product.txt'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial']])execFileSync('git',args,{cwd:project});}
  const child=resolveProviderAgentWorkspace(f,'child-one');
  const reserve=(id,text,mode='read-only')=>{const workspace={mode,agentId:child.agentId},body={...request(text),chat:{workspace}};
    f.bindings.reserve({taskId:id,scope:{kind:'agent',id:child.agentId},workspace,connectorId:f.runtime.connectorId,preset:{modelId:'voice-pinned',reasoningEffort:'low',timeoutMs:30000},requestHash:voiceTaskRequestHash(body)});return body;};
  return {...child,project,reserve};
}
test('factory draft evidence belongs to the completed turn and survives a later successful retry and restart',async t=>{
  const f=fixture(t,'claude',{preflight:async()=>({interrupt:true,steer:false,approvals:true,tools:true})}),slug='snapshot-child',workspace={mode:'read-only',factorySlug:slug};
  const reserve=id=>{const body={...request('Prepare only a draft'),chat:{workspace,subject:{kind:'child',slug,phase:'interview'}}};
    f.bindings.reserve({taskId:id,scope:{kind:'agent',id:slug},workspace,connectorId:'claude',preset:{modelId:'voice-pinned',reasoningEffort:'low',timeoutMs:30000},requestHash:voiceTaskRequestHash(body)});return body;};
  const first=await f.bridge.dispatch('snapshot-first',reserve('snapshot-first'));await until(()=>f.runs.length===1);
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
  const client=f.bindings.task('snapshot-first').clientMessageId;
  const receipt=f.runtime.voiceReceipt(first.topic.chatId,client);
  assert.equal(receipt.turn.status,'completed');assert.deepEqual(receipt.factoryDraftReceipt,{draftCreated:false,errorCode:'factory_not_started'});
  const p=voiceFactoryPaths({root:f.root,stateRoot:f.stateRoot,agentParent:f.agentParent,slug});mkdirSync(path.join(p.memory,'contracts'),{recursive:true});mkdirSync(p.directory,{recursive:true});
  const contract=path.join(p.memory,'contracts','snapshot-draft.md');writeFileSync(contract,'---\nid: snapshot-draft\ntype: agent-contract\nstatus: draft\n---\n# Draft\n');
  writeFileSync(p.file,JSON.stringify({schema:'pritha-voice-factory-v1',slug,chatId:first.topic.chatId,connectorId:'claude',stateRoot:p.stateRoot,target:p.target,phase:'contract-draft',revision:1,running:null,contract}));
  const worker=f.make();assert.deepEqual(worker.voiceReceipt(first.topic.chatId,client).factoryDraftReceipt,receipt.factoryDraftReceipt);
  const second=await new VoiceTaskBridge({bindings:f.bindings,backend:providerVoiceTaskBackend(worker)}).dispatch('snapshot-second',reserve('snapshot-second'));await until(()=>f.runs.length===2);
  f.runs[1].resolve({ok:true,processTreeExited:true});await until(()=>worker.active.size===0);
  assert.deepEqual(worker.voiceReceipt(first.topic.chatId,f.bindings.task('snapshot-second').clientMessageId).factoryDraftReceipt,{draftCreated:true,errorCode:null});
  assert.deepEqual(worker.voiceReceipt(first.topic.chatId,client).factoryDraftReceipt,receipt.factoryDraftReceipt);
  worker.registry.updateTurn(first.topic.chatId,receipt.turnId,row=>{delete row.factoryDraftReceipt;return row;});
  assert.equal(worker.voiceReceipt(first.topic.chatId,client).factoryDraftReceipt.errorCode,'factory_draft_evidence_missing');
});
test('a dirty Claude parent blocks ordinary writes before a chat or model turn, while a new-agent draft stays read-only',async t=>{
  const f=fixture(t,'claude',{preflight:async()=>({interrupt:true,steer:false,approvals:true,tools:true})});
  writeFileSync(path.join(f.root,'README.md'),'# Parent\n');
  for(const args of [['init','-q'],['add','README.md'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial']])execFileSync('git',args,{cwd:f.root});
  writeFileSync(path.join(f.root,'unrelated.md'),'Keep this work');f.settings.sandbox='workspace-write';
  const workspace={mode:'isolated'},body={...request('Edit the existing parent'),chat:{workspace}};
  f.bindings.reserve({taskId:'ordinary-write',scope:{kind:'task',id:'ordinary'},workspace,connectorId:'claude',preset:{modelId:'voice-pinned',reasoningEffort:'low',timeoutMs:30000},requestHash:voiceTaskRequestHash(body)});
  await assert.rejects(f.bridge.dispatch('ordinary-write',body),{code:'workspace_dirty'});
  assert.equal(f.bindings.task('ordinary-write').state,'reserved');assert.equal(f.bindings.topic(f.bindings.task('ordinary-write').topicId).chatId,null);assert.equal(f.runs.length,0);
  const slug='draft-counter',factoryWorkspace={mode:'read-only',factorySlug:slug},draft={...request('Only prepare Contract and Outcome drafts'),chat:{workspace:factoryWorkspace,subject:{kind:'child',slug,phase:'interview'}}};
  f.bindings.reserve({taskId:'new-agent',scope:{kind:'agent',id:slug},workspace:factoryWorkspace,connectorId:'claude',preset:{modelId:'voice-pinned',reasoningEffort:'low',timeoutMs:30000},requestHash:voiceTaskRequestHash(draft)});
  await f.bridge.dispatch('new-agent',draft);await until(()=>f.runs.length===1);
  assert.equal(f.runs[0].input.sandbox,'read-only');assert.equal(f.runs[0].input.hostExecutionContext.factory.slug,slug);
  assert.equal(readFileSync(path.join(f.root,'unrelated.md'),'utf8'),'Keep this work');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
});

test('Voice search intent is pinned to each exact turn through queue and restart, never assembled prompt text',async t=>{
  const f=fixture(t,'claude'),first={...request('Host instructions: search current sources'),turn:{...request('Host instructions: search current sources').turn,voiceSearchText:'Do not browse. Count words.'}};
  f.reserve('search-denied',first);await f.bridge.dispatch('search-denied',first);await until(()=>f.runs.length===1);
  assert.equal(f.runs[0].input.searchUserText,'Do not browse. Count words.');
  const second={...request('Generated context'),turn:{...request('Generated context').turn,voiceSearchText:'Search public sources for Berlin weather'}};
  f.reserve('search-allowed',second);await f.bridge.dispatch('search-allowed',second);assert.equal(f.bindings.task('search-allowed').state,'queued');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.searchUserText,second.turn.voiceSearchText);
  f.runs[1].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
  const worker=f.make(),third=request('Search appears in old generated prompt');f.reserve('search-legacy',third);
  await new VoiceTaskBridge({bindings:f.bindings,backend:providerVoiceTaskBackend(worker)}).dispatch('search-legacy',third);await until(()=>f.runs.length===3);
  assert.equal(f.runs[2].input.searchUserText,'Do not browse.');f.runs[2].resolve({ok:true,processTreeExited:true});await until(()=>worker.active.size===0);
});
for(const connector of ['neuraldeep','claude','openrouter','local'])test(`${connector}: voice creation pins one new child, approvals and tools through queue and restart`,async t=>{
  const f=fixture(t,connector,{preflight:async()=>({interrupt:true,steer:false,approvals:true,tools:true})}),slug='factory-child',workspace={mode:'read-only',factorySlug:slug};
  const reserve=(id,text)=>{const body={...request(text),chat:{workspace,subject:{kind:'child',slug,phase:'interview'}}};f.bindings.reserve({taskId:id,scope:{kind:'agent',id:slug},workspace,connectorId:connector,preset:{modelId:'voice-pinned',reasoningEffort:'low',timeoutMs:30000},requestHash:voiceTaskRequestHash(body)});return body;};
  const first=await f.bridge.dispatch('factory-first',reserve('factory-first','Create a line counter'));await until(()=>f.runs.length===1);
  assert.equal(f.runs[0].input.cwd,realpathSync(f.root));assert.equal(f.runs[0].input.sandbox,'read-only');
  const bound=f.runs[0].input.hostExecutionContext.factory;assert.equal(bound.slug,slug);assert.equal(bound.target,path.join(realpathSync(f.agentParent),slug));assert.equal(bound.model,'voice-pinned');
  assert.ok(f.runtime.execution.claims().some(row=>row.mode==='write' && row.detail.workspacePath===bound.target));
  const queued=await f.bridge.dispatch('factory-second',reserve('factory-second','Continue the contract'));assert.equal(queued.task.state,'queued');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runs.length===2);assert.deepEqual(f.runs[1].input.hostExecutionContext.factory,bound);
  f.runs[1].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
  const worker=f.make();await new VoiceTaskBridge({bindings:f.bindings,backend:providerVoiceTaskBackend(worker)}).dispatch('factory-third',reserve('factory-third','Continue after restart'));await until(()=>f.runs.length===3);assert.deepEqual(f.runs[2].input.hostExecutionContext.factory,bound);
  await assert.rejects(worker.start(first.topic.chatId,{clientMessageId:'factory_redirect',subject:{kind:'child',slug:'another',phase:'interview'},input:[{type:'text',text:'Switch'}]}),{code:'runtime_identity_mismatch'});
  f.runs[2].resolve({ok:true,processTreeExited:true});await until(()=>worker.active.size===0);
});
test('a factory cannot start without host approvals or through an ordinary HTTP-style creation',async t=>{
  const f=fixture(t),workspace={mode:'read-only',factorySlug:'factory-child'},subject={kind:'child',slug:'factory-child',phase:'interview'};
  await assert.rejects(f.runtime.create({clientThreadId:'plain_factory_creation',workspace,subject}),{code:'voice_factory_subject_binding_required'});
  const body={...request('Create a child'),chat:{workspace,subject}};f.bindings.reserve({taskId:'factory-missing-tools',scope:{kind:'agent',id:'factory-child'},workspace,connectorId:'neuraldeep',preset:{modelId:'voice-pinned',reasoningEffort:'low',timeoutMs:30000},requestHash:voiceTaskRequestHash(body)});
  await assert.rejects(f.bridge.dispatch('factory-missing-tools',body),{code:'voice_factory_tools_unavailable'});assert.equal(f.runs.length,0);
});
for(const connector of ['neuraldeep','claude','openrouter','local'])test(`${connector}: existing child voice stays in its exact instance workspace through queue and restart`,async t=>{
  const f=fixture(t,connector),child=childFixture(f),body=child.reserve('child-first','Read the child');
  const first=await f.bridge.dispatch('child-first',body);await until(()=>f.runs.length===1);
  assert.equal(f.runs[0].input.cwd,realpathSync(child.project));assert.equal(f.runtime.require(first.topic.chatId).workspace.agentId,child.agentId);
  const second=child.reserve('child-second','Continue');const queued=await f.bridge.dispatch('child-second',second);assert.equal(queued.task.state,'queued');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runs.length===2);assert.equal(f.runs[1].input.cwd,child.source);
  f.runs[1].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
  const worker=f.make(),next=child.reserve('child-third','After restart');
  await new VoiceTaskBridge({bindings:f.bindings,backend:providerVoiceTaskBackend(worker)}).dispatch('child-third',next);await until(()=>f.runs.length===3);
  assert.equal(f.runs[2].input.cwd,child.source);assert.equal(f.runs[2].input.model,'voice-pinned');
  f.runs[2].resolve({ok:true,processTreeExited:true});await until(()=>worker.active.size===0);
  renameSync(child.project,child.project+'-moved');
  await assert.rejects(worker.start(first.topic.chatId,{clientMessageId:'child_after_move',input:[{type:'text',text:'Continue'}]}));assert.equal(f.runs.length,3);
});
test('child voice writes use a disposable worktree; non-Git isolation fails before chat creation',async t=>{
  const f=fixture(t),child=childFixture(f,{git:true});f.settings.sandbox='workspace-write';
  const body=child.reserve('child-write','Edit child','isolated'),started=await f.bridge.dispatch('child-write',body);await until(()=>f.runs.length===1);
  const binding=f.runtime.require(started.topic.chatId);assert.equal(binding.workspace.mode,'worktree');assert.equal(binding.workspace.source,child.source);assert.notEqual(f.runs[0].input.cwd,child.source);
  writeFileSync(path.join(f.runs[0].input.cwd,'product.txt'),'isolated edit');assert.equal(readFileSync(path.join(child.source,'product.txt'),'utf8'),'original');
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
  const other=fixture(t),plain=childFixture(other);other.settings.sandbox='workspace-write';const write=plain.reserve('plain-write','Edit','isolated');
  await assert.rejects(other.bridge.dispatch('plain-write',write),{code:'voice_workspace_isolation_required'});assert.equal(other.runs.length,0);
});
test('child catalog resolution rejects path injection, foreign parents, symlinks and another Pritha checkout',async t=>{
  const f=fixture(t),child=childFixture(f),foreign=fixture(t);childFixture(foreign);
  for(const target of [child.project,'../child-one',resolveProviderAgentWorkspace(foreign,'child-one').agentId])assert.throws(()=>resolveProviderAgentWorkspace(f,target),{code:'provider_agent_workspace_unavailable'});
  symlinkSync(child.project,path.join(f.agentParent,'alias-child'));
  assert.throws(()=>resolveProviderAgentWorkspace(f,'alias-child'),{code:'provider_agent_workspace_unavailable'});
  const sibling=path.join(f.agentParent,'other-checkout');mkdirSync(sibling);writeFileSync(path.join(sibling,'AGENTS.md'),'# Other');writeFileSync(path.join(sibling,'package.json'),JSON.stringify({name:'pritha'}));
  assert.throws(()=>resolveProviderAgentWorkspace(f,'other-checkout'),{code:'provider_agent_workspace_unavailable'});
  const body=child.reserve('child-mismatch','Read');const topic=f.bindings.topic(f.bindings.task('child-mismatch').topicId);
  await assert.rejects(providerVoiceTaskBackend(f.runtime).create({...topic,workspace:{mode:'read-only'}},body),{code:'voice_topic_workspace_mismatch'});assert.equal(f.runs.length,0);
});

for(const connector of ['neuraldeep','claude','openrouter'])test(`${connector}: voice file queue resumes exact originals and cancellation never dispatches its copies`,async t=>{
  const f=fixture(t,connector,{files:true}),id=randomUUID(),bytes=Buffer.from('voice queued immutable original');
  await f.attachments.upload(id,'voice.txt',new Request('http://fixture.invalid',{method:'PUT',body:bytes}));
  const first=request('First');f.reserve('voice-first',first);const started=await f.bridge.dispatch('voice-first',first);await until(()=>f.runs.length===1);
  const next={...request('Read the supplied file'),turn:{...request('Read the supplied file').turn,attachments:[id]}};
  f.reserve('voice-file',next);const queued=await f.bridge.dispatch('voice-file',next);assert.equal(queued.task.state,'queued');
  const persisted=(await f.runtime.queued(started.topic.chatId))[0];assert.equal(persisted.attachments[0].id,id);
  f.settings.modelId='changed-default';f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].input.model,'voice-pinned');assert.equal(f.runs[1].input.resume,f.runtime.require(started.topic.chatId).nativeThreadId);
  assert.deepEqual((await f.runs[1].input.hostAttachments.read('attachment:'+id)).bytes,bytes);
  await f.bridge.dispatch('voice-file',next);assert.equal(f.runs.length,2);
  const cancel={...request('Do not run this file'),turn:{...request('Do not run this file').turn,attachments:[id]}};f.reserve('voice-cancel-file',cancel);
  const pending=await f.bridge.dispatch('voice-cancel-file',cancel);await f.bridge.stop('voice-cancel-file',{generation:1,revision:pending.task.revision,clientMessageId:'stop_queued_file'});
  f.runs[1].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
  assert.equal(f.runs.length,2);assert.equal((await f.bridge.reconcile('voice-cancel-file')).task.state,'cancelled');assert.equal((await f.attachments.resolve(id)).view.size,bytes.length);
});
for (const connector of ['neuraldeep', 'claude', 'openrouter', 'local']) {
  test(`${connector}: voice and typed tasks share one pinned chat, queue and execution receipt`, async t => {
    const f = fixture(t, connector), body = request('First'), original = f.reserve('task-one', body);
    const started = await f.bridge.dispatch('task-one', body);
    await until(() => f.runs.length === 1);
    const binding = f.runtime.require(started.topic.chatId);
    assert.equal(binding.group, 'voice_work'); assert.equal(binding.origin, 'voice');
    assert.equal(binding.voiceTopicId, original.topic.topicId); assert.equal(binding.modelId, 'voice-pinned');
    assert.equal(binding.executionConfig.timeoutMs, 30000); assert.equal(f.runs[0].input.model, 'voice-pinned');
    assert.equal(f.runs[0].input.effort, 'low'); assert.equal(f.runs[0].input.timeoutMs, 30000);
    const queuedBody = request('Second'); f.reserve('task-two', queuedBody);
    const queued = await f.bridge.dispatch('task-two', queuedBody);
    assert.equal(queued.task.state, 'queued'); assert.equal((await f.runtime.queued(binding.chatId)).length, 1);
    assert.deepEqual(f.runtime.voiceTaskLinks(binding.chatId).map(link=>[link.taskId,link.status]),[['task-one','running'],['task-two','queued']]);
    assert.equal(f.runtime.registry.history.chatForTask('task-one'),binding.chatId);
    f.settings.modelId = 'changed-after-start'; f.settings.timeoutMs = 60000;
    f.runs[0].resolve({ ok: true, processTreeExited: true });
    await until(() => f.runs.length === 2);
    assert.equal(f.runs[1].input.model, 'voice-pinned'); assert.equal(f.runs[1].input.timeoutMs, 30000);
    assert.equal(f.runs[1].input.resume, binding.nativeThreadId);
    const second = await f.bridge.reconcile('task-two');
    assert.equal(second.task.state, 'accepted'); assert.notEqual(second.task.turnId, started.task.turnId);
    assert.equal(f.runtime.voiceTaskLinks(binding.chatId)[0].status,'complete');
    await f.bridge.dispatch('task-one', body); assert.equal(f.runs.length, 2);
    f.runs[1].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
    const typed = await f.runtime.start(binding.chatId, { clientMessageId: 'typed_after_voice', input: [{ type: 'text', text: 'Continue here' }] });
    await until(() => f.runs.length === 3);
    assert.equal(f.runs[2].input.resume, binding.nativeThreadId);
    assert.notEqual(typed.accepted.turn.turnId, second.task.turnId);
    f.runs[2].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
  });
}
test('another worker recovers a lost voice acknowledgement from canonical history with no replay', async t => {
  const f = fixture(t), body = request('Lost acknowledgement'); f.reserve('task-one', body);
  const backend = providerVoiceTaskBackend(f.runtime), start = backend.start;
  backend.start = async (...args) => { await start(...args); throw Object.assign(new Error('lost'), { code: 'transport_closed' }); };
  const receipt = await new VoiceTaskBridge({ bindings: f.bindings, backend }).dispatch('task-one', body);
  await until(() => f.runs.length === 1);
  const worker = f.make(), recovered = await new VoiceTaskBridge({ bindings: f.bindings, backend: providerVoiceTaskBackend(worker) }).dispatch('task-one', body);
  assert.equal(recovered.task.turnId, receipt.task.turnId); assert.equal(f.runs.length, 1);
  assert.equal(worker.voiceTaskChat('task-one'),receipt.topic.chatId);
  assert.equal(worker.voiceTaskLinks(receipt.topic.chatId)[0].status,'running');assert.equal(f.runs.length,1);
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
});
test('queued cancellation uses canonical CAS and never interrupts its active predecessor', async t => {
  const f = fixture(t), body = request('Predecessor'); f.reserve('task-one', body);
  const first = await f.bridge.dispatch('task-one', body); await until(() => f.runs.length === 1);
  const nextBody = request('Cancel queued'); f.reserve('task-two', nextBody);
  const next = await f.bridge.dispatch('task-two', nextBody);
  const cancelled = await f.bridge.stop('task-two', { generation: 1, revision: next.task.revision, clientMessageId: 'cancel_queue_001' });
  assert.equal(cancelled.task.state, 'cancelled'); assert.equal(f.runtime.activeIntent(first.topic.chatId).turnId, first.task.turnId);
  assert.equal((await f.bridge.reconcile('task-two')).receipt.kind, 'cancelled');
  assert.equal(f.runtime.voiceTaskLinks(first.topic.chatId).find(link=>link.taskId==='task-two').status,'aborted');
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
  assert.equal(f.runs.length, 1);
});
test('voice readback retains the bounded authored answer beyond the last page of tool activity', async t => {
  const f=fixture(t),body=request('Long transcript');f.reserve('task-one',body);
  const started=await f.bridge.dispatch('task-one',body);await until(()=>f.runs.length===1);
  const chat=started.topic.chatId,turn=started.task.turnId;
  f.runtime.registry.putItem(chat,turn,{id:'answer_one',kind:'assistant_message',status:'completed',startedAt:null,completedAt:null,message:{id:'answer_one',role:'assistant',markdown:'final '.repeat(4000),status:'completed',createdAt:new Date().toISOString()}});
  for(let i=0;i<25;i++)f.runtime.registry.putItem(chat,turn,{id:'tool_'+i,kind:'tool',status:'completed',startedAt:null,completedAt:null,toolName:'fixture',displayName:'Fixture',summary:'Fixture activity'});
  f.runtime.registry.putItem(chat,turn,{id:'commentary_one',kind:'assistant_message',status:'completed',startedAt:null,completedAt:null,message:{id:'commentary_one',role:'assistant',phase:'commentary',markdown:'Do not speak this activity as the result.',status:'completed',createdAt:new Date().toISOString()}});
  const receipt=f.runtime.voiceReceipt(chat,started.task.clientMessageId);
  assert.equal(receipt.turn.items.some(item=>item.id==='answer_one'),false);
  assert.equal(receipt.resultText,'final '.repeat(4000).slice(0,16000));assert.equal(receipt.resultTruncated,true);
  f.runs[0].resolve({ok:true,processTreeExited:true});await until(()=>f.runtime.active.size===0);
});
test('queued work blocked by lost provider readiness remains cancellable and is not shown as running',async t=>{
  const f=fixture(t),first=request('First'),next=request('Blocked next');f.reserve('task-one',first);await f.bridge.dispatch('task-one',first);await until(()=>f.runs.length===1);
  f.reserve('task-two',next);const queued=await f.bridge.dispatch('task-two',next);
  f.runtime.options.preflight=async()=>{throw Object.assign(new Error('not ready'),{code:'provider_pending_auth'});};
  f.runs[0].resolve({ok:true,processTreeExited:true});
  await until(()=>f.runtime.execution.getIntentById(queued.task.queueId)?.state==='blocked');
  const view=await f.bridge.reconcile('task-two');assert.equal(view.receipt.status,'blocked');assert.equal(view.receipt.reason,'provider_pending_auth');
  assert.equal(f.runtime.voiceTaskLinks(view.topic.chatId).find(link=>link.taskId==='task-two').status,'waiting_for_operator');
  await f.bridge.stop('task-two',{generation:1,revision:view.task.revision,clientMessageId:'stop_blocked_queue'});
  assert.equal(f.runtime.voiceTaskLinks(view.topic.chatId).find(link=>link.taskId==='task-two').status,'aborted');assert.equal(f.runs.length,1);
});
test('an ordinary HTTP-style creation cannot inject voice origin or replace a pinned topic', async t => {
  const f = fixture(t), body = request('Voice'); const r = f.reserve('task-one', body);
  const plain = await f.runtime.create({ clientThreadId: 'plain_fake_voice_1', source: 'chat', hostVoice: { topicId: r.topic.topicId, generation: 1 } });
  assert.equal(plain.binding.origin, 'chat'); assert.equal(plain.binding.voiceTopicId, undefined);
  await assert.rejects(f.bridge.dispatch('task-one', { ...body, turn: { input: [{ type: 'text', text: 'Changed' }] } }), { code: 'voice_task_idempotency_conflict' });
  assert.equal(f.runs.length, 0);
});
test('provider model aliases resolve once at chat creation and remain pinned after restart', async t => {
  let calls = 0, resolved = 'claude-exact-model-one';
  const f = fixture(t, 'claude', { resolveConfiguration: async config => { calls++; return { ...config, modelId: resolved }; } });
  const body = request('Resolve alias'); f.reserve('task-one', body);
  const first = await f.bridge.dispatch('task-one', body); await until(() => f.runs.length === 1);
  assert.equal(first.topic.preset.modelId, 'voice-pinned'); assert.equal(first.topic.resolvedModelId, 'claude-exact-model-one');
  assert.equal(f.runs[0].input.model, 'claude-exact-model-one'); resolved = 'claude-new-alias-target';
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
  const nextBody = request('Continue alias'); f.reserve('task-two', nextBody);
  const worker = f.make();
  await new VoiceTaskBridge({ bindings: f.bindings, backend: providerVoiceTaskBackend(worker) }).dispatch('task-two', nextBody);
  await until(() => f.runs.length === 2);
  assert.equal(f.runs[1].input.model, 'claude-exact-model-one'); assert.equal(calls, 1);
  f.runs[1].resolve({ ok: true, processTreeExited: true }); await until(() => worker.active.size === 0);
});
test('a lost operator acknowledgement replays the exact saved broker answer without authorizing another question', async t => {
  const f = fixture(t, 'claude', { preflight: async () => ({ interrupt: true, approvals: true }) });
  const body = request('Ask operator'); f.reserve('task-one', body);
  const active = await f.bridge.dispatch('task-one', body); await until(() => f.runs.length === 1);
  const answer = f.runs[0].input.approve({ operationId: 'voice_input_001', kind: 'user_input',
    presentation: { questions: [{ id: 'choice_001', question: 'Which local fixture?', isSecret: false }] }, reason: 'Pick the input.' });
  answer.catch(() => {});
  await until(() => f.runtime.pendingRequests(active.topic.chatId).length === 1);
  const pending = f.runtime.pendingRequests(active.topic.chatId)[0];
  await until(() => executionChannelView(f.runtime.execution, 'provider-answer:' + pending.requestId));
  const context = { generation: 1, requestId: pending.requestId, revision: pending.presentation.revision,
    clientMessageId: 'voice_answer_001', response: { answers: { choice_001: ['Fixture A'] } } };
  const backend = providerVoiceTaskBackend(f.runtime), submit = backend.answer;
  backend.answer = async (...args) => { await submit(...args); throw Object.assign(new Error('lost acknowledgement'), { code: 'response_lost' }); };
  await assert.rejects(new VoiceTaskBridge({ bindings: f.bindings, backend }).answer('task-one', context), { code: 'response_lost' });
  assert.deepEqual(await answer, { answers: { choice_001: ['Fixture A'] } });
  assert.deepEqual(await f.bridge.answer('task-one', context), { submitted: true, replayed: true });
  await assert.rejects(f.bridge.answer('task-one', { ...context, revision: context.revision + 1 }), { code: 'voice_question_changed' });
  await assert.rejects(f.bridge.answer('task-one', { ...context, response: { answers: { choice_001: ['Fixture B'] } } }), { code: 'native_request_changed' });
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
});
test('two new tasks racing on the same topic create one chat despite different task titles', async t => {
  const f = fixture(t), a = request('First concurrent task'), b = { ...request('Second concurrent task'), chat: { title: 'A different task label', workspace: { mode: 'read-only' } } };
  f.reserve('task-one', a); f.reserve('task-two', b);
  const [first, second] = await Promise.all([f.bridge.dispatch('task-one', a), f.bridge.dispatch('task-two', b)]);
  assert.equal(first.topic.chatId, second.topic.chatId);
  assert.equal(f.runtime.registry.list({ group: 'all' }).data.length, 1);
  assert.deepEqual([first.task.state, second.task.state].sort(), ['accepted', 'queued']);
  await until(() => f.runs.length === 1);
  f.runs[0].resolve({ ok: true, processTreeExited: true }); await until(() => f.runs.length === 2);
  f.runs[1].resolve({ ok: true, processTreeExited: true }); await until(() => f.runtime.active.size === 0);
});
test('voice creation cannot substitute a workspace or elevate the configured read-only policy', async t => {
  const f = fixture(t), body = request('Read only'), saved = f.reserve('task-one', body);
  const backend = providerVoiceTaskBackend(f.runtime);
  await assert.rejects(backend.create(saved.topic, { ...body, chat: { workspace: { mode: 'isolated' } } }), { code: 'voice_topic_workspace_mismatch' });
  await assert.rejects(backend.create({ ...saved.topic, workspace: { mode: 'isolated' } }, { ...body, chat: { workspace: { mode: 'isolated' } } }), { code: 'voice_workspace_write_unavailable' });
  assert.equal(f.runtime.registry.list({ group: 'all' }).data.length, 0); assert.equal(f.runs.length, 0);
});
