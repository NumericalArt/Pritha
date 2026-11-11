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
  http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const input=JSON.parse(body);res.setHeader('content-type','application/json');
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
  fs.writeFileSync(path.join(root,'scripts/service-control.mjs'),startCode.replace('env:process.env','env:{FIXTURE_PORT:process.env.FIXTURE_PORT}'));
  const lost=run();assert.notEqual(lost.status,0);assert.match(lost.stderr,/Managed Start must preserve PRITHA_CHILD_MODEL_URL/);
  fs.writeFileSync(path.join(root,'scripts/service-control.mjs'),startCode);
  const fixed=code.replace("JSON.stringify(JSON.parse(result.content[0].text))","JSON.stringify({answer:'one __PRITHA_MODEL_TEXT__'})");
  fs.writeFileSync(path.join(root,'scripts/server.mjs'),fixed);const rejected=run();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/HTTP product JSON differs/);
  const fake=structuredClone(trial);delete fake.http[0].model_output;assert.throws(()=>validateProductTrial(fake,data),{code:'factory_product_trial_model_proof_required'});
});
