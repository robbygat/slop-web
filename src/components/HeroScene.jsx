import React,{useEffect,useRef,useState} from 'react';
import {ROBOTS} from '../lib/robot-catalog.js';
import {HERO_CAST} from '../lib/hero-policy.js';
import {heroPosterLayout} from '../lib/hero-composition.js';
import RobotPortrait from './RobotPortrait.jsx';

export default function HeroScene({paused=false}){
 const canvas=useRef(null),scene=useRef(null),buttons=useRef(new Map()),poster=useRef(new Map()),posterPositions=useRef(new Map()),pause=useRef(paused),lifecycle=useRef(null);
 const [ready,setReady]=useState(false),[selected,setSelected]=useState('core');
 pause.current=paused;
 useEffect(()=>{
  const node=canvas.current,motion=matchMedia('(prefers-reduced-motion: reduce)');
  let dead=false,visible=false,booting=false,failed=false,contextLost=false,frame=0,idle=0,timer=0,restoreFrame=0,generation=0;
  const active=()=>visible&&!pause.current&&!document.hidden;
  const cancelScheduled=()=>{generation++;cancelAnimationFrame(frame);frame=0;if(idle)window.cancelIdleCallback(idle);idle=0;clearTimeout(timer);timer=0;};
  const placePoster=(width,height)=>{
   for(const p of heroPosterLayout(width,height)){
    posterPositions.current.set(p.id,p);
    const portrait=poster.current.get(p.id);if(!portrait)continue;
    portrait.style.left=`${p.x}%`;portrait.style.top=`${p.y}%`;portrait.style.width=`${p.size}px`;
   }
  };
  const resize=()=>{
   const r=node.getBoundingClientRect();if(!r.width||!r.height)return;
   placePoster(r.width,r.height);
   scene.current?.resize(r.width,r.height,active()&&!contextLost);
  };
  const start=async token=>{
   frame=idle=timer=0;if(dead||token!==generation||!active()||booting||failed)return;
   const bounds=node.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
   booting=true;
   try{
    const {createHeroScene}=await import('../robots/hero-scene.ts');
    // The module can finish downloading while this hero is covered or offscreen.
    // Wait for the next visible opportunity before allocating any GPU resources.
    if(dead||token!==generation||!active())return;
    scene.current=createHeroScene(node,{
     onSelect:id=>{if(!dead)setSelected(id);},
     onPosition:(id,x,y,flying)=>{
      const button=buttons.current.get(id);if(!button)return;
      button.style.left=`${x*100}%`;button.style.top=`${y*100}%`;button.style.visibility=flying?'hidden':'visible';
     },
    });
    scene.current.setActive(false,motion.matches);resize();setReady(true);sync();
   }catch{
    // A failed renderer keeps the useful poster and primary navigation. Do not
    // repeatedly compile the scene on every observer/resize notification.
    failed=true;scene.current?.dispose();scene.current=null;if(!dead)setReady(false);
   }finally{booting=false;if(!dead&&!scene.current&&!failed&&active())schedule();}
  };
  const schedule=()=>{
   if(dead||booting||failed||frame||idle||timer||scene.current||!active())return;
   const token=generation;
   // Paint the poster first. One bounded idle task starts the shared 3D cast.
   frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
    frame=0;if(dead||token!==generation||!active())return;
    if(window.requestIdleCallback)idle=window.requestIdleCallback(()=>void start(token),{timeout:900});
    else timer=window.setTimeout(()=>void start(token),80);
   });});
  };
  const sync=()=>{
   if(dead)return;
   if(!active()){cancelScheduled();scene.current?.setActive(false,motion.matches);return;}
   if(scene.current){scene.current.setActive(!contextLost,motion.matches);return;}
   schedule();
  };
  lifecycle.current=sync;
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:0});
  const ro=new ResizeObserver(()=>{resize();sync();});ro.observe(node);observer.observe(node);
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
  const lost=e=>{e.preventDefault();contextLost=true;scene.current?.setActive(false,motion.matches);setReady(false);resize();};
  const restored=()=>{cancelAnimationFrame(restoreFrame);restoreFrame=requestAnimationFrame(()=>{
   if(dead||!scene.current)return;contextLost=false;resize();setReady(true);sync();
  });};
  node.addEventListener('webglcontextlost',lost);node.addEventListener('webglcontextrestored',restored);
  resize();
  return()=>{
   dead=true;lifecycle.current=null;cancelScheduled();cancelAnimationFrame(restoreFrame);observer.disconnect();ro.disconnect();
   document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);
   node.removeEventListener('webglcontextlost',lost);node.removeEventListener('webglcontextrestored',restored);
   scene.current?.dispose();scene.current=null;
  };
 },[]);
 useEffect(()=>{if(ready)scene.current?.refreshPositions();},[ready]);
 useEffect(()=>{lifecycle.current?.();},[paused]);
 return <div className={`orbit-scene ${ready?'is-ready':''}`}>
  {!ready&&<div className="orbit-poster" aria-hidden="true">{HERO_CAST.map(id=><span key={id} ref={node=>{if(node){poster.current.set(id,node);const p=posterPositions.current.get(id);if(p){node.style.left=`${p.x}%`;node.style.top=`${p.y}%`;node.style.width=`${p.size}px`;}}else poster.current.delete(id);}} className={`orbit-poster-seat orbit-poster-${id}`} style={{position:'absolute',transform:'translate(-50%,-50%)',left:'48%',top:'50%',width:id==='core'?'33%':'18%'}}><RobotPortrait shell={id} face={id==='core'?'slop':['gatekeeper','chip'].includes(id)?'hearts':'happy'} glow={id==='core'||id==='gatekeeper'?'lime':id==='neko'?'pink':'white'} alt="" animated={false} loading="eager" style={{width:'100%',height:'auto',aspectRatio:1}}/></span>)}</div>}
  <canvas ref={canvas} aria-hidden="true"/>
  {ready&&<div className="orbit-interactions" role="group" aria-label="Slop characters. Choose one to bring it to the front.">{HERO_CAST.map(id=><button key={id} ref={node=>{if(node)buttons.current.set(id,node);else buttons.current.delete(id);}} className={`orbit-character ${id===selected?'is-center':''}`} aria-label={id===selected?`Spin ${ROBOTS.find(r=>r.id===id).name}`:`Bring ${ROBOTS.find(r=>r.id===id).name} to the front`} onClick={()=>scene.current?.activate(id)}/>)}</div>}
 </div>;
}
