// Isolated Task Chat fixture. Factory workers, approvals, research gates,
// scaffold, provider build executors and Trials are real. Provider responses
// and primary-source page contents are synthetic and make no paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import * as hostTools from '../../scripts/lib/provider-host-tools.mjs';
import * as factoryTools from '../../scripts/lib/provider-factory-tools.mjs';
import * as approvals from '../../scripts/lib/provider-approvals.mjs';
import * as processSnapshot from '../../scripts/neuraldeep/process-snapshot.mjs';
import { ProviderTaskRuntime } from '../../scripts/lib/provider-task-runtime.mjs';
import { ExecutionCoordinator } from '../../scripts/lib/execution-coordinator.mjs';
import { atomicWriteFile } from '../../scripts/lib/atomic-file.mjs';
import { voiceFactoryPaths, loadVoiceFactory, factoryArtifact } from '../../scripts/agents-mother/voice-factory-state.mjs';
import { executeVoiceFactoryStep } from '../../scripts/agents-mother/voice-factory-worker.mjs';
import { contractData } from '../../scripts/agents-mother/contract.mjs';
import { HostResearch } from '../../scripts/agents-mother/host-research.mjs';
import { deriveExternalResearchTopics } from '../../scripts/agents-mother/external-research-topics.mjs';
import { verifyPatternPackIntegrity } from '../../scripts/agents-mother/pattern-research.mjs';
import * as delivery from '../../scripts/agents-mother/delivery-loop.mjs';
import { createBuildExecutor } from '../../scripts/agents-mother/build-executors.mjs';

const root = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(new URL('../../interfaces/control-center/package.json', import.meta.url));
const ts = require('typescript');

export const scenarios = [
  { connectorId: 'codex', slug: 'headline-distiller', name: 'Headline Distiller', model: 'gpt-6-astra',
    entrypoint: 'scripts/headline.mjs', flag: '--text', field: 'text', route: '/headline', portVariable: 'HEADLINE_PORT',
    cliInput: 'Первый заголовок', httpInput: 'Второй заголовок',
    result: value => ({ headline: value.trim() }) },
  { connectorId: 'claude', slug: 'yesno-counsel', name: 'YesNo Counsel', model: 'claude-sonnet-5-5',
    entrypoint: 'scripts/counsel.mjs', flag: '--question', field: 'question', route: '/counsel', portVariable: 'YESNO_COUNSEL_PORT',
    cliInput: 'YES?', httpInput: 'NO?',
    result: value => ({ answer: value.startsWith('YES') ? 'YES' : 'NO', reason: value }) },
];

export async function until(predicate) {
  for (let i = 0; i < 1000; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Task Chat fixture did not settle.');
}

class BuildConnection {
  constructor(implement) { this.implement = implement; this.threads = new Map(); }
  async start() {}
  notify() {}
  stop() {}
  async request(method, params) {
    if (method === 'initialize') return { userAgent: 'synthetic-codex-build' };
    if (method === 'thread/start') {
      const thread = { id: 'build_' + this.threads.size, cwd: params.cwd, ephemeral: false, turns: [], goal: null };
      this.threads.set(thread.id, thread);
      return { thread, model: params.model, modelProvider: 'synthetic' };
    }
    if (method === 'thread/list') return { data: [...this.threads.values()].filter(thread => thread.archived) };
    const thread = this.threads.get(params.threadId);
    assert.ok(thread, method);
    if (method === 'thread/goal/set') { thread.goal = { tokensUsed: 0, ...thread.goal, ...params }; return { goal: thread.goal }; }
    if (method === 'thread/goal/get') return { goal: thread.goal };
    if (method === 'thread/goal/clear') { thread.goal = null; return {}; }
    if (method === 'thread/archive') { thread.archived = true; return {}; }
    if (method === 'thread/unsubscribe') return {};
    if (method === 'thread/read' || method === 'thread/resume') return { thread };
    if (method === 'turn/start') {
      this.implement(thread.cwd);
      thread.goal.tokensUsed = 120;
      thread.goal.status = 'complete';
      thread.turns.push({ id: 'build_turn', status: 'completed', items: [{ type: 'agentMessage', text: JSON.stringify({ summary: 'Synthetic implementation', changed_files: ['scripts/server.mjs'], remaining_risks: [] }) }] });
      this.current = thread;
      return { turn: thread.turns[0] };
    }
    throw new Error('Unexpected build method ' + method);
  }
  async waitForNotification() { return { method: 'turn/completed', params: { threadId: this.current.id, turn: this.current.turns[0] } }; }
}

export async function productFactoryFixture(scenario, emit = () => {}) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pritha-product-factory-')));
  const stateRoot = path.join(directory, 'state'), agentParent = path.join(directory, 'children');
  fs.mkdirSync(stateRoot); fs.mkdirSync(agentParent);
  const paths = voiceFactoryPaths({ root, stateRoot, agentParent, slug: scenario.slug });
  const builds = [], reviews = [], hosts = [];
  let coordinator, lease, runtime, native, run, sequence = 0;
  let chatId = 'chat_native_product', turnId = 'task_chat_product_turn';
  const state = () => loadVoiceFactory(paths, { chatId, connectorId: scenario.connectorId });
  const artifact = kind => factoryArtifact(paths, state(), kind);

  function implement(worktree) {
    assert.notEqual(worktree, paths.target);
    assert.match(worktree, /worktree$/);
    builds.push({ connectorId: scenario.connectorId, worktree });
    const operation = scenario.slug === 'headline-distiller'
      ? 'value => ({ headline: value.trim() })'
      : "value => ({ answer: value.startsWith('YES') ? 'YES' : 'NO', reason: value })";
    const cli = 'const run = ' + operation + ';\nconsole.log(JSON.stringify(run(process.argv[3])));\n';
    const server = "import http from 'node:http';\nconst run = " + operation + ';\n'
      + 'http.createServer((req,res) => { let body=""; req.on("data",chunk => body+=chunk); req.on("end",() => {res.setHeader("content-type","application/json");res.end(JSON.stringify(run(JSON.parse(body)[' + JSON.stringify(scenario.field) + '])));}); }).listen(Number(process.env[' + JSON.stringify(scenario.portVariable) + ']),"127.0.0.1");\n';
    fs.writeFileSync(path.join(worktree, scenario.entrypoint), cli);
    fs.writeFileSync(path.join(worktree, 'scripts/server.mjs'), server);
  }

  function executor(options) {
    const expected = scenario.connectorId === 'codex' ? 'codex-app-server' : 'claude-code';
    assert.equal(options.buildExecutor, expected);
    assert.equal(options.buildExecutorOptions.model, scenario.model);
    const service = { require: async () => ({ version: 'synthetic-claude-build', model: { id: scenario.model }, capabilities: { parallelLimit: 1 } }) };
    return createBuildExecutor(expected, { ...options.buildExecutorOptions, connection: new BuildConnection(implement), service,
      launch: async input => {
        await input.beforeStart({ identity: 'a'.repeat(64), evidence: { fixture: true }, sessionId: 'synthetic_build' });
        implement(input.cwd);
        await input.onEvent({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ summary: 'Synthetic implementation', changed_files: [scenario.entrypoint, 'scripts/server.mjs'], remaining_risks: [] }) } });
        return { completion: Promise.resolve({ ok: true, processTreeExited: true, sessionId: 'synthetic_build', model: scenario.model,
          budget: { usageKnown: true, tokensUsed: 120 } }), stop() {} };
      },
    });
  }

  class FixtureHost extends hostTools.ProviderHostTools {
    constructor(options) {
      super(options); hosts.push(this);
      const execute = this.factory.execute.bind(this.factory);
      this.factory.execute = async (input, expected) => {
        if (input.action !== 'deliver') return execute(input, expected);
        // Substitute provider IO in the same trusted worker. The real delivery
        // loop chooses whether to call the real Codex/Claude executor class.
        const next = { ...expected, revision: expected.revision + 1, running: { operationId: input.operation_id, action: input.action } };
        atomicWriteFile(paths.file, JSON.stringify(next));
        const result = await executeVoiceFactoryStep({ root, stateRoot, agentParent, slug: paths.slug, chatId, connectorId: scenario.connectorId,
          model: scenario.model, effort: 'low', state: next, input }, { delivery: { ...delivery,
          deliverOutcome: (spec, target, options) => delivery.deliverOutcome(spec, target, { ...options, buildExecutor: executor(options) }),
        } });
        atomicWriteFile(paths.file, JSON.stringify({ ...result.state, running: null }));
        return { status: 'completed', output: JSON.stringify({ ok: true, ...result.value }) };
      };
    }
  }

  if (scenario.connectorId === 'codex') {
    coordinator = new ExecutionCoordinator({ stateRoot });
    lease = coordinator.claim(['product-fixture'], 'product-factory-owner', { kind: 'turn', detail: { chatId, connectorId: 'codex' } });
    coordinator.extend(lease.owner, lease.generation, ['workspace:' + paths.target]);
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(root, 'interfaces/control-center/src/lib/codex-chat/native-factory.ts'), 'utf8');
    const dependencies = { hostTools: { ...hostTools, ProviderHostTools: FixtureHost }, factoryTools, approvals, processSnapshot };
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    new Function('require', 'module', 'exports', output)(id => {
      if (id.endsWith('/provider-host-tools.mjs')) return dependencies.hostTools;
      if (id.endsWith('/provider-factory-tools.mjs')) return factoryTools;
      if (id.endsWith('/provider-approvals.mjs')) return approvals;
      if (id.endsWith('/process-snapshot.mjs')) return processSnapshot;
      return require(id);
    }, module, module.exports);
    native = new module.exports.NativeFactoryTurn({ root, cwd: root, stateRoot, agentParent, privateRoot: path.join(stateRoot, 'codex-chat'),
      chatId, turnId, threadId: 'native_product', nativeTurnId: () => 'native_product_turn', lease, coordinator,
      slug: paths.slug, target: paths.target, model: scenario.model, effort: 'low', emit });
  } else {
    runtime = new ProviderTaskRuntime({ connectorId: 'claude', root, stateRoot, agentParent, privateRoot: path.join(stateRoot, 'private', 'task-chat'),
      configuration: () => ({ modelId: scenario.model, reasoningEffort: 'low', timeoutMs: 900000, sandbox: 'read-only' }),
      preflight: async () => ({ tools: true, approvals: true }),
      launch: async input => {
        await input.beforeStart({ identity: 'b'.repeat(64), evidence: { fixture: true } });
        await input.onEvent({ type: 'thread.started', thread_id: '11111111-2222-4333-8444-555555555555' });
        const host = new FixtureHost({ ...input, ...input.hostExecutionContext, connectorId: 'claude', onProcessEvidence() {} });
        let finish;
        const completion = new Promise(resolve => { finish = resolve; });
        run = { host, completion, finish, stop: () => finish({ ok: false, errorCode: 'operator_cancel', processTreeExited: true }) };
        return run;
      },
    });
    chatId = (await runtime.create({ clientThreadId: 'product_factory_creation', source: 'chat', factoryIntent: { action: 'create-new-agent', slug: scenario.slug }, workspace: { mode: 'read-only' } })).binding.chatId;
    coordinator = runtime.execution;
    await runtime.start(chatId, { clientMessageId: 'product_first_message', input: [{ type: 'text', text: 'Create ' + scenario.name + ' with HTTP and CLI.' }] });
    await until(() => Boolean(run));
  }

  const pending = () => approvals.pendingProviderRequests(coordinator, chatId);
  const call = async (action, extra = {}) => {
    const input = { operation_id: 'product_step_' + (++sequence), action, ...extra };
    let value;
    try {
      const result = native
        ? await native.call({ threadId: 'native_product', turnId: 'native_product_turn', callId: 'product_call_' + sequence, tool: 'factory_step', arguments: input })
        : await run.host.call('factory_step', input);
      const text = result.contentItems?.[0]?.text || result.content?.[0]?.text;
      const outer = JSON.parse(text);
      value = outer.text ? JSON.parse(outer.text) : outer;
    } catch (error) { value = factoryTools.factoryBriefErrorDetail(error) || { error: error.code || error.message }; }
    emit();
    return value;
  };
  return { root, directory, stateRoot, paths, scenario, chatId, builds, reviews, call, pending, state, artifact,
    brief: { identity: { name: scenario.name, slug: scenario.slug }, goal: 'Return the requested JSON through HTTP and CLI.', user: 'Local operator',
      successCriteria: ['HTTP and CLI return the approved JSON for the supplied input.'], coreFunctions: ['Return the approved product JSON'],
      technical: { preset: 'llm-app', runtimeFamily: 'api', serviceMode: 'process', primaryInterface: 'web', secondaryInterfaces: 'CLI',
        cliEntrypoint: scenario.entrypoint, port: '3021', portVariable: scenario.portVariable,
        repositoryResearchPolicy: 'not-applicable', repositoryAdoptionMode: 'none', repositoryResearchTopics: 'none', repositoryResearchWaiverReason: 'Synthetic product test uses only built-in Node modules.' } },
    trial: { cli: { argv: ['node', scenario.entrypoint, scenario.flag, scenario.cliInput], expected_json: scenario.result(scenario.cliInput) },
      http: { argv: ['node', 'scripts/server.mjs'], port_variable: scenario.portVariable, path: scenario.route,
        input_json: { [scenario.field]: scenario.httpInput }, expected_json: scenario.result(scenario.httpInput) } },
    async answer(request = pending()[0], input = {}) {
      reviews.push(request);
      const result = await approvals.answerProviderRequest(coordinator, chatId, { requestId: request.requestId, revision: request.presentation.revision,
        clientMessageId: 'product_approval_' + reviews.length, decision: 'accept', ...input });
      emit();
      return result;
    },
    async research() {
      const memory = path.join(stateRoot, 'memory'); fs.mkdirSync(memory);
      execFileSync('sqlite3', [path.join(memory, 'pritha.sqlite')], { input: fs.readFileSync(path.join(root, '.memory/schema.sql')) });
      const result = await call('research'); assert.equal(result.error, undefined, JSON.stringify(result));
      const saved = state(), data = contractData(saved.contract, { root });
      const pattern = fs.readFileSync(saved.pattern, 'utf8');
      const topics = deriveExternalResearchTopics(data, { patternPack: pattern });
      const host = new HostResearch({ root, stateRoot, data, report: { fullPath: saved.research, text: fs.readFileSync(saved.research, 'utf8') },
        patternLock: verifyPatternPackIntegrity(pattern, data.fingerprint).lock, topics, connectorId: scenario.connectorId,
        reader: async url => ({ items: [{ url, text: topics.map(topic => topic.query + '. Synthetic primary documentation fixture confirms bounded Node behavior, input validation and explicit application ownership for this isolated test.').join('\n\n') }] }),
      });
      const collected = await host.collect({ sourceUrls: Object.fromEntries(host.topics.map(topic => [topic.id, 'https://' + topic.primaryDomains[0] + '/api/fixture'])) });
      const selection = { facts: collected.sources.map(source => ({ sourceId: source.id, topicId: source.topicId, passageId: source.passages[0].id,
        versionContext: 'Synthetic Node fixture version', compatibility: 'This isolated fixture confirms the selected built-in Node behavior.', compatibilityStatus: 'compatible' })),
        synthesis: { relationship: 'confirms', memory_comparison: 'Synthetic evidence agrees with the selected local Node fixture.', summary: 'The isolated fixture can implement the approved HTTP and CLI behavior.',
          architecture_decision: 'Use the approved API process scaffold and independent product verifier.', alternatives: ['Defer the fixture'], tradeoffs: ['Synthetic sources test the gate without external retrieval'], repository_adoption_recommendation: 'proceed' } };
      return call('research_apply', { selection });
    },
    async close() {
      run?.finish({ ok: true, processTreeExited: true });
      await native?.close();
      for (const host of hosts) await host.close();
      await runtime?.dispose();
      lease?.release();
      if (!runtime) coordinator.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
