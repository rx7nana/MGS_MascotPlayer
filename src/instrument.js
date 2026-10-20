import {Vector3,Quaternion,Matrix,TransformNode,MeshBuilder,StandardMaterial,Color3,LoadAssetContainerAsync} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
export async function createInstrument(scene,layout,approvedPose){
 const container=await LoadAssetContainerAsync('/assets/keytar-photo-v001.glb',scene);container.addAllToScene();
 const anchor=new TransformNode('PerformanceInstrumentAnchor',scene),adapter=new TransformNode('BlenderXYtoInstrumentXY',scene);adapter.parent=anchor;adapter.rotationQuaternion=Quaternion.FromEulerAngles(-Math.PI/2,0,0);adapter.scaling.z=-1;
 for(const node of container.rootNodes){node.rotationQuaternion=Quaternion.Identity();node.scaling.setAll(1);node.parent=adapter;}
 anchor.scaling.setAll(approvedPose.instrumentScale);const lights=new Map();
 for(const k of layout.notes){const m=new StandardMaterial('NoteGlow_'+k.note,scene);m.diffuseColor=Color3.Black();m.emissiveColor=new Color3(.15,.85,1);m.alpha=0;m.disableLighting=true;m.backFaceCulling=false;m.disableDepthWrite=true;const p=MeshBuilder.CreatePlane('Note_'+k.note,{width:.020,height:.047},scene);p.parent=anchor;p.position.copyFromFloats(k.position[0],k.position[1],-k.position[2]-.007);p.material=m;lights.set(k.note,p);}
 let visible=true,glow=true;const tilt=Quaternion.FromArray(approvedPose.instrumentRotationInChestRest);
 function follow(chestMatrix){const chest=Matrix.FromArray(chestMatrix),q=new Quaternion(),scale=new Vector3(),p=new Vector3();chest.decompose(scale,q,p);anchor.position.copyFrom(Vector3.TransformCoordinates(Vector3.FromArray(approvedPose.instrumentOffsetInChestRest),chest));anchor.rotationQuaternion=q.multiply(tilt);anchor.computeWorldMatrix(true);}
 return{anchor,container,layout,lights,follow,probe(){return{glbMeshes:container.meshes.length,scale:anchor.scaling.asArray(),anchor:anchor.position.asArray(),grip:this.world(layout.grip).asArray()};},setVisible(v){visible=v;anchor.setEnabled(v);},setGlow(v){glow=v;},world(v){return Vector3.TransformCoordinates(new Vector3(v[0],v[1],-v[2]),anchor.computeWorldMatrix(true));},light(sample,playing){for(const[n,p]of lights){if(!visible||!glow||!playing||sample.stopped){p.material.alpha=0;continue;}const a=sample.active?.pitch===n?(.4+.6*sample.active.volume):0;if(sample.discontinuity)p.material.alpha=a;else p.material.alpha+=(a-p.material.alpha)*(1-Math.exp(-(sample.visualDelta||0)*12));}},dispose(){container.dispose();anchor.dispose();}};
}


