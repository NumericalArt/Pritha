import {readFileSync} from 'node:fs';
import {childProviderConfiguration} from '../../lib/child-provider-configuration.mjs';

/** Add only explicitly selected provider code; existing scaffolds stay unchanged. */
export function withChildProvider(files,data){
  const config=childProviderConfiguration(data);if(!config)return files;
  const result=files.map(file=>({...file}));
  for(const source of ['lib/child-model-client.mjs','lib/child-provider-configuration.mjs','lib/provider-http.mjs','claude/messages-client.mjs','claude/stream-state.mjs'])result.push({path:'scripts/'+source,content:readFileSync(new URL('../../'+source,import.meta.url),'utf8')});
  result.push({path:'runtime/provider.json',content:JSON.stringify(config,null,2)+'\n'});
  const env=result.find(file=>file.path==='.env.example');env.content+='\n# Selected child provider; configure its own key in .env.local.\n'+config.keyName+'=\n'+config.keyName.replace('_API_KEY','_BASE_URL')+'='+config.baseUrl+'\n'+config.keyName.replace('_API_KEY','_MODEL')+'='+config.modelId+'\n';
  const manifest=result.find(file=>file.path==='operations/manifest.json');
  const operations=manifest?JSON.parse(manifest.content):{schema:'pritha-child-credentials-v1',service_mode:'none',autostart:'disabled'};
  operations.credentials=[...(operations.credentials || []),{name:config.keyName,label:config.label+' API key',provider:config.connectorId==='claude'?'anthropic':config.connectorId,required:true,validation:'format',storage_target:'.env.local',browser_exposure:'server_only',provider_configuration:{model_id:config.modelId,base_url:config.baseUrl},note:'Selected model: '+config.modelId+'. API: '+config.baseUrl+'. Save writes the child-owned key and this model/URL together. Saving does not start the service or make an inference request.'}];
  if(manifest)manifest.content=JSON.stringify(operations,null,2)+'\n';else result.push({path:'operations/manifest.json',content:JSON.stringify(operations,null,2)+'\n'});
  result.push({path:'scripts/provider-pilot.mjs',content:`import {fileURLToPath} from 'node:url';
import {readChildProvider,requestChildModel} from './lib/child-model-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),command=process.argv[2] || 'status';
try {
  const {configuration,apiKey}=readChildProvider(root);
  if(command==='status')console.log(JSON.stringify({provider:configuration.connectorId,model:configuration.modelId,baseUrl:configuration.baseUrl,status:'configured-unverified'}));
  else if(command==='request' && process.argv.includes('--yes')){
    const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>16000)throw Object.assign(Error(),{code:'provider_input_invalid'});chunks.push(chunk);}
    const prompt=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)).trim();if(!prompt)throw Object.assign(Error(),{code:'provider_input_invalid'});
    console.log(JSON.stringify(await requestChildModel(configuration,{messages:[{role:'user',content:prompt}],maxTokens:512},{apiKey})));
  }else throw Object.assign(Error(),{code:'provider_explicit_request_required'});
}catch(error){console.error(JSON.stringify({error:/^[a-z_]+$/.test(error.code || '')?error.code:'provider_unavailable'}));process.exitCode=78;}
`});
  result.find(file=>file.path==='README.md').content+='\n## Selected model API\n\nProvider: '+config.label+'. Model: `'+config.modelId+'`. Endpoint: `'+config.baseUrl+'`. The choice is recorded in `runtime/provider.json`, independently of the Pritha build connector. Configure the child-owned `'+config.keyName+'` through its Credentials panel or private `.env.local`; never copy Pritha credentials. `node scripts/provider-pilot.mjs status` is local only. `node scripts/provider-pilot.mjs request --yes` reads one prompt from stdin and makes one bounded paid request; run only after explicit operator selection. Product logic can import `readChildProvider` and `requestChildModel`. The text client does not execute tools, retry ambiguity or claim product readiness. Anthropic tool requests require a separate approved policy through `scripts/claude/messages-client.mjs`.\n';
  return result;
}
