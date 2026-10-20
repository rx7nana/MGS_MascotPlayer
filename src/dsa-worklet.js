import {SparseWaveBuffer} from './sparse-wave-buffer-v021.js';
import {AudioRendererWorkletProcessor} from './vendor/webaudio-stream-player/dist/workers/audio-renderer-worklet-processor.js';
class ObservedRenderer extends AudioRendererWorkletProcessor {
 constructor(o){super(o);this._buffer=new SparseWaveBuffer(sampleRate,o.outputChannelCount);this.resetStats();const post=this.port.postMessage.bind(this.port);this.port.postMessage=(d,...args)=>{if(d.type==='progress')d.stat={...d.stat,contextTime:currentTime,firstNonzeroContext:this.firstNonzeroContext,underruns:this.underruns,missingSamples:this.missingSamples,firstNonzeroSourceFrame:this.firstNonzeroSourceFrame,firstPCMValue:this.firstPCMValue,lastNonzeroContext:this.lastNonzeroContext,stalled:this.stalled,resumedFromStarvation:this.resumedFromStarvation};post(d,...args);};}
 resetStats(){this.underruns=0;this.missingSamples=0;this.firstNonzeroContext=null;this.firstNonzeroSourceFrame=null;this.firstPCMValue=null;this.lastNonzeroContext=null;this.lastStat='';this.stalled=false;this.resumedFromStarvation=false;}
 async _onCommand(cmd){const result=await super._onCommand(cmd);if(cmd.type==='play'){this.resetStats();this._setState('paused');}return result;}
 process(inputs,outputs){
  if(this._state==='disposed')return false;const s=this._buffer.stat,n=outputs[0][0].length,available=Math.max(0,s.bufferedFrames-s.currentFrame);this.resumedFromStarvation=false;
  if(this._state==='playing'&&this._buffer._primed&&!this._buffer.isFulFilled&&available<n){if(!this.stalled)this.underruns++;this.missingSamples+=n-available;this.stalled=true;this.port.postMessage({type:'progress',stat:s});return true;}
  if(this.stalled&&this._state==='playing'&&available<this._buffer._prerollFrames&&!this._buffer.isFulFilled){this.port.postMessage({type:'progress',stat:s});return true;}
  if(this.stalled){this.stalled=false;this.resumedFromStarvation=true;}
  const result=super.process(inputs,outputs);if(this.firstNonzeroContext===null){const i=outputs[0][0].findIndex(x=>x!==0);if(i>=0){this.firstNonzeroContext=currentTime+i/sampleRate;this.firstNonzeroSourceFrame=s.currentFrame+i;this.firstPCMValue=outputs[0][0][i];}}
  const output=outputs[0][0];for(let i=output.length-1;i>=0;i--)if(output[i]!==0){this.lastNonzeroContext=currentTime+i/sampleRate;break;}const now=this._buffer.stat,sig=now.currentFrame+':'+now.bufferedFrames+':'+now.isFulFilled+':'+(now.cacheRevision||0);if(this._state!=='playing'&&sig!==this.lastStat)this.port.postMessage({type:'progress',stat:now});this.lastStat=sig;return result;
 }
}
registerProcessor('dsa-observed',ObservedRenderer);
