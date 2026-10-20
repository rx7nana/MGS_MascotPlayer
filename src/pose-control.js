import {Quaternion} from '@babylonjs/core';
export class PoseControl {
 constructor(model){this.model=model;this.bones=new Map();this.expressions=new Map();this.saved=new Map();this.trackNames=new Set();this.look=null;}
 setBone(name,rotation,weight=1){const b=this.model.runtimeBones.find(b=>b.name===name);if(!b)return;if(!this.saved.has(name))this.saved.set(name,(b.linkedBone.rotationQuaternion||Quaternion.Identity()).clone());this.bones.set(name,{rotation,weight:Math.max(0,Math.min(1,weight))});}
 clearBone(name){const b=this.model.runtimeBones.find(b=>b.name===name);if(b&&this.saved.has(name))b.linkedBone.rotationQuaternion=this.saved.get(name).clone();this.saved.delete(name);this.bones.delete(name);}
 setLook(yaw,pitch,weight=.7){const y=Math.max(-.4,Math.min(.4,yaw)),p=Math.max(-.25,Math.min(.25,pitch));for(const name of ['左目','右目'])this.setBone(name,[p,y,0],weight);}
 setExpression(name,value){this.expressions.set(name,Math.max(0,Math.min(1,value)));}
 clear(){for(const name of [...this.bones.keys()])this.clearBone(name);for(const name of this.expressions.keys())this.model.morph.setMorphWeight(name,0);this.expressions.clear();this.look=null;}
 apply(){for(const [name,p] of this.bones){const b=this.model.runtimeBones.find(b=>b.name===name);if(b){const q=Quaternion.FromEulerAngles(...p.rotation),base=this.trackNames.has(name)?b.linkedBone.rotationQuaternion:this.saved.get(name);b.linkedBone.rotationQuaternion=Quaternion.Slerp(base||Quaternion.Identity(),q,p.weight);}}for(const [name,value] of this.expressions)this.model.morph.setMorphWeight(name,value);}
}
