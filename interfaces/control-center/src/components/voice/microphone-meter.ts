export type MicrophoneSignal = {
  rms:number;
  paused:boolean;
  stalled:boolean;
  audioContextState:string;
};

/** Observe the existing processed stream. No new microphone, playback, gain
 * changes or audio retention; the session remains the owner of its resources. */
export function startMicrophoneMeter(context:AudioContext,stream:MediaStream,isPaused:()=>boolean,onSignal:(signal:MicrophoneSignal)=>void){
  const source=context.createMediaStreamSource(stream);
  let analyser:AnalyserNode;
  try{analyser=context.createAnalyser();analyser.fftSize=512;source.connect(analyser);}catch(error){source.disconnect();throw error;}
  const samples=new Float32Array(analyser.fftSize);
  let stopped=false;
  const sample=()=>{
    if(stopped)return;
    const paused=isPaused(),stalled=context.state!=='running' || !stream.getAudioTracks().some(track=>track.readyState==='live');
    let rms=0;
    if(!paused && !stalled){analyser.getFloatTimeDomainData(samples);rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);}
    onSignal({rms:Number.isFinite(rms)?rms:0,paused,stalled,audioContextState:context.state});
  };
  const timer=setInterval(sample,200);sample();
  return ()=>{if(stopped)return;stopped=true;clearInterval(timer);source.disconnect();analyser.disconnect();};
}
