import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as profile from '../scripts/lib/provider-profile.mjs';
function fixture(){const rows=new Map(),storage={getItem:key=>rows.get(key),setItem:(key,value)=>rows.set(key,value)};
  const module={exports:{}},source=readFileSync('interfaces/control-center/src/lib/codex-chat/draft-session.ts','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports','sessionStorage',code)(id=>{if(id==='../settings/provider-profile')return profile;throw new Error(id);},module,module.exports,storage);
  return {...module.exports,rows};
}
const initial=()=>({version:1,drafts:{draft_one:'Later text'},revisions:{draft_one:3},creationIds:{draft_one:'creation_exact_1'},newDraftId:'draft_one',pending:{},pendingNew:{draft_one:{draftId:'draft_one',connectorId:'openrouter',clientThreadId:'creation_exact_1',clientMessageId:'first_message_1',text:'Original',modelId:'vendor/alpha',effortId:'high',status:'sending'}},providerSelections:{draft_one:{connectorId:'openrouter',modelId:'vendor/alpha',effortId:'high'},draft_two:{connectorId:'claude',modelId:'claude-fixture',effortId:'low'}}});
test('per-draft provider selection and an uncertain first request survive reload without following a new default',()=>{
  const f=fixture(),value=initial();assert.equal(f.writeDraftSession(value),true);const loaded=f.readDraftSession();assert.deepEqual(loaded.providerSelections,value.providerSelections);assert.equal(loaded.pendingNew.draft_one.status,'delivery_unknown');assert.equal(loaded.pendingNew.draft_one.connectorId,'openrouter');assert.equal(loaded.creationIds.draft_one,'creation_exact_1');assert.equal(loaded.drafts.draft_one,'Later text');
  const legacy=initial();delete legacy.providerSelections;delete legacy.pendingNew.draft_one.connectorId;f.writeDraftSession(legacy);assert(f.readDraftSession());
});
test('foreign providers and credential-bearing selection objects cannot enter a recovered draft',()=>{
  for(const selection of [{connectorId:'foreign',modelId:'vendor/model'},{connectorId:'openrouter',apiKey:'PRIVATE_CANARY'},{connectorId:'openrouter',modelId:'https://user:secret@host/escape'},{connectorId:'openrouter',effortId:'unverified'}]){
    const f=fixture(),value=initial();value.providerSelections.draft_one=selection;f.writeDraftSession(value);assert.equal(f.readDraftSession(),null);
  }
  const f=fixture(),value=initial();value.pendingNew.draft_one.connectorId='foreign';f.writeDraftSession(value);assert.equal(f.readDraftSession(),null);
});
