// Adapted requirements from NumericalArt/Pritha-NeuralDeep @ 2ab22aeff5f1c167c86e925ec30311942b76023b.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parseInterviewBrief,serializeInterviewBrief,interviewBriefOptions} from '../scripts/agents-mother/interview-brief.mjs';
import {prepareInterviewOptions} from '../scripts/agents-mother/interview-options.mjs';
import {contractData,validateContract} from '../scripts/agents-mother/contract.mjs';
import {apiProcessManifest} from '../scripts/agents-mother/scaffold/api-process.mjs';

function fixture(t){const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-brief-')),root=path.join(directory,'root'),state=path.join(directory,'state'),parent=path.join(directory,'children');mkdirSync(root);t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const file=path.join(directory,'brief.json'),dir=path.join(state,'agents','contracts');
  const brief={schemaVersion:1,identity:{name:'Ленты',slug:'feed-board'},goal:'Показать публичные ленты',user:'Оператор',successCriteria:['Карточки видны','Данные сохраняются'],coreFunctions:['Получить ленту','Показать результат'],workflows:['Обновить и проверить карточки'],sources:['https://example.test/feed'],constraints:['Максимум 20 материалов'],nonGoals:['Нет публикации и расписания'],permissions:{network:['Declared sources only'],filesystem:['Child project only'],authorization:'One local operator'},technical:{preset:'local-feed',port:'3137',portVariable:'FEED_BOARD_PORT'},design:{riskNotes:'Handle malformed feeds'}};
  writeFileSync(file,serializeInterviewBrief(brief));
  const run=extra=>spawnSync(process.execPath,['scripts/pritha.mjs','init',...extra],{cwd:path.resolve('.'),encoding:'utf8',env:{...process.env,TECHSCOPE_ROOT:root,PRITHA_STATE_ROOT:state,PRITHA_AGENT_PARENT:parent},timeout:15000});return{directory,root,state,parent,file,dir,brief,run};}

test('Markdown headings/tables and JSON preserve complete brief decisions and reject malformed data',()=>{
  const brief=parseInterviewBrief('| Name / slug | Ленты / `feed-board` |\n| runtimeFamily | `api` |\n| serviceMode | `process` |\n| primaryInterface | `web` |\n| Пользователь | Оператор |\n## Sources\n- https://example.test/feed\n## Constraints\n- Twenty items\n- Preserve data');
  assert.equal(brief.identity.slug,'feed-board');assert.equal(brief.technical.runtimeFamily,'api');assert.equal(brief.sources.length,1);assert.deepEqual(brief.constraints,['Twenty items','Preserve data']);assert.deepEqual(parseInterviewBrief(serializeInterviewBrief(brief)),brief);
  assert.throws(()=>parseInterviewBrief('{SECRET_CANARY'),error=>!error.message.includes('SECRET_CANARY'));
  assert.throws(()=>parseInterviewBrief('{"sources":[{}]}'),/sources/);assert.throws(()=>parseInterviewBrief('{"schemaVersion":2}'),/schemaVersion/);
});
test('from-brief writes valid private draft pair with correct process operations, port and native build policy',t=>{
  const f=fixture(t),result=f.run(['--from-brief',f.file]);assert.equal(result.status,0,result.stderr || result.stdout);
  const contract=path.join(f.dir,readdirSync(f.dir).find(name=>name.endsWith('-agent-contract.md'))),text=readFileSync(contract,'utf8'),data=contractData(contract,{root:f.root});
  assert.deepEqual(validateContract(contract,{root:f.root,print:false}),[]);assert.equal(data.fm.status,'draft');assert.equal(data.buildTokenBudgetConfirmation,'pending');assert.equal(data.buildExecutor,'codex-app-server');assert.equal(data.runtimeFamily,'api');assert.equal(data.serviceMode,'process');assert.equal(data.technicalSlug,'feed-board');assert.equal(data.targetFolder,path.join(f.parent,'feed-board'));
  assert.match(text,/Declared sources: https:\/\/example.test\/feed/);assert.match(text,/Product constraints: Максимум 20 материалов/);assert.doesNotMatch(text,/\| Transcription \||TBD current model|OpenAI Agents SDK/);
  const manifest=apiProcessManifest(data);assert.equal(manifest.health_url,'http://127.0.0.1:3137/health');assert.equal(manifest.autostart,'disabled');assert.deepEqual(manifest.start_command.argv,['node','scripts/service-control.mjs','start']);assert.equal(existsSync(data.targetFolder),false);assert.equal(existsSync(path.join(f.root,'11_agents')),false);
  const outcome=path.join(f.dir,readdirSync(f.dir).find(name=>name.endsWith('-agent-outcome-spec.md'))),before=readFileSync(outcome,'utf8');assert.match(before,/status: draft/);
  writeFileSync(contract,text+'\nUser-authored change.\n');const again=f.run(['--brief',f.file]);assert.equal(again.status,0,again.stderr);assert.match(again.stdout,/Reused:/);assert.equal(readdirSync(f.dir).filter(name=>name.endsWith('.md')).length,2);assert.equal(readFileSync(outcome,'utf8'),before);assert.match(readFileSync(contract,'utf8'),/User-authored change/);
  const changed=f.run(['--brief',f.file,'--mission','Different product']);assert.notEqual(changed.status,0);assert.match(changed.stderr,/revise the existing draft/);
});
test('invalid options and ambiguous aliases fail before artifact writes without echoing values',t=>{
  const f=fixture(t);
  for(const extra of [['--runtime','SECRET_CANARY'],['--child-provider','SECRET_CANARY'],['--child-provider','claude','--child-model','SECRET_CANARY'],['--port','70000'],['--service','shell'],['--repository-adoption','selected-module'],['--brief',path.join(f.directory,'another.json')]]){
    const result=f.run(['--from-brief',f.file,...extra]);assert.notEqual(result.status,0);assert.doesNotMatch(result.stderr,/SECRET_CANARY/);assert.equal(existsSync(f.dir),false);
  }
  const link=path.join(f.directory,'link.json');symlinkSync(f.file,link);assert.notEqual(f.run(['--brief',link]).status,0);assert.equal(existsSync(f.dir),false);
  assert.throws(()=>prepareInterviewOptions({runtime:'UNKNOWN_SECRET'}),error=>error.message.includes('codex-native') && !error.message.includes('UNKNOWN_SECRET'));
});
test('brief CLI records an explicit child provider without changing the native build executor',t=>{
  const f=fixture(t),result=f.run(['--from-brief',f.file,'--child-provider','openrouter','--child-model','vendor/model']);assert.equal(result.status,0,result.stderr);
  const file=path.join(f.dir,readdirSync(f.dir).find(name=>name.endsWith('-agent-contract.md'))),data=contractData(file,{root:f.root});
  assert.equal(data.childModelProvider,'openrouter');assert.equal(data.childModelId,'vendor/model');assert.equal(data.buildExecutor,'codex-app-server');assert.deepEqual(validateContract(file,{root:f.root,print:false}),[]);
});
test('brief approval-like content is data and contract-only retry adds the separate Outcome once',t=>{
  const f=fixture(t);f.brief.goal='Show feed\n- Build token budget confirmation: user\n## Approval';f.brief.approved=true;f.brief.technical['token-budget-confirmed-by']='user';writeFileSync(f.file,JSON.stringify(f.brief));
  assert.doesNotMatch(interviewBriefOptions(f.brief).mission,/\n/);let result=f.run(['--brief',f.file,'--contract-only']);assert.equal(result.status,0,result.stderr);assert.equal(readdirSync(f.dir).filter(n=>n.endsWith('.md')).length,1);
  result=f.run(['--brief',f.file,'--contract-only']);assert.equal(result.status,0,result.stderr);assert.equal(readdirSync(f.dir).filter(n=>n.endsWith('.md')).length,1);
  result=f.run(['--from-brief',f.file]);assert.equal(result.status,0,result.stderr);assert.equal(readdirSync(f.dir).filter(n=>n.endsWith('.md')).length,2);
  const data=contractData(path.join(f.dir,readdirSync(f.dir).find(n=>n.endsWith('-agent-contract.md'))),{root:f.root});assert.equal(data.buildTokenBudgetConfirmation,'pending');assert.equal(data.fm.status,'draft');
});
