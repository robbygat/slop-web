import * as THREE from 'three';
import {Stage} from './mobile/scene/Stage';
import {drawFace} from './mobile/face2d';
import {robotSpec} from '../lib/robot-catalog.js';
import {expressiveFace} from '../lib/robot-expression.js';

/** Original orbit choreography with the app's screen painter, one face per shell. */
export function createHeroScene(canvas:HTMLCanvasElement, options:any) {
  const faces:any[]=[];
  let playing=false,reduced=false;
  const point=new THREE.Vector3();
  const stage=new Stage(canvas,{
    onEquip:id=>options.onSelect(id),
    beforeRender:time=>{
      for (const f of faces) {
        const a=f.actor, s=a.shell.screenSpec;
        const state=expressiveFace(f.spec,time,a.motion ? .5 : a.hello);
        drawFace(f.surface,{...state,gazeX:a.lookYaw,gazeY:a.lookPitch},s.w/s.h,s.r/s.h,s.shape==='circle',time,1);
        f.texture.needsUpdate=true;
        a.shell.face.material.uniforms.uBright.value=0;
        a.shell.face.material.uniforms.uGlitch.value=0;
        point.copy(a.shell.root.position).project(stage.camera);
        options.onPosition(a.shell.id,(point.x+1)*.5,(1-point.y)*.5,a.motion!==null);
      }
    },
  });
  for (const [id,actor] of stage.actors) {
    const spec=robotSpec(null,{shell:id,face:id==='core'?'slop':id==='chip'||id==='gatekeeper'?'hearts':'happy',glow:id==='core'||id==='gatekeeper'?'lime':id==='neko'?'pink':'white'});
    const s=actor.shell.screenSpec, surface=document.createElement('canvas');
    surface.width=320;surface.height=Math.round(320/(s.w/s.h));
    const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;
    const uniforms=actor.shell.face.material.uniforms;
    uniforms.uAppFace.value=texture;uniforms.uAppFaceEnabled.value=1;
    uniforms.uGlow.value.set(spec.glow);
    faces.push({actor,spec:{...spec,seed:actor.seed},surface,texture});
  }
  stage.stopShowcase();stage.measure=options.measure;stage.world.useBrandBackdrop();
  stage.world.synapses.group.traverse((object:any)=>{
    if(object.material?.uniforms?.uColor)object.material.uniforms.uColor.value.set('#c8ff63');
  });
  return {
    resize:(w:number,h:number)=>{stage.resize(w,h);stage.drawStill();},
    refreshPositions:()=>stage.redraw(),
    activate:(id:string)=>{if(!playing||reduced){stage.equipNow(id);stage.drawStill();}else stage.activate(id);},
    setActive:(value:boolean,reduce:boolean)=>{playing=value;reduced=reduce;stage.setReduced(reduce);if(value&&!reduce)stage.start();else{stage.stop();if(value)stage.drawStill();}},
    dispose:()=>stage.dispose(),
  };
}
