import React,{useEffect,useRef,useState} from 'react';
import RobotPortrait from './RobotPortrait.jsx';
import {robotSpec} from '../lib/robot-catalog.js';

export default function RobotStage({look,shell='core',face,finish,glow,crowd=false,crown='none',paused=false,className='',alt='Interactive Slop character'}) {
  const canvas=useRef(null),stage=useRef(null),visible=useRef(false),pause=useRef(paused),spec=robotSpec(look,look?{}:Object.fromEntries(Object.entries({shell,face,finish,glow}).filter(([,v])=>v!==undefined))),current=useRef(spec),[ready,setReady]=useState(false);
  current.current=spec;
  pause.current=paused;
  useEffect(()=>{
    let dead=false,loading=false;const node=canvas.current,motion=matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>stage.current?.setActive(visible.current&&!pause.current,motion.matches);
    const observer=new IntersectionObserver(async([entry])=>{
      visible.current=entry.isIntersecting;
      if(visible.current&&!stage.current&&!loading){loading=true;try{const {createRobotStage}=await import('../robots/stage.ts');if(dead)return;stage.current=createRobotStage(node,{crowd,crown,onReady:()=>{if(!dead)setReady(true);}});stage.current.select(current.current);}catch{if(!dead)setReady(false);}}
      sync();
    },{rootMargin:'80px'});
    observer.observe(node);motion.addEventListener('change',sync);
    const lost=()=>setReady(false),restored=()=>{if(stage.current){setReady(true);sync();}};
    node.addEventListener('webglcontextlost',lost);node.addEventListener('webglcontextrestored',restored);
    return()=>{dead=true;observer.disconnect();motion.removeEventListener('change',sync);node.removeEventListener('webglcontextlost',lost);node.removeEventListener('webglcontextrestored',restored);stage.current?.dispose();stage.current=null;};
  },[crowd,crown]);
  useEffect(()=>{stage.current?.setActive(visible.current&&!paused,matchMedia('(prefers-reduced-motion: reduce)').matches);},[paused]);
  useEffect(()=>{stage.current?.select(spec);},[JSON.stringify(spec)]);
  return <div className={`robot-stage ${ready?'is-ready':''} ${className}`}>
    <RobotPortrait look={{robot:spec}} animated={false} className="robot-stage-fallback" alt=""/>
    <canvas ref={canvas} role="img" aria-label={alt} tabIndex={alt?0:-1} onKeyDown={e=>{if(!alt)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();stage.current?.react();}}}/>
  </div>;
}
