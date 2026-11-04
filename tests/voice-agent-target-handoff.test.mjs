import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import {scopedAgentWorkspace} from '../scripts/lib/task-workspace.mjs';

// Execute the real prompt builder and writable-root resolver together. Routing
// tests that stub the prompt builder missed an independent task replacing the
// child slug with its timestamped task ID.
const file=ts.createSourceFile('runtime.ts',readFileSync('interfaces/control-center/src/lib/realtime/pritha-runtime.ts','utf8'),ts.ScriptTarget.Latest,true);
const names=['codexAgentDirectoryName','codexAdditionalWritableDirs','buildCodexPrompt','codexTaskApprovalReasons'];
const source=file.statements.filter(node=>ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node=>node.getText(file)).join('\n')+'\nexport {codexAdditionalWritableDirs,buildCodexPrompt,codexTaskApprovalReasons};';
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

function fixture(t){
  const parent=realpathSync(mkdtempSync(path.join(os.tmpdir(),'pritha-voice-target-'))),root=path.join(parent,'Pritha');mkdirSync(root);
  t.after(()=>rmSync(parent,{recursive:true,force:true}));
  const dependencies={path,scopedAgentWorkspace,resolvePrithaRoot:()=>root,resolvePrithaAgentParent:()=>parent,
    compactText:(value,max)=>String(value || '').slice(0,max),codexSandboxForTask:()=> 'danger-full-access',knownSiblingChildAgentProjects:()=>[],rootRelative:(base,file)=>path.relative(base,file)};
  const api={};new Function(...Object.keys(dependencies),'exports',compiled)(...Object.values(dependencies),api);
  return {...api,root,parent};
}
const creation={id:'2026-11-04T12-10-19-495Z-example',task:'Create a word counter agent.',task_type:'agent_creation',write_mode:'workspace_write',
  subject_kind:'agent',subject_id:'word-counter-fixture',thread_scope:{kind:'task',id:'2026-11-04T12-10-19-495Z-example',source:'independent',generation:1}};

test('independent native task keeps the same exact child target in its prompt and writable roots',t=>{
  const f=fixture(t),target=path.join(f.parent,creation.subject_id),prompt=f.buildCodexPrompt(creation);
  assert.deepEqual(f.codexAdditionalWritableDirs(f.root,creation,'workspace-write'),[target]);
  assert.ok(prompt.includes(`Child-agent directory: word-counter-fixture. Exact child target: ${target}.`));
  assert.ok(!prompt.includes('Child-agent directory: '+creation.id));
  // Full-access transport uses this same prompt; lacking extra sandbox roots
  // must not substitute conversation identity for product identity.
  assert.deepEqual(f.codexAdditionalWritableDirs(f.root,creation,'danger-full-access'),[]);
  assert.ok(prompt.includes('Native Codex agent creation uses the canonical'));
});

test('operator-resolved child name wins over routing identity in both handoff surfaces',t=>{
  const f=fixture(t),task={...creation,execution_agent_directory_name:'confirmed-counter'};
  assert.deepEqual(f.codexAdditionalWritableDirs(f.root,task,'workspace-write'),[path.join(f.parent,'confirmed-counter')]);
  assert.ok(f.buildCodexPrompt(task).includes('Child-agent directory: confirmed-counter.'));
});

test('a missing child slug never becomes a task-scoped directory',t=>{
  const f=fixture(t),task={...creation,subject_kind:'task',subject_id:undefined};
  assert.match(f.buildCodexPrompt(task),/Child-agent directory is unresolved/);
  assert.throws(()=>f.codexAdditionalWritableDirs(f.root,task,'workspace-write'),{code:'agent_workspace_target_required'});
});

test('legacy agent-scoped tasks still resolve the declared child',t=>{
  const f=fixture(t),task={...creation,subject_kind:undefined,subject_id:undefined,thread_scope:{kind:'agent',id:'legacy-child'}};
  assert.deepEqual(f.codexAdditionalWritableDirs(f.root,task,'workspace-write'),[path.join(f.parent,'legacy-child')]);
  assert.ok(f.buildCodexPrompt(task).includes('Child-agent directory: legacy-child.'));
});

test('invalid explicit child identifiers fail instead of falling back to another identity',t=>{
  const f=fixture(t);
  for(const bad of ['', '../neighbor','Pritha']){
    const task={...creation,execution_agent_directory_name:bad};
    assert.throws(()=>f.buildCodexPrompt(task),{code:'agent_workspace_target_required'});
    assert.throws(()=>f.codexAdditionalWritableDirs(f.root,task,'workspace-write'),{code:'agent_workspace_target_required'});
  }
});

test('external factory handoffs retain their tool contract and exact child directory',t=>{
  const f=fixture(t),prompt=f.buildCodexPrompt({...creation,task_chat_connector:'claude'});
  assert.ok(prompt.includes('You are the claude task executor'));
  assert.ok(prompt.includes('Child-agent directory: word-counter-fixture.'));
  assert.ok(!prompt.includes('Native Codex agent creation uses the canonical'));
});

for(const connector of ['codex','claude','neuraldeep'])test(`${connector}: bound Voice factory asks for document approvals, not a duplicate task launch`,t=>{
  const f=fixture(t),task={...creation,task_chat_connector:connector,task:'Create a counter without services, deployment or secrets.',task_chat_request:{chat:{workspace:{mode:'read-only',factorySlug:creation.subject_id}}}};
  assert.deepEqual(f.codexTaskApprovalReasons(task),[]);
  for(const changed of [{task_type:'implementation'},{subject_id:'other-target'},{task_chat_request:undefined},{task_chat_request:{chat:{workspace:{mode:'isolated',factorySlug:creation.subject_id}}}}])assert.ok(f.codexTaskApprovalReasons({...task,...changed}).length);
});
