import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {AnimationMixer,Box3,Vector3} from 'three';

test('full Core GLB loads with complete geometry and a working joint animation',async()=>{
 const bytes=await readFile(new URL('../public/assets/robots/models/slop-core.glb',import.meta.url));
 const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 for(const name of ['HeadMount','CoreHead','Torso','LeftShoulder','RightShoulder','LeftHip','RightHip','Crown_diamond','Slop_glyph_0'])assert.ok(model.scene.getObjectByName(name),name);
 const size=new Box3().setFromObject(model.scene).getSize(new Vector3());
 assert.ok(size.y>2.4&&size.y<3);assert.ok(size.x>1&&size.z>.5);
 let triangles=0;model.scene.traverse(node=>{
  if(!node.isMesh)return;
  const position=node.geometry.getAttribute('position');
  for(const value of position.array)assert.ok(Number.isFinite(value));
  triangles+=(node.geometry.index?.count||position.count)/3;
 });
 assert.ok(triangles>10000&&triangles<60000);assert.ok(bytes.byteLength<1200000);
 const shoulder=model.scene.getObjectByName('RightShoulder'),start=shoulder.quaternion.clone();
 const mixer=new AnimationMixer(model.scene);for(const clip of model.animations)mixer.clipAction(clip).play();mixer.update(.5);
 assert.ok(shoulder.quaternion.angleTo(start)>.005);
 for(const side of ['Left','Right']){
  assert.equal(model.scene.getObjectByName(side+'Elbow').parent.name,side+'Shoulder');
  assert.equal(model.scene.getObjectByName(side+'Wrist').parent.name,side+'Elbow');
  assert.equal(model.scene.getObjectByName(side+'Knee').parent.name,side+'Hip');
  assert.equal(model.scene.getObjectByName(side+'Ankle').parent.name,side+'Knee');
 }
 for(const clip of model.animations)for(const track of clip.tracks){
  const stride=track.getValueSize(),a=Array.from(track.values.slice(0,stride)),b=Array.from(track.values.slice(-stride));
  assert.ok(a.every((value,i)=>Math.abs(value-b[i])<.00001),track.name);
 }
});

test('the seated hero body is headless, with bent knees and unchanged joint lengths',async()=>{
 const bytes=await readFile(new URL('../public/assets/robots/models/slop-seated.glb',import.meta.url));
 const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 for(const name of ['HeadMount','CoreHead','Neck','CrownMount'])assert.equal(model.scene.getObjectByName(name),undefined,name);
 assert.equal(model.animations.length,0);model.scene.updateMatrixWorld(true);
 const position=name=>model.scene.getObjectByName(name).getWorldPosition(new Vector3());
 for(const side of ['Left','Right']){
  const hip=position(side+'Hip'),knee=position(side+'Knee'),ankle=position(side+'Ankle');
  assert.ok(knee.z-hip.z>.24,'thigh extends forward');assert.ok(hip.y-knee.y<.08,'thigh stays near horizontal');assert.ok(knee.y-ankle.y>.25,'shin drops naturally');
  for(const [child,parent,distance] of [['Elbow','Shoulder',.285],['Wrist','Elbow',.258],['Knee','Hip',.279],['Ankle','Knee',.271]]){
   const joint=model.scene.getObjectByName(side+child);assert.equal(joint.parent.name,side+parent);assert.ok(Math.abs(joint.position.length()-distance)<.001);
  }
 }
 const size=new Box3().setFromObject(model.scene).getSize(new Vector3());assert.ok(size.y>.8&&size.y<1.5);assert.ok(bytes.byteLength<750000);
});
