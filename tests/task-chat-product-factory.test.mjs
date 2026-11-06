import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { scenarios, productFactoryFixture, until } from './helpers/product-factory.mjs';
import { runTrialPlan } from '../scripts/agents-mother/trial-runner.mjs';
import { approveOutcomeSpec } from '../scripts/agents-mother/outcome-spec.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const ok = result => { assert.equal(result.error, undefined, JSON.stringify(result)); assert.notEqual(result.ok, false, JSON.stringify(result)); return result; };

for (const scenario of scenarios) test(`${scenario.name} via ${scenario.connectorId} Task Chat rejects unsupported Contract before approval and automatically builds after a stub fails`, { timeout: 120000 }, async t => {
  const f = await productFactoryFixture(scenario);
  t.after(() => f.close());
  const initialized = ok(await f.call('init', { brief: f.brief, build_token_budget: 10000, build_iteration_budget: 2 }));
  assert.deepEqual(initialized.scaffoldCapability.interfaces, ['web', 'cli']);
  assert.equal(initialized.scaffoldCapability.supported, true);
  assert.equal(f.pending().length, 0);
  assert.equal(f.state().contractApproval, undefined);

  const draft = f.artifact('contract');
  const unsupported = draft.text.replace('- Secondary interfaces: CLI', '- Secondary interfaces: Telegram');
  ok(await f.call('write_draft', { artifact: 'contract', expected_sha256: draft.sha256, content: unsupported }));
  const plan = ok(await f.call('scaffold_plan'));
  assert.equal(plan.capability.supported, false);
  const refused = await f.call('approve_contract', { expected_sha256: f.artifact('contract').sha256 });
  assert.equal(refused.error, 'scaffold_adapter_unavailable');
  assert.equal(f.pending().length, 0, 'Unsupported contracts must fail before the approval card.');
  assert.equal(f.state().contractApproval, undefined);
  assert.equal(fs.existsSync(f.paths.target), false);

  ok(await f.call('write_draft', { artifact: 'contract', expected_sha256: f.artifact('contract').sha256, content: draft.text }));
  const approvingContract = f.call('approve_contract', { expected_sha256: f.artifact('contract').sha256 });
  await until(() => f.pending().length === 1);
  assert.deepEqual(f.pending()[0].presentation.scaffoldCapability.interfaces, ['web', 'cli']);
  assert.equal(f.pending()[0].presentation.buildProvider, scenario.connectorId);
  assert.equal(f.pending()[0].presentation.buildModel, scenario.model);
  await f.answer();
  ok(await approvingContract);
  ok(await f.call('create_outcome'));

  assert.equal((await f.call('approve_outcome', { expected_sha256: f.artifact('outcome').sha256 })).error, 'factory_product_trial_required');
  assert.equal(f.pending().length, 0, 'A structural smoke cannot authorize an API product.');
  const prepared = ok(await f.call('prepare_product_trial', { expected_sha256: f.artifact('outcome').sha256, trial: f.trial }));
  assert.equal(fs.existsSync(f.paths.target), false, 'Verifier preparation precedes the child.');
  assert.equal(f.state().outcomeApproval, undefined);
  assert.match(f.artifact('outcome').text, /Product target: scripts\/server\.mjs/);
  assert.match(f.artifact('outcome').text, new RegExp('Product target: ' + scenario.entrypoint.replace('.', '\\.')));
  const frozenVerifier = fs.readFileSync(path.join(f.paths.directory, 'trial-inputs', prepared.verifier.path), 'utf8');
  const approvingOutcome = f.call('approve_outcome', { expected_sha256: prepared.sha256 });
  await until(() => f.pending().length === 1);
  const review = f.pending()[0].presentation;
  assert.equal(review.trialInputs[0].content, frozenVerifier);
  assert.equal(review.trialInputs[0].sha256, prepared.verifier.sha256);
  await f.answer();
  ok(await approvingOutcome);
  assert.equal(f.reviews.length, 2);

  ok(await f.research());
  ok(await f.call('scaffold'));
  assert.equal(f.state().phase, 'scaffolded');
  assert.match(fs.readFileSync(path.join(f.paths.target, 'scripts/server.mjs'), 'utf8'), /implementation-required/);
  const delivered = ok(await f.call('deliver'));
  assert.equal(delivered.status, 'verified', JSON.stringify(delivered));
  assert.equal(delivered.iteration, 1);
  assert.equal(delivered.budget.tokens_used, 120);
  assert.equal(f.builds.length, 1, 'The failed product Trial must cause exactly one build.');
  assert.equal(f.builds[0].connectorId, scenario.connectorId);
  assert.equal(delivered.manualAcceptance, 'pending');
  assert.equal(fs.readFileSync(path.join(delivered.worktree, 'verification/product.mjs'), 'utf8'), frozenVerifier);
  assert.equal(f.reviews.length, 2, 'Technical continuation must reuse the two document approvals.');
  const runRoot = path.join(f.stateRoot, 'builds', scenario.slug, delivered.runId);
  const results = fs.readdirSync(path.join(runRoot, 'trial-results')).filter(name => name.endsWith('.json'))
    .sort().map(name => JSON.parse(fs.readFileSync(path.join(runRoot, 'trial-results', name), 'utf8')));
  assert.equal(results[0].verification_status, 'failed');
  assert.equal(results.at(-1).verification_status, 'verified');
  assert.match(results[0].trials[0].execution.stderr, /CLI product failed/);

  // A constant/wrong CLI answer must still fail the unchanged reviewed verifier.
  const entry = path.join(delivered.worktree, scenario.entrypoint);
  const implementation = fs.readFileSync(entry, 'utf8');
  fs.writeFileSync(entry, 'console.log(JSON.stringify({wrong:true}));\n');
  const trialPlan = JSON.parse(fs.readFileSync(path.join(runRoot, 'trial-plan.json'), 'utf8'));
  const wrong = await runTrialPlan(trialPlan, { root: f.root, stateRoot: f.stateRoot, projectPath: delivered.worktree, backend: 'local', write: false });
  assert.equal(wrong.result.verification_status, 'failed');
  fs.writeFileSync(entry, implementation);
  const server = path.join(delivered.worktree, 'scripts/server.mjs');
  const serverImplementation = fs.readFileSync(server, 'utf8');
  fs.writeFileSync(server, serverImplementation.replace('JSON.stringify(run(JSON.parse(body)[' + JSON.stringify(scenario.field) + ']))', 'JSON.stringify({wrong:true})'));
  const wrongHttp = await runTrialPlan(trialPlan, { root: f.root, stateRoot: f.stateRoot, projectPath: delivered.worktree, backend: 'local', write: false });
  assert.equal(wrongHttp.result.verification_status, 'failed');
  assert.match(wrongHttp.result.trials[0].execution.stderr, /HTTP product JSON differs/);
  fs.writeFileSync(server, serverImplementation);
  assert.equal(f.builds.length, 1);
});

test('product Trial rejects undeclared interfaces, unsafe commands and stale drafts before writing or approval', { timeout: 30000 }, async t => {
  const f = await productFactoryFixture(scenarios[1]);
  t.after(() => f.close());
  ok(await f.call('init', { brief: f.brief, build_token_budget: 10000 }));
  const approving = f.call('approve_contract', { expected_sha256: f.artifact('contract').sha256 });
  await until(() => f.pending().length === 1); await f.answer(); ok(await approving);
  ok(await f.call('create_outcome'));
  const expected_sha256 = f.artifact('outcome').sha256;
  for (const trial of [{ http: f.trial.http }, { ...f.trial, cli: { ...f.trial.cli, argv: ['node', '../escape.mjs'] } }, { ...f.trial, injected: 'unknown' }]) {
    assert.match((await f.call('prepare_product_trial', { expected_sha256, trial })).error, /^factory_product_trial_/);
    assert.equal(f.artifact('outcome').sha256, expected_sha256);
  }
  const prepared = ok(await f.call('prepare_product_trial', { expected_sha256, trial: f.trial }));
  assert.equal((await f.call('prepare_product_trial', { expected_sha256, trial: f.trial })).error, 'factory_draft_changed');
  const pending = f.call('approve_outcome', { expected_sha256: prepared.sha256 });
  await until(() => f.pending().length === 1);
  const verifier = path.join(f.paths.directory, 'trial-inputs', prepared.verifier.path);
  fs.appendFileSync(verifier, '\nconsole.log("tampered");\n');
  await f.answer();
  const result = await pending;
  assert.ok(result.error || result.ok === false, JSON.stringify(result));
  assert.equal(f.state().outcomeApproval, undefined);
  assert.notEqual(hash(fs.readFileSync(verifier)), prepared.verifier.sha256);
  assert.equal(fs.existsSync(f.paths.target), false);
});

test('a legacy approved API smoke cannot start delivery without a reviewed product Trial', { timeout: 30000 }, async t => {
  const f = await productFactoryFixture(scenarios[1]);
  t.after(() => f.close());
  ok(await f.call('init', { brief: f.brief, build_token_budget: 10000 }));
  const approving = f.call('approve_contract', { expected_sha256: f.artifact('contract').sha256 });
  await until(() => f.pending().length === 1); await f.answer(); ok(await approving);
  ok(await f.call('create_outcome'));
  // Reconstruct the pre-fix accepted smoke-only state through its public
  // approval compiler. Delivery must preserve those bytes and ask for revision.
  const oldDraft = f.artifact('outcome');
  approveOutcomeSpec(oldDraft.file, { root: f.root, stateRoot: f.stateRoot, approvedBy: 'user' });
  const approved = f.artifact('outcome');
  fs.writeFileSync(f.paths.file, JSON.stringify({ ...f.state(), phase: 'scaffolded',
    outcomeApproval: { sha256: approved.sha256, reviewedSha256: oldDraft.sha256, operationId: 'legacy_outcome_approval' } }));
  const result = await f.call('deliver');
  assert.equal(result.error, 'factory_product_trial_required');
  assert.equal(f.artifact('outcome').sha256, approved.sha256);
  assert.equal(f.state().runId, undefined);
  assert.equal(f.builds.length, 0);
});
