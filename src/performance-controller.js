import {Vector3,Quaternion,Matrix} from '@babylonjs/core';
import {PerformanceEvents} from './performance-events.js';
const point=b=>new Vector3(b.worldMatrix[12],b.worldMatrix[13],b.worldMatrix[14]);
const worldQ=b=>{const q=new Quaternion();Matrix.FromArray(b.worldMatrix).decompose(undefined,q);return q;};
function arc(a,b){a=a.normalize();b=b.normalize();let dot=Math.min(1,Math.max(-1,Vector3.Dot(a,b)));if(dot<-.9999){const axis=Vector3.Cross(a,new Vector3(0,1,0));if(axis.lengthSquared()<.001)axis.copyFrom(Vector3.Cross(a,new Vector3(1,0,0)));return Quaternion.RotationAxis(axis.normalize(),Math.PI);}const axis=Vector3.Cross(a,b);return new Quaternion(axis.x,axis.y,axis.z,1+dot).normalize();}
export class PerformanceController {
 constructor(model,instrument,data,approvedPose){this.approvedPose=approvedPose;this.model=model;this.instrument=instrument;this.events=new PerformanceEvents(data);this.config={instrumentVisible:true,performanceEnabled:true,glowEnabled:true};this.bones=new Map(model.runtimeBones.map(b=>[b.name,b]));this.chest=this.bones.get('上半身2')||this.bones.get('上半身');this.x=0;this.blend=0;this.metrics={};this.saved=new Map();}
 configure(c){this.config=c;this.instrument.setVisible(c.instrumentVisible);this.instrument.setGlow(c.glowEnabled);}
 restore(){for(const[n,q]of this.saved)this.bones.get(n).linkedBone.rotationQuaternion=q;this.saved.clear();}
 aim(name,child,target,weight){const b=this.bones.get(name),c=this.bones.get(child);if(!b||!c)return;const q=worldQ(b),delta=arc(point(c).subtract(point(b)),target.subtract(point(b))),desired=delta.multiply(q),parent=b.parentBone?worldQ(b.parentBone):Quaternion.Identity(),local=parent.conjugate().multiply(desired);if(!this.saved.has(name))this.saved.set(name,b.linkedBone.rotationQuaternion.clone());b.linkedBone.rotationQuaternion=Quaternion.Slerp(b.linkedBone.rotationQuaternion,local,weight);b.updateWorldMatrix(false,false);for(const ch of b.childBones)this.refresh(ch);}
 refresh(b){b.updateWorldMatrix(false,false);for(const c of b.childBones)this.refresh(c);}
 arm(side,target,weight){const upper=this.bones.get(side+'腕'),elbow=this.bones.get(side+'ひじ'),wrist=this.bones.get(side+'手首');if(!upper||!elbow||!wrist)return null;const s=point(upper),e=point(elbow),w=point(wrist),l1=Vector3.Distance(s,e),l2=Vector3.Distance(e,w),dir=target.subtract(s),distance=dir.length();dir.normalize();const reach=Math.min(l1+l2-.005,Math.max(Math.abs(l1-l2)+.005,distance)),clamped=s.add(dir.scale(reach)),chest=Matrix.FromArray(this.chest.worldMatrix),pole=this.instrument.world(this.approvedPose.elbowPole[side]).subtract(s).normalize();let perp=pole.subtract(dir.scale(Vector3.Dot(pole,dir))).normalize();const along=(l1*l1-l2*l2+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,l1*l1-along*along)),desiredElbow=s.add(dir.scale(along)).add(perp.scale(height));this.aim(side+'腕',side+'ひじ',desiredElbow,weight);this.aim(side+'ひじ',side+'手首',clamped,weight);
 return{target:target.asArray(),wrist:point(wrist).asArray(),error:Vector3.Distance(point(wrist),target),reachClamped:distance>l1+l2-.005};}

 rotateWorld(b,desired,weight){const parent=b.parentBone?worldQ(b.parentBone):Quaternion.Identity(),local=parent.conjugate().multiply(desired);if(!this.saved.has(b.name))this.saved.set(b.name,b.linkedBone.rotationQuaternion.clone());b.linkedBone.rotationQuaternion=Quaternion.Slerp(b.linkedBone.rotationQuaternion,local,weight);this.refresh(b);}
 hand(side,weight){
 if(weight<.001)return;
 // World orientations relative to the instrument, exported from the approved
 // Blender pose. Preserve the complete palm/thumb/finger shape, not new curls.
 const anchorQ=this.instrument.anchor.rotationQuaternion;
 for(const [name,pose] of Object.entries(this.approvedPose.hand)){
  if(!name.startsWith(side))continue;const b=this.bones.get(name);if(!b)continue;
  this.rotateWorld(b,anchorQ.multiply(Quaternion.FromArray(pose.rotationInInstrument)),weight);
 }
 }
 poseError(side){
  let maximum=0;for(const [name,pose] of Object.entries(this.approvedPose.hand)){
   if(!name.startsWith(side))continue;const b=this.bones.get(name);if(!b)continue;
   const expected=this.instrument.world(pose.headInstrument),actual=point(b);
   maximum=Math.max(maximum,Vector3.Distance(expected,actual));
  }return maximum;
 }
 reachableRightX(requested){
 const u=this.bones.get('右腕'),e=this.bones.get('右ひじ'),w=this.bones.get('右手首'),origin=point(u);
 const radius=Vector3.Distance(origin,point(e))+Vector3.Distance(point(e),point(w))-.08;
 const y=this.approvedPose.rightWrist[1],z=this.approvedPose.rightWrist[2],p=this.instrument.world([0,y,z]),axis=this.instrument.world([1,y,z]).subtract(p),d=p.subtract(origin);
 const aa=axis.lengthSquared(),bb=2*Vector3.Dot(axis,d),cc=d.lengthSquared()-radius*radius,disc=bb*bb-4*aa*cc;
 if(disc<0)return requested;
 const low=Math.max(-.52,(-bb-Math.sqrt(disc))/(2*aa)),high=Math.min(.16,(-bb+Math.sqrt(disc))/(2*aa));
 return low<=high?Math.max(low,Math.min(high,requested)):requested;
 }
 update(state,dt){const sample=this.events.sample(state.time),enabled=this.config.performanceEnabled&&this.config.instrumentVisible&&!!state.motion;this.blend+=((enabled?1:0)-this.blend)*(1-Math.exp(-dt*9));
 this.instrument.follow(this.chest.worldMatrix);let targetX=this.instrument.layout.rangePositions[sample.active?Math.max(0,Math.min(2,Math.floor((sample.active.pitch-48)/9))):1];if(sample.discontinuity)this.x=targetX;else if(state.playing)this.x+=(targetX-this.x)*(1-Math.exp(-dt*7));
 const legBefore=['首','頭','左目','右目','センター','グルーブ','下半身','左足','右足','左ひざ','右ひざ','左足首','右足首'].map(n=>{const b=this.bones.get(n);return b?[n,...b.linkedBone.rotationQuaternion.asArray(),...b.linkedBone.position.asArray()]:[n]});
 const reachedX=this.reachableRightX(this.x);const l=this.arm('左',this.instrument.world(this.approvedPose.leftWrist),this.blend),r=this.arm('右',this.instrument.world([reachedX,this.approvedPose.rightWrist[1],this.approvedPose.rightWrist[2]]),this.blend);
 this.hand('左',this.blend);this.hand('右',this.blend);
 const legAfter=legBefore.map(row=>{const b=this.bones.get(row[0]);return b?[row[0],...b.linkedBone.rotationQuaternion.asArray(),...b.linkedBone.position.asArray()]:[row[0]];});const lowerBodyUnchanged=JSON.stringify(legBefore)===JSON.stringify(legAfter);
 sample.visualDelta=state.playing?dt:0;this.instrument.light(sample,state.time>0&&this.config.instrumentVisible&&!!state.motion);this.events.mark(state.time);this.metrics={enabled,blend:this.blend,pitch:sample.active?.pitch??null,physicalPitch:sample.active?.physicalPitch??null,track:sample.active?.track??null,rightZoneX:this.x,rightReachAdjustedX:reachedX,left:l,right:r,lowerBodyUnchanged,leftApprovedShapePositionError:this.poseError('左')};}
}


