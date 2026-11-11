import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import {createProbeCache} from '../scripts/lib/async-probe.mjs';

const source=fs.readFileSync('interfaces/control-center/src/lib/control-center/server.ts','utf8');
const tree=ts.createSourceFile('server.ts',source,ts.ScriptTarget.Latest,true);
const functions=new Set(['controlCenterStatusCacheKey','getControlCenterStatus','getControlCenterAgent','runAgentRuntimeAction']);
const declarations=tree.statements.filter(node=>
  ts.isFunctionDeclaration(node)&&functions.has(node.name?.text) ||
  ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(tree)==='statusReadCache'));
const code=ts.transpileModule(declarations.map(n=>n.getText(tree)).join('\n'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
}).outputText.replace(/^export /gm,'');

function fixture({scoped=false}={}){
  let root='/fixture/main',mode='ok',executions=0,reads=0,issued=0,revoked=0;
  const running=new Map(),audits=[];
  // Freeze cache time: the next read must observe the action without waiting
  // for expiry. Only process execution and host diagnostics are fixtures.
  const context={
    sharedProbeCache:(_name,options)=>createProbeCache({...options,now:()=>0}),
    resolvePrithaRoot:()=>root,
    resolvePrithaStateRoot:r=>r+'/state',
    resolvePrithaAgentParent:r=>r+'/children',
    readControlCenterStatus:async()=>{reads++;return {root,childAgents:[{id:'agent',name:'Fixture',control:{},running:running.get(root)===true}]};},
    selectAgent:(agents,id)=>agents.find(a=>a.id===id)||null,
    buildOperatorActionPlan:()=>({actionEnabled:true,checks:[],confirmation:{requiredPhrase:'confirm'}}),
    operatorActionPhrase:()=> 'confirm',
    blockedOperatorActionResult:()=>({ok:false,status:'pending_confirmation'}),
    operationManifestForAgent:()=>({folder:{absolutePath:root+'/children/agent'},manifest:{}}),
    approvedChildModel:()=>scoped?{configuration:{connection:'pritha'},contractHash:'fixture'}:null,
    APP_PORT:3420,
    issueChildModelConnection:()=>{issued++;return {PRITHA_CHILD_MODEL_URL:'http://127.0.0.1:3420/api/child-model',PRITHA_CHILD_MODEL_TOKEN:'synthetic'};},
    revokeChildModelConnection:()=>{revoked++;},
    validateStructuredOperationsCommand:()=>({ok:true,command:{argv:['fixture']},env:{FIXTURE_PORT:'3441'},warnings:[]}),
    executeStructuredAgentCommand:async({action})=>{
      executions++;running.set(root,action==='start');
      if(mode==='throw')throw Error('fixture execution error');
      return {status:mode==='failed'?'failed':action==='start'?'running':'stopped',exitCode:mode==='failed'?1:0,readiness:{status:action==='start'?'ok':'failed'}};
    },
    countChecks:()=>({passed:0,warnings:0,failed:0}),
    operatorActionAuditLogRelativePath:()=> 'fixture-audit',
    auditEntryId:()=> 'fixture-action',
    appendManualCheckAudit:(_status,result)=>audits.push(result),
  };
  const api=new Function(...Object.keys(context),code+'\nreturn {getControlCenterStatus,runAgentRuntimeAction};')(...Object.values(context));
  return {...api,setRoot:r=>{root=r;},setMode:m=>{mode=m;},stats:()=>({reads,executions,issued,revoked,audits:audits.length})};
}

test('the first catalog read after Start and Stop observes the completed action',async()=>{
  const f=fixture();
  assert.equal((await f.getControlCenterStatus()).childAgents[0].running,false);
  for(const action of ['start','stop']){
    assert.equal((await f.runAgentRuntimeAction('agent',action,'confirm')).ok,true);
    const current=await f.getControlCenterStatus();
    assert.equal(current.childAgents[0].running,action==='start');
    assert.equal(await f.getControlCenterStatus(),current,'ordinary reads retain the warm cache');
  }
  assert.equal(f.stats().executions,2);
});

test('runtime mutation invalidates only its own instance status',async()=>{
  const f=fixture();f.setRoot('/fixture/other');const other=await f.getControlCenterStatus();
  f.setRoot('/fixture/main');await f.runAgentRuntimeAction('agent','start','confirm');
  assert.equal((await f.getControlCenterStatus()).childAgents[0].running,true);
  const before=f.stats().reads;f.setRoot('/fixture/other');
  assert.equal(await f.getControlCenterStatus(),other);assert.equal(f.stats().reads,before);
});

test('a failed runtime command still refreshes observed service state',async()=>{
  const f=fixture();f.setMode('failed');
  assert.equal((await f.runAgentRuntimeAction('agent','start','confirm')).ok,false);
  assert.equal((await f.getControlCenterStatus()).childAgents[0].running,true);
});

test('an unexpected execution error cannot retain the pre-action snapshot',async()=>{
  const f=fixture();f.setMode('throw');
  await assert.rejects(f.runAgentRuntimeAction('agent','start','confirm'),/fixture execution error/);
  assert.equal((await f.getControlCenterStatus()).childAgents[0].running,true);
});

test('a rejected confirmation neither runs the command nor discards its fresh diagnostic',async()=>{
  const f=fixture();assert.equal((await f.runAgentRuntimeAction('agent','start','wrong')).ok,false);
  const before=f.stats().reads,current=await f.getControlCenterStatus();
  assert.equal(current.childAgents[0].running,false);assert.equal(f.stats().executions,0);
  assert.equal(f.stats().reads,before);
});

test('failed Start, thrown execution and Stop revoke the scoped model connection',async()=>{
  for(const mode of ['failed','throw']){
    const f=fixture({scoped:true});f.setMode(mode);
    if(mode==='throw')await assert.rejects(f.runAgentRuntimeAction('agent','start','confirm'),/fixture execution error/);
    else assert.equal((await f.runAgentRuntimeAction('agent','start','confirm')).ok,false);
    assert.equal(f.stats().issued,1);assert.equal(f.stats().revoked,1);
  }
  const f=fixture({scoped:true});await f.runAgentRuntimeAction('agent','stop','confirm');
  assert.equal(f.stats().issued,0);assert.equal(f.stats().revoked,1);
});
