import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,realpathSync,rmSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';

const source=readFileSync('interfaces/control-center/src/lib/realtime/pritha-runtime.ts','utf8');
const tree=ts.createSourceFile('pritha-runtime.ts',source,ts.ScriptTarget.Latest,true);
const stats=tree.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(row=>row.name.getText(tree)==='MEMORY_STATS_SQL'));
const status=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='memoryStatus');
assert.ok(stats&&status);
const compiled=ts.transpileModule(`
  import {existsSync} from 'node:fs';
  import path from 'node:path';
  import {runAsyncProbe} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/lib/async-probe.mjs')).href)};
  import {prithaRootEnvironment} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/lib/paths.mjs')).href)};
  const memoryDbPath=root=>path.join(root,'memory.sqlite');
  ${stats.getText(tree)}
  export ${status.getText(tree)}
`,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {memoryStatus}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture(t){
  const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'pritha-memory-status-')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return {root,file:path.join(root,'memory.sqlite')};
}

test('a real memory writer lock leaves diagnostics available without blocking the event loop, then counts recover',async t=>{
  const {root,file}=fixture(t),db=new DatabaseSync(file);
  t.after(()=>db.close());
  for(const name of ['documents','chunks','entities','relations','embeddings'])db.exec(`CREATE TABLE ${name}(id INTEGER PRIMARY KEY)`);
  db.exec('INSERT INTO documents VALUES(1); BEGIN EXCLUSIVE');
  let ticks=0;
  const timer=setInterval(()=>ticks++,10),started=Date.now();
  let locked;
  try{locked=await memoryStatus(root);}finally{clearInterval(timer);db.exec('ROLLBACK');}
  assert.deepEqual(locked,{sqlite:true,sqlite_cli:true,stats:[],stats_status:'unavailable'});
  assert.ok(ticks>0,'A diagnostic read must not block other requests');
  assert.ok(Date.now()-started<3000,'A diagnostic read must have a bounded deadline');
  const recovered=await memoryStatus(root);
  assert.equal(recovered.stats_status,'ready');
  assert.deepEqual(Object.fromEntries(recovered.stats.map(row=>[row.name,row.count])),{documents:1,chunks:0,entities:0,relations:0,embeddings:0});
});

test('a missing optional memory index is reported without creating a database',async t=>{
  const {root,file}=fixture(t);
  assert.deepEqual(await memoryStatus(root),{sqlite:false,sqlite_cli:true,stats:[],stats_status:'missing'});
  assert.equal(existsSync(file),false);
});

test('an unreadable index stays unavailable and unchanged without exposing SQLite errors',async t=>{
  const {root,file}=fixture(t),content='Not a SQLite database';
  writeFileSync(file,content);
  assert.deepEqual(await memoryStatus(root),{sqlite:true,sqlite_cli:true,stats:[],stats_status:'unavailable'});
  assert.equal(readFileSync(file,'utf8'),content);
});
