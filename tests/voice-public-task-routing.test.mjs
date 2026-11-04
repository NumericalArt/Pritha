import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as profile from '../scripts/lib/provider-profile.mjs';
import {ExecutionCoordinator} from '../scripts/lib/execution-coordinator.mjs';
import {ImmutableAttachmentStore} from '../scripts/lib/chat-attachment-store.mjs';
import {VoiceIntakeReceipts,voiceIntakeAttachmentIds} from '../scripts/lib/voice-intake-receipts.mjs';
import {normalizeChatSubject} from '../scripts/lib/chat-subject.mjs';

const file = ts.createSourceFile('runtime.ts', readFileSync('interfaces/control-center/src/lib/realtime/pritha-runtime.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['prepareProviderVoiceTask', 'startProviderVoiceTask', 'runCodexTask', 'abortPrithaCodexTask', 'runtimeSettingsForVoiceTask', 'createPrithaVoiceIntakeCodexTask'];
const source = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(file)).join('\n') + '\nexport {runCodexTask,runtimeSettingsForVoiceTask};';
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pritha-voice-entry-')), privateRoot = path.join(root, 'private');
  const coordinator=new ExecutionCoordinator({stateRoot:root}),attachments=new ImmutableAttachmentStore({stateRoot:root,privateRoot:path.join(privateRoot,'chat')});
  t.after(async() => {coordinator.close();await attachments.close();rmSync(root, { recursive: true, force: true });});
  const calls = [], reservations = [], settings = { activeConnectorId: options.connector || 'neuraldeep', providerPresets: Object.fromEntries(profile.PROVIDER_CONNECTOR_IDS.map(id => [id, { ...profile.defaultProviderPreset(id), modelId: id + '-model' }])) };
  const locks = new Set();
  const runtimeSettings={deepTaskPrimaryTransport:'codex-cli',codexAppThreadRoutingMode:'subject_scoped',codexModel:'default-native',codexReasoningEffort:'medium',codexTimeoutMs:90000,codexServiceTier:'standard',codexNetworkAccess:true,codexExecutionMode:'auto'};
  const json = async file => JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));
  const dependencies = {
    path, randomUUID, existsSync, mkdir, writeFile, readJsonFile: json,VoiceIntakeReceipts,voiceIntakeAttachmentIds,
    VOICE_INTAKE_MAX_FILES:8,VOICE_INTAKE_MAX_FILE_BYTES:10*1024*1024,VOICE_INTAKE_MAX_TOTAL_BYTES:25*1024*1024,VOICE_INTAKE_STAGING_TTL_MS:7200000,
    purgeOldVoiceIntakeStaging:async()=>{calls.push('purge');},compactText:(value,limit)=>String(value || '').trim().slice(0,limit),extractUrls:()=>[],
    normalizeVoiceIntakeConfirmation:value=>value || {},voiceIntakeRoot:()=>path.join(privateRoot,'intake'),voiceIntakeTaskText:({text})=>text,
    safeOriginalFilename:value=>path.basename(value),safeStagedExtension:()=>'.txt',formatBytes:String,
    resolvePrithaRoot: () => root, resolvePrithaStateRoot: () => root, privateRoot: () => privateRoot, resolvePrithaAgentParent: () => root,
    rootRelative: (root, file) => path.relative(root, file),
    getPrithaRuntimeSettings: () => runtimeSettings, codexMode: () => 'exec',
    normalizeProviderPreset:profile.normalizeProviderPreset,normalizeCodexReasoningEffort:value=>value,normalizeCodexServiceTier:(value,fallback)=>['standard','fast'].includes(value)?value:fallback,
    codexAvailable: async () => { calls.push('native-probe'); return { available: true }; }, codexAppAvailable: async () => { calls.push('native-app-probe'); return { available: false }; },
    normalizeCodexTaskType: value => value || 'analysis', normalizeCodexWriteMode: value => value || 'read_only',
    normalizeThreadScopeKind: value => value, normalizeThreadScopeId: value => value, normalizeThreadScopeLabel: value => value,
    boolValue: value => Boolean(value), codexTaskLooksLikeAgentDevelopment: () => false,
    agentCreationResearchGatePayload: () => ({}), agentDevelopmentResearchGatePayload: () => ({}),
    deriveCodexThreadScope: args => ({ kind: args.subject_kind || 'pritha', id: 'fixture', label: 'Fixture', generation: 1 }),
    continuationThreadScopeFromUnknown: value => value, codexTaskHandoffConfirmationResult: () => options.handoff || null,
    resolveContinuationForTask: async () => options.continuation ? ({action:'selected',selected:{taskId:options.continuation},historyContext:{}}) : ({ action: 'none' }), normalizeCodexTaskRef: value => String(value || ''),
    applyContinuationToTask: (task,selected) => { task.parent_task_id=selected.taskId; },
    resolveCodexTaskIdRef: async value => value && existsSync(path.join(privateRoot, 'codex-tasks', String(value), 'request.json')) ? String(value) : null,
    ensureCodexTaskShortId: async () => 'ABC', codexTaskApprovalFor: () => options.approval ? { status: 'pending' } : null,
    codexTaskProgressPath: dir => path.join(dir, 'progress.jsonl'), codexTaskPlanPath: dir => path.join(dir, 'plan.json'), codexTaskVoiceFeedbackPath: dir => path.join(dir, 'voice.jsonl'),
    appendCodexTaskProgress: async () => {}, logPrivateEvent: async () => {},
    buildCodexPrompt: task => 'Operator task: ' + task.task, codexOutboundTransports: () => [], applyCodexOutboundPromptBudget: async () => { calls.push('native-budget'); },
    nativeExecutionCoordinator: () => coordinator, codexTaskIsAborted: async () => false,
    getPrithaCodexTask: async id => ({ok:true,...await json(path.join(privateRoot,'codex-tasks',id,'status.json'))}),
    startAdmittedVoiceTask: async transport => { calls.push('native-start'); return { status: 'running', transport }; },
    atomicWritePrivateJson: async ({ filePath, value }) => writeFile(filePath, JSON.stringify(value)),
    require: id => {
      if(id.endsWith('/chat-subject.mjs'))return {normalizeChatSubject};
      if(id.endsWith('/provider-agent-workspace.mjs'))return {resolveProviderAgentWorkspace:()=>{throw Object.assign(new Error('Missing child'),{code:'provider_agent_workspace_unavailable'});}};
      if (id === '../settings/provider-settings-server') return { getProviderSettings: () => settings };
      if (id === '../settings/provider-profile') return profile;
      if (id === '../codex-chat/gateway') return {getCodexChatGateway:()=>({attachments})};
      if (id === '../voice/task-router') return {
        reserveProviderVoiceTask: input => {
          if (options.preparationError) throw Object.assign(new Error('preparation failure'), { code: options.preparationError });
          reservations.push(input); return { topic: { topicId: 'topic_fixture', scope: { ...input.scope, generation: 1 } } };
        },
        dispatchProviderVoiceTask: async (id, request) => { calls.push('provider-start'); return { status: { status: 'running', connector_id: settings.activeConnectorId, chat_id: 'chat_fixture' } }; },
        providerVoiceTaskBinding: () => ({task:{revision:1},topic:{scope:{generation:1}}}),
        stopProviderVoiceTask: async id => { assert.equal(locks.has('voice-control:'+id),true); calls.push('provider-stop'); return options.stopError?{ok:false,error:options.stopError}:{ok:true}; },
      };
      throw new Error('Unexpected runtime dependency: ' + id);
    },
  };
  const mutate=coordinator.withMutation.bind(coordinator);coordinator.withMutation=(key,action,options)=>mutate(key,async()=>{locks.add(key);try{return await action();}finally{locks.delete(key);}},options);
  const exports = {};
  new Function(...Object.keys(dependencies), 'exports', compiled)(...Object.values(dependencies), exports);
  return { run: exports.runCodexTask, intake:exports.createPrithaVoiceIntakeCodexTask, abort: exports.abortPrithaCodexTask, taskSettings:exports.runtimeSettingsForVoiceTask, runtimeSettings, root, privateRoot, calls, reservations, settings, json,attachments,coordinator };
}
for (const connector of ['neuraldeep', 'claude', 'openrouter', 'local']) {
  test(`${connector}: public voice task preparation selects its provider without native probes or fallback`, async t => {
    const f = fixture(t, { connector }), result = await f.run({ task: 'Inspect the current project.' }, { reservedTaskId: 'voice-fixture-one' });
    assert.equal(result.ok, true); assert.equal(result.effective_transport, 'task-chat'); assert.equal(result.connector_id, connector);
    assert.equal(result.mode, 'exec'); assert.equal(result.fallback_transport, null);
    assert.deepEqual(f.calls, ['provider-start']); assert.equal(f.reservations[0].preset.modelId, connector + '-model');
    const stored = await f.json(path.join(f.privateRoot, 'codex-tasks', result.task_id, 'request.json'));
    assert.equal(stored.task_chat_connector, connector); assert.equal(stored.task_chat_request.turn.input[0].text, 'Operator task: Inspect the current project.');
  });
}
test('a write task retains the existing UI approval gate and does not dispatch at capture time', async t => {
  const f = fixture(t, { approval: true }), result = await f.run({ task: 'Implement a focused change.', write_mode: 'workspace_write', operator_confirmation: 'Confirmed brief' });
  assert.equal(result.status, 'decision_required'); assert.equal(result.mode, 'approval'); assert.deepEqual(f.calls, []);
  assert.deepEqual(f.reservations[0].workspace, { mode: 'isolated' });
});
test('Voice pins original task search permission outside the assembled executor prompt',async t=>{
  for(const requires_internet of [true,false]){
    const f=fixture(t,{connector:'claude'}),result=await f.run({task:'Find the weather for Berlin.',task_type:'research',requires_internet});
    assert.equal(result.ok,true);
    const stored=await f.json(path.join(f.privateRoot,'codex-tasks',result.task_id,'request.json'));
    assert.equal(stored.task_chat_request.turn.voiceSearchText,(requires_internet?'Search public sources for this operator task:\n':'Do not browse.\n')+'Find the weather for Berlin.');
  }
});
test('handoff and preparation failures make no task directory and never start a native fallback', async t => {
  for (const options of [{ handoff: { ok: false, error: 'confirmation_required' } }, { preparationError: 'provider_model_invalid' }]) {
    const f = fixture(t, options), result = await f.run({ task: 'Inspect fixture' });
    assert.equal(result.ok, false); assert.deepEqual(f.calls, []);
    assert.equal(existsSync(path.join(f.privateRoot, 'codex-tasks')), false);
  }
});
test('unverified child workspaces, read-only factory requests and file delivery fail before a provider call', async t => {
  for (const [args,error] of [
    [{ subject_kind: 'agent' },'provider_agent_workspace_unavailable'],
    [{ task_type: 'agent_creation' },'factory_write_mode_required'],
    [{ intake: { files: [{ id: 'file-one' }] } },'provider_attachments_unverified'],
  ]) {
    const f = fixture(t), result = await f.run({ task: 'Inspect fixture', ...args });
    assert.equal(result.ok, false); assert.equal(result.error,error);
    assert.deepEqual(f.calls, []); assert.equal(existsSync(path.join(f.privateRoot, 'codex-tasks')), false);
  }
});
for(const connector of ['neuraldeep','claude','openrouter','local'])test(`${connector}: a confirmed factory brief pins the new child without granting general workspace writes`,async t=>{
  const f=fixture(t,{connector}),result=await f.run({task:'Create a small offline notes agent.',task_type:'agent_creation',write_mode:'workspace_write',subject_kind:'agent',subject_id:'notes-fixture',operator_confirmation:'Create the proposed notes agent.'});
  assert.equal(result.ok,true);assert.equal(result.connector_id,connector);assert.deepEqual(f.calls,['provider-start']);
  assert.deepEqual(f.reservations[0].workspace,{mode:'read-only',factorySlug:'notes-fixture'});
  const stored=await f.json(path.join(f.privateRoot,'codex-tasks',result.task_id,'request.json'));
  assert.deepEqual(stored.task_chat_request.chat.subject,{kind:'child',slug:'notes-fixture',phase:'interview'});
  assert.match(stored.task_chat_request.turn.input[0].text,/Never treat the spoken brief confirmation as either artifact approval/);
});
test('an explicit native task keeps its original backend after changing the default connector', async t => {
  const f = fixture(t), dir = path.join(f.privateRoot, 'codex-tasks', 'native-parent'); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'request.json'), JSON.stringify({ task: 'Original native task' }));
  const result = await f.run({ task: 'Continue native work.', continue_task_id: 'native-parent' });
  assert.equal(result.connector_id, 'codex'); assert.equal(result.effective_transport, 'codex-cli');
  assert.ok(f.calls.includes('native-start')); assert.equal(f.calls.includes('provider-start'), false);
});
test('stop shares the approval lock and only rejects a pending task after confirmed cancellation', async t => {
  for(const stopError of [null,'voice_task_context_changed']) {
    const f=fixture(t,{approval:true,stopError}),created=await f.run({task:'Write fixture',write_mode:'workspace_write'});
    const stopped=await f.abort(created.task_id);
    const saved=await f.json(path.join(f.privateRoot,'codex-tasks',created.task_id,'request.json'));
    assert.equal(stopped.ok,!stopError);assert.equal(saved.approval.status,stopError?'pending':'rejected');
    assert.deepEqual(f.calls,['provider-stop']);
  }
});
test('a host voice session pins the selected provider and preset after the global default changes',async t=>{
  const f=fixture(t,{connector:'claude'}),selection={contextId:'fixture-context',connectorId:'neuraldeep',preset:{modelId:'session-pinned',reasoningEffort:'high',timeoutMs:30000},serviceTier:'standard'};
  const result=await f.run({task:'Inspect fixture'},{taskSelection:selection});
  assert.equal(result.connector_id,'neuraldeep');assert.equal(f.reservations[0].preset.modelId,'session-pinned');assert.equal(f.calls.includes('native-start'),false);
});
test('native tasks persist session model settings across approval while retaining current security policy',async t=>{
  const f=fixture(t,{approval:true}),selection={contextId:'fixture-context',connectorId:'codex',preset:{modelId:'native-pinned',reasoningEffort:'ultra',timeoutMs:30000},serviceTier:'fast'};
  const result=await f.run({task:'Implement fixture',write_mode:'workspace_write'},{taskSelection:selection});
  assert.equal(result.connector_id,'codex');assert.equal(result.status,'decision_required');
  const saved=await f.json(path.join(f.privateRoot,'codex-tasks',result.task_id,'request.json'));
  f.runtimeSettings.codexModel='changed-native';f.runtimeSettings.codexNetworkAccess=false;
  const actual=f.taskSettings(saved);assert.equal(actual.codexModel,'native-pinned');assert.equal(actual.codexReasoningEffort,'ultra');assert.equal(actual.codexTimeoutMs,30000);assert.equal(actual.codexServiceTier,'fast');
  assert.equal(actual.codexExecutionMode,'inline_only');assert.equal(actual.codexNetworkAccess,false);
});
test('automatic native continuation inherits its original task preset rather than a new session default',async t=>{
  const f=fixture(t,{connector:'codex',approval:true,continuation:'native-parent'}),dir=path.join(f.privateRoot,'codex-tasks','native-parent');
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'request.json'),JSON.stringify({native_task_preset:{modelId:'original-model',reasoningEffort:'high',timeoutMs:180000},native_service_tier:'fast'}));
  const result=await f.run({task:'Continue fixture',write_mode:'workspace_write'},{taskSelection:{connectorId:'codex',preset:{modelId:'new-session-model',reasoningEffort:'low',timeoutMs:30000},serviceTier:'standard'}});
  const saved=await f.json(path.join(f.privateRoot,'codex-tasks',result.task_id,'request.json'));
  assert.equal(saved.parent_task_id,'native-parent');assert.equal(saved.native_task_preset.modelId,'original-model');
  assert.equal(saved.native_task_preset.reasoningEffort,'high');assert.equal(saved.native_task_preset.timeoutMs,180000);assert.equal(saved.native_service_tier,'fast');
});

test('intake forwards the immutable host task selection through the real public task preparation',async t=>{
  const f=fixture(t,{connector:'claude'}),taskSelection={contextId:'vctx_'+'a'.repeat(32),connectorId:'neuraldeep',preset:{modelId:'intake-pinned',reasoningEffort:'high',timeoutMs:30000},serviceTier:'standard'};
  const input={text:'Inspect fixture',confirmation:{source_intake_id:'voice-intake-fixture',instruction:'Inspect fixture'}};
  const result=await f.intake(input,{taskSelection});
  assert.equal(result.connector_id,'neuraldeep');assert.equal(f.reservations[0].preset.modelId,'intake-pinned');
  const replay=await f.intake({...input,confirmation:{...input.confirmation,timestamp:new Date().toISOString()}},{taskSelection});
  assert.equal(replay.task_id,result.task_id);assert.equal(replay.replayed,true);assert.deepEqual(f.calls,['provider-start']);
});
test('malformed intake byte counts create no originals, staging or task',async t=>{
  const f=fixture(t),bytes=new Uint8Array([42]);
  const result=await f.intake({files:[{name:'fixture.txt',size:2,bytes}],confirmation:{instruction:'Inspect fixture'}},{taskSelection:{connectorId:'neuraldeep'}});
  assert.equal(result.ok,false);assert.equal(result.error,'invalid_file_size');
  assert.deepEqual(f.calls,[]);assert.equal(existsSync(f.privateRoot),false);assert.deepEqual([...bytes],[42]);
});

for(const connectorId of ['neuraldeep','claude','openrouter'])test(`${connectorId}: confirmed voice files use shared originals and replay one exact task`,async t=>{
  const f=fixture(t,{connector:connectorId}),taskSelection={contextId:'vctx_'+'b'.repeat(32),connectorId,preset:{modelId:'file-pinned',reasoningEffort:'high',timeoutMs:30000},serviceTier:'standard'};
  const bytes=Buffer.from('private voice fixture'),input={text:'Inspect the file',sessionId:'voice-session',files:[{name:'fixture.txt',size:bytes.length,bytes}],confirmation:{source_intake_id:'confirmed-file',instruction:'Read fixture',timestamp:'first'}};
  const first=await f.intake(input,{taskSelection}),replay=await f.intake({...input,confirmation:{...input.confirmation,timestamp:'retry'}},{taskSelection});
  assert.equal(first.ok,true);assert.equal(replay.task_id,first.task_id);assert.deepEqual(f.calls,['provider-start']);
  const saved=await f.json(path.join(f.privateRoot,'codex-tasks',first.task_id,'request.json')),ids=saved.task_chat_request.turn.attachments;
  assert.equal(ids.length,1);assert.deepEqual(readFileSync((await f.attachments.resolve(ids[0])).filePath),bytes);
  assert.equal(saved.intake.retention,'private-chat-originals');assert.equal(saved.intake.files[0].relative_path,'attachment:'+ids[0]);assert.equal(existsSync(path.join(f.privateRoot,'intake')),false);
  await assert.rejects(f.intake({...input,files:[{...input.files[0],bytes:Buffer.alloc(bytes.length,1)}]},{taskSelection}),{code:'voice_intake_idempotency_conflict'});
  assert.deepEqual(f.calls,['provider-start']);assert.equal(f.reservations[0].preset.modelId,'file-pinned');
});

test('a lost intake receipt after dispatch recovers the existing card without a second provider task',async t=>{
  const f=fixture(t),taskSelection={contextId:'vctx_'+'c'.repeat(32),connectorId:'neuraldeep',preset:{modelId:'pinned',reasoningEffort:'high',timeoutMs:30000},serviceTier:'standard'};
  const input={text:'Inspect the fixture',confirmation:{source_intake_id:'lost-intake',instruction:'Inspect fixture'}};
  const update=f.coordinator.updateIntent.bind(f.coordinator);let lost=false;
  f.coordinator.updateIntent=(key,patch,...rest)=>{if(key.startsWith('voice-intake:') && patch.state==='completed' && !lost){lost=true;throw new Error('lost acknowledgement');}return update(key,patch,...rest);};
  await assert.rejects(f.intake(input,{taskSelection}));
  const recovered=await f.intake(input,{taskSelection});assert.equal(recovered.ok,true);assert.equal(recovered.recovered,true);assert.equal(recovered.replayed,true);
  assert.deepEqual(f.calls,['provider-start']);assert.equal(readdirSync(path.join(f.privateRoot,'codex-tasks')).length,1);
});

test('closing the context after originals are prepared prevents task creation and retains the bytes',async t=>{
  const f=fixture(t),taskSelection={contextId:'vctx_'+'d'.repeat(32),connectorId:'neuraldeep',preset:{modelId:'pinned',reasoningEffort:'high',timeoutMs:30000},serviceTier:'standard'};
  const input={text:'Inspect fixture',files:[{name:'fixture.txt',size:1,bytes:Buffer.from('x')}],confirmation:{source_intake_id:'closed-intake',instruction:'Inspect fixture'}};
  let checks=0;await assert.rejects(f.intake(input,{taskSelection,check:()=>{if(++checks===3)throw Object.assign(new Error('closed'),{code:'voice_context_unavailable'});}}),{code:'voice_context_unavailable'});
  assert.deepEqual(f.calls,[]);assert.equal(existsSync(path.join(f.privateRoot,'codex-tasks')),false);
  const receipt=f.coordinator.listIntents({kind:'voice-intake'})[0];assert.equal((await f.attachments.resolve(receipt.attachmentIds[0])).view.size,1);
});
