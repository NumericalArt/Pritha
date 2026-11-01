import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,linkSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {childProviderConfiguration,readChildProvider,requestChildModel} from '../scripts/lib/child-model-client.mjs';
import {generatedAgentFiles} from '../scripts/agents-mother/scaffold/index.mjs';
import {deriveExternalResearchTopics} from '../scripts/agents-mother/external-research-topics.mjs';
import {contractData,validateContract} from '../scripts/agents-mother/contract.mjs';
import {childCredentialConfiguration} from '../scripts/lib/child-provider-configuration.mjs';

const selection=provider=>({childModelProvider:provider,childModelId:provider==='claude'?'claude-sonnet-5-5':provider==='neuraldeep'?'qwen3.8-27b-noreason':'vendor/model'});
const base={text:'',coreFunctions:[],criticalWorkflows:[],agentName:'Provider fixture',runtimeFamily:'cli',primaryInterface:'CLI',memoryModel:'none',toolSystem:'none',skillNeeds:'none',telegramMode:'none',serviceMode:'none',proactiveMode:'none',autostart:'disabled'};
function temporary(t){const root=mkdtempSync(path.join(os.tmpdir(),'pritha-child-provider-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
const reply=(config,patch={})=>config.connectorId==='claude'?{id:'msg_fixture',model:config.modelId,content:[{type:'text',text:'fixture answer'}],stop_reason:'end_turn',usage:{input_tokens:20,output_tokens:10},...patch}:{id:'fixture',model:config.modelId,choices:[{message:{role:'assistant',content:'fixture answer'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30},...patch};

for(const provider of ['claude','neuraldeep','openrouter'])test(provider+': selected scaffold runs its own API client and never inherits parent auth',async t=>{
  const root=temporary(t),config=childProviderConfiguration(selection(provider)),files=generatedAgentFiles({...base,...selection(provider)});
  for(const file of files){const target=path.join(root,file.path);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,file.content);assert.doesNotMatch(file.content,/PARENT_CANARY/);}
  const manifest=JSON.parse(files.find(file=>file.path==='operations/manifest.json').content);
  const binding=childCredentialConfiguration(manifest.credentials[0]);assert.equal(binding.status,'selected');assert.equal(binding.assignments[config.keyName.replace('_API_KEY','_BASE_URL')],config.baseUrl);
  assert.equal(manifest.credentials[0].storage_target,'.env.local');assert.match(manifest.credentials[0].note,new RegExp(config.modelId));
  const exec=argv=>spawnSync(process.execPath,argv,{cwd:root,encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,HOME:root,[config.keyName]:'PARENT_CANARY'}});
  const pending=exec(['scripts/provider-pilot.mjs','status']);assert.equal(pending.status,78);assert.match(pending.stderr,/provider_pending_auth/);assert.doesNotMatch(pending.stderr,/PARENT_CANARY/);
  writeFileSync(path.join(root,'.env.local'),config.keyName+'=child-fixture-key\n'+Object.entries(binding.assignments).map(([name,value])=>name+'='+value+'\n').join(''),{mode:0o600});
  const status=exec(['scripts/provider-pilot.mjs','status']);assert.equal(status.status,0,status.stderr);assert.equal(JSON.parse(status.stdout).status,'configured-unverified');assert.doesNotMatch(status.stdout,/child-fixture-key/);
  assert.equal(exec(['scripts/provider-pilot.mjs','request']).status,78);
  const client=await import(pathToFileURL(path.join(root,'scripts/lib/child-model-client.mjs'))),local=client.readChildProvider(root);let requests=0;
  const result=await client.requestChildModel(local.configuration,{messages:[{role:'user',content:'synthetic prompt'}],maxTokens:512},{apiKey:local.apiKey,fetchImpl:async(url,options)=>{
    requests++;assert.equal(url,config.baseUrl+(provider==='claude'?'/messages':'/chat/completions'));assert.equal(options.headers.authorization,'Bearer child-fixture-key');assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body);assert.equal(body.model,config.modelId);assert.equal(body.max_tokens,512);assert.equal(body.stream,false);assert.ok(!body.tools && !body.plugins && !body.models);
    if(provider==='openrouter')assert.deepEqual(body.provider,{allow_fallbacks:false});return Response.json(reply(config));
  }});
  assert.equal(result.content[0].text,'fixture answer');assert.equal(result.usage.totalTokens,30);assert.equal(requests,1);
  assert.ok(deriveExternalResearchTopics({...base,...selection(provider)}).some(topic=>topic.id===({claude:'anthropic-messages-api',neuraldeep:'neuraldeep-model-api',openrouter:'openrouter-model-api'}[provider])));
});

test('child secret reader rejects duplicate keys, links, oversized stores and endpoint changes',t=>{
  const root=temporary(t),config=childProviderConfiguration(selection('openrouter'));mkdirSync(path.join(root,'runtime'));
  const cfg=path.join(root,'runtime/provider.json'),file=path.join(root,'.env.local'),outside=path.join(root,'outside');writeFileSync(cfg,JSON.stringify(config));writeFileSync(outside,'OPENROUTER_API_KEY=outside-secret');
  for(const kind of ['symlink','hardlink','duplicate','large']){
    if(kind==='symlink')symlinkSync(outside,file);else if(kind==='hardlink')linkSync(outside,file);else writeFileSync(file,kind==='duplicate'?'OPENROUTER_API_KEY=a\nOPENROUTER_API_KEY=b':'x'.repeat(32001));
    assert.throws(()=>readChildProvider(root));rmSync(file);
  }
  writeFileSync(file,'OPENROUTER_API_KEY=child-fixture-key');writeFileSync(cfg,JSON.stringify({...config,baseUrl:'https://other.invalid'}));assert.throws(()=>readChildProvider(root),{code:'child_provider_configuration_invalid'});
  writeFileSync(cfg,JSON.stringify(config));writeFileSync(file,'OPENROUTER_API_KEY=child-fixture-key\nOPENROUTER_BASE_URL=https://other.invalid');assert.throws(()=>readChildProvider(root),{code:'child_provider_configuration_invalid'});
  assert.throws(()=>childCredentialConfiguration({name:'OPENROUTER_API_KEY',provider:'openrouter',provider_configuration:{model_id:'vendor/model',base_url:'https://other.invalid'}}),{code:'child_provider_configuration_invalid'});
});

for(const provider of ['claude','neuraldeep','openrouter'])test(provider+': no retries, fallback, tools or fabricated usage after failures',async()=>{
  const config=childProviderConfiguration(selection(provider)),input={messages:[{role:'user',content:'synthetic prompt'}]},apiKey='child-fixture-key';
  let attempts=0;await assert.rejects(requestChildModel(config,input,{apiKey,fetchImpl:async()=>{attempts++;throw Error('private upstream text');}}));assert.equal(attempts,1);
  await assert.rejects(requestChildModel(config,input,{apiKey,fetchImpl:async()=>Response.json(reply(config,{model:'wrong-model'}))}),{code:'runtime_identity_mismatch'});
  await assert.rejects(requestChildModel(config,{...input,tools:[{type:'web_search'}]},{apiKey,fetchImpl:()=>assert.fail('Invalid request must not dispatch')}),{code:'provider_input_invalid'});
  const unknown=await requestChildModel(config,input,{apiKey,fetchImpl:async()=>Response.json(reply(config,{usage:{}}))});assert.equal(unknown.usageKnown,false);assert.equal(unknown.usage,null);
  const controller=new AbortController();controller.abort();await assert.rejects(requestChildModel(config,input,{apiKey,signal:controller.signal,fetchImpl:()=>assert.fail('Cancelled request must not dispatch')}),{code:'operator_cancel'});
});

test('existing scaffolds remain provider-free and contracts preserve or reject the explicit child choice',t=>{
  assert.equal(childProviderConfiguration(),null);assert.ok(!generatedAgentFiles(base).some(file=>file.path==='runtime/provider.json'));
  for(const data of [{childModelProvider:'private-secret'},{childModelProvider:'constructor',childModelId:'vendor/model'},{childModelProvider:'openrouter',childModelId:'bad key'},{childModelId:'vendor/model'}])assert.throws(()=>childProviderConfiguration(data));
  const root=temporary(t),file=path.join(root,'contract.md');writeFileSync(file,'---\ntype: agent-contract\nstatus: draft\n---\n- Child model provider: openrouter\n- Child model ID: vendor/model\n');
  const data=contractData(file,{root});assert.equal(data.childModelProvider,'openrouter');assert.equal(data.childModelId,'vendor/model');
  assert.ok(!validateContract(file,{root,print:false}).some(issue=>issue.includes('child model')));
  writeFileSync(file,'- Child model provider: private-secret');const issues=validateContract(file,{root,print:false});assert.ok(issues.some(issue=>issue.includes('child model')));assert.ok(!issues.join(' ').includes('private-secret'));
});
