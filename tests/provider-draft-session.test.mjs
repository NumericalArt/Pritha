import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as profile from '../scripts/lib/provider-profile.mjs';
import * as subject from '../scripts/lib/chat-subject.mjs';
function fixture(){const rows=new Map(),storage={getItem:key=>rows.get(key),setItem:(key,value)=>rows.set(key,value)};
  const module={exports:{}},source=readFileSync('interfaces/control-center/src/lib/codex-chat/draft-session.ts','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports','sessionStorage',code)(id=>{if(id==='../settings/provider-profile')return profile;if(id.endsWith('/chat-subject.mjs'))return subject;throw new Error(id);},module,module.exports,storage);
  return {...module.exports,rows};
}
const initial=()=>({version:1,drafts:{draft_one:'Later text'},revisions:{draft_one:3},creationIds:{draft_one:'creation_exact_1'},newDraftId:'draft_one',pending:{},pendingNew:{draft_one:{draftId:'draft_one',connectorId:'openrouter',clientThreadId:'creation_exact_1',clientMessageId:'first_message_1',text:'Original',modelId:'vendor/alpha',effortId:'high',status:'sending'}},providerSelections:{draft_one:{connectorId:'openrouter',modelId:'vendor/alpha',effortId:'high'},draft_two:{connectorId:'claude',modelId:'claude-fixture',effortId:'low'}}});
test('per-draft provider selection and an uncertain first request survive reload without following a new default',()=>{
  const f=fixture(),value=initial();assert.equal(f.writeDraftSession(value),true);const loaded=f.readDraftSession();assert.deepEqual(loaded.providerSelections,value.providerSelections);assert.equal(loaded.pendingNew.draft_one.status,'delivery_unknown');assert.equal(loaded.pendingNew.draft_one.connectorId,'openrouter');assert.equal(loaded.creationIds.draft_one,'creation_exact_1');assert.equal(loaded.drafts.draft_one,'Later text');
  const legacy=initial();delete legacy.providerSelections;delete legacy.pendingNew.draft_one.connectorId;f.writeDraftSession(legacy);assert(f.readDraftSession());
});
test('an explicit request can start a fresh proposal; discussions, quoted commands and negations cannot',()=>{
  const f=fixture(),id='cb4b6fa0-663d-41fb-9c59-42ce22e33427';
  for(const text of ['Создай мне локального агента, который убирает пробелы.', 'Please create a local agent that counts words.']){
    assert.deepEqual(f.requestedFactoryIntent(text,id),{action:'create-new-agent',slug:'agent-cb4b6fa0663d'});
  }
  assert.equal(f.requestedFactoryIntent('Создай агента «Headline Distiller» для заголовков.',id).slug,'headline-distiller');
  for(const text of ['Как создать агента?', 'Объясни: «Создай агента…»', 'Не создавай агента.', 'Create an agentic workflow', 'Review the agent.',''])assert.equal(f.requestedFactoryIntent(text,id),null);
});
test('foreign providers and credential-bearing selection objects cannot enter a recovered draft',()=>{
  for(const selection of [{connectorId:'foreign',modelId:'vendor/model'},{connectorId:'openrouter',apiKey:'PRIVATE_CANARY'},{connectorId:'openrouter',modelId:'https://user:secret@host/escape'},{connectorId:'openrouter',effortId:'unverified'}]){
    const f=fixture(),value=initial();value.providerSelections.draft_one=selection;f.writeDraftSession(value);assert.equal(f.readDraftSession(),null);
  }
  const f=fixture(),value=initial();value.pendingNew.draft_one.connectorId='foreign';f.writeDraftSession(value);assert.equal(f.readDraftSession(),null);
});
test('each draft and unknown first send preserve their separate factory subject without hidden prompt headers',()=>{
  const f=fixture(),value=initial(),subject={kind:'child',slug:'paper-radar',phase:'outcome'};
  value.factorySelections={draft_one:subject,draft_two:{kind:'child',slug:'unfinished-',phase:'interview'}};value.pendingNew.draft_one.subject=subject;
  f.writeDraftSession(value);const restored=f.readDraftSession();assert.deepEqual(restored.factorySelections,value.factorySelections);assert.deepEqual(restored.pendingNew.draft_one.subject,subject);assert.equal(restored.pendingNew.draft_one.text,'Original');
  assert.deepEqual(f.composeDraftSubject(subject),subject);assert.equal(f.composeDraftSubject({kind:'self',slug:'kept-draft',phase:'outcome'}),null);assert.throws(()=>f.composeDraftSubject(restored.factorySelections.draft_two),{code:'chat_subject_invalid'});
  value.pendingNew.draft_one.subject.approved=true;f.writeDraftSession(value);assert.equal(f.readDraftSession(),null);
});

test('explicit creation intent survives uncertain delivery without becoming subject metadata or host authority',()=>{
  const f=fixture(),value=initial(),intent={action:'create-new-agent',slug:'new-child'};
  value.factorySelections={draft_one:{kind:'child',slug:'new-child',phase:'outcome',createNew:true}};value.pendingNew.draft_one.factoryIntent=intent;value.pendingNew.draft_one.workspace={mode:'read-only'};
  f.writeDraftSession(value);const restored=f.readDraftSession();assert.deepEqual(restored.pendingNew.draft_one.factoryIntent,intent);assert.equal(restored.creationIds.draft_one,value.creationIds.draft_one);assert.equal(restored.pendingNew.draft_one.clientThreadId,value.pendingNew.draft_one.clientThreadId);assert.equal(restored.pendingNew.draft_one.clientMessageId,value.pendingNew.draft_one.clientMessageId);assert.equal(restored.pendingNew.draft_one.status,'delivery_unknown');assert.equal(f.composeDraftSubject(restored.factorySelections.draft_one),null);assert.deepEqual(f.composeDraftFactoryIntent(restored.factorySelections.draft_one),intent);
  assert.deepEqual(f.composeDraftSubject({...restored.factorySelections.draft_one,createNew:false}),{kind:'child',slug:'new-child',phase:'outcome'});
  for(const extra of [{factoryIntent:{...intent,target:'/escape'}},{connectorId:'codex'},{subject:{kind:'child',slug:'new-child',phase:'interview'}}]){value.pendingNew.draft_one={...restored.pendingNew.draft_one,...extra};f.writeDraftSession(value);assert.equal(f.readDraftSession(),null);}
});
