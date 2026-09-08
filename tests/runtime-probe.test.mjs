import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeProbe } from '../scripts/lib/runtime-probe.mjs';

test('cold runtime probes share a child without blocking neighboring request work',async()=>{
  const args=['-e',"setTimeout(()=>process.stdout.write('ready'),180)"];
  const first=runtimeProbe(process.execPath,args,process.cwd());
  assert.equal(runtimeProbe(process.execPath,args,process.cwd()),first);
  let finished=false;first.then(()=>finished=true);
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(finished,false,'a neighboring request can run while the probe is pending');
  assert.deepEqual(await first,{ok:true,stdout:'ready',stderr:''});
  assert.equal(runtimeProbe(process.execPath,args,process.cwd()),first);
});

test('runtime probe failures and timeouts are bounded and do not reject request handlers',async()=>{
  const failed=await runtimeProbe(process.execPath,['-e',"process.stderr.write('unavailable');process.exit(7)"],process.cwd());
  assert.equal(failed.ok,false);assert.equal(failed.stderr,'unavailable');
  const timed=await runtimeProbe(process.execPath,['-e','setTimeout(()=>{},60000)'],process.cwd(),{timeoutMs:50});
  assert.equal(timed.ok,false);
});
