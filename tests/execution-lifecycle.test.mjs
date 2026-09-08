import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
import { drainExecutions,executionBuildCompatible,executionDirectory,executionLifecycleStatus } from '../scripts/lib/execution-lifecycle.mjs';
test('read-only lifecycle status creates nothing; the first execution fences incompatible rollback builds',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-execution-lifecycle-')),state=path.join(root,'state');
  let db;
  try {
    assert.equal(executionLifecycleStatus(root,state).exists,false);assert.equal(existsSync(state),false);
    db=new ExecutionCoordinator({stateRoot:state,directory:executionDirectory(root,state)});
    assert.equal(executionBuildCompatible(root,state),true);
    const active=db.claim(['native:a'],'owner');assert.equal(executionBuildCompatible(root,state),false);
    const dist=path.join(root,'interfaces/control-center/.next');mkdirSync(dist,{recursive:true});
    writeFileSync(path.join(dist,'BUILD_ID'),'build-a');writeFileSync(path.join(dist,'pritha-execution-protocol.json'),JSON.stringify({version:1,buildId:'build-a'}));
    assert.equal(executionBuildCompatible(root,state),true);
    assert.equal(drainExecutions(root,state).active,1);assert.equal(db.admission().enabled,false);
    assert.throws(()=>db.claim(['native:b'],'second'),{code:'execution_draining'});active.assertOwned();active.release();
    assert.equal(executionLifecycleStatus(root,state).active,0);
    writeFileSync(path.join(dist,'BUILD_ID'),'old-build');assert.equal(executionBuildCompatible(root,state),false);
    assert.equal(executionLifecycleStatus(root,state).floor,1);
  }finally{db?.close();rmSync(root,{recursive:true,force:true});}
});
test('drain preserves existing workflow progress and a reduced limit never kills current turns',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-execution-lifecycle-')),db=new ExecutionCoordinator({stateRoot:root});
  try {
    const workflow=db.claim(['workflow'],'voice',{kind:'voice-workflow'});
    db.reserveIntent('voice-workflow:voice','hash',{kind:'voice-workflow'});db.updateIntent('voice-workflow:voice',{state:'running'});
    const a=db.claim(['a'],'a',{capacity:3}),b=db.claim(['b'],'b',{capacity:3});
    db.setAdmission(true,1);a.assertOwned();b.assertOwned();assert.equal(db.claim(['c'],'c',{capacity:db.admission().capacity}),null);
    a.release();b.release();db.setAdmission(false,3);
    const phase=db.claim(['voice-phase'],'voice-phase',{kind:'turn',capacity:3,detail:{taskId:'voice'}});assert.ok(phase);
    assert.throws(()=>db.claim(['new-workflow'],'new',{kind:'voice-workflow'}),{code:'execution_draining'});
    phase.release();workflow.release();
  }finally{db.close();rmSync(root,{recursive:true,force:true});}
});
