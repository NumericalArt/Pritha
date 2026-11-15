// Host-only knowledge about child model IDs. The child client and its
// configuration module are copied into every model-connected child and their
// hashes are bound into its protected verifier, so their bytes cannot change
// without invalidating existing agents. Alias handling therefore lives here,
// on the Pritha side of the model connection.
//
// Source: Anthropic "Models overview" (alias and full-ID columns, deprecation
// table), https://platform.claude.com/docs/en/about-claude/models/overview
// Checked 2026-11-14 against the reference cached 2026-11-03. Models released
// from Claude 4.6 onward have no separate dated ID and are reported verbatim.
const ALIASES=Object.freeze({
  claude:Object.freeze({
    'claude-haiku-4-5':'claude-haiku-4-5-20251001',
    'claude-opus-4-5':'claude-opus-4-5-20251101',
    'claude-sonnet-4-5':'claude-sonnet-4-5-20250929',
  }),
});
// Full IDs with an announced retirement date (UTC day on which requests stop).
const RETIREMENTS=Object.freeze({
  claude:Object.freeze({'claude-sonnet-4-5-20250929':'2026-11-30'}),
});
const RETIREMENT_NOTICE_MS=90*24*60*60*1000;

/** The exact ID a provider reports for a documented alias; other IDs are returned unchanged. */
export function canonicalChildModelId(connectorId,modelId){
  const aliases=Object.hasOwn(ALIASES,connectorId)?ALIASES[connectorId]:null;
  return aliases && typeof modelId==='string' && Object.hasOwn(aliases,modelId)?aliases[modelId]:modelId;
}

/** Null, or the reason a new child should not be pinned to this model. Never
 * applied to an existing agent: its accepted Contract keeps its selection. */
export function childModelRetirement(connectorId,modelId,now=Date.now()){
  const retirements=Object.hasOwn(RETIREMENTS,connectorId)?RETIREMENTS[connectorId]:null,canonical=canonicalChildModelId(connectorId,modelId);
  if(!retirements || !Object.hasOwn(retirements,canonical))return null;
  const date=retirements[canonical],at=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(at) && at-now<=RETIREMENT_NOTICE_MS?{modelId:canonical,retires:date,retired:at<=now}:null;
}
