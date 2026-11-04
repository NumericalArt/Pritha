import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';

const file=ts.createSourceFile('runtime.ts',readFileSync('interfaces/control-center/src/lib/realtime/pritha-runtime.ts','utf8'),ts.ScriptTarget.Latest,true);
const names=['mergeProviderVoiceTaskStatus','providerVoiceTaskFields','providerVoiceTaskFeedback','codexTaskProgressMetrics','codexTaskPlanSteps','codexStepIdFromProgressEvent','fallbackCodexProgressPercent','codexTaskApprovalReasons'];
const source=file.statements.filter(node=>ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node=>node.getText(file)).join('\n');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api=new Function('compactText','codexSandboxForTask',compiled+'\nreturn {'+names.join(',')+'};')((value,limit)=>String(value || '').trim().slice(0,limit),()=> 'danger-full-access');

test('a reserved Voice workspace failure survives readback and reports zero execution progress',()=>{
  const stored={status:'waiting_for_operator',phase:'provider_dispatch_attention',error_code:'workspace_dirty',updated_at:'2026-01-01T00:00:01Z'};
  const projection={task:{state:'reserved'},status:{status:'waiting_for_operator',phase:'reserved',chat_id:null,turn_id:null,error_code:null,question:'',updated_at:'2026-01-01T00:00:00Z'}};
  const status=api.mergeProviderVoiceTaskStatus(stored,projection),request={task_chat_connector:'claude'};
  assert.equal(status.error_code,'workspace_dirty');assert.equal(status.phase,'provider_dispatch_attention');assert.equal(status.updated_at,stored.updated_at);
  assert.equal(api.providerVoiceTaskFields(request,status).error_code,'workspace_dirty');
  const feedback=api.providerVoiceTaskFeedback('fixture',request,status);
  assert.match(feedback.voice_text,/ещё не запущена/);assert.match(feedback.voice_text,/незакоммиченные/);assert.match(feedback.voice_text,/отдельного нового агента/);
  assert.equal(feedback.requires_response,false); // No answerable provider question exists before chat creation.
  const progress=api.codexTaskProgressMetrics({statusValue:status.status,complete:false,waitingForOperator:true,decisionRequired:false,resultAvailable:false,stale:false,plan:null,progress:[],notDispatched:status.dispatch_state==='reserved'});
  assert.equal(progress.percent,0);assert.equal(progress.detail.source,'before_dispatch');
  assert.equal(api.mergeProviderVoiceTaskStatus(stored,projection).error_code,'workspace_dirty'); // Polling is read-only.
});
test('confirmed dispatch, real questions and terminal results replace stale preflight failures',()=>{
  const old={status:'waiting_for_operator',phase:'provider_dispatch_attention',error_code:'workspace_dirty',dispatch_state:'reserved'};
  const status=api.mergeProviderVoiceTaskStatus(old,{task:{state:'running'},status:{status:'waiting_for_operator',phase:'waiting_for_input',chat_id:'chat_fixture',turn_id:'turn_fixture',error_code:null,question:'Which file?',requires_operator_response:true}});
  assert.equal(status.error_code,null);assert.equal(status.dispatch_state,'running');
  const feedback=api.providerVoiceTaskFeedback('fixture',{task_chat_connector:'claude'},status);
  assert.equal(feedback.voice_text,'Which file?');assert.equal(feedback.requires_response,true);
  assert.equal(api.codexTaskProgressMetrics({statusValue:status.status,complete:false,waitingForOperator:true,progress:[],notDispatched:false}).percent,80);
  assert.equal(api.providerVoiceTaskFeedback('fixture',{task_chat_connector:'claude'},{...status,status:'aborted'}),null);
  assert.equal(api.mergeProviderVoiceTaskStatus(old,null).dispatch_state,undefined);
});
test('a finished model answer with no factory draft is reported as failed work with zero product progress',()=>{
  const status={status:'failed',phase:'factory_draft_failed',factory_draft_failed:true,error_code:'factory_not_started'};
  const feedback=api.providerVoiceTaskFeedback('fixture',{task_chat_connector:'claude'},status);
  assert.match(feedback.voice_text,/не подтверждено/);assert.equal(feedback.requires_response,false);
  const progress=api.codexTaskProgressMetrics({statusValue:'failed',complete:true,waitingForOperator:false,progress:[],factoryDraftFailed:true});
  assert.equal(progress.percent,0);assert.equal(progress.detail.source,'factory_draft_missing');
});
test('external tasks retain write and consequential-action gates without inheriting native full-access claims',()=>{
  const external={task_chat_connector:'claude',task_type:'agent_creation',write_mode:'workspace_write',task:'Create an offline word counter'};
  assert.deepEqual(api.codexTaskApprovalReasons(external),['workspace_write_requested']);
  assert.deepEqual(api.codexTaskApprovalReasons({...external,write_mode:'read_only',task_type:'research'}),[]);
  assert.ok(api.codexTaskApprovalReasons({...external,task_chat_connector:undefined}).includes('danger_full_access_sandbox'));
  assert.ok(api.codexTaskApprovalReasons({...external,task_chat_connector:'codex'}).includes('danger_full_access_sandbox'));
  for(const [task,reason] of [['Publish the result','external_publish_or_deployment'],['Delete an old project','destructive_change'],['Change an API key','credential_or_secret_change'],['Install launchd service','scheduler_or_service_enablement']])assert.ok(api.codexTaskApprovalReasons({...external,task}).includes(reason));
});
