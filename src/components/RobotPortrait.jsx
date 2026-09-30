import React,{useEffect,useRef,useState} from 'react';
import meta from '../data/robots.json';
import {robotSpec} from '../lib/robot-catalog.js';
import {expressiveFace} from '../lib/robot-expression.js';
import {observePortrait} from '../lib/portrait-clock.js';
import {loadPortraitShell} from '../lib/portrait-assets.js';
import SlopMark from './SlopMark.jsx';

// One atomic shell-and-face frame, warmed before it scrolls into view.
export default function RobotPortrait({look,shell,finish,face,glow,className='',alt='Slop',onActivate,style,animated=true,loading='lazy'}){
 const spec=robotSpec(look,Object.fromEntries(Object.entries({shell,finish,face,glow}).filter(([,v])=>v!==undefined)));
 const canvas=useRef(null),root=useRef(null),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),key=JSON.stringify(spec);
 useEffect(()=>{
  let disposed=false,loadingNow=false,paint=null,clock=null,hovered=false,visible=false,cleanup=()=>{};
  const node=root.current,motion=matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>{clock?.set(visible&&animated&&!motion.matches,hovered?10:0);node.classList.toggle('is-awake',visible&&animated&&!motion.matches);};
  async function load(){
   if(loadingNow||paint)return;loadingNow=true;setFailed(false);
   try{
    const url=`/assets/robots/shells/${spec.shell}/${spec.finish}.webp`;
    const [image,{drawFace}]=await Promise.all([loadPortraitShell(url).catch(()=>loadPortraitShell(url)),import('../robots/mobile/face2d.ts')]);
    if(disposed)return;
    const screen=meta.shells[spec.shell].screen,source=document.createElement('canvas');source.width=256;source.height=Math.round(256/screen.aspect);
    const ctx=canvas.current.getContext('2d'),q=screen.quad.map(([x,y])=>[x*640,y*640]);
    const triangle=(a,b,c,sa,sb,sc)=>{
     const d=sa[0]*(sb[1]-sc[1])+sb[0]*(sc[1]-sa[1])+sc[0]*(sa[1]-sb[1]);
     const coeff=v=>[(v[0]*(sb[1]-sc[1])+v[1]*(sc[1]-sa[1])+v[2]*(sa[1]-sb[1]))/d,(v[0]*(sc[0]-sb[0])+v[1]*(sa[0]-sc[0])+v[2]*(sb[0]-sa[0]))/d,(v[0]*(sb[0]*sc[1]-sc[0]*sb[1])+v[1]*(sc[0]*sa[1]-sa[0]*sc[1])+v[2]*(sa[0]*sb[1]-sb[0]*sa[1]))/d];
     const x=coeff([a[0],b[0],c[0]]),y=coeff([a[1],b[1],c[1]]);ctx.save();ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...c);ctx.closePath();ctx.clip();ctx.setTransform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(source,0,0);ctx.restore();
    };
    let gazeX=0,gazeY=0,reactUntil=0;
    paint=time=>{const state=animated&&!motion.matches?expressiveFace(spec,time,Math.max(0,reactUntil-time)):spec;drawFace(source,{...state,gazeX,gazeY},screen.aspect,screen.radius,screen.shape==='circle',time);ctx.clearRect(0,0,640,640);ctx.drawImage(image,0,0,640,640);triangle(q[0],q[1],q[2],[0,0],[source.width,0],[source.width,source.height]);triangle(q[0],q[2],q[3],[0,0],[source.width,source.height],[0,source.height]);};
    paint(1.2);setReady(true);clock=observePortrait(paint);sync();
    const move=e=>{hovered=true;const r=node.getBoundingClientRect();gazeX=(e.clientX-r.left)/r.width*2-1;gazeY=(e.clientY-r.top)/r.height*2-1;sync();};
    const leave=()=>{hovered=false;gazeX=0;gazeY=0;sync();},react=()=>{reactUntil=performance.now()/1000+1;};
    node.addEventListener('pointermove',move);node.addEventListener('pointerleave',leave);node.addEventListener('pointerdown',react);
    cleanup=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerleave',leave);node.removeEventListener('pointerdown',react);};
   }catch{paint=null;if(!disposed){setReady(false);setFailed(true);}}finally{loadingNow=false;}
  }
  const warm=new IntersectionObserver(([e])=>{if(e.isIntersecting)void load();},{rootMargin:'320px'});warm.observe(node);
  const observer=new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync();},{threshold:.05});observer.observe(node);
  const retry=()=>{if(visible)void load();};window.addEventListener('online',retry);motion.addEventListener('change',sync);
  if(loading==='eager')void load();
  return()=>{disposed=true;warm.disconnect();observer.disconnect();clock?.dispose();cleanup();node.classList.remove('is-awake');window.removeEventListener('online',retry);motion.removeEventListener('change',sync);};
 },[key,animated,loading]);
 return <span ref={root} className={`robot-portrait slop ${ready?'is-painted':''} ${failed?'is-unavailable':''} ${className}`} style={style} role={onActivate?'button':alt?'img':undefined} aria-label={alt||undefined} aria-hidden={!alt||undefined} tabIndex={onActivate?0:undefined} onClick={onActivate} onKeyDown={onActivate?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onActivate();}}:undefined}>
  <span className="portrait-placeholder" aria-hidden="true"><SlopMark/></span><canvas ref={canvas} width="640" height="640" aria-hidden="true"/>
 </span>;
}
