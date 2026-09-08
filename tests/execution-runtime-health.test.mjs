import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ExecutionCoordinator, executionRuntimeReady } from '../scripts/lib/execution-coordinator.mjs';

test('SQLite readiness uses the same native loader as execution and creates no state', () => {
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-execution-health-'));
  const original=process.getBuiltinModule;
  try {
    assert.equal(executionRuntimeReady(),true);
    assert.deepEqual(readdirSync(root),[]);
    process.getBuiltinModule=()=>undefined;
    assert.equal(executionRuntimeReady(),false);
    assert.throws(()=>new ExecutionCoordinator({stateRoot:root}),{code:'execution_runtime_unsupported'});
    assert.deepEqual(readdirSync(root),[]);
  } finally {process.getBuiltinModule=original;rmSync(root,{recursive:true,force:true});}
});
