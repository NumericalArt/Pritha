import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {productTrialVerifier,firstUseExamples,validateProductTrial} from '../scripts/agents-mother/factory-product-trial.mjs';
import {generatedAgentFiles} from '../scripts/agents-mother/scaffold/index.mjs';

for(const [builder,provider,model] of [['codex','openai','gpt-4.1-mini'],['claude','claude','claude-haiku-4-5-20251001'],['neuraldeep','neuraldeep','qwen3.8-flash']])test(builder+': protected product trial requires the selected child LLM response, never a fixed offline answer',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pritha-llm-product-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const data={text:'',coreFunctions:[],criticalWorkflows:[],agentName:'LLM fixture',runtimeFamily:'api',primaryInterface:'api',secondaryInterfaces:'none',memoryModel:'none',toolSystem:'none',skillNeeds:'none',telegramMode:'none',serviceMode:'process',proactiveMode:'none',autostart:'disabled',envExampleVariables:'FIXTURE_PORT=3041',childModelProvider:provider,childModelId:model,childModelConnection:'pritha',childMaxOutputTokens:'256'};
  const check=(input,extra)=>({argv:['node','scripts/server.mjs'],port_variable:'FIXTURE_PORT',path:'/run',input_json:{text:input},covers:['F001'],...extra});
  const trial={http:[check('first',{expected_json:{answer:'one __PRITHA_MODEL_TEXT__'},model_output:{answer:'one __PRITHA_MODEL_TEXT__'}}),check('second',{expected_json:{answer:'two __PRITHA_MODEL_TEXT__'},model_output:{answer:'two __PRITHA_MODEL_TEXT__'}}),check('',{expected_status:400,expected_json:{error:'invalid_input'}}),check('offline',{expected_status:503,model_error:'provider_unavailable',expected_json:{error:'provider_unavailable'}})]};
  for(const file of generatedAgentFiles(data)){const target=path.join(root,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.content);}
  fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/product.mjs'),productTrialVerifier(trial,data));
  fs.appendFileSync(path.join(root,'README.md'),'\n'+Object.values(firstUseExamples(trial,data)).join('\n'));
  const code=`import http from 'node:http';import {readChildProvider,requestChildModel} from './lib/child-model-client.mjs';
  http.createServer(async(req,res)=>{if(req.url==='/health'){res.end(JSON.stringify({ok:true}));return;}let body='';for await(const part of req)body+=part;const input=JSON.parse(body);res.setHeader('content-type','application/json');
    if(!input.text){res.writeHead(400);res.end(JSON.stringify({error:'invalid_input'}));return;}
    try{const selected=readChildProvider(process.cwd());const result=await requestChildModel(selected.configuration,{system:'Transform the supplied input into JSON.',messages:[{role:'user',content:input.text}],maxTokens:256},selected);res.end(JSON.stringify(JSON.parse(result.content[0].text)));}
    catch(e){res.writeHead(503);res.end(JSON.stringify({error:e.code}));}
  }).listen(Number(process.env.FIXTURE_PORT),'127.0.0.1');`;
  fs.writeFileSync(path.join(root,'scripts/server.mjs'),code);
  const startCode="import {spawn} from 'node:child_process';const child=spawn(process.execPath,['scripts/server.mjs'],{detached:true,stdio:'ignore',env:process.env});child.unref();";
  fs.writeFileSync(path.join(root,'scripts/service-control.mjs'),startCode);
  const run=()=>spawnSync(process.execPath,['verification/product.mjs'],{cwd:root,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,HOME:root,OPENAI_API_KEY:'parent-canary'}});
  const result=run();assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).modelVerification,'protected-local-responder');
  assert.equal(JSON.parse(result.stdout).liveModelVerified,false);
  assert.deepEqual(JSON.parse(result.stdout).hostChecks,['model_connection','managed_start']);
  fs.writeFileSync(path.join(root,'scripts/server.mjs'),code.replace("if(req.url==='/health'){","if(req.url==='/health'){res.writeHead(process.env.PRITHA_CHILD_MODEL_URL?200:503);"));
  const brokenHealth=run();assert.notEqual(brokenHealth.status,0);assert.match(brokenHealth.stderr,/Health must work without a model connection/);
  fs.writeFileSync(path.join(root,'scripts/server.mjs'),code.replace('res.writeHead(503);',"res.writeHead(e.code==='pritha_connection_unavailable'?200:503);"));
  const offlineSuccess=run();assert.notEqual(offlineSuccess.status,0);assert.match(offlineSuccess.stderr,/missing model connection must return an explicit service error/);
  fs.writeFileSync(path.join(root,'scripts/server.mjs'),code);
  fs.writeFileSync(path.join(root,'scripts/service-control.mjs'),startCode.replace('env:process.env','env:{FIXTURE_PORT:process.env.FIXTURE_PORT}'));
  const lost=run();assert.notEqual(lost.status,0);assert.match(lost.stderr,/Managed Start must preserve PRITHA_CHILD_MODEL_URL/);
  fs.writeFileSync(path.join(root,'scripts/service-control.mjs'),startCode);
  const fixed=code.replace("JSON.stringify(JSON.parse(result.content[0].text))","JSON.stringify({answer:'one __PRITHA_MODEL_TEXT__'})");
  fs.writeFileSync(path.join(root,'scripts/server.mjs'),fixed);const rejected=run();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/HTTP product JSON differs/);
  const fake=structuredClone(trial);delete fake.http[0].model_output;assert.throws(()=>validateProductTrial(fake,data),{code:'factory_product_trial_model_proof_required'});
});

test('every rejected product example names the violated rule and the example, without quoting its content',()=>{
  // Observed 2026-11-14: builders repeated the same rejected examples because
  // every rule answered with one generic sentence. Each rule now explains itself.
  const base={text:'',coreFunctions:[],criticalWorkflows:[],agentName:'Rule fixture',runtimeFamily:'api',primaryInterface:'api',secondaryInterfaces:'none',memoryModel:'none',toolSystem:'none',skillNeeds:'none',telegramMode:'none',serviceMode:'process',proactiveMode:'none',autostart:'disabled',envExampleVariables:'FIXTURE_PORT=3041',childModelProvider:'claude',childModelId:'claude-haiku-4-5-20251001',childModelConnection:'pritha',childMaxOutputTokens:'256',outcomeApprovalPolicy:'request-delegated-local-v1'};
  const check=(input,extra)=>({argv:['node','scripts/server.mjs'],port_variable:'FIXTURE_PORT',path:'/run',input_json:{text:input},covers:['F001'],...extra});
  const ok=()=>({http:[check('first',{expected_json:{label:'one'},model_output:{label:'one'}}),check('',{expected_status:400,expected_json:{error:'invalid_input'}})]});
  assert.doesNotThrow(()=>validateProductTrial(ok(),base));
  const SECRET='do-not-echo-this-example-text';
  const rejects=(mutate,code,detail,data=base)=>{
    const trial=ok();mutate(trial);
    try{validateProductTrial(trial,data);assert.fail('expected '+code);}catch(error){
      assert.equal(error.code,code);assert.match(error.detail,detail);assert.ok(!error.detail.includes(SECRET),'detail must not quote example content');
    }
  };
  rejects(t=>{t.extra=[];},'factory_product_trial_invalid',/only http, cli and host_checks/);
  rejects(t=>{delete t.http;},'factory_product_trial_invalid',/at least one http or cli example/);
  rejects(t=>{t.cli=[{argv:['node','scripts/agent-cli.mjs',SECRET],expected_json:{label:'one'},covers:['F001']}];},'factory_product_trial_interfaces',/declares no CLI interface\. Remove the cli examples/);
  rejects(()=>{},'factory_product_trial_interfaces',/declares a CLI interface, so cli examples are required\. For an HTTP-only product set secondaryInterfaces=none/,{...base,secondaryInterfaces:'CLI'});
  rejects(t=>{t.http[1].expected_status=302;},'factory_product_trial_invalid',/^http\[1\]: expected_status is 200 for success or 400–599/);
  rejects(t=>{t.http[0].expected_json=[SECRET];},'factory_product_trial_invalid',/^http\[0\]: expected_json must be a JSON object/);
  rejects(t=>{t.http[0].path='run '+SECRET;},'factory_product_trial_invalid',/^http\[0\]: an http example needs a path such as \/run/);
  rejects(t=>{t.http[0].unknown=SECRET;},'factory_product_trial_invalid',/^http\[0\]: an example is an object with only its documented fields/);
  rejects(t=>{delete t.http[0].model_output;},'factory_product_trial_model_proof_required',/^http\[0\]: a successful example of a model-connected product needs model_output/);
  rejects(t=>{t.http.push(check('offline',{expected_status:503,model_error:'model_unavailable',expected_json:{error:SECRET}}));},'factory_product_trial_invalid',/^http\[2\]: model_error is one of provider_pending_auth, provider_unavailable, provider_rate_limited, provider_timeout/);
  rejects(t=>{t.http[0].model_output=[SECRET];},'factory_product_trial_invalid',/^http\[0\]: model_output must be text or a JSON object/);
  rejects(t=>{t.http.push(structuredClone(t.http[0]));},'factory_product_trial_invalid',/^http\[2\]: this request repeats an earlier example/);
  rejects(t=>{t.http=[t.http[1]];},'factory_product_trial_variants_required',/at least one successful http example/);
  rejects(t=>{t.http=[];},'factory_product_trial_variants_required',/between 1 and 8 http examples/);
});
