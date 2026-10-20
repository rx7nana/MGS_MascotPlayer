// Standalone audio-sample -> musical beat -> motion time mapping.
class BeatClock {
 constructor(rate=48000){this.rate=rate;this.points=[];this.cursor=0;}
 push(rows){for(const r of rows)if(r.kind==='beat')this.points.push(r);}
 at(sample){
  if(!this.points.length)return null;
  while(this.cursor+1<this.points.length&&this.points[this.cursor+1].samplePosition<=sample)this.cursor++;
  const a=this.points[this.cursor],b=this.points[this.cursor+1];let beat=a.beat;
  if(sample<a.samplePosition)beat=0;
  else if(b){const f=(sample-a.samplePosition)/(b.samplePosition-a.samplePosition);beat=a.beat+(b.beat-a.beat)*f;}
  else beat=a.beat+Math.min(Math.max(0,sample-a.samplePosition),this.rate/a.driverHz)*a.bpm*a.driverHz/(3600*this.rate);
  return {beat,bpm:a.bpm,driverHz:a.driverHz,samplePosition:sample};
 }
 prune(){if(this.cursor>128){this.points.splice(0,this.cursor-1);this.cursor=1;}}
}
class MotionBeatSync {
 constructor(profile){this.profile={baseBpm:120,songStartBeat:0,motionStartBeat:0,beatOffset:0,loopBeats:8,motionLoopStartSeconds:32,...profile};this.validate();}
 validate(){const p=this.profile;for(const k of ['baseBpm','songStartBeat','motionStartBeat','beatOffset','loopBeats','motionLoopStartSeconds'])if(!Number.isFinite(p[k]))throw Error('Invalid motion profile '+k);if(p.baseBpm<=0||p.loopBeats<=0||p.motionLoopStartSeconds<0)throw Error('Invalid BPM/loop');}
 at(clock){const p=this.profile,absoluteBeat=clock.beat-p.songStartBeat+p.motionStartBeat+p.beatOffset,phase=((absoluteBeat%p.loopBeats)+p.loopBeats)%p.loopBeats;return {songBeat:clock.beat,absoluteMotionBeat:absoluteBeat,phaseBeat:phase,loopIndex:Math.floor(absoluteBeat/p.loopBeats),motionSeconds:p.motionLoopStartSeconds+phase*60/p.baseBpm,nominalSpeed:clock.bpm/p.baseBpm,effectiveSpeed:clock.bpm/p.baseBpm*clock.driverHz/60,bpm:clock.bpm};}
}
if(typeof module!=='undefined')module.exports={BeatClock,MotionBeatSync};else Object.assign(window,{BeatClock,MotionBeatSync});
