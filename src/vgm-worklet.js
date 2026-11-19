import{AudioRendererWorkletProcessor}from'./vendor/webaudio-stream-player/dist/workers/audio-renderer-worklet-processor.js';
import{VgmWindowBuffer}from'./vgm-window-buffer.js';
export class VgmRendererProcessor extends AudioRendererWorkletProcessor{
 constructor(o){super(o);this._buffer=new VgmWindowBuffer(sampleRate,o.outputChannelCount[0]||1);const post=this.port.postMessage.bind(this.port);this.port.postMessage=(d,...args)=>{if(d.type==='progress')d.stat={...d.stat,contextTime:currentTime};post(d,...args)}}
 async _onCommand(c){const r=await super._onCommand(c);if(c.type==='play')this._setState('paused');return r}
 process(inputs,outputs){if(this._state!=='playing'&&this._state!=='disposed')this.port.postMessage({type:'progress',stat:this._buffer.stat});return super.process(inputs,outputs)}
}
registerProcessor('vgm-window',VgmRendererProcessor);
