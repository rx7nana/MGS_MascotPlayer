// Display-only extensions. No synthesis, output, cache writes, or transport control.
export function spectrumBands(count,bins=256){
 const edges=[1];
 for(let i=1;i<count;i++)edges.push(Math.min(bins-(count-i),Math.max(edges.at(-1)+1,Math.floor(Math.pow(bins,i/count)))));
 edges.push(bins);return edges.slice(0,-1).map((lo,i)=>[lo,edges[i+1]]);
}
export function copyCurrentWave(target,state){
 target.fill(0);const end=Math.max(0,Math.min(state.frames||0,Math.floor(state.position*48000))),begin=Math.max(0,end-target.length);
 if(!state.pcm||!state.ranges?.some(([a,b])=>a<=begin&&b>=end))return false;
 const pad=target.length-(end-begin),gain=Number.isFinite(state.gain)?state.gain:1;
 for(let i=begin;i<end;i++)target[pad+i-begin]=state.pcm[i]/32768*gain;
 return true;
}
export class AudioVisualizers {
 constructor(){this.wave=new Float32Array(256);this.levels=new Float32Array(64);this.peaks=new Float32Array(64);this.holds=new Float64Array(64);this.key='';this.sampleKey='';this.last=0;this.reset()}
 reset(){this.wave.fill(0);this.levels.fill(0);this.peaks.fill(0);this.holds.fill(0);this.last=0;this.sampleKey='';this.resets=(this.resets||0)+1}
 render(canvas,cfg,state,spectrum,colors,now){
  const key=state.request+':'+state.discontinuity+':'+cfg.visualizerType+':'+cfg.visualizer+':'+cfg.spectrumBars;
  if(key!==this.key){this.key=key;this.reset()}
  const d=devicePixelRatio,w=innerWidth,h=innerHeight;canvas.width=w*d;canvas.height=h*d;const c=canvas.getContext('2d');c.scale(d,d);
  if(!cfg.visualizer)return;
  const playing=state.mode==='playing',paused=state.mode==='paused',brightness={subtle:.36,standard:.62,vivid:.85}[cfg.brightness]||.62;
  const dt=this.last?Math.min(.1,(now-this.last)/1000):1/60;this.last=now;
  if(cfg.visualizerType==='spectrum'){
   const count=[16,32,64].includes(cfg.spectrumBars)?cfg.spectrumBars:32,bands=spectrumBands(count),left=w*.06,span=w*.88,height=h*.20,base=h*.48+height/2,cell=span/count;
   if(!playing&&!paused){this.levels.fill(0);this.peaks.fill(0);this.holds.fill(0)}
   c.globalAlpha=brightness;
   for(let i=0;i<count;i++){
    if(playing){let v=0;for(let k=bands[i][0];k<bands[i][1];k++)v=Math.max(v,spectrum[k]/255);this.levels[i]=Math.max(v,this.levels[i]*Math.exp(-dt/.13));if(this.levels[i]>=this.peaks[i]){this.peaks[i]=this.levels[i];this.holds[i]=now+350}else if(now>this.holds[i])this.peaks[i]*=Math.exp(-dt/.55)}
    c.fillStyle=colors[Math.floor(i*colors.length/count)];const x=left+i*cell,y=Math.pow(this.levels[i],1.6)*height;c.fillRect(x,base-y,Math.max(1,cell*.7),y+2);c.fillRect(x,base-Math.pow(this.peaks[i],1.6)*height-2,Math.max(1,cell*.7),1.5);
   }
  }else if(cfg.visualizerType==='oscilloscope'){
   const sampleKey=state.request+':'+state.discontinuity+':'+Math.floor(state.position*48000);
   if(playing||(paused&&sampleKey!==this.sampleKey)){copyCurrentWave(this.wave,state);this.sampleKey=sampleKey}else if(!paused){this.wave.fill(0);this.sampleKey=''}
   const left=w*.06,span=w*.88,cy=h*.48,scale=h*.085,amplitude=cfg.oscilloscopeAmplitude||2,gradient=c.createLinearGradient(left,0,left+span,0);
   colors.forEach((color,i)=>gradient.addColorStop(i/Math.max(1,colors.length-1),color));c.strokeStyle=gradient;c.lineCap='round';
   c.save();c.beginPath();c.rect(left-4,cy-scale,span+8,scale*2);c.clip();c.beginPath();
   for(let i=0;i<this.wave.length;i++){const x=left+i*span/(this.wave.length-1),y=cy-this.wave[i]*amplitude*scale;if(i)c.lineTo(x,y);else c.moveTo(x,y)}
   if(cfg.oscilloscopeGlow){c.globalAlpha=brightness*.13;c.lineWidth=8;c.stroke();c.globalAlpha=brightness*.23;c.lineWidth=4;c.stroke()}
   c.globalAlpha=brightness;c.lineWidth=2;c.stroke();c.restore();
  }
 }
}
