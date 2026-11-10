import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';

const source=fs.readFileSync('interfaces/control-center/src/lib/control-center/server.ts','utf8');
const tree=ts.createSourceFile('server.ts',source,ts.ScriptTarget.Latest,true);
const names=['classifyRuntime','controlOwnership','buildAgentControl'];
const code=names.map(name=>tree.statements.find(n=>ts.isFunctionDeclaration(n) && n.name?.text===name).getText(tree)).join('\n');
const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const build=new Function('isExternalDeployment','hasAgentHarness','hasScheduledWork','classifyCommandReadiness',compiled+'\nreturn buildAgentControl;')(()=>false,()=>false,()=>false,()=> 'structured_executable');

test('scaffold manifest cannot expose executable Start even with a real folder and structured commands',()=>{
  for(const status of [{outcome_status:'implementation-required'},{control_center_contract:{status:'implementation-required'}}]){
    const control=build({interface:'web'},{absolutePath:'/fixture'},{local_upstream_url:'http://127.0.0.1:3000',control_center_managed:true,...status},{},'alive','inactive',{});
    assert.equal(control.runtimeKind,'scaffold');assert.equal(control.ownership,'none');
    assert.notEqual(control.executionMode,'executable');assert.equal(control.label,'Подготовка агента');
    assert.match(control.reason,/каркас/);
  }
  const ready=build({interface:'web'},{absolutePath:'/fixture'},{local_upstream_url:'http://127.0.0.1:3000',control_center_managed:true,outcome_status:'implemented'},{},'alive','inactive',{});
  assert.equal(ready.runtimeKind,'web_service');assert.equal(ready.executionMode,'executable');
});
