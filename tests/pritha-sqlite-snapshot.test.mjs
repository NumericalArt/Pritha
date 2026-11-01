import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import { snapshotPrithaDatabase } from '../scripts/lib/sqlite-snapshot.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pritha-sqlite-snapshot-')), source = path.join(root, 'techscope.sqlite'), destination = path.join(root, 'pritha.sqlite');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, source, destination };
}
function sql(file, statement) { const result = spawnSync('sqlite3', [file, statement], {encoding:'utf8'}); assert.equal(result.status,0,result.stderr);return result.stdout.trim(); }

test('SQLite backup includes committed WAL rows, FTS, relations and embedding values while the source stays open', async t => {
  const f = fixture(t);
  sql(f.source, 'CREATE TABLE documents(id TEXT PRIMARY KEY, body TEXT); CREATE VIRTUAL TABLE chunks_fts USING fts5(text); CREATE TABLE embeddings(id TEXT, dimensions INTEGER, vector BLOB); CREATE TABLE relations(source TEXT REFERENCES documents(id), target TEXT REFERENCES documents(id));');
  const script = "import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA wal_autocheckpoint=0');c.execute(\"INSERT INTO documents VALUES('one','evidence'),('two','context')\");c.execute(\"INSERT INTO chunks_fts VALUES('durable evidence')\");c.execute(\"INSERT INTO embeddings VALUES('one',2,X'01020304')\");c.execute(\"INSERT INTO relations VALUES('one','two')\");c.commit();print('ready',flush=True);sys.stdin.readline();c.close()";
  const worker = spawn('python3', ['-u','-c',script,f.source], {stdio:['pipe','pipe','pipe']});
  const closed = once(worker, 'exit');
  t.after(() => { if (worker.exitCode === null) worker.kill('SIGKILL'); });
  await Promise.race([once(worker.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture writer timeout')),5000);timer.unref();})]);
  assert.equal(existsSync(f.source+'-wal'),true);
  const before = readFileSync(f.source);
  const result = snapshotPrithaDatabase(f.source,f.destination,{root:f.root,env:{PATH:process.env.PATH}});
  assert.equal(result.status,'created');assert.equal(result.integrity,'ok');assert.equal(result.table_counts.documents,2);
  assert.equal(sql(f.destination,"SELECT count(*) FROM chunks_fts WHERE chunks_fts MATCH 'evidence';"),'1');
  assert.equal(sql(f.destination,'SELECT hex(vector) FROM embeddings;'),'01020304');
  assert.equal(sql(f.destination,'SELECT source||target FROM relations;'),'onetwo');
  assert.equal(statSync(f.destination).mode & 0o777,0o600);assert.deepEqual(readFileSync(f.source),before);
  const destinationBytes = readFileSync(f.destination);
  assert.equal(snapshotPrithaDatabase(f.source,f.destination,{root:f.root,env:{PATH:process.env.PATH}}).status,'already_present');
  assert.deepEqual(readFileSync(f.destination),destinationBytes);
  worker.stdin.end('finish\n');await closed;
  assert.equal(readdirSync(f.root).some(name=>name.startsWith('.pritha-snapshot-')),false);
});

test('conflicting and corrupt SQLite sources never clobber destination bytes or expose their contents',t=>{
  const f=fixture(t);sql(f.source,'CREATE TABLE data(value TEXT); INSERT INTO data VALUES(\'old\');');sql(f.destination,'CREATE TABLE data(value TEXT); INSERT INTO data VALUES(\'new\');');
  const before=readFileSync(f.destination);
  assert.throws(()=>snapshotPrithaDatabase(f.source,f.destination,{root:f.root,env:{PATH:process.env.PATH}}),{code:'pritha_snapshot_unavailable'});
  assert.deepEqual(readFileSync(f.destination),before);
  writeFileSync(f.source,'PRIVATE_CANARY_invalid_sqlite');rmSync(f.destination);
  assert.throws(()=>snapshotPrithaDatabase(f.source,f.destination,{root:f.root,env:{PATH:process.env.PATH}}),error=>error.code==='pritha_snapshot_unavailable' && !error.message.includes('PRIVATE_CANARY'));
  assert.equal(existsSync(f.destination),false);assert.equal(readFileSync(f.source,'utf8'),'PRIVATE_CANARY_invalid_sqlite');
  assert.equal(readdirSync(f.root).some(name=>name.startsWith('.pritha-snapshot-')),false);
});

test('instance migration discovers either filename family and creates a verified canonical snapshot',t=>{
  for(const legacy of [false,true]){
    const f=fixture(t),state=path.join(f.root,'state'),memory=path.join(f.root,'.memory');mkdirSync(memory);
    const source=path.join(memory,legacy?'techscope.sqlite':'pritha.sqlite');sql(source,'CREATE TABLE documents(id TEXT); INSERT INTO documents VALUES(\'preserved-id\');');
    const setup=path.join(f.root,legacy?'.techscope-setup.json':'.pritha-setup.json');writeFileSync(setup,'{"schema":"techscope-setup-state-v1","status":"completed","profile":"preserved-fixture"}\n');
    const env={PATH:process.env.PATH,HOME:process.env.HOME,PRITHA_ROOT:f.root,PRITHA_STATE_ROOT:state,PRITHA_AGENT_PARENT:path.join(f.root,'agents'),PRITHA_INSTANCE_ID:'snapshot-fixture',PRITHA_CONTROL_CENTER_PORT:'64520'};
    const run=args=>spawnSync(process.execPath,[path.resolve('scripts/pritha-instance.mjs'),'migrate',...args,'--json'],{cwd:f.root,env,encoding:'utf8',timeout:15000});
    const plan=run(['--plan']);assert.equal(plan.status,0,plan.stderr);assert.equal(existsSync(state),false);
    assert.ok(JSON.parse(plan.stdout).operations.some(op=>op.kind==='sqlite-snapshot' && op.source===source));
    const applied=run(['--apply','--yes']);assert.equal(applied.status,0,applied.stderr);
    assert.equal(sql(path.join(state,'memory/pritha.sqlite'),'SELECT id FROM documents;'),'preserved-id');
    assert.equal(readFileSync(path.join(state,'setup/setup.json'),'utf8'),readFileSync(setup,'utf8'));
    assert.equal(existsSync(source),true);assert.equal(existsSync(path.join(state,'memory/techscope.sqlite')),false);
  }
});
