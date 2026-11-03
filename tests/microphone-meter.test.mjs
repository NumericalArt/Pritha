import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
const source=ts.transpileModule(readFileSync('interfaces/control-center/src/components/voice/microphone-meter.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
  const module={exports:{}},signals=[],graph=[],timers=new Map();let next=0,amplitude=0.02,paused=false,sourceClosed=0,analyserClosed=0;
  new Function('module','exports','setInterval','clearInterval',source)(module,module.exports,fn=>{timers.set(++next,fn);return next;},id=>timers.delete(id));
  const analyser={fftSize:512,getFloatTimeDomainData:array=>array.fill(amplitude),disconnect:()=>{analyserClosed++;}},track={readyState:'live'},stream={getAudioTracks:()=>[track]};
  const context={state:'running',createMediaStreamSource:value=>{assert.equal(value,stream);return {connect:node=>graph.push(node),disconnect:()=>{sourceClosed++;}};},createAnalyser:()=>analyser};
  const stop=module.exports.startMicrophoneMeter(context,stream,()=>paused,value=>signals.push(value));
  return {context,track,signals,timers,graph,analyser,stop,tick:()=>{for(const fn of timers.values())fn();},pause:value=>{paused=value;},amplitude:value=>{amplitude=value;},closed:()=>({sourceClosed,analyserClosed})};
}
test('microphone meter observes the processed signal, follows mute/suspend/end and releases only its own resources',()=>{
  const f=fixture();assert.ok(Math.abs(f.signals.at(-1).rms-0.02)<1e-7);assert.deepEqual(f.graph,[f.analyser]);
  f.pause(true);f.tick();assert.equal(f.signals.at(-1).rms,0);assert.equal(f.signals.at(-1).paused,true);
  f.pause(false);f.context.state='suspended';f.tick();assert.equal(f.signals.at(-1).stalled,true);assert.equal(f.signals.at(-1).rms,0);
  f.context.state='running';f.amplitude(0.04);f.tick();assert.ok(f.signals.at(-1).rms>0.039);
  f.track.readyState='ended';f.tick();assert.equal(f.signals.at(-1).stalled,true);assert.equal(f.signals.at(-1).rms,0);
  f.stop();f.stop();const count=f.signals.length;f.tick();assert.equal(f.signals.length,count);assert.equal(f.timers.size,0);assert.deepEqual(f.closed(),{sourceClosed:1,analyserClosed:1});
  const fresh=fixture();assert.equal(fresh.timers.size,1);fresh.stop();
});
