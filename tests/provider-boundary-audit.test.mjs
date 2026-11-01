import test from 'node:test';
import assert from 'node:assert/strict';
import {providerBoundaryAuditPlan,runProviderBoundaryAudit} from '../scripts/lib/provider-boundary-audit.mjs';
test('audits select explicit offline evidence without interpreting provider names or reading credentials',()=>{
  for(const connector of ['neuraldeep','claude','openrouter','local','all']){
    const plan=runProviderBoundaryAudit({kind:'network',connector,plan:true});
    assert.equal(plan.status,'planned');assert.equal(plan.liveProviderCalls,'not-performed');assert.equal(plan.liveCredentialScan,'not-performed');
    assert(plan.files.includes('tests/provider-sandbox.test.mjs'));assert.equal(new Set(plan.files).size,plan.files.length);
    if(connector==='all'||connector==='local')assert(plan.files.includes('tests/owned-local-server.test.mjs'));
  }
  for(const connector of ['__proto__','constructor','codex','../private','NEVER_ECHO_SECRET'])assert.throws(()=>providerBoundaryAuditPlan({kind:'network',connector}),/^Error: provider_boundary_audit_selection_invalid$/);
  assert.throws(()=>providerBoundaryAuditPlan({kind:'__proto__'}));
});
