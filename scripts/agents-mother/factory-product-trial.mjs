import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicCompareAndSwapFile } from '../lib/atomic-file.mjs';
import { privateStateDirectory, privateStateFile } from '../lib/private-state-path.mjs';
import { parseBoundedJson } from '../lib/bounded-json.mjs';
import { redactSensitiveText } from '../lib/redaction.mjs';
import { validateOutcomeSpecText } from './outcome-spec.mjs';
import { preparedTrialInputFiles } from './prepared-trial-inputs.mjs';
import { safeTrialInputPath } from './trial-input-declarations.mjs';
import { scaffoldCapability } from './scaffold/capabilities.mjs';
import { apiProcessPortConfiguration } from './scaffold/api-process.mjs';

const verifierPath = 'verification/product.mjs';
const provenance = 'host-template:api-cli-product-v1';
const sha256 = content => createHash('sha256').update(content).digest('hex');
const fail = code => { throw Object.assign(new Error('Prepare and review an independent HTTP/CLI product Trial before approving this Outcome.'), { code }); };

function nodeCommand(argv) {
  if (!Array.isArray(argv) || argv.length < 2 || argv.length > 24 || argv[0] !== 'node'
      || !safeTrialInputPath(argv[1]) || !argv[1].startsWith('scripts/') || !argv[1].endsWith('.mjs')
      || argv.some(value => typeof value !== 'string' || value.length > 2000 || /[\x00-\x1f]/.test(value))) {
    fail('factory_product_trial_invalid');
  }
}

export function validateProductTrial(trial, data) {
  let json;
  try {
    json = JSON.stringify(trial);
    parseBoundedJson(json, { maxBytes: 12000, maxDepth: 8, maxNodes: 500 });
  } catch { fail('factory_product_trial_invalid'); }
  if (!trial || Array.isArray(trial) || Object.keys(trial).some(key => !['cli', 'http'].includes(key))
      || (!trial.cli && !trial.http) || redactSensitiveText(json) !== json) fail('factory_product_trial_invalid');
  const capability = scaffoldCapability(data);
  if (capability.adapter !== 'api-process-v1' || !trial.http || capability.interfaces.includes('cli') !== Boolean(trial.cli)) {
    fail('factory_product_trial_interfaces');
  }
  for (const [kind, check] of Object.entries(trial)) {
    const fields = kind === 'cli' ? ['argv', 'expected_json'] : ['argv', 'port_variable', 'path', 'input_json', 'expected_json'];
    if (!check || Array.isArray(check) || Object.keys(check).some(key => !fields.includes(key))
        || fields.some(key => !Object.hasOwn(check, key))) fail('factory_product_trial_invalid');
    nodeCommand(check.argv);
    if (kind === 'cli' && check.argv[1] !== (data.cliEntrypoint || 'scripts/agent-cli.mjs')) fail('factory_product_trial_interfaces');
    if (!check.expected_json || Array.isArray(check.expected_json) || typeof check.expected_json !== 'object') fail('factory_product_trial_invalid');
    if (kind === 'http' && (!/^[A-Z][A-Z0-9_]{0,63}_PORT$/.test(check.port_variable)
        || check.port_variable !== apiProcessPortConfiguration(data).variable || check.argv[1] !== 'scripts/server.mjs'
        || !/^\/[A-Za-z0-9/_-]{0,120}$/.test(check.path) || check.path.startsWith('//')
        || !check.input_json || Array.isArray(check.input_json) || typeof check.input_json !== 'object')) fail('factory_product_trial_invalid');
  }
}

export function prepareProductTrial(paths, outcome, data, trial) {
  validateProductTrial(trial, data);
  const checked = validateOutcomeSpecText(outcome.text, { root: paths.root });
  const template = fs.readFileSync(new URL('./scaffold/templates/product-trial.mjs.tmpl', import.meta.url), 'utf8');
  const content = 'const checks = JSON.parse(' + JSON.stringify(JSON.stringify(trial)) + ');\n' + template;
  const inputRoot = privateStateDirectory(paths.stateRoot, path.join(paths.directory, 'trial-inputs'));
  const file = privateStateFile(paths.stateRoot, path.join(inputRoot, verifierPath));
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  atomicCompareAndSwapFile(file, previous, content);
  const targets = [...new Set(Object.values(trial).map(check => check.argv[1]))];
  const block = [
    '## Trials', '', '### Trial: product-http-cli', '',
    '- Statement: The approved HTTP and CLI requests return the exact expected product JSON.',
    '- Kind: automated',
    ...checked.coverage.map(row => '- Covers: ' + row.id),
    '- Isolation: none', '- When argv: ["node", "' + verifierPath + '"]', '- When cwd: .',
    '- Then exit code: 0', ...targets.map(target => '- Product target: ' + target),
    '- Verifier input: ' + verifierPath + ' :: sha256:' + sha256(content) + ' :: ' + provenance,
    '- Timeout ms: 60000', '', '',
  ].join('\n');
  const next = outcome.text.replace(/## Trials\n[\s\S]*?(?=## Demo script)/, block);
  if (next === outcome.text) fail('factory_product_trial_invalid');
  const validation = validateOutcomeSpecText(next, { root: paths.root });
  if (validation.issues.some(issue => !['OS015', 'OS016'].includes(issue.code))) fail('factory_product_trial_invalid');
  atomicCompareAndSwapFile(outcome.file, outcome.text, next);
  return { artifact: 'outcome', sha256: sha256(next), verifier: { path: verifierPath, sha256: sha256(content), provenance },
    checks: trial, next: 'Read the updated Outcome and request its separate approval. The displayed verifier executes only during approved Trials.' };
}

// Reused before showing an approval and immediately before its effect. Existing
// accepted documents are handled by their original locks, not a new approval.
export function reviewProductTrials(paths, outcome, data, { includeInputs = true } = {}) {
  const checked = validateOutcomeSpecText(outcome.text, { root: paths.root });
  if (checked.issues.some(issue => !['OS015', 'OS016'].includes(issue.code))) fail('factory_product_trial_invalid');
  const automated = checked.parsed.trials.filter(trial => trial.kind === 'automated' && trial.productTargets?.length);
  if (data.runtimeFamily === 'api' && data.serviceMode === 'process') {
    const targets = automated.flatMap(trial => trial.productTargets);
    if (!targets.includes('scripts/server.mjs') || scaffoldCapability(data).interfaces.includes('cli')
        && !targets.includes(data.cliEntrypoint || 'scripts/agent-cli.mjs')) {
      fail('factory_product_trial_required');
    }
  }
  if (!includeInputs) return [];
  if (!checked.parsed.trials.some(trial => trial.verifierInputs || trial.productTargets)) return [];
  const inputRoot = privateStateDirectory(paths.stateRoot, path.join(paths.directory, 'trial-inputs'), { create: false });
  if (!inputRoot) fail('factory_trial_inputs_missing');
  return preparedTrialInputFiles({ trials: checked.parsed.trials }, inputRoot).map(file => ({
    path: file.path, sha256: sha256(file.content), content: file.content.toString('utf8'),
  }));
}
