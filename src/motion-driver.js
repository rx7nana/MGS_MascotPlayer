import {VmdLoader} from 'babylon-mmd/esm/Loader/vmdLoader';
export class MotionDriver {
 constructor(scene,model){this.scene=scene;this.model=model;this.handle=null;}
 async load(url,name){const a=await new VmdLoader(this.scene).loadAsync(name,url);const next=this.model.createRuntimeAnimation(a);this.model.setRuntimeAnimation(next);if(this.handle!==null)this.model.destroyRuntimeAnimation(this.handle);this.handle=next;this.model.initializePhysics();return{duration:a.endFrame/30,sourceBoneNames:[...a.boneTracks,...a.movableBoneTracks].map(t=>t.name),morphTracks:a.morphTracks.map(t=>t.name),ik:a.propertyTrack.ikBoneNames};}
 get loaded(){return this.handle!==null;}
}
