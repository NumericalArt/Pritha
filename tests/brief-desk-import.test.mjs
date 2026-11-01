import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {installBriefDesk,briefDeskPlan} from '../scripts/install-brief-desk.mjs';
import {readAgentCatalog} from '../scripts/agents-mother/identity.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(t){const base=fs.mkdtempSync(path.join(os.tmpdir(),'pritha-example-import-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));return {root,stateRoot:path.join(base,'state'),agentParent:path.join(base,'children'),env:{}};}
test('read-only plan; import is private, empty, discoverable and idempotent across two instances',t=>{
  const first=fixture(t),second=fixture(t);const plan=installBriefDesk({...first,plan:true});
  assert.equal(plan.status,'planned');assert.equal(fs.existsSync(first.stateRoot),false);assert.equal(fs.existsSync(first.agentParent),false);
  const installed=installBriefDesk(first);assert.equal(installed.status,'installed');
  for(const name of ['.git','.env','.env.local','.data','node_modules'])assert.equal(fs.existsSync(path.join(installed.target,name)),false);
  const details=briefDeskPlan(first);for(const file of Object.values(details.artifactPaths)){const text=fs.readFileSync(file,'utf8');assert.match(text,/privacy: local-private/);assert.match(text,/status: draft/);assert.doesNotMatch(text,/\{\{/);assert.equal(fs.statSync(file).mode&0o777,0o600);}
  const modified=path.join(installed.target,'README.md');fs.writeFileSync(modified,'operator edit');
  fs.writeFileSync(path.join(installed.target,'.env.local'),'NEURALDEEP_API_KEY=fixture-own-key');
  assert.equal(installBriefDesk(first).status,'already-installed');assert.equal(fs.readFileSync(modified,'utf8'),'operator edit');
  const other=installBriefDesk(second);assert.notEqual(other.target,installed.target);assert.equal(fs.existsSync(path.join(other.target,'.env.local')),false);
  const a=readAgentCatalog({...first,fresh:true}),b=readAgentCatalog({...second,fresh:true});
  const serialized=JSON.stringify(a);assert.ok(serialized.includes(installed.target));assert.ok(!serialized.includes(other.target));assert.ok(JSON.stringify(b).includes(other.target));
});
test('existing projects and linked private directories are never overwritten',t=>{
  const options=fixture(t),target=path.join(options.agentParent,'brief-desk-nd');fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'keep'),'original');
  assert.throws(()=>installBriefDesk(options),/brief_desk_target_exists/);assert.equal(fs.readFileSync(path.join(target,'keep'),'utf8'),'original');
  const linked=fixture(t);fs.mkdirSync(path.join(linked.stateRoot,'agents'),{recursive:true});fs.mkdirSync(linked.agentParent);fs.symlinkSync(linked.agentParent,path.join(linked.stateRoot,'agents','contracts'));
  assert.throws(()=>installBriefDesk(linked));assert.equal(fs.existsSync(path.join(linked.agentParent,'brief-desk-nd')),false);
});
test('interrupted import and changed identity require recovery without modifying user files',t=>{
  const options=fixture(t);const installed=installBriefDesk(options),plan=briefDeskPlan(options);
  const receipt=JSON.parse(fs.readFileSync(plan.receipt));fs.writeFileSync(plan.receipt,JSON.stringify({...receipt,status:'prepared'}));
  assert.throws(()=>installBriefDesk(options),/brief_desk_import_recovery_required/);
  fs.writeFileSync(plan.receipt,JSON.stringify(receipt));fs.writeFileSync(path.join(installed.target,'.pritha-bundled-example.json'),JSON.stringify({installId:'other'}));
  assert.throws(()=>installBriefDesk(options),/brief_desk_import_identity_changed/);
});

test('import CLI reads this checkout’s configured instance paths before planning or writing',t=>{
  const f=fixture(t),source=path.join(path.dirname(f.stateRoot),'source');fs.mkdirSync(path.join(source,'03_reviews'),{recursive:true});
  fs.cpSync(path.join(root,'examples/brief-desk-nd'),path.join(source,'examples/brief-desk-nd'),{recursive:true});
  fs.copyFileSync(path.join(root,'03_reviews/2026-11-01-brief-desk-adoption.json'),path.join(source,'03_reviews/2026-11-01-brief-desk-adoption.json'));
  fs.writeFileSync(path.join(source,'.env.local'),`PRITHA_STATE_ROOT=${f.stateRoot}\nPRITHA_AGENT_PARENT=${f.agentParent}\n`);
  const env={PATH:process.env.PATH,HOME:os.tmpdir(),PRITHA_ROOT:source};
  for(const action of ['--plan','--install']){
    const result=spawnSync(process.execPath,[path.join(root,'scripts/install-brief-desk.mjs'),action],{cwd:source,env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);const payload=JSON.parse(result.stdout);
    assert.equal(payload.target,path.join(fs.realpathSync(path.dirname(f.stateRoot)),'children/brief-desk-nd'));
    if(action==='--plan'){assert.equal(fs.existsSync(f.stateRoot),false);assert.ok(payload.artifacts.every(file=>file.startsWith(path.join(fs.realpathSync(path.dirname(f.stateRoot)),'state/agents')+path.sep)));}
  }
  assert.equal(fs.existsSync(path.join(source,'.private')),false);
});
