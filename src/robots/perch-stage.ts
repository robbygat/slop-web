import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
export async function createPerchStage(canvas:HTMLCanvasElement){
 const {scene:model}=await new GLTFLoader().loadAsync('/assets/robots/models/slop-seated.glb');
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.1,1.1,1.1,-1.1,.1,30);
 const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();scene.environment=environment.texture;scene.environmentIntensity=1;
 scene.add(new THREE.HemisphereLight('#ffffff','#9d91c2',1.2));const key=new THREE.DirectionalLight('#fffaf2',3);key.position.set(-3,5,4);scene.add(key);
 const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const mount=new THREE.Group();model.position.sub(center);mount.add(model);mount.scale.setScalar(1.75/size.y);scene.add(mount);
 camera.position.set(1.8,1.2,5);camera.lookAt(0,0,0);
 let active=false,visible=false,reduced=false,disposed=false,frame=0,last=0,time=0;
 function draw(dt=0){time+=dt;mount.rotation.y=reduced?0:Math.sin(time*.65)*.018;renderer.render(scene,camera);}
 function tick(now:number){if(!active||disposed)return;frame=requestAnimationFrame(tick);if(now-last<1000/24)return;const dt=Math.min((now-last)/1000,.05);last=now;draw(dt);}
 function sync(){const run=visible&&!reduced&&!document.hidden&&!disposed;if(run&&!active){active=true;last=performance.now();frame=requestAnimationFrame(tick);}else if(!run){active=false;cancelAnimationFrame(frame);if(!disposed)draw();}}
 function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.left=-1.1*w/h;camera.right=1.1*w/h;camera.updateProjectionMatrix();draw();}
 const ro=new ResizeObserver(resize);ro.observe(canvas);document.addEventListener('visibilitychange',sync);resize();
 return {setActive(v:boolean,r=false){visible=v;reduced=r;sync();},dispose(){disposed=true;active=false;cancelAnimationFrame(frame);ro.disconnect();document.removeEventListener('visibilitychange',sync);model.traverse((o:any)=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});environment.dispose();renderer.dispose();renderer.forceContextLoss();}};
}
