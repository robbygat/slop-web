import * as THREE from 'three';
import {Stage} from './mobile/scene/Stage';
import {drawFace} from './mobile/face2d';
import {robotSpec} from '../lib/robot-catalog.js';
import {expressiveFace} from '../lib/robot-expression.js';
import {heroRenderBudget} from '../lib/hero-policy.js';

/** The app's real seven-shell cast, with a bounded website render budget. */
export function createHeroScene(canvas:HTMLCanvasElement,options:any){
 const coarse=matchMedia('(pointer: coarse)').matches;
 const bounds=canvas.getBoundingClientRect();
 let budget=heroRenderBudget({width:bounds.width,height:bounds.height,dpr:window.devicePixelRatio,coarse});
 const faces:any[]=[];
 let playing=false,reduced=false,disposed=false;
 const point=new THREE.Vector3();
 const stage=new Stage(canvas,{
  onEquip:id=>options.onSelect(id),
  beforeRender:time=>{
   for(const f of faces){
    const a=f.actor,s=a.shell.screenSpec;
    const fps=a.shell.id===stage.equippedId?budget.maxFPS:budget.faceFPS;
    if(f.paintedAt===null||time-f.paintedAt>=1/fps-.001){
     const state=expressiveFace(f.spec,time,a.motion ? .5 : a.hello);
     drawFace(f.surface,{...state,gazeX:a.lookYaw,gazeY:a.lookPitch},s.w/s.h,s.r/s.h,s.shape==='circle',time,1);
     f.texture.needsUpdate=true;f.paintedAt=time;
    }
    point.copy(a.shell.root.position).project(stage.camera);
    const x=(point.x+1)*.5,y=(1-point.y)*.5,flying=a.motion!==null;
    if(Math.abs(x-f.x)>.0006||Math.abs(y-f.y)>.0006||f.flying!==flying){
     options.onPosition(a.shell.id,x,y,flying);f.x=x;f.y=y;f.flying=flying;
    }
   }
  },
 },{brandBackdrop:true,dprCap:budget.dprCap,maxFPS:budget.maxFPS,particles:budget.particles,intro:false,powerPreference:coarse?'low-power':'high-performance'});
 for(const [id,actor] of stage.actors){
  const spec=robotSpec(null,{shell:id,face:id==='core'?'slop':['chip','gatekeeper'].includes(id)?'hearts':'happy',glow:id==='core'||id==='gatekeeper'?'lime':id==='neko'?'pink':'white'});
  const s=actor.shell.screenSpec,surface=document.createElement('canvas');
  surface.width=budget.faceSize;surface.height=Math.round(budget.faceSize/(s.w/s.h));
  const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;
  const uniforms=actor.shell.face.material.uniforms;
  uniforms.uAppFace.value=texture;uniforms.uAppFaceEnabled.value=1;uniforms.uGlow.value.set(spec.glow);
  uniforms.uBright.value=0;uniforms.uGlitch.value=0;
  faces.push({actor,spec:{...spec,seed:actor.seed},surface,texture,paintedAt:null,x:Infinity,y:Infinity,flying:null});
 }
 stage.stopShowcase();stage.framed=true;
 // The generated world image shows through the transparent canvas. Geometry is
 // limited to the actual cast, swap effects, and the lines connecting actors.
 stage.scene.fog=null;stage.renderer.setClearColor(0x000000,0);
 stage.world.synapses.group.traverse((object:any)=>{
  if(object.material?.uniforms?.uColor)object.material.uniforms.uColor.value.set('#c8ff63');
 });
 const refresh=()=>{for(const f of faces){f.x=Infinity;f.y=Infinity;}};
 return {
  resize:(w:number,h:number,paint=true)=>{
   if(disposed)return;
   budget=heroRenderBudget({width:w,height:h,dpr:window.devicePixelRatio,coarse});
   stage.setRenderBudget(budget.dprCap,budget.maxFPS);stage.resize(w,h);refresh();if(paint)stage.drawStill();
  },
  refreshPositions:()=>{if(!disposed){refresh();if(playing)stage.redraw();}},
  activate:(id:string)=>{
   if(disposed)return;
   for(const f of faces)f.paintedAt=null;
   if(!playing||reduced){stage.equipNow(id);stage.drawStill();}else stage.activate(id);
  },
  setActive:(value:boolean,reduce:boolean)=>{
   if(disposed)return;
   const changed=playing!==value||reduced!==reduce;
   playing=value;reduced=reduce;stage.setReduced(reduce);
   if(value&&!reduce)stage.start();else{stage.stop();if(value&&changed)stage.drawStill();}
  },
  dispose:()=>{if(disposed)return;disposed=true;stage.dispose();for(const f of faces)f.texture.dispose();},
 };
}
