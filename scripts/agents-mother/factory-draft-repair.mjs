import {createHash} from 'node:crypto';
import {redundantHttpEntrypoint} from './interview-brief.mjs';
import {scaffoldCapability} from './scaffold/capabilities.mjs';

/** Read-only, exact patch proposal for an existing unapproved HTTP draft.
 * Applying it still uses the ordinary hash-bound draft operation. */
export function factoryDraftRepair(row,data,state){
  if(row.frontmatter.status!=='draft' || state.contractApproval || state.outcomeApproval || state.running
      || !redundantHttpEntrypoint(data))return null;
  const from='- CLI entrypoint: scripts/server.mjs\n';
  if(row.text.split(from).length!==2)return null;
  const capability=scaffoldCapability({...data,cliEntrypoint:undefined});
  if(!capability.supported)return null;
  const content=row.text.replace(from,'');
  return {reason:'http-server-is-not-a-cli',hint:'This draft explicitly selects HTTP with no secondary interface. Remove only the redundant CLI entrypoint; keep the HTTP server and all product decisions. Apply this exact patch, then inspect scaffold_plan and request Contract approval.',
    tool:'factory_patch_draft',input:{artifact:'contract',expected_sha256:row.sha256,edits:[{from,to:''}],
      expected_result_sha256:createHash('sha256').update(content).digest('hex')},capability};
}
