import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as profile from '../scripts/lib/provider-profile.mjs';

const file = ts.createSourceFile('runtime.ts', readFileSync('interfaces/control-center/src/lib/realtime/pritha-runtime.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['prepareProviderVoiceTask', 'startProviderVoiceTask', 'runCodexTask', 'abortPrithaCodexTask'];
const source = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(file)).join('\n') + '\nexport {runCodexTask};';
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pritha-voice-entry-')), privateRoot = path.join(root, 'private');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [], reservations = [], settings = { activeConnectorId: options.connector || 'neuraldeep', providerPresets: Object.fromEntries(profile.PROVIDER_CONNECTOR_IDS.map(id => [id, { ...profile.defaultProviderPreset(id), modelId: id + '-model' }])) };
  const locks = new Set();
  const json = async file => JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));
  const dependencies = {
    path, randomUUID, existsSync, mkdir, writeFile, readJsonFile: json,
    resolvePrithaRoot: () => root, resolvePrithaStateRoot: () => root, privateRoot: () => privateRoot, resolvePrithaAgentParent: () => root,
    rootRelative: (root, file) => path.relative(root, file),
    getPrithaRuntimeSettings: () => ({ deepTaskPrimaryTransport: 'codex-cli', codexAppThreadRoutingMode: 'subject_scoped' }), codexMode: () => 'exec',
    codexAvailable: async () => { calls.push('native-probe'); return { available: true }; }, codexAppAvailable: async () => { calls.push('native-app-probe'); return { available: false }; },
    normalizeCodexTaskType: value => value || 'analysis', normalizeCodexWriteMode: value => value || 'read_only',
    normalizeThreadScopeKind: value => value, normalizeThreadScopeId: value => value, normalizeThreadScopeLabel: value => value,
    boolValue: value => Boolean(value), codexTaskLooksLikeAgentDevelopment: () => false,
    agentCreationResearchGatePayload: () => ({}), agentDevelopmentResearchGatePayload: () => ({}),
    deriveCodexThreadScope: args => ({ kind: args.subject_kind || 'pritha', id: 'fixture', label: 'Fixture', generation: 1 }),
    continuationThreadScopeFromUnknown: value => value, codexTaskHandoffConfirmationResult: () => options.handoff || null,
    resolveContinuationForTask: async () => ({ action: 'none' }), normalizeCodexTaskRef: value => String(value || ''),
    applyContinuationToTask: () => { throw new Error('Unexpected continuation fixture'); },
    resolveCodexTaskIdRef: async value => value && existsSync(path.join(privateRoot, 'codex-tasks', String(value), 'request.json')) ? String(value) : null,
    ensureCodexTaskShortId: async () => 'ABC', codexTaskApprovalFor: () => options.approval ? { status: 'pending' } : null,
    codexTaskProgressPath: dir => path.join(dir, 'progress.jsonl'), codexTaskPlanPath: dir => path.join(dir, 'plan.json'), codexTaskVoiceFeedbackPath: dir => path.join(dir, 'voice.jsonl'),
    appendCodexTaskProgress: async () => {}, logPrivateEvent: async () => {},
    buildCodexPrompt: task => 'Operator task: ' + task.task, codexOutboundTransports: () => [], applyCodexOutboundPromptBudget: async () => { calls.push('native-budget'); },
    nativeExecutionCoordinator: () => ({ withMutation: async (key, action) => { locks.add(key); try { return await action(); } finally { locks.delete(key); } } }), codexTaskIsAborted: async () => false,
    getPrithaCodexTask: async id => ({ok:true,...await json(path.join(privateRoot,'codex-tasks',id,'status.json'))}),
    startAdmittedVoiceTask: async transport => { calls.push('native-start'); return { status: 'running', transport }; },
    atomicWritePrivateJson: async ({ filePath, value }) => writeFile(filePath, JSON.stringify(value)),
    require: id => {
      if (id === '../settings/provider-settings-server') return { getProviderSettings: () => settings };
      if (id === '../settings/provider-profile') return profile;
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
  const exports = {};
  new Function(...Object.keys(dependencies), 'exports', compiled)(...Object.values(dependencies), exports);
  return { run: exports.runCodexTask, abort: exports.abortPrithaCodexTask, root, privateRoot, calls, reservations, settings, json };
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
test('handoff and preparation failures make no task directory and never start a native fallback', async t => {
  for (const options of [{ handoff: { ok: false, error: 'confirmation_required' } }, { preparationError: 'provider_model_invalid' }]) {
    const f = fixture(t, options), result = await f.run({ task: 'Inspect fixture' });
    assert.equal(result.ok, false); assert.deepEqual(f.calls, []);
    assert.equal(existsSync(path.join(f.privateRoot, 'codex-tasks')), false);
  }
});
test('unverified child workspaces and file delivery remain explicit blockers before a provider call', async t => {
  for (const args of [{ subject_kind: 'agent' }, { task_type: 'agent_creation' }, { intake: { files: [{ id: 'file-one' }] } }]) {
    const f = fixture(t), result = await f.run({ task: 'Inspect fixture', ...args });
    assert.equal(result.ok, false); assert.ok(['provider_voice_agent_workspace_pending', 'provider_attachments_unverified'].includes(result.error));
    assert.deepEqual(f.calls, []); assert.equal(existsSync(path.join(f.privateRoot, 'codex-tasks')), false);
  }
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
