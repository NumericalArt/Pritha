import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {verifyNeuralDeepAttachmentTransport} from '../../scripts/neuraldeep/verify-attachment-transport.mjs';
import {readAttachmentTransport} from '../../scripts/neuraldeep/attachment-transport.mjs';
import {attachmentSupport} from '../../scripts/neuraldeep/attachment-policy.mjs';

test('installed Codex preserves original PNG bytes on initial, text resume and image resume without real inference',{timeout:90000},async()=>{
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-image-proof-')),root=fileURLToPath(new URL('../../',import.meta.url)),privateRoot=path.join(stateRoot,'private','neuraldeep');
  mkdirSync(privateRoot,{recursive:true});
  const model={id:'qwen3.8-27b',provider:'neuraldeep',capabilitiesKnown:true,inputModalities:['text','image'],visionAdvertised:true,toolsAdvertised:true},catalog={source:'provider-fixture',refreshedAt:new Date().toISOString()};
  let passed=false;
  try{
    const result=await verifyNeuralDeepAttachmentTransport({root,stateRoot,privateRoot,model,catalog});
    assert.equal(result.verified,true);assert.equal(result.providerRequests,3);assert.equal(result.paidCalls,0);assert.equal(result.processTreesExited,true);
    const transport=readAttachmentTransport({root,stateRoot,privateRoot,cliVersion:result.cliVersion});
    for(const path of ['initial','resume'])assert.equal(attachmentSupport({model,catalog,transport,path}).image,'supported');
    passed=true;
  }finally{if(passed)rmSync(stateRoot,{recursive:true,force:true});}
});
