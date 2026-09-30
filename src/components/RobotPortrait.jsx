import React,{useEffect,useRef} from 'react';
import meta from '../data/robots.json';
import {robotSpec} from '../lib/robot-catalog.js';
import {expressiveFace} from '../lib/robot-expression.js';
import {observePortrait} from '../lib/portrait-clock.js';

// The exact mobile sprite and screen projection, with the mobile face painter.
// Visible portraits share one bounded frame clock; no WebGL context per card.
export default function RobotPortrait({look,shell,finish,face,glow,className='',alt='Slop',onActivate,style,animated=true,loading='lazy',fetchPriority}) {
  const spec=robotSpec(look,Object.fromEntries(Object.entries({shell,finish,face,glow}).filter(([,v])=>v!==undefined)));
  const canvas=useRef(null),key=JSON.stringify(spec);
  useEffect(()=>{
    let disposed=false,cleanup=()=>{};
    import('../robots/mobile/face2d.ts').then(({drawFace})=>{
      if(disposed||!canvas.current)return;
      const screen=meta.shells[spec.shell]?.screen;if(!screen)return;
      const source=document.createElement('canvas');source.width=320;source.height=Math.round(320/screen.aspect);
      const ctx=canvas.current.getContext('2d'),q=screen.quad.map(([x,y])=>[x*640,y*640]);
      // Two clipped affine triangles preserve the sprite's perspective quad.
      const triangle=(a,b,c,sa,sb,sc)=>{
        const denom=sa[0]*(sb[1]-sc[1])+sb[0]*(sc[1]-sa[1])+sc[0]*(sa[1]-sb[1]);
        const coeff=v=>[(v[0]*(sb[1]-sc[1])+v[1]*(sc[1]-sa[1])+v[2]*(sa[1]-sb[1]))/denom,(v[0]*(sc[0]-sb[0])+v[1]*(sa[0]-sc[0])+v[2]*(sb[0]-sa[0]))/denom,(v[0]*(sb[0]*sc[1]-sc[0]*sb[1])+v[1]*(sc[0]*sa[1]-sa[0]*sc[1])+v[2]*(sa[0]*sb[1]-sb[0]*sa[1]))/denom];
        const x=coeff([a[0],b[0],c[0]]),y=coeff([a[1],b[1],c[1]]);
        ctx.save();ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...c);ctx.closePath();ctx.clip();ctx.setTransform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(source,0,0);ctx.restore();
      };
      const w=source.width,h=source.height,node=canvas.current.parentElement;let visible=false,hovered=false,gazeX=0,gazeY=0,reactUntil=0;
      const paint=time=>{const state=animated?expressiveFace(spec,time,Math.max(0,reactUntil-time)):spec;drawFace(source,{...state,gazeX,gazeY},screen.aspect,screen.radius,screen.shape==='circle',time);ctx.clearRect(0,0,640,640);triangle(q[0],q[1],q[2],[0,0],[w,0],[w,h]);triangle(q[0],q[2],q[3],[0,0],[w,h],[0,h]);};paint(1.2);
      if(!animated)return;
      const motion=matchMedia('(prefers-reduced-motion: reduce)'),clock=observePortrait(paint);
      const sync=()=>{clock.set(visible&&!motion.matches,hovered?10:0);node.classList.toggle('is-awake',visible&&!motion.matches);};
      const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:.15});observer.observe(node);
      const move=e=>{hovered=true;const r=node.getBoundingClientRect();gazeX=(e.clientX-r.left)/r.width*2-1;gazeY=(e.clientY-r.top)/r.height*2-1;sync();};
      const leave=()=>{hovered=false;gazeX=0;gazeY=0;sync();},react=()=>{reactUntil=performance.now()/1000+1;};
      node.addEventListener('pointermove',move);node.addEventListener('pointerleave',leave);node.addEventListener('pointerdown',react);motion.addEventListener('change',sync);
      cleanup=()=>{clock.dispose();observer.disconnect();node.classList.remove('is-awake');node.removeEventListener('pointermove',move);node.removeEventListener('pointerleave',leave);node.removeEventListener('pointerdown',react);motion.removeEventListener('change',sync);};
    }).catch(()=>{});
    return()=>{disposed=true;cleanup();};
  },[key,animated]);
  return <span className={`robot-portrait slop ${className}`} style={style} role={onActivate?'button':alt?'img':undefined} aria-label={alt||undefined} aria-hidden={!alt||undefined} tabIndex={onActivate?0:undefined} onClick={onActivate} onKeyDown={onActivate?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onActivate();}}:undefined}>
    <img src={`/assets/robots/shells/${spec.shell}/${spec.finish}.webp`} width="640" height="640" alt="" loading={loading} fetchPriority={fetchPriority} decoding="async" draggable="false"/>
    <canvas ref={canvas} width="640" height="640" aria-hidden="true"/>
  </span>;
}
