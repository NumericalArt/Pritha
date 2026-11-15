import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';

// Run the production readiness decision itself. Only the host probes it calls
// (launchd, screen) are fixtures; no service or network is involved.
const source=fs.readFileSync('interfaces/control-center/src/lib/control-center/server.ts','utf8');
const tree=ts.createSourceFile('server.ts',source,ts.ScriptTarget.Latest,true);
const names=['operationalRuntimeManager','classifyCommandReadiness','operationalReadiness'];
const code=ts.transpileModule(names.map(name=>{
  const node=tree.statements.find(item=>ts.isFunctionDeclaration(item) && item.name?.text===name);
  assert.ok(node,'Missing production function '+name);
  return node.getText(tree);
}).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {operationalReadiness}=new Function('launchdRuntimeState','screenSessionRunning',code+'\nreturn {operationalReadiness};')(async()=>null,async()=>false);

const command=action=>({argv:['node','scripts/service-control.mjs',action],cwd:'.',control_center_managed:true});
const managed=(extra={})=>({
  version:1,service_mode:'process',control_center_managed:true,outcome_status:'verified',
  control_center_contract:{version:1,status:'ready',required:true},
  control_center_runtime:{manager:'detached-node-process'},
  start_command:command('start'),stop_command:command('stop'),
  health_url:'http://127.0.0.1:3187/health',local_upstream_url:'http://127.0.0.1:3187',...extra,
});
const failed={status:'failed',checkedUrl:'http://127.0.0.1:3187/health',detail:'Local endpoint did not respond'};
const readiness=(manifest,health=failed)=>operationalReadiness({
  folderPresent:true,manifest,operations:'ready',health,localUrl:manifest.local_upstream_url,access:{},
});

test('a service Pritha can start is reported as stopped, not blocked, when it is not running',async()=>{
  const result=await readiness(managed());
  assert.equal(result.status,'stopped');
  assert.match(result.summary,/not running/);
  assert.deepEqual(result.blockers,[]);
  assert.equal((await readiness(managed(),{status:'ok',checkedUrl:failed.checkedUrl,detail:'HTTP 200'})).status,'local_ready');
});

test('a runtime the Control Center cannot start stays blocked with a readable reason',async()=>{
  for(const manifest of [
    managed({control_center_managed:false}),
    managed({start_command:'npm start'}),
    managed({start_command:{argv:['node','scripts/server.mjs']}}),
  ]){
    const result=await readiness(manifest);
    assert.equal(result.status,'blocked');
    assert.match(result.summary,/did not respond: http:\/\/127\.0\.0\.1:3187\/health/);
  }
});

test('a scaffold is not presented as a stopped service that can be started',async()=>{
  for(const manifest of [managed({outcome_status:'implementation-required'}),managed({control_center_contract:{version:1,status:'implementation-required',required:true}})]){
    const result=await readiness(manifest);
    assert.equal(result.status,'blocked');
    assert.match(result.summary,/scaffold/);
  }
});
