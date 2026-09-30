import * as THREE from 'three';
import {makeShell} from './mobile/robots';
import {drawFace} from './mobile/face2d';
import {buildAccessory} from './mobile/accessories';
import {updateSharedUniforms} from './mobile/scene/toon';
import {disposeStageTree} from './mobile/live-loop.mjs';
import {robotSpec} from '../lib/robot-catalog.js';
import {expressiveFace} from '../lib/robot-expression.js';

/** One context for the whole hero. Mobile geometry, materials, face and crown. */
export function createRobotStage(canvas:HTMLCanvasElement,{crowd=false,crown='none',onReady=()=>{}}={}) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0,0);renderer.toneMapping=THREE.NoToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,100);
  camera.position.set(0,0,9.1);camera.lookAt(0,0,0);
  let actors:any[]=[],frame=0,last=0,time=0,active=false,disposed=false,visible=true,reduced=false,selected='';
  let pointerX=0,pointerY=0,spin=0,dragging=false,dragX=0,hop=0;
  const make=(spec:any,x:number,y:number,scale:number,index:number)=>{
    const shell=makeShell(spec.shell,spec.finish),u=shell.face.material.uniforms;
    u.uBright.value=0;u.uLine.value.setRGB(0,0,0);u.uGlow.value.set(spec.glow);
    const surface=document.createElement('canvas'),s=shell.screenSpec;surface.width=index===0?384:192;surface.height=Math.round(surface.width/(s.w/s.h));
    const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;
    u.uAppFace.value=texture;u.uAppFaceEnabled.value=1;
    // Match mobile: stored cosmetic headgear stays parked; the hero wears the competitive crown.
    if(index===0&&(crowd||crown==='gold'||crown==='diamond'))shell.pivot.add(buildAccessory('crown',shell,crowd||crown==='diamond'?'diamond':'gold').group);
    shell.root.position.set(x,y,index===0?.4:-.4);shell.root.scale.setScalar(scale);scene.add(shell.root);
    return {shell,spec:{...spec,seed:.19+index*.41},surface,texture,s,x,y,scale,index};
  };
  const release=()=>{for(const a of actors){scene.remove(a.shell.root);disposeStageTree(a.shell.pivot);}actors=[];};
  function select(raw:any){
    const spec=robotSpec(null,raw),key=JSON.stringify(spec);if(key===selected)return;selected=key;
    release();actors.push(make(spec,0,crowd?-.2:0,crowd?1.48:1.85,0));
    if(crowd){
      [['neko',-1.72,1.48,.66],['gatekeeper',1.62,1.56,.67],['clicky',2.25,-.18,.62],['blocky',1.62,-1.48,.57],['drizzle',-1.75,-1.33,.61],['liftoff',-2.38,.03,.60]].forEach(([id,x,y,s],i)=>{
        const shell=id===spec.shell?'glowcap':id;actors.push(make(robotSpec(null,{shell,face:i%2?'hearts':'happy',glow:i%2?'lime':'white'}),Number(x),Number(y),Number(s),i+1));
      });
    }
    hop=.7;draw(0);onReady();
  }
  function draw(dt:number){
    time+=dt;hop=Math.max(0,hop-dt*1.6);
    for(const a of actors){
      const t=time+a.index*.93,main=a.index===0;
      a.shell.root.position.y=a.y+(reduced?0:Math.sin(t*1.35)*.065)+(main?Math.sin(hop*Math.PI)*.2:0);
      a.shell.root.rotation.set(pointerY*.07+(reduced?0:Math.sin(t*.8)*.05), -.18+(main?spin+pointerX*.25+Math.sin(t*.65)*.09:Math.sin(t*.6)*.15),main?-.045+pointerX*.025+Math.sin(t*1.2)*.028:Math.sin(t*.8)*.07);
      a.shell.update(dt,time);const u=a.shell.face.material.uniforms;u.uBright.value=0;u.uLine.value.setRGB(0,0,0);
      drawFace(a.surface,{...expressiveFace(a.spec,reduced?0:t,main?hop:0),gazeX:pointerX*.8+Math.sin(t*.6)*.22,gazeY:pointerY*.7},a.s.w/a.s.h,a.s.r/a.s.h,a.s.shape==='circle',time,1);
      a.texture.needsUpdate=true;
    }
    updateSharedUniforms(camera,canvas.clientHeight*renderer.getPixelRatio(),time);renderer.render(scene,camera);
  }
  function tick(now:number){if(!active||disposed)return;frame=requestAnimationFrame(tick);if(now-last<1000/30)return;const dt=Math.min((now-last)/1000,.05);last=now;if(!dragging)spin*=.94;draw(dt);}
  function sync(){const run=visible&&!document.hidden&&!reduced&&!disposed;if(run&&!active){active=true;last=performance.now();frame=requestAnimationFrame(tick);}else if(!run){active=false;cancelAnimationFrame(frame);draw(0);}}
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=crowd?(camera.aspect<1.25?10.8:9.1):(camera.aspect<.8?10:8);camera.updateProjectionMatrix();draw(0);}
  const move=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();pointerX=(e.clientX-r.left)/r.width*2-1;pointerY=(e.clientY-r.top)/r.height*2-1;if(dragging){spin+=(e.clientX-dragX)*.012;dragX=e.clientX;}if(reduced)draw(0);};
  const down=(e:PointerEvent)=>{dragging=true;dragX=e.clientX;canvas.setPointerCapture(e.pointerId);hop=.7;};
  const up=()=>{dragging=false;};const leave=()=>{pointerX=0;pointerY=0;};
  const lost=(e:Event)=>{e.preventDefault();visible=false;sync();};
  const restored=()=>{visible=true;resize();sync();};
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  document.addEventListener('visibilitychange',sync);const ro=new ResizeObserver(resize);ro.observe(canvas);
  return {select,setActive(v:boolean,reduce=false){visible=v;reduced=reduce;sync();},react(){hop=.85;spin=0;draw(0);},dispose(){disposed=true;active=false;cancelAnimationFrame(frame);ro.disconnect();document.removeEventListener('visibilitychange',sync);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);release();renderer.dispose();renderer.forceContextLoss();}};
}
