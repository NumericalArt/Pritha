import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,symlinkSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as paths from '../scripts/lib/paths.mjs';
import {loadPrithaRuntimeEnv} from '../scripts/lib/env.mjs';
const cleanEnv=()=>{const env={...process.env};for(const key of ['PRITHA_ROOT','TECHSCOPE_ROOT','PRITHA_STATE_ROOT','PRITHA_AGENT_PARENT','GIT_DIR','GIT_WORK_TREE'])delete env[key];return env;};
function fixture(t){const base=realpathSync(mkdtempSync(path.join(os.tmpdir(),'pritha-root-parity-'))),root=path.join(base,'Project with spaces'),other=path.join(base,'Other'),alias=path.join(base,'symlink');mkdirSync(root);mkdirSync(other);symlinkSync(root,alias);writeFileSync(path.join(base,'plain-file'),'fixture');t.after(()=>rmSync(base,{recursive:true,force:true}));return {base,root,other,alias};}
function result(resolve,options){try{return {root:resolve(options)};}catch(error){assert.doesNotMatch(error.message,/PRIVATE_CANARY/);return {code:error.code};}}

test('Node, TS and Python agree on explicit/new/legacy/Git/cwd identity without filesystem mutations',t=>{
  const f=fixture(t),nested=path.join(f.root,'nested');mkdirSync(nested);execFileSync('git',['init','-q',f.root],{env:cleanEnv()});
  const cases=[
    {cwd:f.other,env:{}},{cwd:nested,env:{}},{cwd:f.other,env:{TECHSCOPE_ROOT:f.root}}, {cwd:f.other,env:{PRITHA_ROOT:f.root}},
    {cwd:f.other,env:{PRITHA_ROOT:f.root,TECHSCOPE_ROOT:f.alias}},{cwd:f.other,env:{PRITHA_ROOT:f.alias,TECHSCOPE_ROOT:f.root}},
    {cwd:f.other,env:{PRITHA_ROOT:f.root,TECHSCOPE_ROOT:f.other}},{cwd:f.other,env:{PRITHA_ROOT:f.root,TECHSCOPE_ROOT:path.join(f.base,'PRIVATE_CANARY_missing')}},
    {cwd:f.other,env:{PRITHA_ROOT:path.join(f.base,'plain-file')}},{cwd:f.other,env:{TECHSCOPE_ROOT:path.join(f.base,'missing')}},
    {cwd:f.other,root:f.alias,env:{PRITHA_ROOT:f.other,TECHSCOPE_ROOT:f.root}},{cwd:f.other,root:'../Project with spaces',env:{}},
    {cwd:f.other,root:path.join(f.base,'missing'),env:{PRITHA_ROOT:f.root}},
    {cwd:f.other,env:{GIT_DIR:path.join(f.root,'.git'),GIT_WORK_TREE:f.root}},
  ];
  const before=readdirSync(f.base).sort();
  const expected=cases.map(options=>result(paths.resolvePrithaRoot,options));
  assert.deepEqual(expected,[{root:f.other},{root:f.root},{root:f.root},{root:f.root},{root:f.root},{root:f.alias},{code:'pritha_root_conflict'},{code:'pritha_root_invalid'},{code:'pritha_root_invalid'},{code:'pritha_root_invalid'},{root:f.alias},{root:f.root},{code:'pritha_root_invalid'},{root:f.other}]);
  assert.equal(paths.resolveTechscopeRoot,paths.resolvePrithaRoot);
  const source=readFileSync('interfaces/control-center/src/lib/pritha-paths.ts','utf8'),module={exports:{}};
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>paths,module,module.exports);
  assert.equal(module.exports.resolvePrithaRoot,paths.resolvePrithaRoot);assert.equal(module.exports.resolveTechscopeRoot,paths.resolvePrithaRoot);
  assert.deepEqual(cases.map(options=>result(module.exports.resolvePrithaRoot,options)),expected);
  const python=`import sys,json\nsys.path.insert(0,sys.argv[1])\nfrom pritha_paths import resolve_pritha_root,PrithaRootError\nrows=[]\nfor case in json.load(sys.stdin):\n try: rows.append({'root':str(resolve_pritha_root(**case))})\n except PrithaRootError as error: rows.append({'code':error.code})\nprint(json.dumps(rows))`;
  const run=spawnSync('python3',['-c',python,path.resolve('scripts')],{env:cleanEnv(),input:JSON.stringify(cases),encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),expected);assert.deepEqual(readdirSync(f.base).sort(),before);
});
test('explicit child root replaces both aliases and path-env loading cannot retarget it',t=>{
  const f=fixture(t),state=path.join(f.base,'state');mkdirSync(path.join(state,'config'),{recursive:true});
  writeFileSync(path.join(f.root,'.env.local'),`TECHSCOPE_ROOT="${f.other}"\nPRITHA_STATE_ROOT="${state}"\nUNRELATED_PRIVATE_CANARY=must-not-load\n`);
  writeFileSync(path.join(state,'config','runtime.env'),`PRITHA_ROOT="${f.other}"\nTECHSCOPE_ROOT="${f.other}"\n`);
  const target={PRITHA_ROOT:f.other,TECHSCOPE_ROOT:f.other};const resolved=loadPrithaRuntimeEnv({root:f.alias,target});
  assert.equal(resolved.root,f.alias);assert.equal(resolved.stateRoot,state);assert.deepEqual({PRITHA_ROOT:target.PRITHA_ROOT,TECHSCOPE_ROOT:target.TECHSCOPE_ROOT},paths.prithaRootEnvironment(f.alias));
  const child=spawnSync(process.execPath,[path.resolve('scripts/pritha-root.mjs'),'--cwd',f.other],{env:{...cleanEnv(),...paths.prithaRootEnvironment(f.alias)},encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),f.alias);
  const invalid=spawnSync(process.execPath,[path.resolve('scripts/pritha-root.mjs'),'--cwd',f.other],{env:{...cleanEnv(),PRITHA_ROOT:f.root,TECHSCOPE_ROOT:f.other},encoding:'utf8'});assert.equal(invalid.status,2);assert.equal(invalid.stdout,'');assert.match(invalid.stderr,/different directories/);
  assert.equal(paths.resolvePrithaStateRoot({root:f.root,stateRoot:f.alias}),f.root);assert.equal(paths.resolvePrithaStatePathFrom({root:f.root,stateRoot:f.alias},'memory','fixture.sqlite'),path.join(f.root,'.memory','fixture.sqlite'));
  const pathEnv={};loadPrithaRuntimeEnv({root:f.root,target:pathEnv,pathOnly:true});assert.equal(pathEnv.PRITHA_STATE_ROOT,state);assert.equal(pathEnv.UNRELATED_PRIVATE_CANARY,undefined);
});
