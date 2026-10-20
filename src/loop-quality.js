// Search source poses only. No cross-fade, root offset, retargeting, or VMD mutation.
export function compareLoopIntervals(view,state,baseBpm=120,loopBeats=8){
 const duration=state.duration,span=loopBeats*60/baseBpm;
 const names=['センター','グルーブ','下半身','上半身','上半身2','首','頭','左足','右足','左ひざ','右ひざ','左足首','右足首'];
 const bones=view.model.runtimeBones.filter(b=>names.includes(b.name));
 const evaluate=t=>{view.render({...state,time:t,playing:false},0);return Object.fromEntries(bones.map(b=>[b.name,Array.from(b.worldMatrix)]));};
 const distance=(a,b)=>{let translation=0,rotation=0,feet=0;for(const name of Object.keys(a)){const p=a[name],q=b[name],d=Math.hypot(p[12]-q[12],p[13]-q[13],p[14]-q[14]);translation+=d;rotation+=Math.sqrt([0,1,2,4,5,6,8,9,10].reduce((s,i)=>s+(p[i]-q[i])**2,0));if(/足首/.test(name))feet+=d;}return {translationMean:translation/bones.length,rotationMean:rotation/bones.length,feetSum:feet,score:translation/bones.length+rotation/bones.length+feet*2};};
 function candidate(start){const a=evaluate(start),b=evaluate(start+span-1/300),middle=evaluate(start+span/2),d=distance(a,b),movement=distance(a,middle);return {startSeconds:start,endSeconds:start+span,baseBpm,loopBeats,...d,middlePoseChange:movement.score,footMovement:movement.feetSum};}
 const baseline=candidate(32),candidates=[];
 // Phase is relative to the selected segment, not an inferred musical BPM of the VMD.
 for(let t=8;t+span<duration-2;t+=60/baseBpm){const c=candidate(t);if(c.middlePoseChange>=Math.max(3,baseline.middlePoseChange*.6)&&c.footMovement>=Math.max(.7,baseline.footMovement*.4))candidates.push(c);}
 candidates.sort((a,b)=>a.score-b.score);const best=candidates[0]||baseline;
 view.model.initializePhysics();return {method:'Beat-grid source interval selection; no blended feet/root',baseline,best,candidates:candidates.slice(0,20),searched:candidates.length,sourceDuration:duration,visualApprovalRequired:true,excludedQuietSegments:true,minFootMovement:Math.max(.7,baseline.footMovement*.4)};
}
