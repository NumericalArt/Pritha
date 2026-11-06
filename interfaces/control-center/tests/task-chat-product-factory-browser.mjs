// Exercise the actual Task Chat UI and its approval requests against isolated
// factory sessions. Only provider responses and source-page contents are fake.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { scenarios, productFactoryFixture, until } from '../../../tests/helpers/product-factory.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appRoot, 'package.json'));
const { webpack } = require('next/dist/compiled/webpack/webpack');
const output = mkdtempSync(path.join(os.tmpdir(), 'pritha-product-factory-ui-'));
const artifacts = process.env.PRITHA_TEST_ARTIFACTS || path.resolve(appRoot, '../../.private/testing/product-factory');
mkdirSync(artifacts, { recursive: true });
const loader = path.join(output, 'typescript-loader.cjs');
writeFileSync(loader, `const ts = require(${JSON.stringify(require.resolve('typescript'))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; };`);
const entry = path.join(output, 'entry.tsx');
writeFileSync(entry, `import { createRoot } from 'react-dom/client';
import { CodexChatPage } from ${JSON.stringify(path.join(appRoot, 'src/components/codex/CodexChatPage.tsx'))};
createRoot(document.getElementById('root')).render(<CodexChatPage />);`);
await new Promise((resolve, reject) => {
  const compiler = webpack({
    mode: 'production', target: 'web', entry, output: { path: output, filename: 'bundle.js' }, optimization: { minimize: false },
    resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(appRoot, 'node_modules')], alias: { '@': path.join(appRoot, 'src') } },
    module: { rules: [{ test: /\.tsx?$/, use: [loader] }] },
  });
  compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const bundle = readFileSync(path.join(output, 'bundle.js'));
const styles = readFileSync(path.join(appRoot, 'src/styles/tokens.css'), 'utf8')
  + readFileSync(path.join(appRoot, 'src/styles/globals.css'), 'utf8').replace('@import "./tokens.css";', '');
const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'
  + styles + '#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/bundle.js"></script></html>';
// A bounded fixture SSE connection keeps the actual EventSource lifecycle open.
const events = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  response.write(': ready\n\n');
});
await new Promise(resolve => events.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + events.address().port;
const browser = await chromium.launch({ headless: true });
const results = [];
const check = value => { assert.equal(value.error, undefined, JSON.stringify(value)); assert.notEqual(value.ok, false, JSON.stringify(value)); return value; };
try {
  for (const scenario of scenarios) for (const width of [1280, 390]) {
    const f = await productFactoryFixture(scenario,()=>{},{automate:true});
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const message = 'Создай агента «'+scenario.name+'», который '+(scenario.connectorId==='codex'?'убирает пробелы по краям текста и возвращает заголовок в JSON':'возвращает YES только для вопросов с префиксом YES, а иначе NO')+'. Хочу пользоваться им из CLI и по HTTP.';
    let story, storyError, finished = false, delivered, resultMessage;
    const now = new Date().toISOString();
    const thread = () => ({ chatId: f.chatId, title: scenario.name, preview: message, group: 'my_chats', origin: 'chat', status: finished ? 'completed' : story ? 'active' : 'idle',
      activeFlags: !story || finished ? [] : [f.pending().length ? 'waiting_on_approval' : 'streaming'], taskLinks: [], pinned: false, archived: false,
      historyKind: scenario.connectorId === 'codex' ? 'native' : 'mirrored', createdAt: now, updatedAt: now,
      runtime: { connectorId: scenario.connectorId, modelId: scenario.model, providerId: scenario.connectorId + '_runtime',
        protocol: scenario.connectorId === 'codex' ? 'app_server' : 'exec_resume', stateIdentityHash: 'synthetic-fixture', compatibility: 'bound' }, continuationState: 'continuation_enabled' });
    const turn = () => ({ turnId: 'product_ui_turn', status: finished ? 'completed' : 'inProgress', userMessage: { id: 'product_user', markdown: message },
      items: finished ? [{ id: 'product_result', kind: 'assistant_message', status: 'completed', message: { id: 'product_result', markdown: resultMessage, status: 'completed' } }] : [],
      startedAt: now, pendingRequestIds: f.pending().map(request => request.requestId) });
    const workflow = async () => {
      check(await f.call('init', { brief: f.brief, build_token_budget: 10000, build_iteration_budget: 2 }));
      const plan = check(await f.call('scaffold_plan'));
      assert.deepEqual(plan.capability.interfaces, ['web', 'cli']);
      assert.equal(plan.capability.supported, true);
      check(await f.call('approve_contract', { expected_sha256: f.artifact('contract').sha256 }));
      assert.equal((await f.call('approve_outcome', { expected_sha256: f.artifact('outcome').sha256 })).error, 'factory_product_trial_required');
      const prepared = check(await f.call('prepare_product_trial', { expected_sha256: f.artifact('outcome').sha256, trial: f.trial }));
      check(await f.call('approve_outcome', { expected_sha256: prepared.sha256 }));
      const synthesis=check(await f.research());
      assert.deepEqual(synthesis.continued,['scaffold','deliver','finish']);
      assert.equal(synthesis.continuationFailed,false);
      const progress=f.progress();delivered=progress.delivery;
      assert.equal(delivered.status,'verified');assert.equal(delivered.iteration,1);
      assert.equal(f.builds.length,1);assert.ok(progress.firstUse);
      resultMessage=scenario.name+' — продуктовый тест прошёл после одной итерации сборки.';
      finished = true;
    };
    await page.route(origin + '/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: url.pathname === '/bundle.js' ? 'text/javascript' : 'text/html', body: url.pathname === '/bundle.js' ? bundle : html });
      if (url.pathname === '/api/health') return route.fulfill({ json: { schema: 'pritha-control-center-health-v2', ok: true, service: 'pritha-control-center', status: 'ready', instance: { id: 'fixture', port: 3420 }, release: { commit: 'fixture', buildId: 'fixture' } } });
      if (url.pathname.endsWith('/events')) return route.continue();
      let data;
      if (url.pathname.endsWith('/threads') && request.method() === 'POST') {
        assert.equal(story, undefined, 'One composer message starts one factory workflow.');
        const body=request.postDataJSON();
        assert.deepEqual(body.factoryIntent,{action:'create-new-agent',slug:scenario.slug});
        assert.equal(body.connectorId,scenario.connectorId);assert.deepEqual(body.workspace,{mode:'read-only'});
        assert.equal(body.initialTurn.input[0].text,message);
        story = workflow().catch(error => { storyError = error; });
        const streamUrl='/api/codex-chat/v1/threads/'+f.chatId+'/events';
        data = {detail:{thread:thread(),streamUrl,activeTurnId:'product_ui_turn',pendingRequests:[],continuationState:'continuation_enabled'},accepted:{turn:turn(),streamUrl}};
      } else if (url.pathname.endsWith('/requests') && request.method() === 'POST') {
        const input = request.postDataJSON(), pending = f.pending()[0];
        assert.equal(input.requestId, pending.requestId);
        assert.equal(input.revision, pending.presentation.revision);
        data = await f.answer(pending, input);
      } else if (url.pathname.endsWith('/runtime')) {
        data = { connectorId: scenario.connectorId, preferredProvider: scenario.connectorId + '_runtime', effectiveProvider: scenario.connectorId + '_runtime', availability: 'ready',
          providers: [{ providerId: scenario.connectorId + '_runtime', label: scenario.connectorId, protocol: scenario.connectorId === 'codex' ? 'app_server' : 'exec_resume', availability: 'ready',
            capabilities: { fullChat: true, factoryTools: true, permissionApprovals: true, commandApprovals: true, fileChangeApprovals: true, interruptTurn: true } }],
          models: [{ id: scenario.model, label: scenario.model, inputModalities: ['text'], effortIds: ['low'], serviceTierIds: [] }],
          selected: { modelId: scenario.model, effortId: 'low', sandboxMode: 'read_only', approvalMode: 'on_request' } };
      } else if (url.pathname.endsWith('/threads')) data = { data: story?[thread()]:[], nextCursor: null };
      else if (url.pathname.endsWith('/activity')) data = { cursor: 0, changed: [] };
      else if (url.pathname.endsWith('/ui-activity')) data = { ok: true };
      else if (url.pathname.endsWith('/delivery')) data = { runs: [] };
      else if (url.pathname.endsWith('/goal')) data = { availability: 'unavailable' };
      else if (url.pathname.endsWith('/turns') || url.pathname.endsWith('/history')) data = { data: story ? [turn()] : [], olderCursor: null, hasOlder: false };
      else data = { thread: thread(), factoryControl:f.progress(), activeTurnId: story && !finished ? 'product_ui_turn' : null,
        controls: story && !finished ? { turnId: 'product_ui_turn', steer: false, interrupt: false } : null,
        pendingRequests: f.pending(), queued: [], continuationState: 'continuation_enabled', history: { state: 'available' }, streamUrl: '/api/codex-chat/v1/threads/' + f.chatId + '/events' };
      return route.fulfill({ json: { apiVersion: '1', requestId: 'product_ui_response', data } });
    });
    try {
      const url = origin + '/task-chat?group=my_chats';
      await page.goto(url);
      await page.locator('textarea').fill(message);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await until(() => f.pending().length === 1 || storyError);
      if (storyError) throw storyError;
      await page.reload();
      await expect(page.getByText('1. Что создать и в каких пределах', { exact: true })).toBeVisible();
      await page.getByText('Полный документ и условия проверки',{exact:true}).click();
      await expect(page.locator('fieldset pre')).toContainText('scaffoldCapability');
      await expect(page.locator('fieldset pre')).toContainText('"supported": true');
      await expect(page.locator('fieldset pre')).toContainText('"cli"');
      await page.screenshot({ path: path.join(artifacts, scenario.slug + '-' + width + '-contract.png') });
      await page.getByRole('button', { name: 'Approve this request', exact: true }).click();
      await until(() => f.pending().length === 1 && f.pending()[0].presentation.approvalScope === 'outcome only' || storyError);
      if (storyError) throw storyError;
      await page.reload();
      await expect(page.getByText('2. Как проверить результат',{exact:true})).toBeVisible();
      await page.getByText('Полный документ и условия проверки',{exact:true}).click();
      await expect(page.locator('fieldset pre')).toContainText('trialInputs');
      await expect(page.locator('fieldset pre')).toContainText('verification/product.mjs');
      await page.getByRole('button', { name: 'Approve this request', exact: true }).click();
      await story;
      if (storyError) throw storyError;
      await page.reload();
      await expect(page.getByText(resultMessage, { exact: true }).last()).toBeVisible();
      await expect(page.getByText('Попробовать проверенную версию',{exact:true})).toBeVisible();
      await expect(page.locator('aside pre').first()).toContainText(scenario.entrypoint);
      assert.deepEqual(errors, []);
      assert.equal(f.reviews.length, 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(artifacts, scenario.slug + '-' + width + '-result.png') });
      results.push({ scenario: scenario.name, connectorId: scenario.connectorId, width, approvals: f.reviews.length,
        builds: f.builds.length, status: delivered.status, iteration: delivered.iteration, providerIO: 'synthetic',
        brief:message,decisions:['contract','outcome'],firstUse:(()=>{const {commit,commands,observed}=f.progress().firstUse;return {commit,commands,observed,workspace:'disposable fixture; removed after test'};})() });
    } finally { await page.close(); await f.close(); }
  }
  writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results.length, results, artifacts }, null, 2));
} finally {
  await browser.close();
  events.closeAllConnections();
  await new Promise(resolve => events.close(resolve));
  rmSync(output, { recursive: true, force: true });
}
