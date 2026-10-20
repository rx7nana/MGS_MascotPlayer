export function floorIndex(rows,sample){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].samplePosition<=sample)lo=mid+1;else hi=mid;}return lo-1;}
export class PreparedIndex{
 constructor(song){this.beats=[];this.channels=new Map();this.rate=song.rate;this.append(song.rows);}
 append(rows){for(const r of rows){if(r.kind==='beat')this.beats.push(r);}for(const r of rows)if(r.sourceType){const k=r.sourceType+':'+r.channel;if(!this.channels.has(k))this.channels.set(k,[]);this.channels.get(k).push(r);}}
 at(sample){const states=[];for(const arr of this.channels.values()){const i=floorIndex(arr,sample);if(i>=0)states.push(arr[i]);}const i=floorIndex(this.beats,sample);if(i<0)return {states,clock:this.beats[0]?{beat:0,bpm:this.beats[0].bpm,driverHz:this.beats[0].driverHz,samplePosition:sample}:null};const a=this.beats[i],b=this.beats[i+1];const beat=b?a.beat+(b.beat-a.beat)*(sample-a.samplePosition)/(b.samplePosition-a.samplePosition):a.beat+Math.min(Math.max(0,sample-a.samplePosition),this.rate/a.driverHz)*a.bpm*a.driverHz/(3600*this.rate);return {states,clock:{beat,bpm:a.bpm,driverHz:a.driverHz,samplePosition:sample}};}
}
