import {createHash} from 'node:crypto';
import {deliveryUsageStatus} from './delivery-ledger.mjs';
import {scaffoldCapability} from './scaffold/capabilities.mjs';

// Start from an official page with relevant, readable passages. HostResearch
// still checks each redirect, source authority, freshness and selected quote.
const localApiPrimaryPages = {
  'node-http-runtime': 'https://nodejs.org/api/http.md',
  'interface-runtime-security': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Type',
  'operations-deployment': 'https://nodejs.org/api/process.md',
  'declared-dependencies': 'https://nodejs.org/api/modules.md',
  'pattern-api': 'https://nodejs.org/api/url.md',
  'pattern-voice-speech': 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API',
  'pattern-codex': 'https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex',
  'pattern-github-repository': 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes',
  'pattern-agent-skills-evals': 'https://developers.openai.com/api/docs/guides/evals',
  'pattern-semantic-embeddings-rag': 'https://qdrant.tech/documentation/overview/',
  'pattern-mcp-connector-permissions': 'https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices',
  'pattern-browser-sandbox': 'https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy',
  'pattern-openai': 'https://openai.github.io/openai-agents-js/',
};

export function localApiResearchSources(topics) {
  return Object.fromEntries(topics
    .filter(({id}) => Object.hasOwn(localApiPrimaryPages, id))
    .map(({id}) => [id, localApiPrimaryPages[id]]));
}

export function supportsLocalApiContinuation(contract) {
  return contract.childModelProvider === 'none' && contract.childModelId === 'none'
    && contract.repositoryAdoptionMode === 'none' && contract.autostart === 'disabled'
    && scaffoldCapability(contract).adapter === 'api-process-v1';
}

// A plan is not authority. The tool host checks the lease, approvals, locks
// and current revision again when it claims each ordinary worker operation.
export function nextFactoryAction(s,ledger) {
  const wait=(reason)=>({kind:'wait',reason}), step=action=>({kind:'step',action});
  if(!s?.contract)return wait('brief');
  if(s.running)return wait('reconcile');
  if(s.continuationPause)return wait('inspect_step');
  if(!s.contractApproval)return wait('contract_decision');
  if(!s.outcome)return s.phase==='contract-approved'?step('create_outcome'):wait('reconcile');
  if(!s.outcomeApproval)return wait('outcome_decision');
  if(s.runId){
    if(!ledger || ledger.run_id!==s.runId)return wait('reconcile');
    if(deliveryUsageStatus(ledger.budget)!=='complete')return wait('reconcile');
    if(ledger.budget.tokens_used>ledger.budget.max_tokens)return wait('budget_overrun');
    if(ledger.status==='blocked'){
      // A known, stopped builder that ran out of reservation may already have
      // written a working product. One verification only; no new model turn.
      if(s.hostVerifiedIteration!==ledger.iteration && ledger.iteration>0 && ledger.blockers.length===1
        && ['token_budget_exhausted','iteration_budget_exhausted'].includes(ledger.blockers[0].code)
        && ledger.blockers[0].options.some(o=>o.id==='verify-only'))return step('verify');
      return wait('delivery_decision');
    }
    if(['verified','awaiting_acceptance'].includes(ledger.status) && ['delivery-verified','delivery-awaiting_acceptance'].includes(s.phase))return step('finish');
    return wait(['verified','awaiting_acceptance','accepted'].includes(ledger.status)?'manual_acceptance':'delivery');
  }
  if(s.phase==='outcome-approved' && !s.research && !s.pattern)return step('research');
  if(s.phase==='research' && s.research && s.pattern){
    if(s.researchStage==='planned')return step('research_collect');
    if(s.researchStage==='published')return step('scaffold');
    return wait('source_selection');
  }
  return s.phase==='scaffolded' && s.scaffoldRevision?step('deliver'):wait('reconcile');
}
export function factoryOperationId(s,action){
  const key=[s.stateRoot,s.target,s.chatId,s.connectorId,s.slug,s.revision,s.contractApproval?.sha256,s.outcomeApproval?.sha256,s.runId,action];
  return 'host_'+createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0,32);
}

// Page by source, not raw character offset. Every source and passage keeps its
// host-issued ID; the model can request the next page on native and MCP alike.
export function researchPage(result,offset=0){
  if(!Number.isSafeInteger(offset) || offset<0 || offset>result.sources.length)throw Object.assign(Error('Invalid research page.'),{code:'factory_input_invalid'});
  const topics=result.topics.map(({id,primaryDomains,checkpoint})=>({id,primaryDomains,status:checkpoint?.status || 'not-started',attempts:checkpoint?.attempts || 0,error:checkpoint?.error || null}));
  const sources=result.sources.slice(offset,offset+1);
  return {status:result.status,topics,offset,sources,sourceCount:result.sources.length,nextOffset:offset+sources.length<result.sources.length?offset+sources.length:null,
    hint:'Use research_status with nextOffset as offset for remaining passages. compatibilityStatus describes temporal applicability of the cited fact; record non-adoption in synthesis.'};
}
