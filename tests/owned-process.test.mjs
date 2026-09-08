import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { ownChildProcess, ownedGroupExited, signalOwnedProcess } from '../scripts/lib/owned-process.mjs';

async function child() {
  const processHandle = spawn(process.execPath, ['-e', 'process.stdout.write("ready\\n");setInterval(()=>{},1000)'], {detached:true,stdio:['ignore','pipe','ignore']});
  await once(processHandle.stdout,'data');
  return ownChildProcess(processHandle,process.cwd());
}

test('stop signals only the owned detached group; acknowledgment is not exit', async () => {
  const a=await child(), b=await child();
  try {
    assert.equal(ownedGroupExited(a),false);
    const closed=once(a.child,'close');
    assert.equal(signalOwnedProcess(a).signaled,true);
    assert.equal(ownedGroupExited(a),false);
    await closed;
    assert.equal(ownedGroupExited(a),true);
    assert.equal(b.child.exitCode,null);
    assert.equal(b.child.signalCode,null);
    assert.equal(signalOwnedProcess(a,'SIGKILL').attempted,false);
  } finally {
    for (const owner of [a,b]) {
      if (owner.child.exitCode===null && owner.child.signalCode===null) {
        const closed=once(owner.child,'close');
        signalOwnedProcess(owner,'SIGKILL');
        await closed;
      }
    }
  }
});

test('stale birth, group or child identity never signals another task', async () => {
  const a=await child(), b=await child();
  try {
    assert.equal(signalOwnedProcess({...a,birth:'stale'}).attempted,false);
    assert.equal(signalOwnedProcess({...a,group:b.group}).attempted,false);
    assert.equal(signalOwnedProcess({...a,pid:b.pid}).attempted,false);
    assert.equal(signalOwnedProcess(undefined).attempted,false);
    assert.equal(b.child.signalCode,null);
  } finally {
    await Promise.all([a,b].map(async owner=>{const closed=once(owner.child,'close');signalOwnedProcess(owner,'SIGKILL');await closed;}));
  }
});
