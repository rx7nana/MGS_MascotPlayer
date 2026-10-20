import {whiteAppearance} from './white-appearance.js';
import {createInstrument} from './instrument.js';import {ArmCoverController as PerformanceController} from './arm-cover-controller.js';
import {Engine,Scene,Vector3,ArcRotateCamera,HemisphericLight,DirectionalLight,LoadAssetContainerAsync} from '@babylonjs/core';
import 'babylon-mmd/esm/Loader/index';
import {MotionDriver} from './motion-driver.js';
import {MmdRuntime} from 'babylon-mmd/esm/Runtime/mmdRuntime';
import 'babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation';
import '@babylonjs/core/Physics/v1/physicsEngineComponent';
import {MmdAmmoJSPlugin} from 'babylon-mmd/esm/Runtime/Physics/mmdAmmoJSPlugin';
import {MmdAmmoPhysics} from 'babylon-mmd/esm/Runtime/Physics/mmdAmmoPhysics';
import {PoseControl} from './pose-control.js';
export async function createView(canvas){
 const engine=new Engine(canvas,true,{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true});engine.setHardwareScalingLevel(window.devicePixelRatio>1?1/window.devicePixelRatio:1);
 const scene=new Scene(engine);scene.clearColor.set(0,0,0,0);const camera=new ArcRotateCamera('camera',-Math.PI/2,Math.PI/2-.12,50,new Vector3(0,10,0),scene);camera.mode=1;
 new HemisphericLight('ambient',new Vector3(0,1,0),scene).intensity=.9;new DirectionalLight('key',new Vector3(-1,-2,1),scene).intensity=1.1;
 const {default:Ammo}=await import('/ammo.wasm.js');const ammo=await Ammo({wasmBinary:await(await fetch('/ammo.wasm.wasm')).arrayBuffer()});const plugin=new MmdAmmoJSPlugin(true,ammo);plugin.setFixedTimeStep(1/120);plugin.setMaxSteps(8);scene.enablePhysics(new Vector3(0,-98,0),plugin);
 const runtime=new MmdRuntime(scene,new MmdAmmoPhysics(scene));runtime.autoPhysicsInitialization=true;scene.onAfterPhysicsObservable.add(()=>runtime.afterPhysics());
 const container=await LoadAssetContainerAsync('/model/TEST_MODEL_mmd_phase3_v002.pmx',scene);container.addAllToScene();const mesh=container.meshes.find(m=>m.metadata?.bones);if(!mesh)throw Error('PMX骨格を読み込めません');const md=mesh.metadata;
 let min=Infinity,max=-Infinity;for(const m of container.meshes){const p=m.getVerticesData('position');if(p)for(let i=1;i<p.length;i+=3){min=Math.min(min,p[i]);max=Math.max(max,p[i]);}}const height=max-min;mesh.position.y=-min;
 const model=runtime.createMmdModel(mesh,{buildPhysics:true,trimMetadata:false}),pose=new PoseControl(model),motion=new MotionDriver(scene,model);
 const layout=await(await fetch('/assets/keytar-layout.json')).json(),eventData=await(await fetch('/assets/test-notes.json')).json(),approvedPose=await(await fetch('/assets/approved-palm-pose.json')).json(),instrument=await createInstrument(scene,layout,approvedPose),performanceControl=new PerformanceController(model,instrument,eventData,approvedPose);await scene.whenReadyAsync();const white=whiteAppearance(scene,instrument);for(const m of container.materials)if(m.diffuseTexture&&!/EyeIris|EyeHighlight|FaceBrow|FaceEyeline/.test(m.name)){m.transparencyMode=1;m.alphaCutOff=.5;m.diffuseTexture.hasAlpha=true;m.useAlphaFromDiffuseTexture=true;m.forceDepthWrite=true;}
 let viewConfig={};function config(c){viewConfig=c;white.apply(c.whiteMode);performanceControl.configure({...c,rightHandMode:'B'});engine.resize();const aspect=canvas.width/canvas.height,h=height*.84375/c.scale;camera.setTarget(new Vector3(-c.offsetX*height,height*(.53+c.offsetY),0));camera.alpha=-Math.PI/2-c.angle*Math.PI/180;camera.beta=Math.PI/2-.12;camera.radius=height*3;camera.orthoTop=h;camera.orthoBottom=-h;camera.orthoLeft=-h*aspect;camera.orthoRight=h*aspect;}
 function detailCamera(){if(viewConfig.whiteView!=='instrument')return;camera.setTarget(instrument.world([.04,.10,.025]));camera.alpha=viewConfig.angle===45?-3*Math.PI/4:-Math.PI/2;camera.beta=Math.PI/2-.22;const h=7.8,aspect=canvas.width/canvas.height;camera.orthoTop=h;camera.orthoBottom=-h;camera.orthoLeft=-h*aspect;camera.orthoRight=h*aspect;}
 function render(state,dt){engine.beginFrame();performanceControl.restore();if(motion.loaded)runtime.seekAnimation(state.time*30,true);pose.apply();model.beforePhysics(null);performanceControl.update(state,dt);scene.physicsEnabled=state.playing;runtime.beforePhysics(state.playing?dt*1000:0);detailCamera();scene.render();if(!state.playing)runtime.afterPhysics();engine.endFrame();}
 return{white,currentFrame:()=>runtime.currentFrameTime,camera,config,loadMotion:async(url,name)=>{const info=await motion.load(url,name);if(info)pose.trackNames=new Set(info.sourceBoneNames);return info;},clearMotion(){motion.clear();pose.clear();pose.trackNames.clear();},render,pose,canvas,model,scene,engine,instrument,performanceControl,metrics:{height,bones:md.bones.length,morphs:md.morphs.length,rigidBodies:md.rigidBodies.length,joints:md.joints.length,materials:md.materials.length,physics:true},sample:()=>({rightArm:Array.from(model.runtimeBones.find(b=>b.name==='右腕').worldMatrix),ik:model.runtimeBones.filter(b=>b.ikSolver).map(b=>b.name)}),dispose(){runtime.dispose();scene.dispose();engine.dispose();}};
}
