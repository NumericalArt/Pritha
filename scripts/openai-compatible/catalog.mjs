/** Provider metadata is data, never executable configuration or an error body. */
export const OPENROUTER_SHORTLIST=Object.freeze(['anthropic/claude-sonnet-4.5','deepseek/deepseek-chat-v3.1','qwen/qwen3-coder','google/gemini-2.5-pro','openai/gpt-5.4']);
export const OPENROUTER_BASE_URL='https://openrouter.ai/api/v1';
export const OPENROUTER_HEADERS=Object.freeze({'HTTP-Referer':'https://github.com/NumericalArt/Pritha','X-Title':'Pritha Control Center'});
export const COMPATIBLE_EFFORTS=Object.freeze(['none','minimal','low','medium','high','xhigh']);
export const modelId=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,199}$/.test(value)?value:null;
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const count=value=>Number.isSafeInteger(value) && value>=0?value:null;
const positive=value=>count(value)>0?value:null;
const money=value=>typeof value==='number' && Number.isFinite(value) && value>=0?value:null;
const date=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value) && Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const failed=()=>{throw Object.assign(new Error('The provider metadata could not be verified.'),{code:'provider_metadata_invalid'});};
const rows=(payload,key='data')=>{if(!record(payload) || !Array.isArray(payload[key]) || payload[key].length>10000)failed();return payload[key];};
const unique=(list,normalize)=>{const seen=new Set();return list.flatMap(row=>{const item=normalize(row);if(!item || seen.has(item.id))return [];seen.add(item.id);return [item];});};

export function normalizeOpenRouterAccount(payload){
  const data=payload?.data;if(!record(data) || typeof data.is_free_tier!=='boolean')failed();
  const effective=record(data.effective_budget)?data.effective_budget:null;
  return {usageUsd:money(data.usage),limitUsd:money(data.limit),remainingUsd:money(effective?effective.remaining_usd:data.limit_remaining),
    remainingSource:effective?'effective-budget':'key-limit',effectiveLimitUsd:money(effective?.limit_usd),effectiveSpendUsd:money(effective?.spend_usd),
    limitReset:['daily','weekly','monthly'].includes(data.limit_reset)?data.limit_reset:null,resetsAt:date(effective?.resets_at),expiresAt:date(data.expires_at),
    isFreeTier:data.is_free_tier,managementOnly:data.is_management_key===true || data.is_provisioning_key===true,
    freeRequests:{limit:count(data.free_model_daily_requests?.limit),remaining:count(data.free_model_daily_requests?.remaining),used:count(data.free_model_daily_requests?.used)}};
}

export function normalizeOpenRouterModels(payload){
  return unique(rows(payload),row=>{
    const id=modelId(row?.id);if(!id || !id.includes('/') || row.architecture?.output_modalities && !row.architecture.output_modalities.includes('text'))return null;
    const parameters=Array.isArray(row.supported_parameters)?row.supported_parameters:[];
    const effortMetadata=row.reasoning?.supported_efforts;
    const efforts=effortMetadata===null?[...COMPATIBLE_EFFORTS]:Array.isArray(effortMetadata)?COMPATIBLE_EFFORTS.filter(value=>effortMetadata.includes(value)):[];
    // No override is distinct from disabling reasoning. A mandatory-thinking
    // model without a public effort knob still supports its provider default.
    if(row.reasoning?.mandatory===true && efforts.includes('none'))efforts.splice(efforts.indexOf('none'),1);
    efforts.unshift('default');
    return {id,tools:parameters.includes('tools'),responses:Array.isArray(row.endpoints)?row.endpoints.includes('/api/v1/responses'):true,
      contextTokens:positive(row.context_length),outputTokens:positive(row.top_provider?.max_completion_tokens),efforts,
      reasoningMandatory:row.reasoning?.mandatory===true,thinkingBudget:row.reasoning?.supports_max_tokens===true,
      reasoningControl:record(row.reasoning) && Object.hasOwn(row.reasoning,'supported_efforts'),
      inputModalities:['text','image','audio','video'].filter(value=>row.architecture?.input_modalities?.includes(value)),
      shortlist:OPENROUTER_SHORTLIST.includes(id),expiresAt:typeof row.expiration_date==='string' && /^\d{4}-\d\d-\d\d$/.test(row.expiration_date)?row.expiration_date:null};
  });
}
export function openRouterShortlist(models){return OPENROUTER_SHORTLIST.map(id=>({id,available:models.some(row=>row.id===id)}));}

export function normalizeLocalModels(payload){
  return unique(rows(payload),row=>{const id=modelId(row?.id);return id?{id,tools:false,responses:false,contextTokens:null,outputTokens:null,efforts:['default'],inputModalities:['text'],cloud:/(?:^|[:/-])cloud(?:$|[:/-])/i.test(id),source:'openai-compatible'}:null;});
}
export function ollamaModelMetadata(model,payload){
  if(!record(payload) || !Array.isArray(payload.capabilities))failed();
  const cloud=Boolean(payload.remote_model || payload.remote_host) || model.cloud;
  const context=Object.entries(record(payload.model_info)?payload.model_info:{}).filter(([key])=>key.endsWith('.context_length')).map(([,value])=>positive(value)).find(Boolean) || null;
  // Boolean thinking and per-model effort are different APIs. Never invent effort
  // values from a model family name or silently remap xhigh to high.
  const efforts=Array.isArray(payload.thinking?.supported_efforts)?COMPATIBLE_EFFORTS.filter(value=>payload.thinking.supported_efforts.includes(value)):[];
  if(payload.thinking?.mandatory===true && efforts.includes('none'))efforts.splice(efforts.indexOf('none'),1);
  efforts.unshift('default');
  return {...model,cloud,tools:payload.capabilities.includes('tools'),responses:true,contextTokens:context,efforts,
    inputModalities:payload.capabilities.includes('vision')?['text','image']:['text'],source:'ollama'};
}
export function lmStudioModelMetadata(models,payload){
  const native=rows(payload,'models');
  return models.map(model=>{
    const row=native.find(value=>value?.key===model.id || value?.loaded_instances?.some(item=>item.id===model.id));
    if(!row || row.type!=='llm')return model;
    const efforts=['default',...(Array.isArray(row.capabilities?.reasoning?.allowed_options)?row.capabilities.reasoning.allowed_options.filter(value=>['off','low','medium','high'].includes(value)).map(value=>value==='off'?'none':value):[])];
    return {...model,tools:row.capabilities?.trained_for_tool_use===true,responses:true,efforts,contextTokens:positive(row.max_context_length),
      inputModalities:row.capabilities?.vision===true?['text','image']:['text'],cloud:model.cloud || Boolean(row.remote || row.remote_host),source:'lm-studio'};
  });
}
