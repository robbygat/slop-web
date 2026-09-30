import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
const canvas=document.querySelector('canvas')!;
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,100);
camera.position.set(2,1.6,5.4);camera.lookAt(0,1.28,0);
const environment=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
const env=pmrem.fromScene(environment,.04);scene.environment=env.texture;scene.environmentIntensity=.5;environment.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#f9faff','#a6a3c4',.6));
const light=new THREE.DirectionalLight('#fff9f0',1.7);light.position.set(-3,5,5);scene.add(light);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.target.set(0,1.28,0);controls.minDistance=3;controls.maxDistance=9;
let mixer:THREE.AnimationMixer|null=null,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion=document.getElementById('motion')!;const label=()=>motion.textContent=paused?'Play animation':'Pause animation';label();
motion.addEventListener('click',()=>{paused=!paused;label();});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>{
 const view=button.dataset.view;camera.position.set(view==='side'?5.5:0,1.35,view==='back'?-5.5:view==='side'?0:5.5);controls.target.set(0,1.28,0);controls.update();
}));
new ResizeObserver(()=>{const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(canvas);
new GLTFLoader().load('/assets/robots/models/slop-core.glb',gltf=>{
 scene.add(gltf.scene);mixer=new THREE.AnimationMixer(gltf.scene);for(const clip of gltf.animations)mixer.clipAction(clip).play();
 document.getElementById('status')!.textContent='3D model ready · 49 meshes · Animated joints';
},undefined,()=>{document.getElementById('status')!.textContent='The model could not load. Refresh to try again.';});
let previous=performance.now();
renderer.setAnimationLoop(now=>{const dt=Math.min((now-previous)/1000,.05);previous=now;if(!document.hidden&&!paused)mixer?.update(dt);controls.update();renderer.render(scene,camera);});
