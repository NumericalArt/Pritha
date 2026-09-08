import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ExecutionCoordinator } from '../scripts/lib/execution-coordinator.mjs';
const moduleUrl = pathToFileURL(path.resolve('scripts/lib/execution-coordinator.mjs')).href;
function fixture() {
  const stateRoot = mkdtempSync(path.join(tmpdir(), 'pritha-execution-test-'));
  const db = new ExecutionCoordinator({ stateRoot });
  return { stateRoot, db, close() { db.close(); rmSync(stateRoot, { recursive: true, force: true }); } };
}
function child(stateRoot, body) {
  const script = `import {ExecutionCoordinator} from ${JSON.stringify(moduleUrl)};const db=new ExecutionCoordinator({stateRoot:${JSON.stringify(stateRoot)}});${body};db.close();`;
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore','pipe','pipe'] });
    let out='',err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
    p.on('error',reject);p.on('exit',code=>code===0?resolve(out.trim()):reject(new Error(err)));
  });
}
test('independent workers reserve one intent and reject payload reuse', async () => {
  const f=fixture();
  try {
    const results=await Promise.all(Array.from({length:4},()=>child(f.stateRoot, `console.log(db.reserveIntent('create:one','payload',{kind:'create'}).created)`)));
    assert.equal(results.filter(r=>r==='true').length,1);
    assert.throws(()=>f.db.reserveIntent('create:one','different',{kind:'create'}), {code:'idempotency_conflict'});
    const before=f.db.getIntent('create:one');
    f.db.updateIntent('create:one',{state:'dispatching'},before.revision);
    assert.throws(()=>f.db.updateIntent('create:one',{state:'bound'},before.revision),{code:'execution_revision_conflict'});
    assert.equal(statSync(f.db.file).mode & 0o777,0o600);
  } finally { f.close(); }
});
test('native claims survive dispatcher exit and require exact generation to release', async () => {
  const f=fixture();
  try {
    await child(f.stateRoot, `db.claim(['storage:thread'],'old-owner',{kind:'turn',detail:{nativeTurnId:'turn-1'}})`);
    assert.equal(f.db.claim(['storage:thread'],'new-owner'),null);
    const old=f.db.claims()[0];
    assert.equal(f.db.reconcileRelease(old.owner,'wrong-generation'),0);
    assert.equal(f.db.claim(['storage:thread'],'new-owner'),null);
    assert.equal(f.db.reconcileRelease(old.owner,old.generation),1);
    const current=f.db.claim(['storage:thread'],'new-owner'); assert.ok(current);
    assert.equal(f.db.reconcileRelease(old.owner,old.generation),0);
    current.assertOwned(); current.release();
  } finally { f.close(); }
});
test('metadata locks recover after proven process exit; execution locks never use age', async () => {
  const f=fixture();
  try {
    await child(f.stateRoot, `db.claim(['metadata:registry'],'abandoned',{kind:'metadata'})`);
    assert.equal(await f.db.withMutation('registry',async()=>42),42);
    assert.equal(f.db.claims().length,0);
    const first=f.db.claim(['repo'],'writer');
    f.db.db.prepare("UPDATE execution_claims SET value=?").run(JSON.stringify({createdAt:'1970-01-01'}));
    assert.equal(f.db.claim(['repo'],'second'),null);
    first.release();
  } finally { f.close(); }
});
test('capacity and resource claims are atomic, read-only work can coexist', () => {
  const f=fixture();
  try {
    const a=f.db.claim(['repo'],'a',{mode:'read',capacity:2});
    const b=f.db.claim(['repo'],'b',{mode:'read',capacity:2});
    assert.ok(a&&b);
    assert.equal(f.db.claim(['other'],'c',{capacity:2}),null);
    b.release(); assert.equal(f.db.claim(['repo'],'writer'),null);
    a.release(); const c=f.db.claim(['repo','service'],'writer');assert.ok(c);c.release();
  } finally { f.close(); }
});
test('serialized asynchronous registry mutations do not lose writes across processes', async () => {
  const f=fixture();
  try {
    const work=`await db.withMutation('test', async()=>{const key='counter';const row=db.getIntent(key);if(!row)db.reserveIntent(key,'one',{kind:'counter',count:0});const count=db.getIntent(key).count;await new Promise(r=>setTimeout(r,20));db.updateIntent(key,{count:count+1});})`;
    await Promise.all(Array.from({length:5},()=>child(f.stateRoot,work)));
    assert.equal(f.db.getIntent('counter').count,5);
  } finally { f.close(); }
});

test('nested workspaces conflict across workers, but siblings and read-only ancestors coexist',async()=>{
  const f=fixture();
  try {
    const reader=f.db.claim(['workspace:/project'],'reader',{mode:'read'});
    assert.equal(await child(f.stateRoot,`console.log(Boolean(db.claim(['workspace:/project/child'],'writer')))`),'false');
    const childReader=f.db.claim(['workspace:/project/child'],'child-reader',{mode:'read'});
    assert.ok(childReader);reader.release();childReader.release();
    const a=f.db.claim(['workspace:/project/a'],'a');
    const b=f.db.claim(['workspace:/project/b'],'b');assert.ok(a&&b);
    assert.equal(f.db.extend(a.owner,a.generation,['workspace:/project']),false);
    b.release();assert.equal(f.db.extend(a.owner,a.generation,['workspace:/project']),true);
    assert.equal(f.db.claim(['workspace:/project/a/nested'],'third'),null);a.release();
  }finally{f.close();}
});

test('queue admission limits are atomic across processes and include reserved entries',async()=>{
  const f=fixture();
  try {
    const results=await Promise.all(Array.from({length:6},(_,i)=>child(f.stateRoot,`try{db.reserveIntent('queued:${i}','hash',{kind:'queue',chatId:'one'},{limit:{max:4,states:['queued'],scopeField:'chatId',scopeMax:2}});console.log('admitted')}catch(e){console.log(e.code)}`)));
    assert.equal(results.filter(row=>row==='admitted').length,2);
    assert.equal(results.filter(row=>row==='execution_queue_full').length,4);
  }finally{f.close();}
});
