import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderThreadRouting } from '../scripts/lib/provider-thread-routing.mjs';

test('creation receipts retain provider/model after a lost response, worker reload and default change', () => {
  const stateRoot=mkdtempSync(path.join(tmpdir(),'pritha-route-'));
  const options={stateRoot,directory:path.join(stateRoot,'routes')};
  const first=new ProviderThreadRouting(options),second=new ProviderThreadRouting(options);
  try {
    const request={clientThreadId:'first-request-123'};
    assert.deepEqual(first.resolve(request,()=>({connectorId:'neuraldeep',modelId:'original-model'})),{connectorId:'neuraldeep',modelId:'original-model'});
    first.close();
    assert.deepEqual(second.resolve(request,()=>{throw new Error('A changed default must never be consulted');}),{connectorId:'neuraldeep',modelId:'original-model'});
    assert.throws(()=>second.resolve({...request,connectorId:'claude'},()=>{}),{code:'runtime_identity_mismatch'});
    assert.throws(()=>second.resolve({...request,modelId:'changed-model'},()=>{}),{code:'runtime_identity_mismatch'});
    const another=second.resolve({clientThreadId:'different-request'},()=>({connectorId:'claude',modelId:'claude-model'}));
    assert.equal(another.connectorId,'claude');
    assert.equal(second.execution.listIntents({kind:'provider-create-route'}).length,2);
  } finally {first.close();second.close();rmSync(stateRoot,{recursive:true,force:true});}
});

test('competing first reservations use the committed route and separate instances stay separate', () => {
  const stateRoot=mkdtempSync(path.join(tmpdir(),'pritha-route-'));
  const options={stateRoot,directory:path.join(stateRoot,'routes')};
  const first=new ProviderThreadRouting(options),second=new ProviderThreadRouting(options),other=new ProviderThreadRouting({stateRoot,directory:path.join(stateRoot,'other-instance')});
  const request={clientThreadId:'shared-request-123'};
  try {
    const result=first.resolve(request,()=>{
      second.resolve(request,()=>({connectorId:'local',modelId:'local-model'}));
      return {connectorId:'openrouter',modelId:'remote-model'};
    });
    assert.deepEqual(result,{connectorId:'local',modelId:'local-model'});
    assert.equal(other.resolve(request,()=>({connectorId:'claude',modelId:'other'})).connectorId,'claude');
    for(const connectorId of [null,'unknown','CODEX'])assert.throws(()=>first.resolve({...request,connectorId},()=>{}),{code:'provider_profile_invalid'});
    assert.throws(()=>first.resolve({...request,modelId:'../secret\n'},()=>{}),{code:'provider_model_invalid'});
    assert.throws(()=>first.resolve({clientThreadId:'short'},()=>{}),{code:'invalid_client_thread_id'});
  } finally {first.close();second.close();other.close();rmSync(stateRoot,{recursive:true,force:true});}
});
