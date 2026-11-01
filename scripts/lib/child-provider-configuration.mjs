const providers=Object.freeze({
  claude:{baseUrl:'https://api.anthropic.com/v1',keyName:'ANTHROPIC_API_KEY',label:'Anthropic'},
  neuraldeep:{baseUrl:'https://api.neuraldeep.ru/v1',keyName:'NEURALDEEP_API_KEY',label:'NeuralDeep'},
  openrouter:{baseUrl:'https://openrouter.ai/api/v1',keyName:'OPENROUTER_API_KEY',label:'OpenRouter'},
});
const fail=code=>Object.assign(new Error('The selected child model request could not complete.'),{code});
/** Selected by the authored child contract, independently of its build executor. */
export function childProviderConfiguration(data={}){
  const connectorId=data.childModelProvider || 'none';
  if(connectorId==='none'){if(data.childModelId && data.childModelId!=='none')throw fail('child_provider_not_selected');return null;}
  const provider=Object.hasOwn(providers,connectorId)?providers[connectorId]:null,modelId=data.childModelId;
  if(!provider || typeof modelId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(modelId)
    || connectorId==='claude' && !/^claude-[a-z0-9]+(?:-[a-z0-9]+)+$/.test(modelId)
    || connectorId==='openrouter' && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._:/-]+$/.test(modelId))throw fail('child_provider_configuration_invalid');
  return {schema:'pritha-child-model-v1',connectorId,modelId,...provider,maxOutputTokens:4096,timeoutMs:60000,credentialTarget:'.env.local'};
}

export function childCredentialConfiguration(definition){
  if(definition.provider_configuration===undefined)return undefined;
  const raw=definition.provider_configuration,connectorId=definition.provider==='anthropic'?'claude':definition.provider;
  const config=childProviderConfiguration({childModelProvider:connectorId,childModelId:raw?.model_id});
  if(!config || definition.name!==config.keyName || raw?.base_url!==config.baseUrl || Object.keys(raw).some(key=>!['model_id','base_url'].includes(key)))throw fail('child_provider_configuration_invalid');
  return {status:'selected',modelId:config.modelId,baseUrl:config.baseUrl,assignments:{[config.keyName.replace('_API_KEY','_BASE_URL')]:config.baseUrl,[config.keyName.replace('_API_KEY','_MODEL')]:config.modelId}};
}
