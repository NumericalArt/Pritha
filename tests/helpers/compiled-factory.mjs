import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {productFactoryFixture,until} from './product-factory.mjs';
import {productTrialVerifier} from '../../scripts/agents-mother/factory-product-trial.mjs';
import {contractData} from '../../scripts/agents-mother/contract.mjs';
import {generatedAgentFiles} from '../../scripts/agents-mother/scaffold/index.mjs';

// Run in a disposable process against the actual production artifact. Loading
// source TypeScript or mocking the HTTP response would miss asset URL rewrites.
const dist=path.resolve(process.argv[2]);
const require=createRequire(import.meta.url);
const chunkRoot=path.join(dist,'server/chunks');
const runtime=require(path.join(chunkRoot,'[turbopack]_runtime.js'))('compiled-factory-regression');
const factories=new Map();
function collect(rows){
  let ids=[];
  for(const row of rows){
    if(Array.isArray(row)){collect(row);continue;}
    if(typeof row==='function'){for(const id of ids)factories.set(id,row);ids=[];}
    else ids.push(row);
  }
}
for(const file of fs.readdirSync(chunkRoot).filter(name=>name.endsWith('.js') && name!=='[turbopack]_runtime.js')){
  collect(require(path.join(chunkRoot,file)));
  runtime.c('server/chunks/'+file);
}
async function compiled(marker,predicate){
  const matches=[];
  for(const [id,factory] of factories)if(factory.toString().includes(marker)){
    const exports=await runtime.m(id).exports;
    for(const value of Object.values(exports))if(typeof value==='function' && predicate(value))matches.push(value);
  }
  assert.equal(new Set(matches).size,1,'Exactly one bundled implementation must match '+marker);
  return matches[0];
}
const FactoryTools=await compiled('factory_child_connection_missing',value=>value.prototype?.validate && value.prototype?.execute && value.prototype?.read);
const review=await compiled('const checks = JSON.parse(',value=>value.length===3 && value.toString().includes('includeInputs'));

for(const [connectorId,model,childProvider,childModel] of [
  ['codex','gpt-6-astra','openai','gpt-4.1-mini'],
  ['claude','claude-sonnet-5-5','claude','claude-haiku-4-5-20251001'],
  ['neuraldeep','kimi-k3.1-pro','neuraldeep','gpt-oss-20b'],
]){
  const f=await productFactoryFixture({connectorId,model,childProvider,childModel,httpOnly:true,slug:'bundled-'+connectorId,name:'Bundled '+connectorId,field:'text',route:'/run',portVariable:'FIXTURE_PORT',cliInput:'first',httpInput:'second',result:text=>({answer:text})},()=>{},{automate:true,factoryToolsClass:FactoryTools});
  try{
    const call=async(action,args)=>{const result=await f.call(action,args);assert.equal(result.error,undefined,JSON.stringify(result));assert.notEqual(result.continuationFailed,true,JSON.stringify(result));return result;};
    const brief=f.brief;
    brief.coreFunctions.push('Health and Stop work without a model connection.', 'A missing model connection produces an explicit service error.', 'Managed Start preserves the model URL, token and port without logging the connection.');
    brief.technical.cliEntrypoint='scripts/server.mjs';
    const product={http:['first','second'].map(text=>({functions:[1],path:'/run',input_json:{text},expected_json:{answer:text+' __PRITHA_MODEL_TEXT__'},model_output:{answer:text+' __PRITHA_MODEL_TEXT__'}}))};
    product.http.push({functions:[1],path:'/run',input_json:{text:'   '},expected_status:400,expected_json:{error:'invalid_text'}});
    const proposal=call('propose',{brief,product,build_token_budget:10000,build_iteration_budget:2});
    const pending=async kind=>{
      await Promise.race([until(()=>f.pending().length===1),proposal.then(result=>assert.fail('Stopped before '+kind+': '+JSON.stringify(result)))]);
      assert.equal(f.pending()[0].presentation.approvalScope,kind+' only');
    };
    await pending('contract');
    assert.equal((await call('scaffold_plan')).capability.supported,true);
    await f.answer();await pending('outcome');
    const trial=f.trial;
    const data=contractData(f.state().contract,{root:f.root});
    // This compiled review regenerates and compares the complete verifier,
    // including its client hashes, against the worker-written file.
    review(f.paths,f.artifact('outcome'),data);
    const proof=JSON.parse(/^const modelProof = (.*);$/m.exec(productTrialVerifier(trial,data))[1]);
    assert.equal(Object.keys(proof.files).length,5);
    assert.equal(new Set(Object.values(proof.files)).size,5,'Each client source must retain its own digest');
    // Scaffolding runs in the source worker; its files must match the hashes
    // enforced by the compiled host, not just another copy of source logic.
    const files=generatedAgentFiles(data);
    for(const [file,digest] of Object.entries(proof.files)){
      const content=files.find(row=>row.path===file)?.content;
      assert.equal(content,fs.readFileSync(path.join(f.root,file),'utf8'),'Scaffold must copy original '+file);
      assert.equal(createHash('sha256').update(content).digest('hex'),digest);
    }
    const before=f.artifact('outcome').sha256;
    await f.answer();await proposal;
    assert.equal(f.reviews[1].presentation.beforeSha256,before,'The original Outcome must reach its approval card without repair');
    const finished=await f.research();
    assert.equal(finished.continuationFailed,false,JSON.stringify(finished));
    assert.deepEqual(finished.continued,['scaffold','deliver','finish']);
    assert.equal(f.state().phase,'awaiting-manual-acceptance');
    assert.equal(f.builds.length,1,'A failed scaffold Trial must start the builder automatically');
    assert.equal(f.reviews.length,2);
    console.log(JSON.stringify({connectorId,compiledOutcomeApproval:true,structuredProposal:true,reviewedOriginalOutcome:true,distinctClientSources:5,scaffoldSourcesMatch:true,lifecycleCoverage:true,httpExamples:3,automaticBuild:true,paidRequests:0}));
  }finally{await f.close();}
}
