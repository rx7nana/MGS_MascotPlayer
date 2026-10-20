// Events retain exact pitches/times; the visual adapter may reduce hand motion.
export class PerformanceEvents {
 constructor(data){this.data=data;this.lastTime=null;}
 sample(time){const t=((time%this.data.duration)+this.data.duration)%this.data.duration;const active=this.data.events.find(e=>e.noteOn<=t&&t<e.noteOff)||null;const previous=[...this.data.events].reverse().find(e=>e.noteOn<=t)||this.data.events[this.data.events.length-1];return{time:t,active,previous,discontinuity:this.lastTime!==null&&Math.abs(time-this.lastTime)>.4};}
 mark(time){this.lastTime=time;}
}
