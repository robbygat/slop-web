import React,{useEffect,useRef,useState} from 'react';
import {ROBOTS} from '../lib/robot-catalog.js';
import RobotPortrait from './RobotPortrait.jsx';
const cast=['core','neko','blocky','clicky','gatekeeper','chip','noir'];

export default function HeroScene({heroRef,copyRef,paused}) {
  const canvas=useRef(null),scene=useRef(null),buttons=useRef(new Map()),pause=useRef(paused);
  const [ready,setReady]=useState(false),[selected,setSelected]=useState('core');
  const visible=useRef(false);pause.current=paused;
  useEffect(()=>{
    let dead=false,loading=false;
    const node=canvas.current,motion=matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>scene.current?.setActive(visible.current&&!pause.current&&!document.hidden,motion.matches);
    const resize=()=>{const r=node.getBoundingClientRect();if(r.width&&r.height)scene.current?.resize(r.width,r.height);sync();};
    const observer=new IntersectionObserver(async([entry])=>{
      visible.current=entry.isIntersecting;
      if(visible.current&&!scene.current&&!loading){
        loading=true;
        try {
          const {createHeroScene}=await import('../robots/hero-scene.ts');if(dead)return;
          // Let the lightweight cast paint before compiling the interactive scene.
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(dead)return;
          scene.current=createHeroScene(node,{
            measure:()=>({ctaBottom:copyRef.current.getBoundingClientRect().bottom-heroRef.current.getBoundingClientRect().top+12,dockTop:node.clientHeight-50}),
            onSelect:id=>{if(!dead)setSelected(id);},
            onPosition:(id,x,y,flying)=>{const button=buttons.current.get(id);if(button){button.style.left=`${x*100}%`;button.style.top=`${y*100}%`;button.style.visibility=flying?'hidden':'visible';}},
          });
          resize();setReady(true);
        } catch {if(!dead)setReady(false);}
      }
      sync();
    },{threshold:0});
    const ro=new ResizeObserver(resize);ro.observe(node);observer.observe(node);
    document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
    const lost=e=>{e.preventDefault();scene.current?.setActive(false,true);setReady(false);};
    const restored=()=>{resize();setReady(true);sync();};
    node.addEventListener('webglcontextlost',lost);
    node.addEventListener('webglcontextrestored',restored);
    return()=>{dead=true;observer.disconnect();ro.disconnect();document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);node.removeEventListener('webglcontextlost',lost);node.removeEventListener('webglcontextrestored',restored);scene.current?.dispose();scene.current=null;};
  },[]);
  useEffect(()=>{if(ready)scene.current?.refreshPositions();},[ready]);
  useEffect(()=>{scene.current?.setActive(visible.current&&!paused&&!document.hidden,matchMedia('(prefers-reduced-motion: reduce)').matches);},[paused]);
  return <div className={`orbit-scene ${ready?'is-ready':''}`}>
    {!ready&&<div className="orbit-poster" aria-hidden="true">{cast.map(id=><RobotPortrait key={id} shell={id} face={id==='core'?'slop':id==='gatekeeper'||id==='chip'?'hearts':'happy'} glow={id==='core'||id==='gatekeeper'?'lime':id==='neko'?'pink':'white'} alt="" animated={false} loading="eager" fetchPriority={id==='core'?'high':'auto'} className={`orbit-poster-${id}`}/>)}</div>}
    <canvas ref={canvas} aria-hidden="true"/>
    {ready&&<div className="orbit-interactions" role="group" aria-label="Slop characters. Choose one to bring it to the front.">{cast.map(id=><button key={id} ref={node=>{if(node)buttons.current.set(id,node);else buttons.current.delete(id);}} className={`orbit-character ${id===selected?'is-center':''}`} aria-label={id===selected?`Spin ${ROBOTS.find(r=>r.id===id).name}`:`Bring ${ROBOTS.find(r=>r.id===id).name} to the front`} onClick={()=>scene.current?.activate(id)}/>)}</div>}
  </div>;
}
