import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';

const source = readFileSync('interfaces/control-center/src/lib/realtime/core/voice-tools-dispatcher.ts', 'utf8');
const module = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(module, module.exports);
const { CORE_VOICE_TOOLS, dispatchVoiceTool, canonicalVoiceTool } = module.exports;

test('shared transport schemas expose the same nine tools with optional music only', () => {
  const definitions = {exports:{}};
  new Function('module','exports',ts.transpileModule(readFileSync('interfaces/control-center/src/lib/realtime/core/voice-tool-definitions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(definitions,definitions.exports);
  const base=definitions.exports.buildPrithaRealtimeTools(), music=definitions.exports.buildPrithaRealtimeTools({musicControlEnabled:true});
  assert.deepEqual(base.map(tool=>tool.name),[...CORE_VOICE_TOOLS]);
  assert.deepEqual(music.slice(0,-1),base);assert.equal(music.at(-1).name,'music_control');
  for(const tool of music){assert.equal(tool.type,'function');assert.equal(tool.parameters.type,'object');for(const required of tool.parameters.required||[])assert.ok(Object.hasOwn(tool.parameters.properties,required));}
  assert.ok(base.find(tool=>tool.name==='full_pritha_memory').parameters.properties.operator_confirmation);
  assert.ok(base.find(tool=>tool.name==='run_codex_task').parameters.properties.continue_task_id);
  assert.equal(music.at(-1).parameters.properties.volume.maximum,100);
});

test('all nine voice capabilities retain exact arguments and the host receipt across transports', async () => {
  assert.equal(CORE_VOICE_TOOLS.length, 9); assert.equal(new Set(CORE_VOICE_TOOLS).size, 9);
  for (const name of CORE_VOICE_TOOLS) {
    const args = Object.freeze({ id: 'fixture', query: 'stored standards' }), receipt = Object.freeze({ ok: true, id: 'receipt' });
    let calls = 0;
    assert.equal(await dispatchVoiceTool(name, args, { [name]: received => { calls++; assert.equal(received, args); return receipt; } }), receipt);
    assert.equal(calls, 1);
  }
});

test('provider-neutral task aliases use the same pinned host handler, never another tool', async () => {
  const pairs = [['run_voice_task', 'run_codex_task'], ['inspect_voice_task', 'inspect_codex_task'], ['answer_voice_task', 'answer_codex_task']];
  for (const [alias, canonical] of pairs) {
    assert.equal(canonicalVoiceTool(alias), canonical);
    assert.equal(await dispatchVoiceTool(alias, {}, { [canonical]: () => 'exact-bound-handler' }), 'exact-bound-handler');
  }
});

test('unknown, inherited, disabled and pre-cancelled tools cannot reach a host handler', async () => {
  let calls = 0; const handler = () => { calls++; return {}; }, handlers = { run_codex_task: handler };
  for (const name of ['constructor', '__proto__', 'toString', 'unknown', 'x'.repeat(65), null]) assert.equal((await dispatchVoiceTool(name, {}, handlers)).error, 'unknown_tool');
  assert.equal((await dispatchVoiceTool('run_voice_task', { allowedTools: ['run_codex_task'] }, handlers, { allowedTools: ['full_pritha_memory'] })).error, 'tool_not_available');
  assert.equal((await dispatchVoiceTool('run_codex_task', {}, Object.create(handlers))).error, 'tool_not_available');
  assert.equal((await dispatchVoiceTool('run_codex_task', {}, handlers, { signal: AbortSignal.abort() })).error, 'tool_interrupted');
  for (const args of [null, [], 'prompt', 1]) assert.equal((await dispatchVoiceTool('run_codex_task', args, handlers)).error, 'invalid_tool_arguments');
  assert.equal(calls, 0);
});

test('client-owned intake/music remain client actions and Good State capture never dispatches a deep task', async () => {
  for (const name of ['confirm_voice_intake', 'music_control']) assert.equal((await dispatchVoiceTool(name, {}, {})).error, 'client_tool_required');
  let captured = 0;
  const receipt = await dispatchVoiceTool('record_good_state_signal', { signal: 'This state works well' }, {
    record_good_state_signal: () => { captured++; return { ok: true, status: 'voice_confirmed_alignment_signal' }; },
    run_codex_task: () => assert.fail('Good State capture must not create a task'),
  });
  assert.equal(captured, 1); assert.equal(receipt.status, 'voice_confirmed_alignment_signal');
});

test('an interrupt after a completed effect preserves its receipt and host failures are never fabricated success', async () => {
  const controller = new AbortController(), receipt = { ok: true, task_id: 'already-created' };
  assert.equal(await dispatchVoiceTool('run_codex_task', {}, { run_codex_task: () => { controller.abort(); return receipt; } }, { signal: controller.signal }), receipt);
  await assert.rejects(dispatchVoiceTool('run_codex_task', {}, { run_codex_task: () => { throw new Error('fixture failure'); } }), /fixture failure/);
});
