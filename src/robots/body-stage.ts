import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {makeShell} from './mobile/robots';
import {drawFace} from './mobile/face2d';
import {updateSharedUniforms} from './mobile/scene/toon';
import {disposeStageTree} from './mobile/live-loop.mjs';
import {expressiveFace} from '../lib/robot-expression.js';

export async function createBodyStage(canvas:HTMLCanvasElement){
 const gltf=await new GLTFLoader().loadAsync('/assets/robots/models/slop-core.glb');
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,30);
 const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();scene.environment=environment.texture;scene.environmentIntensity=.8;
 scene.add(new THREE.HemisphereLight('#ffffff','#a7a5c7',1.1));
 const key=new THREE.DirectionalLight('#ffffff',2.5);key.position.set(-3,4,5);scene.add(key);
 const rim=new THREE.DirectionalLight('#92cdff',1.5);rim.position.set(3,2,-3);scene.add(rim);
 const orbit=new THREE.Group(),model=gltf.scene;orbit.add(model);scene.add(orbit);
 const mixer=new THREE.AnimationMixer(model);for(const clip of gltf.animations)mixer.clipAction(clip).play();
 const mount=model.getObjectByName('HeadMount')!,core=model.getObjectByName('CoreHead')!,neck=model.getObjectByName('Neck')!,arm=model.getObjectByName('LeftShoulder')!,elbow=model.getObjectByName('LeftElbow')!;
 let head:any=null,face:HTMLCanvasElement|null=null,texture:THREE.CanvasTexture|null=null,spec:any=null;
 const rest=[neck,arm,elbow].map(joint=>({joint,rotation:joint.rotation.clone()}));
 let active=false,visible=false,reduced=false,disposed=false,frame=0,last=0,time=0,turn=-.15,target=-.15,reactAt=.25,nextWave=12,dragging=false,moved=0,dragX=0,gazeX=0,gazeY=0;
 function releaseHead(){if(head){mount.remove(head.root);disposeStageTree(head.pivot);head=null;}texture?.dispose();texture=null;face=null;}
 function select(next:any){
  spec=next;releaseHead();core.visible=next.shell==='core'&&next.finish==='signature'&&next.face==='slop';
  if(!core.visible){
   head=makeShell(next.shell,next.finish);const bounds=new THREE.Box3().setFromObject(head.root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=1.13/Math.max(size.x,.5);
   head.root.scale.setScalar(scale);head.root.position.copy(center.multiplyScalar(-scale));mount.add(head.root);
   face=document.createElement('canvas');face.width=320;face.height=Math.round(320/(head.screenSpec.w/head.screenSpec.h));texture=new THREE.CanvasTexture(face);texture.colorSpace=THREE.SRGBColorSpace;
   const u=head.face.material.uniforms;u.uAppFace.value=texture;u.uAppFaceEnabled.value=1;u.uBright.value=0;u.uLine.value.setRGB(0,0,0);u.uGlow.value.set(next.glow);
  }
  const colors:any={neko:'#ff87d9',clicky:'#ffca39',gatekeeper:'#516acb',blocky:'#83c66a',chip:'#f25e5e',drizzle:'#88bcff',liftoff:'#ff654e',noir:'#6b7384','coin-op':'#eb66ba',glowcap:'#a597ef'};
  const finishes:any={bubblegum:'#ff89d7',mint:'#79dca8',sky:'#5ac2ff',gold:'#efbd50',sunny:'#f3cf58',grape:'#b599ee',tangerine:'#ff9d52',cherry:'#f75f77',midnight:'#37404c'};
  model.traverse((o:any)=>{if(o.isMesh&&o.material.name.startsWith('Accent'))o.material.color.set(finishes[next.finish]||colors[next.shell]||'#48b5fa');});
  draw(0);
 }
 function wave(){if(reduced)return;reactAt=time;nextWave=time+12;sync();}
 function react(){if(reduced)return;target+=Math.PI*2;wave();}
 function draw(dt:number){
  time+=dt;
  // Procedural motion is always relative to the authored pose. Repeated still
  // frames/resizes must not accumulate rotations and twist the joints.
  for(const {joint,rotation} of rest)joint.rotation.copy(rotation);
  mixer.update(reduced?0:dt);turn=THREE.MathUtils.damp(turn,target,4,dt||1/30);
  if(!reduced&&!dragging&&time>=nextWave){reactAt=time;nextWave=time+12;}
  const elapsed=time-reactAt,envelope=elapsed>=0&&elapsed<2.4?Math.sin(Math.PI*elapsed/2.4):0;
  orbit.rotation.set(reduced?0:Math.sin(time*.7)*.025,turn+gazeX*.10,reduced?0:Math.sin(time*.9)*.025);
  orbit.position.y=reduced?0:Math.sin(time*1.4)*.045+envelope*.17;
  if(!reduced){neck.rotation.y+=gazeX*.15;neck.rotation.x+=gazeY*.06;arm.rotation.z-=envelope*.9;elbow.rotation.x-=envelope*(.45+Math.sin(elapsed*10)*.18);}
  if(head&&face&&texture){const s=head.screenSpec;head.update(dt,time);drawFace(face,{...expressiveFace(spec,reduced?0:time,envelope),gazeX,gazeY},s.w/s.h,s.r/s.h,s.shape==='circle',time,1);texture.needsUpdate=true;}
  updateSharedUniforms(camera,canvas.clientHeight*renderer.getPixelRatio(),time);renderer.render(scene,camera);
 }
 function tick(now:number){if(!active||disposed)return;frame=requestAnimationFrame(tick);if(now-last<1000/30)return;const dt=Math.min((now-last)/1000,.05);last=now;draw(dt);}
 function sync(){const run=visible&&!document.hidden&&!reduced&&!disposed;if(run&&!active){active=true;last=performance.now();frame=requestAnimationFrame(tick);}else if(!run){active=false;cancelAnimationFrame(frame);if(!disposed)draw(0);}}
 function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.set(0,1.4,Math.max(5.35,2.85/camera.aspect));camera.lookAt(0,1.26,0);camera.updateProjectionMatrix();draw(0);}
 const down=(e:PointerEvent)=>{dragging=true;moved=0;dragX=e.clientX;canvas.setPointerCapture(e.pointerId);};
 const move=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();gazeX=(e.clientX-r.left)/r.width*2-1;gazeY=(e.clientY-r.top)/r.height*2-1;if(dragging){const delta=e.clientX-dragX;moved+=Math.abs(delta);target+=delta*.012;dragX=e.clientX;}if(reduced){turn=target;draw(0);}};
 const up=()=>{if(dragging&&moved<8)react();dragging=false;};const cancel=()=>{dragging=false;};const leave=()=>{gazeX=0;gazeY=0;};
 const lost=(e:Event)=>{e.preventDefault();active=false;cancelAnimationFrame(frame);};const restored=()=>{resize();sync();};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
 const ro=new ResizeObserver(resize);ro.observe(canvas);document.addEventListener('visibilitychange',sync);resize();
 return {select,react,wave,setActive(v:boolean,r=false){visible=v;reduced=r;sync();},dispose(){disposed=true;active=false;cancelAnimationFrame(frame);ro.disconnect();document.removeEventListener('visibilitychange',sync);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);releaseHead();mixer.stopAllAction();mixer.uncacheRoot(model);model.traverse((o:any)=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});environment.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
