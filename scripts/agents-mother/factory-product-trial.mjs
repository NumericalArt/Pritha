import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicCompareAndSwapFile } from '../lib/atomic-file.mjs';
import { privateStateDirectory, privateStateFile } from '../lib/private-state-path.mjs';
import { parseBoundedJson } from '../lib/bounded-json.mjs';
import { redactSensitiveText } from '../lib/redaction.mjs';
import { renderOutcomeSpecFromContract, validateOutcomeSpecText } from './outcome-spec.mjs';
import { preparedTrialInputFiles } from './prepared-trial-inputs.mjs';
import { safeTrialInputPath } from './trial-input-declarations.mjs';
import { scaffoldCapability } from './scaffold/capabilities.mjs';
import { apiProcessPortConfiguration } from './scaffold/api-process.mjs';

const verifierPath = 'verification/product.mjs';
const provenance = 'host-template:api-cli-product-v2';
const sha256 = content => createHash('sha256').update(content).digest('hex');
const fail = code => { throw Object.assign(new Error('Prepare and review an independent HTTP/CLI product Trial before approving this Outcome.'), { code }); };

// Read data from our template prefix without evaluating verifier code.
export function productExamples(content){
  const match=/^const checks = JSON\.parse\(([^\n]+)\);\n/.exec(content);
  if(!match)return [];
  try{
    const checks=JSON.parse(JSON.parse(match[1]));
    return Object.entries(checks).filter(([k])=>['http','cli'].includes(k)).flatMap(([kind,values])=>(Array.isArray(values)?values:[values]).map(c=>({interface:kind,input:kind==='cli'?c.argv.slice(2):c.input_json,expected:c.expected_json})));
  }catch{return [];}
}

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
  for (const [kind, cases] of Object.entries(trial)) {
    if (!Array.isArray(cases) || cases.length < 2 || cases.length > 8) fail('factory_product_trial_variants_required');
    const signatures = new Map(), outputs = new Set();
    for (const check of cases) {
      const fields = kind === 'cli' ? ['argv','expected_exit'] : ['argv','port_variable','path','input_json','expected_status'];
      if (!check || Array.isArray(check) || Object.keys(check).some(key => ![...fields,'expected_json','covers'].includes(key))
          || !Array.isArray(check.covers) || !check.covers.length || check.covers.some(id=>typeof id!=='string' || id.length>200)) fail('factory_product_trial_invalid');
      nodeCommand(check.argv);
      if (kind==='cli' && check.argv[1] !== (data.cliEntrypoint || 'scripts/agent-cli.mjs')) fail('factory_product_trial_interfaces');
      const status=kind==='cli'?(check.expected_exit??0):(check.expected_status??200);
      const success=status===(kind==='cli'?0:200);
      if (!Number.isInteger(status) || !success && (kind==='cli'?status<1 || status>125:status<400 || status>499)) fail('factory_product_trial_invalid');
      if ((success || Object.hasOwn(check,'expected_json')) && (!check.expected_json || Array.isArray(check.expected_json) || typeof check.expected_json!=='object')) fail('factory_product_trial_invalid');
      if (kind==='http' && check.port_variable!==capability.apiPort.variable) {
        throw Object.assign(new Error('The HTTP Trial must use the Contract port variable.'), {code:'factory_product_trial_port_mismatch', expectedPortVariable:capability.apiPort.variable});
      }
      if (kind==='http' && (check.argv.length!==2 || check.argv[1]!=='scripts/server.mjs'
          || !/^\/[A-Za-z0-9/_-]{0,120}$/.test(check.path) || check.path.startsWith('//') || !check.input_json || Array.isArray(check.input_json) || typeof check.input_json!=='object')) fail('factory_product_trial_invalid');
      const signature=canonical(kind==='http'?[check.path,check.input_json]:check.argv);
      if(signatures.has(signature))fail('factory_product_trial_invalid');
      signatures.set(signature,success);
      if(success)outputs.add(canonical(check.expected_json));
    }
    if([...signatures.values()].filter(Boolean).length<2 || outputs.size<2)fail('factory_product_trial_variants_required');
  }
}

const canonical=value=>JSON.stringify(value,(_key,val)=>val && typeof val==='object' && !Array.isArray(val)?Object.fromEntries(Object.keys(val).sort().map(k=>[k,val[k]])):val);
const quote=value=>/^[a-zA-Z0-9_.:/-]+$/.test(value)?value:"'"+value.replaceAll("'","'\"'\"'")+"'";
export function firstUseExamples(trial,data){
  const cli=trial.cli?.find(c=>(c.expected_exit??0)===0),http=trial.http.find(c=>(c.expected_status??200)===200);
  const port=apiProcessPortConfiguration(data);
  return {...(cli?{cli:cli.argv.map(quote).join(' ')}:{}),
    server:port.variable+'='+port.port+' node scripts/server.mjs',
    http:'curl -sS -H '+quote('Content-Type: application/json')+' --data '+quote(JSON.stringify(http.input_json))+' '+quote('http://127.0.0.1:'+port.port+http.path)};
}
export function prepareProductTrial(paths, outcome, data, trial) {
  validateProductTrial(trial, data);
  const checked = validateOutcomeSpecText(outcome.text, { root: paths.root });
  const cases=Object.values(trial).flat();
  const covers=[...new Set(cases.flatMap(c=>c.covers))];
  if(covers.some(id=>!checked.coverage.some(row=>row.id===id)))fail('factory_product_trial_coverage_invalid');
  // A JSON exchange cannot demonstrate process management or the delivery of another interface.
  // Keep such original obligations independent even if a proposed mapping mentions them.
  if(checked.coverage.some(r=>covers.includes(r.id) && /\b(?:start\s*\/\s*stop|managed (?:start|stop|service)|autostart|launchd|telegram|deployment)\b/i.test(r.statement)))fail('factory_product_trial_coverage_invalid');
  const guide=checked.coverage.find(row=>row.statement.replace(/\.$/,'')==='Runnable project with a user guide and verification evidence');
  if(guide && !covers.includes(guide.id))covers.push(guide.id);
  const firstUse=firstUseExamples(trial,data);
  const template = fs.readFileSync(new URL('./scaffold/templates/product-trial.mjs.tmpl', import.meta.url), 'utf8');
  const content = 'const checks = JSON.parse(' + JSON.stringify(JSON.stringify(trial)) + ');\nconst firstUse = '+JSON.stringify(firstUse)+';\n' + template;
  const targets = [...new Set(cases.map(check => check.argv[1]))];
  const trialSection=text=>text.match(/^## Trials\n([\s\S]*?)(?=^## Demo script$)/m)?.[1] || '';
  const blocks=text=>trialSection(text).split(/(?=^### Trial: )/m).map(b=>b.trim()).filter(Boolean);
  const generated=new Set(blocks(renderOutcomeSpecFromContract(data)));
  const keep=blocks(outcome.text).filter(b=>{
    if(b.startsWith('### Trial: product-http-cli\n') && b.includes(' :: '+provenance))return false;
    const ids=[...b.matchAll(/^- Covers: ([^\n]+)/gm)].map(m=>m[1]);
    return !generated.has(b) || !ids.length || !ids.every(id=>covers.includes(id));
  });
  const block = [
    '## Trials', '', '### Trial: product-http-cli', '',
    '- Statement: Each selected interface returns the approved JSON for different inputs, and the first-use commands are documented.',
    '- Kind: automated', ...covers.map(id => '- Covers: ' + id),
    '- Isolation: none', '- When argv: ["node", "' + verifierPath + '"]', '- When cwd: .',
    '- Then exit code: 0', ...targets.map(target => '- Product target: ' + target),
    '- Verifier input: ' + verifierPath + ' :: sha256:' + sha256(content) + ' :: ' + provenance,
    '- Timeout ms: 120000', '', ...keep.map(b=>b+'\n'), '',
  ].join('\n');
  const next = outcome.text.replace(/## Trials\n[\s\S]*?(?=## Demo script)/, ()=>block);
  const validation = validateOutcomeSpecText(next, { root: paths.root });
  if (validation.issues.some(issue => !['OS015', 'OS016'].includes(issue.code))) fail('factory_product_trial_invalid');
  const inputRoot = privateStateDirectory(paths.stateRoot, path.join(paths.directory, 'trial-inputs'));
  const file = privateStateFile(paths.stateRoot, path.join(inputRoot, verifierPath));
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  atomicCompareAndSwapFile(file, previous, content);
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
    if (outcome.frontmatter?.status==='draft' && automated.some(t=>t.verifierInputs?.some(v=>v.provenance==='host-template:api-cli-product-v1'))) fail('factory_product_trial_required');
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
